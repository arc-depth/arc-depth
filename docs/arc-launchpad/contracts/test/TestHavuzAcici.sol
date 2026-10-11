// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

import {HavuzAcici, IERC20H} from "../HavuzAcici.sol";

/* Read-only window onto the hook, so the harness measures what the hook
   actually recorded instead of recomputing it and agreeing with itself. */
interface IHookOku {
    function acilisZamani(PoolId) external view returns (uint64);
    function floorAccrued(PoolId, Currency) external view returns (uint256);
}
import {MockERC20} from "./TestRedemption.sol";
import {MockUSDC6} from "./TestOndalik.sol";

/// @title TestHavuzAcici
/// @notice The graduated pool, against the real Arc PoolManager.
///
/// Pool code gets tested against the real thing here, not a mock, because
/// the mistakes that have cost this project money were all in the seam
/// between our arithmetic and Uniswap's: a band on the wrong side of the
/// price, a 60x ceiling that emptied a book, a price computed as though
/// two different decimal scales were one.
///
/// What has to be true: the pool opens at the ratio of the money to the
/// tokens and not at a number anybody chose, there is a bid in it from the
/// first block so the first holder can actually sell, the leftover dust is
/// dust, and nothing can pull the liquidity back out.
contract TestHavuzAcici is IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager pm;

    struct Acilis {
        uint160 sqrtP;
        int24 tick;
        uint128 likidite;
        uint256 artanQuote;
        uint256 artanToken;
        uint256 havuzQuote;
        uint256 havuzToken;
        bool tokenSifirinci;
        bool ikinciAcilisRed;
        bool yabanciCagriRed;
    }

    /// Two amounts in, a pool at their ratio out.
    function runAcilis(IPoolManager _pm, uint256 quoteMiktari, uint256 tokenMiktari)
        external
        returns (Acilis memory a)
    {
        pm = _pm;
        (MockERC20 tok, MockUSDC6 usd, HavuzAcici h) = _kur();
        a.tokenSifirinci = address(tok) < address(usd);

        usd.transfer(address(h), quoteMiktari);
        tok.transfer(address(h), tokenMiktari);
        h.ac(quoteMiktari, tokenMiktari);

        PoolId id = h.havuzId();
        (a.sqrtP, a.tick,,) = pm.getSlot0(id);
        a.likidite = pm.getLiquidity(id);
        a.artanQuote = usd.balanceOf(address(h));
        a.artanToken = tok.balanceOf(address(h));
        a.havuzQuote = usd.balanceOf(address(pm));
        a.havuzToken = tok.balanceOf(address(pm));

        /* Once, and only by the curve. */
        try h.ac(1, 1) { a.ikinciAcilisRed = false; } catch { a.ikinciAcilisRed = true; }
        Yabanci y = new Yabanci();
        try y.ac(h) { a.yabanciCagriRed = false; } catch { a.yabanciCagriRed = true; }
    }

    struct Satis {
        uint256 satilanToken;
        uint256 alinanQuote;
        uint160 sqrtOnce;
        uint160 sqrtSonra;
        bool fiyatDustu;
    }

    /// The thing the previous pool could not do: somebody sells into it on
    /// the first block and gets money out. A one-sided position has no bid
    /// at all, so this is the test that the position is really two-sided.
    function runIlkBloktaSatis(IPoolManager _pm, uint256 quoteMiktari, uint256 tokenMiktari, uint256 satis)
        external
        returns (Satis memory s)
    {
        pm = _pm;
        (MockERC20 tok, MockUSDC6 usd, HavuzAcici h) = _kur();
        usd.transfer(address(h), quoteMiktari);
        tok.transfer(address(h), tokenMiktari);
        h.ac(quoteMiktari, tokenMiktari);

        PoolId id = h.havuzId();
        (s.sqrtOnce,,,) = pm.getSlot0(id);

        bool tokenSifirinci = address(tok) < address(usd);
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(tokenSifirinci ? address(tok) : address(usd)),
            currency1: Currency.wrap(tokenSifirinci ? address(usd) : address(tok)),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        s.satilanToken = satis;
        _takas = Takas({key: key, zeroForOne: tokenSifirinci, miktar: satis, token: address(tok), quote: address(usd), tamCikis: false});
        pm.unlock(abi.encode(uint8(1)));
        s.alinanQuote = _sonAlinan;

        (s.sqrtSonra,,,) = pm.getSlot0(id);
        s.fiyatDustu = tokenSifirinci ? (s.sqrtSonra < s.sqrtOnce) : (s.sqrtSonra > s.sqrtOnce);
    }

    /* ---- plumbing --------------------------------------------------- */

    /* tamCikis: the trader fixes the OUTPUT instead of the input. Added
       because the fee and the opening surcharge both used to read the
       wrong side of an exact-output swap, and neither could be measured
       without a harness able to make one. */
    struct Takas {
        PoolKey key;
        bool zeroForOne;
        uint256 miktar;
        address token;
        address quote;
        bool tamCikis;
    }
    Takas private _takas;
    uint256 private _sonAlinan;

    function _kur() internal returns (MockERC20 tok, MockUSDC6 usd, HavuzAcici h) {
        return _kurUcret(0);
    }

    function _kurUcret(uint24 ucret) internal returns (MockERC20 tok, MockUSDC6 usd, HavuzAcici h) {
        tok = new MockERC20(1_000_000_000 ether, address(this));
        usd = new MockUSDC6(10_000_000 * 1e6, address(this));
        h = new HavuzAcici(pm, IERC20H(address(tok)), IERC20H(address(usd)),
                           IHooks(address(0)), ucret, 60, address(this));
    }

    function unlockCallback(bytes calldata veri) external returns (bytes memory) {
        require(msg.sender == address(pm), "pm");
        uint8 kip = abi.decode(veri, (uint8));
        if (kip == 2 || kip == 3) {
            /* Removal must revert for everyone; an add from anyone but the
               opener must revert too. This contract is not the opener. */
            pm.modifyLiquidity(
                _cikarmaKey,
                ModifyLiquidityParams({
                    tickLower: -887220, tickUpper: 887220,
                    liquidityDelta: kip == 2 ? int256(-1) : int256(1),
                    salt: bytes32(0)
                }),
                ""
            );
            return "";
        }
        Takas memory t = _takas;
        (BalanceDelta d) = pm.swap(
            t.key,
            SwapParams({
                zeroForOne: t.zeroForOne,
                amountSpecified: t.tamCikis ? int256(t.miktar) : -int256(t.miktar),
                sqrtPriceLimitX96: t.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        int128 a0 = d.amount0();
        int128 a1 = d.amount1();
        /* Pay what is owed, take what is credited. */
        _odeVeAl(t.key.currency0, a0);
        _odeVeAl(t.key.currency1, a1);
        _sonAlinan = uint256(uint128(t.zeroForOne ? (a1 > 0 ? a1 : int128(0)) : (a0 > 0 ? a0 : int128(0))));
        return "";
    }

    function _odeVeAl(Currency c, int128 d) internal {
        if (d < 0) {
            pm.sync(c);
            MockERC20(Currency.unwrap(c)).transfer(address(pm), uint256(uint128(-d)));
            pm.settle();
        } else if (d > 0) {
            pm.take(c, address(this), uint256(uint128(d)));
        }
    }

    struct HookUcret {
        address beklenenAcici;
        uint256 kurucuSatisSonrasi;
        uint256 stakeSatisSonrasi;
        uint256 aciciParaSatisSonrasi;
        uint256 aciciTokenAlimSonrasi;
        uint256 satilanQuote;
        bool cikarmaRed;
        bool yabanciEklemeRed;
    }

    /// Where every fee goes once the pool is live. The hook is injected at
    /// a mined address by the runner; this contract creates the pool opener
    /// at the nonce the hook was built around.
    function runHookUcret(IPoolManager _pm, address hookAdres, uint256 quoteMiktari, uint256 tokenMiktari)
        external
        returns (HookUcret memory u)
    {
        pm = _pm;
        _hookKur(hookAdres, quoteMiktari, tokenMiktari);
        u.beklenenAcici = address(_h);

        /* A sell: tokens in, USDC out, so the fee is money and splits. */
        _satDene(2_000_000 ether);
        u.satilanQuote = _sonAlinan;
        u.kurucuSatisSonrasi = _usd.balanceOf(KURUCU_HOOK);
        u.stakeSatisSonrasi = _usd.balanceOf(STAKE_HOOK);
        u.aciciParaSatisSonrasi = _usd.balanceOf(address(_h));

        /* A buy: USDC in, tokens out, so the fee is tokens and all of it
           goes to depth rather than to anybody as something to sell. */
        u.aciciTokenAlimSonrasi = _alDene(20 * 1e6);

        try this.cikarmayiDene() { u.cikarmaRed = false; } catch { u.cikarmaRed = true; }
        try this.yabanciEklemeyiDene() { u.yabanciEklemeRed = false; } catch { u.yabanciEklemeRed = true; }
    }

    bool private _tamCikis;

    MockERC20 private _tok;
    MockUSDC6 private _usd;
    HavuzAcici private _h;

    /* Order matters: the hook's immutable havuzAcici was computed as this
       contract's CREATE address at nonce 2, so the token and the quote have
       to be created first. A state-override contract starts at nonce 0. */
    function _hookKur(address hookAdres, uint256 quoteMiktari, uint256 tokenMiktari) internal {
        _tok = new MockERC20(1_000_000_000 ether, address(this));            // nonce 0
        _usd = new MockUSDC6(10_000_000 * 1e6, address(this));               // nonce 1
        _h = new HavuzAcici(pm, IERC20H(address(_tok)), IERC20H(address(_usd)),
                            IHooks(hookAdres), 0, 60, address(this));        // nonce 2
        _usd.transfer(address(_h), quoteMiktari);
        _tok.transfer(address(_h), tokenMiktari);
        _h.ac(quoteMiktari, tokenMiktari);
        _cikarmaKey = _anahtar(hookAdres);
    }

    function _anahtar(address hookAdres) internal view returns (PoolKey memory) {
        bool t0 = address(_tok) < address(_usd);
        return PoolKey({
            currency0: Currency.wrap(t0 ? address(_tok) : address(_usd)),
            currency1: Currency.wrap(t0 ? address(_usd) : address(_tok)),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(hookAdres)
        });
    }

    function _satDene(uint256 miktar) internal {
        _takas = Takas({key: _cikarmaKey, zeroForOne: address(_tok) < address(_usd),
                        miktar: miktar, token: address(_tok), quote: address(_usd), tamCikis: false});
        pm.unlock(abi.encode(uint8(1)));
    }

    function _alDene(uint256 miktar) internal returns (uint256 eklenen) {
        uint256 once = _tok.balanceOf(address(_h));
        _takas = Takas({key: _cikarmaKey, zeroForOne: !(address(_tok) < address(_usd)),
                        miktar: miktar, token: address(_tok), quote: address(_usd), tamCikis: _tamCikis});
        pm.unlock(abi.encode(uint8(1)));
        eklenen = _tok.balanceOf(address(_h)) - once;
    }

    address constant KURUCU_HOOK = address(uint160(0xB07));
    address constant STAKE_HOOK = address(uint160(0x57A1));
    PoolKey private _cikarmaKey;
    uint8 private _kip;

    function cikarmayiDene() external {
        _kip = 2;
        pm.unlock(abi.encode(uint8(2)));
    }
    function yabanciEklemeyiDene() external {
        _kip = 3;
        pm.unlock(abi.encode(uint8(3)));
    }

    struct Birikim {
        uint128 likiditeOnce;
        uint128 likiditeSonra;
        uint256 eklenen;
        uint256 aciciQuoteOnce;
        uint256 aciciTokenOnce;
        uint256 aciciQuoteSonra;
        uint256 aciciTokenSonra;
        bool acilmadanRed;
        bool herkesCagirabilir;
    }

    /// A nonzero fee is only safe because this exists: trading fees accrue
    /// to a locked position and v4 does not reinvest them on its own, so
    /// without a way to collect they would pile up unreachable — which is
    /// what happened to AlpLocker. Here each trade makes the book
    /// permanently deeper and still nothing can leave.
    function runBiriktir(IPoolManager _pm, uint256 quoteMiktari, uint256 tokenMiktari, uint256 takasMiktari)
        external
        returns (Birikim memory b)
    {
        pm = _pm;
        (MockERC20 tok, MockUSDC6 usd, HavuzAcici h) = _kurUcret(3000);   // 0.30%

        /* Before the pool exists there is nothing to reinvest. */
        try h.biriktir() { b.acilmadanRed = false; } catch { b.acilmadanRed = true; }

        usd.transfer(address(h), quoteMiktari);
        tok.transfer(address(h), tokenMiktari);
        h.ac(quoteMiktari, tokenMiktari);

        PoolId id = h.havuzId();
        b.likiditeOnce = pm.getLiquidity(id);

        bool tokenSifirinci = address(tok) < address(usd);
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(tokenSifirinci ? address(tok) : address(usd)),
            currency1: Currency.wrap(tokenSifirinci ? address(usd) : address(tok)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        /* Trade both ways so fees land on both sides of the book. */
        _takas = Takas({key: key, zeroForOne: tokenSifirinci, miktar: takasMiktari, tamCikis: false,
                        token: address(tok), quote: address(usd)});
        pm.unlock(abi.encode(uint8(1)));
        _takas = Takas({key: key, zeroForOne: !tokenSifirinci, miktar: 5 * 1e6, tamCikis: false,
                        token: address(tok), quote: address(usd)});
        pm.unlock(abi.encode(uint8(1)));

        b.aciciQuoteOnce = usd.balanceOf(address(h));
        b.aciciTokenOnce = tok.balanceOf(address(h));

        /* Called by somebody with no relationship to any of this. */
        SahteAcici yabanci = new SahteAcici();
        yabanci.biriktir(h);
        b.herkesCagirabilir = true;

        b.likiditeSonra = pm.getLiquidity(id);
        b.eklenen = uint256(b.likiditeSonra) - uint256(b.likiditeOnce);
        b.aciciQuoteSonra = usd.balanceOf(address(h));
        b.aciciTokenSonra = tok.balanceOf(address(h));
    }
}

contract SahteAcici {
    function biriktir(HavuzAcici h) external { h.biriktir(); }
}

contract Yabanci {
    function ac(HavuzAcici h) external { h.ac(1, 1); }
}
