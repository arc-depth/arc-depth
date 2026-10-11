// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TeminatKasasi, IERC20K, ICevirmeAlicisi} from "../TeminatKasasi.sol";
import {LaunchToken} from "../LaunchToken.sol";
import {ChainlinkOracle} from "../ChainlinkOracle.sol";
import {IOracle} from "../IOracle.sol";
import {SwapRouter} from "../SwapRouter.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

/// IERC20K has no approve — the vault is only ever paid, never a spender.
/// The borrower needs one, so the single missing method is declared here
/// rather than widened in the interface the vault depends on.
interface IOnay {
    function approve(address who, uint256 v) external returns (bool);
}

/// @notice Does `cevir()` survive contact with a real pool?
///
/// WHY A STUB WOULD HAVE PROVEN NOTHING
///   Conversion is the one vault operation that accepts an exchange rate,
///   so it is the one place an oracle actually binds. Tested against a mock
///   swapper that returns whatever the test asks for, every assertion would
///   be a restatement of the test's own arithmetic. So this borrows the
///   quote from the vault and routes it through Arc's live cirBTC/USDC v4
///   pool, then lets the vault judge the result against a live Chainlink
///   feed. Both sides are real and neither knows about the other.
///
/// WHAT THE BORROWER CAN DO WRONG, DELIBERATELY
///   `kesinti` makes the borrower skim a share of the cirBTC it received
///   before handing the rest over. That is the only honest way to drive the
///   failing side: the pool will not sell at a bad price on request, so the
///   bad price has to be manufactured after the swap. A test that only ran
///   the passing side would also pass against a contract with the slippage
///   check deleted.
contract TestCevirme is ICevirmeAlicisi {
    address public constant USDC   = 0x3600000000000000000000000000000000000000;
    address public constant CIRBTC = 0x171A4217b86A807A64eB94757Db6849fb4bDbAA0;

    LaunchToken public token;
    TeminatKasasi public kasa;
    SwapRouter public router;
    PoolKey public key;
    IOracle public oracle;

    /// bps of the swap output the borrower keeps for itself.
    uint256 public kesinti;
    /// Set when the borrower should route nowhere at all.
    bool public takasYapma;

    uint256 private constant ARZ = 1_000_000_000 ether;

    struct Sonuc {
        uint256 usdcOnce;
        uint256 btcOnce;
        uint256 usdcSonra;
        uint256 btcSonra;
        uint256 gelen;
        uint256 oracleDegeri;
        uint256 havuzKuru;      // what the pool gave, in USDC per full cirBTC
        uint256 oracleKuru;     // what the feed says, same units
        uint256 hakBtcOnce;
        uint256 hakBtcSonra;
        uint256 sepetOnce;
        uint256 sepetSonra;
    }

    /// `yuzdeBtc` is cirBTC's target weight in bps; USDC takes the rest.
    function _kur(IPoolManager pm, address btcFeed, uint16 yuzdeBtc) internal {
        token = new LaunchToken("Test", "TST", ARZ, address(this));
        router = new SwapRouter(pm);

        /* cirBTC ONLY. The USDC/USD aggregator on Arc is an
           AccessControlledOffchainAggregator: a wallet reads it fine
           because the controller grants msg.sender == tx.origin, and no
           contract can read it at all. Registering it would make the
           oracle revert "No access" during construction.
           Nothing is lost: degerle() returns face value for the quote,
           so the vault never asks a feed what a dollar is worth. */
        address[] memory ov = new address[](1);
        address[] memory of_ = new address[](1);
        uint64[] memory oy = new uint64[](1);
        ov[0] = CIRBTC; of_[0] = btcFeed; oy[0] = 30 days;
        oracle = IOracle(address(new ChainlinkOracle(USDC, ov, of_, oy)));

        address[] memory varliklar = new address[](2);
        uint16[] memory agirliklar = new uint16[](2);
        varliklar[0] = USDC;   agirliklar[0] = 10_000 - yuzdeBtc;
        varliklar[1] = CIRBTC; agirliklar[1] = yuzdeBtc;

        kasa = new TeminatKasasi(
            IERC20K(address(token)),
            address(uint160(0xE1)),
            address(uint160(0xAC)),
            USDC,
            oracle,
            varliklar,
            agirliklar
        );

        /* cirBTC is currency0 and USDC currency1 — read from the pool's own
           registration, not assumed from which one the product cares about.
           Getting this backwards swaps the direction and the pool returns
           nothing. */
        key = PoolKey({
            currency0: Currency.wrap(CIRBTC),
            currency1: Currency.wrap(USDC),
            fee: 1500,
            tickSpacing: 15,
            hooks: IHooks(address(0))
        });

        IOnay(USDC).approve(address(kasa), type(uint256).max);
        IOnay(USDC).approve(address(router), type(uint256).max);
    }

    /// Fund the vault with pending quote. The harness holds USDC because the
    /// state override gives it balance and Arc's gas token IS USDC.
    function _besle(uint256 usdcMiktar) internal {
        kasa.besle(USDC, usdcMiktar);
    }

    /* ---- the live conversion ----------------------------------------- */

    function cevirTesti(
        IPoolManager pm,
        address btcFeed,
        uint256 besleme,
        uint256 harcama,
        uint16 yuzdeBtc,
        uint256 _kesinti
    ) external returns (Sonuc memory s) {
        _kur(pm, btcFeed, yuzdeBtc);
        _besle(besleme);
        kesinti = _kesinti;

        s.usdcOnce = kasa.bakiye(USDC);
        s.btcOnce = kasa.bakiye(CIRBTC);
        s.hakBtcOnce = kasa.hak(CIRBTC);
        s.sepetOnce = kasa.sepetDegeri();

        s.gelen = kasa.cevir(CIRBTC, harcama, "");

        s.usdcSonra = kasa.bakiye(USDC);
        s.btcSonra = kasa.bakiye(CIRBTC);
        s.hakBtcSonra = kasa.hak(CIRBTC);
        s.sepetSonra = kasa.sepetDegeri();
        s.oracleDegeri = oracle.deger(CIRBTC, s.gelen);

        /* Both rates in the same units so the caller can see whether the
           pool and the feed agree, rather than taking "it passed" on
           faith. 1e8 is cirBTC's own scale. */
        if (s.gelen > 0) {
            s.havuzKuru = (harcama * 1e8) / s.gelen;
            s.oracleKuru = oracle.deger(CIRBTC, 1e8);
        }
    }

    /// Every refusal, each returning its own revert data so the test can
    /// tell "wrong reason" from "right reason".
    function redTesti(
        IPoolManager pm,
        address btcFeed,
        uint256 besleme,
        uint256 harcama,
        uint16 yuzdeBtc,
        uint256 _kesinti,
        address hedef
    ) external returns (bool revertEtti, bytes memory sebep) {
        _kur(pm, btcFeed, yuzdeBtc);
        _besle(besleme);
        kesinti = _kesinti;
        try kasa.cevir(hedef, harcama, "") {
            revertEtti = false;
        } catch (bytes memory e) {
            revertEtti = true;
            sebep = e;
        }
    }

    /// Two conversions in sequence, to see whether the weight ceiling stops
    /// the second one. A single call cannot show that: the first conversion
    /// is what moves the share.
    function ikiKezTesti(
        IPoolManager pm,
        address btcFeed,
        uint256 besleme,
        uint256 harcama,
        uint16 yuzdeBtc
    )
        external
        returns (
            bool birinciRevert,
            uint256 birinci,
            bool ikinciRevert,
            bytes memory sebep,
            uint256 payBps
        )
    {
        _kur(pm, btcFeed, yuzdeBtc);
        _besle(besleme);
        /* The first call is wrapped too. A ceiling that refuses the
           first conversion is a real outcome — sized wrong it is exactly
           what happens — and a harness that reverts there would report
           nothing about the second. */
        try kasa.cevir(CIRBTC, harcama, "") returns (uint256 g) {
            birinci = g;
        } catch {
            birinciRevert = true;
            return (birinciRevert, 0, false, "", 0);
        }
        uint256 toplam = kasa.sepetDegeri();
        if (toplam > 0) {
            payBps = (oracle.deger(CIRBTC, kasa.bakiye(CIRBTC)) * 10_000) / toplam;
        }
        try kasa.cevir(CIRBTC, harcama, "") {
            ikinciRevert = false;
        } catch (bytes memory e) {
            ikinciRevert = true;
            sebep = e;
        }
    }

    /* ---- the loan callback ------------------------------------------- */

    /// The vault has already sent `harcama` of the quote. Whatever this
    /// leaves in the vault is what the vault will judge.
    function cevirmeCagrisi(address odunc, uint256 harcama, address hedef, bytes calldata)
        external
        override
    {
        if (msg.sender != address(kasa)) revert("cagiran kasa degil");
        odunc;
        if (takasYapma) return;

        uint256 once = IERC20K(hedef).balanceOf(address(this));
        router.swap(key, false, harcama, 0);     // USDC in (currency1), cirBTC out
        uint256 cikti = IERC20K(hedef).balanceOf(address(this)) - once;

        uint256 gonderilecek = cikti - (cikti * kesinti) / 10_000;
        IERC20K(hedef).transfer(address(kasa), gonderilecek);
    }
}
