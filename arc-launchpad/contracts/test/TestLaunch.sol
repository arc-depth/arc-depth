// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Launchpad} from "../Launchpad.sol";
import {TeminatKarnesi} from "../TeminatKarnesi.sol";
import {LaunchToken} from "../LaunchToken.sol";
import {CollateralVault, IERC20} from "../CollateralVault.sol";
import {MockERC20} from "./TestRedemption.sol";
import {MockUSDC6} from "./TestOndalik.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @notice A whole launch against the REAL Arc PoolManager, and then the
///         question the first design got wrong.
///
/// The question is not whether a launch succeeds. The version before this
/// one succeeded every time while returning 42.66 of a 100 deposit, because
/// it spent 40% of the money on liquidity nobody can withdraw and backed
/// the whole supply with a vault the founder owned half of. So what is
/// checked here is: how much of the deposit can the depositor get back,
/// and does the pool take any of it.
///
/// Nothing here is a simulation of Uniswap. The pool is initialised and the
/// position created by the actual v4 contract deployed on Arc, through
/// eth_call, so no transaction is sent and no gas paid. A position v4 would
/// reject is rejected here too — which matters more than usual, because a
/// one-sided position is exactly the kind v4 refuses if the band is on the
/// wrong side of the price.
///
/// The hook is address(0): its own rules are covered against a stand-in
/// PoolManager elsewhere. What cannot be faked is whether the split, the
/// floor, the opening price and the tick band add up to something the real
/// pool manager accepts.
contract TestLaunch {
    using PoolIdLibrary for PoolKey;

    address constant DEV = address(0xDEAD);
    address constant PROTO = address(0xBEEF);
    /// Every launch opens here, whatever is behind it: $1,500 for the
    /// whole supply, in six-decimal USDC.
    uint256 constant ACILIS = 1500 * 1e6;


    struct Sonuc {
        address token;
        address vault;
        uint256 kasaTeminat;      // what reached the vault
        uint256 ucret;            // what reached the three sinks
        uint256 tabanFiyat;       // 1e18 scaled, collateral per token
        uint256 havuzTeminat;     // collateral the PoolManager took  <-- must be 0
        uint256 havuzToken;       // tokens the PoolManager took
        uint256 kurucuToken;      // the founder's FREE balance (70% of their share)
        uint256 kurucuKilitli;    // and the 30% sitting in the Vesting contract
        uint256 toplamArz;
        uint256 lpBakiye;         // residue on the launchpad
        uint256 geriAlinan;       // burning the founder's whole holding
        uint256 tabanSonra;       // floor after that burn
    }

    /// The collateral is a wrapped share, eighteen decimals. The money is
    /// USDC, six. Keeping them different is the whole point of the test:
    /// a pool priced across two decimal counts is where this project's
    /// worst bug lived.
    function _kur(IPoolManager pm, uint256 deposit)
        internal
        returns (MockERC20 col, Launchpad lp, MockUSDC6 usdc)
    {
        col = new MockERC20(deposit * 100, address(this));
        usdc = new MockUSDC6(1_000_000 * 1e6, address(this));
        /* The collateral is also the quote — launch() requires it. This
           keeps the 18-decimal coverage the mock provides. */
        lp = new Launchpad(pm, IHooks(address(0)), IERC20(address(col)), 0, DEV, PROTO);
        col.approve(address(lp), type(uint256).max);
    }

    function run(IPoolManager pm, uint256 deposit, uint256 poolBps)
        external
        returns (Sonuc memory s)
    {
        (MockERC20 col, Launchpad lp, MockUSDC6 usdc) = _kur(pm, deposit);

        (address token, address vault, address rewards) =
            lp.launch("Teminatli", "TMN", IERC20(address(col)), deposit, ACILIS, poolBps);

        LaunchToken t = LaunchToken(token);
        s.token = token;
        s.vault = vault;
        s.kasaTeminat = col.balanceOf(vault);
        s.ucret = col.balanceOf(rewards) + col.balanceOf(DEV) + col.balanceOf(PROTO);
        s.tabanFiyat = CollateralVault(vault).floorPrice();
        /* The one that decides whether any of this works: a USDC-quoted
           pool, opened with no USDC. */
        s.havuzTeminat = usdc.balanceOf(address(pm));
        s.havuzToken = t.balanceOf(address(pm));
        s.kurucuToken = t.balanceOf(address(this));
        /* 30% of the founder's share went into a Vesting contract, so the
           free balance alone no longer accounts for the supply. Reported
           separately rather than folded in, because the point of the lock
           is that the two amounts are not the same thing. */
        address kilit = lp.founderVestingOf(address(t));
        s.kurucuKilitli = kilit == address(0) ? 0 : t.balanceOf(kilit);
        s.toplamArz = t.totalSupply();
        s.lpBakiye = col.balanceOf(address(lp));

        // The only question. Burn everything the founder holds.
        uint256 once = col.balanceOf(address(this));
        t.approve(vault, type(uint256).max);
        CollateralVault(vault).redeem(s.kurucuToken);
        s.geriAlinan = col.balanceOf(address(this)) - once;
        s.tabanSonra = CollateralVault(vault).floorPrice();
    }

    /// Two launches, deposits an order of magnitude apart, and the price
    /// the market opens at.
    ///
    /// This is the whole reason the opening stopped being a multiple of the
    /// deposit. Before, 31 cents of collateral produced a 61 cent market and
    /// twenty cents bought half the float — which was arithmetically correct
    /// and told a buyer nothing except that the deposit was small. Now every
    /// launch starts in the same place and the only thing that differs is
    /// what is behind it, which is the number worth comparing.
    ///
    /// The price is read out of the PoolManager's own storage. Recomputing
    /// it from the inputs would show the arithmetic agreeing with itself.
    function runAcilisAyni(IPoolManager pm, uint256 kucuk, uint256 buyuk)
        external
        returns (uint160 sqrtKucuk, uint160 sqrtBuyuk, uint256 tabanKucuk, uint256 tabanBuyuk)
    {
        (sqrtKucuk, tabanKucuk) = _acilis(pm, kucuk);
        (sqrtBuyuk, tabanBuyuk) = _acilis(pm, buyuk);
    }

    function _acilis(IPoolManager pm, uint256 deposit)
        internal
        returns (uint160 sqrtP, uint256 taban)
    {
        (MockERC20 col, Launchpad lp, MockUSDC6 usdc) = _kur(pm, deposit);
        (address token, address vault,) =
            lp.launch("Acilis", "ACL", IERC20(address(col)), deposit, ACILIS, 4000);

        bool tokenIsZero = token < address(usdc);
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(tokenIsZero ? token : address(usdc)),
            currency1: Currency.wrap(tokenIsZero ? address(usdc) : token),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        /* Uniswap keeps its pools at slot 6; slot0 of a pool's state holds
           sqrtPriceX96 in its low 160 bits. */
        bytes32 durum = keccak256(abi.encode(PoolId.unwrap(key.toId()), uint256(6)));
        sqrtP = uint160(uint256(pm.extsload(durum)));
        taban = CollateralVault(vault).floorPrice();
    }

    /// quoteLaunch is what the interface shows before anyone signs. If it
    /// disagrees with the launch it describes, the interface is lying.
    function runTeklif(IPoolManager pm, uint256 deposit, uint256 poolBps)
        external
        returns (
            uint256 teklifGeri, uint256 gercekGeri,
            uint256 teklifHavuz, uint256 gercekHavuz,
            uint256 teklifTaban, uint256 gercekTaban
        )
    {
        (MockERC20 col, Launchpad lp,) = _kur(pm, deposit);

        (, , uint256 qTaban, , uint256 qHavuz, , uint256 qGeri) = lp.quoteLaunch(deposit, poolBps);
        teklifGeri = qGeri;
        teklifHavuz = qHavuz;
        teklifTaban = qTaban;

        (address token, address vault,) =
            lp.launch("Teminatli", "TMN", IERC20(address(col)), deposit, ACILIS, poolBps);
        LaunchToken t = LaunchToken(token);
        gercekHavuz = t.balanceOf(address(pm));
        gercekTaban = CollateralVault(vault).floorPrice();

        uint256 once = col.balanceOf(address(this));
        t.approve(vault, type(uint256).max);
        CollateralVault(vault).redeem(t.balanceOf(address(this)));
        gercekGeri = col.balanceOf(address(this)) - once;
    }

    /// The pool share has bounds; the deposit no longer does. A range in
    /// units of the collateral token meant nothing once the collateral
    /// became a tokenized share, so it moved to the queue where the
    /// customer pays in USDC. What is left here is that a launch needs
    /// something to launch with.
    /// The three things added with the converter: a launch may again use
    /// collateral that is not the quote, it costs more when it does, and
    /// whatever backs it gets graded once and filed.
    function runKarneVeUcret(IPoolManager pm)
        external
        returns (
            uint256 ucretQuote, uint256 ucretDiger,
            address karneTeminat, uint8 karneBasamak,
            bool karneGercekPara, bool karneSahip, uint256 karneKod,
            bool digerTeminatGecti
        )
    {
        MockERC20 col2 = new MockERC20(1_000_000 ether, address(this));
        MockUSDC6 usd2 = new MockUSDC6(1_000_000 * 1e6, address(this));
        Launchpad lp2 = new Launchpad(pm, IHooks(address(0)), IERC20(address(usd2)), 0, DEV, PROTO);

        ucretQuote = lp2.ucretPpm(address(usd2));
        ucretDiger = lp2.ucretPpm(address(col2));

        /* Collateral that is NOT the quote — the case the converter exists
           for, and the case that reverted while the restriction stood. */
        col2.approve(address(lp2), type(uint256).max);
        address tok2;
        try lp2.launch("Karne", "KRN", IERC20(address(col2)), 100 ether, ACILIS, 4000)
            returns (address a, address, address) { tok2 = a; digerTeminatGecti = true; }
        catch { digerTeminatGecti = false; }

        if (tok2 != address(0)) {
            TeminatKarnesi.Karne memory k = lp2.karne().oku(tok2);
            karneTeminat = k.teminat;
            karneBasamak = k.basamak;
            karneGercekPara = k.gercekParaMi;
            karneSahip = k.sahipVar;
            karneKod = k.kodBoyutu;
        }
    }

    function runSinirlar(IPoolManager pm)
        external
        returns (
            bool sifirRed, bool havuzAltRed, bool havuzUstRed, bool kucukGecti
        )
    {
        MockERC20 col = new MockERC20(500000 ether, address(this));
        MockUSDC6 usdc = new MockUSDC6(1_000_000 * 1e6, address(this));
        Launchpad lp = new Launchpad(pm, IHooks(address(0)), IERC20(address(col)), 0, DEV, PROTO);
        col.approve(address(lp), type(uint256).max);

        try lp.launch("X", "X", IERC20(address(col)), 0, ACILIS, 4000) { sifirRed = false; }
        catch { sifirRed = true; }

        try lp.launch("X", "X", IERC20(address(col)), 500 ether, ACILIS, 400) { havuzAltRed = false; }
        catch { havuzAltRed = true; }

        try lp.launch("X", "X", IERC20(address(col)), 500 ether, ACILIS, 7001) { havuzUstRed = false; }
        catch { havuzUstRed = true; }

        /* A fraction of a share, which is what $100 of NVIDIA is. The old
           range rejected exactly this. */
        try lp.launch("X", "X", IERC20(address(col)), 0.41 ether, ACILIS, 4000) { kucukGecti = true; }
        catch { kucukGecti = false; }
    }
}
