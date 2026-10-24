// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PulseLaunchpad} from "../PulseLaunchpad.sol";
import {PulseAcici} from "../PulseAcici.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

interface IERC20C2 {
    function transfer(address to, uint256 v) external returns (bool);
    function approve(address who, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

interface IKasaC2 {
    function dolasim() external view returns (uint256);
    function hak(address varlik) external view returns (uint256);
    function iade(uint256 miktar) external returns (uint256, uint256);
}

/// A founder that is not the trader.
///
/// The harness launched the token itself first and the run died with
/// Panic(0x11): the founder's slice is measured as an INCREASE in the
/// founder's balance, and the harness also pays for the swaps — so its
/// balance fell and the subtraction underflowed. Not a test artefact: it
/// is the same confusion a real launch would have if the founder and the
/// trader were one account.
contract KurucuC2 {
    function launch(
        PulseLaunchpad lp,
        address quote,
        string calldata ad,
        string calldata sembol,
        address hedefVarlik,
        uint256 vergiPpm,
        uint256 alim,
        uint256 teminat
    ) external returns (address token, address kasa) {
        IERC20C2(quote).approve(address(lp), type(uint256).max);
        return lp.launch(ad, sembol, hedefVarlik, vergiPpm, alim, teminat);
    }

    function gonder(address token, address to, uint256 v) external {
        IERC20C2(token).transfer(to, v);
    }
}

/// @title TestPulseCanli — the full life cycle against the DEPLOYED
///        launchpad
///
/// WHY A SEPARATE HARNESS
///   `TestPulseLaunch` builds the launchpad ITSELF, and that was the right
///   thing while nothing was deployed: what was measured was the CODE.
///   There is one on chain now, and the two claims differ:
///
///     "this code is correct"            -> 601 assertions + the launch
///                                          measurement
///     "this address on chain is right"  -> denetim-dagitim-pulse2, 34
///                                          assertions
///     "this address on chain WORKS"     -> nothing says anything
///
///   This is the third. It deploys nothing; it CALLS the deployed
///   launchpad, against the real PoolManager, with the real hook and real
///   USDC. The only fake thing is this contract's balance.
///
/// SIX THINGS ARE MEASURED, IN SEQUENCE AND ON THE SAME MONEY
///   1. Does a launch really happen — the founder's share, collateral, pool
///   2. Does dolasim() exclude the pool  (if wrong it WOULD NOT REVERT)
///   3. Does an exact-input buy get its USDC tax to the vault  (beforeSwap)
///   4. Does an exact-output buy pay the fee  (the old hook's hole)
///   5. Does the sell tax reach the vault
///   6. Can somebody who burns tokens get their money, and does the claim
///      stay constant
///
///   Measured separately, a system whose links between them were broken
///   would also pass all six: the vault can fill while the claim does not
///   see that money, and the claim can be right while the redemption does
///   not pay.
contract TestPulseCanli {
    using PoolIdLibrary for PoolKey;

    struct Sonuc {
        address token;
        address acici;
        address kasa;
        address kurucu;
        bool tokenSifirinci;

        bool launchGecti;
        bytes launchSebep;
        uint256 alim;
        uint256 ucret;
        uint256 net;
        uint256 teminat;
        uint256 kurucuToken;
        uint256 merdiven;
        uint256 arz;

        uint160 havuzSqrtP;
        int24 havuzTick;
        uint160 beklenenSqrtP;
        uint256 kasadakiUsdc;
        uint256 aciciKalanToken;
        uint256 aciciKalanQuote;
        uint256 bildirilenTeklif;

        uint256 dolasim;
        uint256 cuzdandaki;
        uint256 havuzdakiToken;
        uint256 hak;

        bool giristenGecti;
        uint256 giristenOdenen;
        uint256 giristenAlinan;
        uint256 giristenKurucuArtti;
        uint256 giristenKasaArtti;
        uint256 giristenDerinlikArtti;
        uint256 giristenLikiditeArtti;
        bytes giristenSebep;

        bool ciktidanGecti;
        uint256 ciktidanIstenen;
        uint256 ciktidanOdenen;
        uint256 ciktidanKurucuArtti;
        uint256 ciktidanKasaArtti;
        uint256 ciktidanDerinlikArtti;
        bytes ciktidanSebep;

        bool satisGecti;
        uint256 satilanToken;
        uint256 satistanAlinan;
        uint256 satistanKasaArtti;
        bytes satisSebep;

        /* ---- 6. and out again ---- */
        uint256 hakIadeOncesi;
        bool iadeGecti;
        uint256 iadeYakilan;
        uint256 iadeAlinan;
        uint256 iadeBeklenen;
        uint256 hakIadeSonrasi;
        bytes iadeSebep;
    }

    IPoolManager private _pm;
    PoolKey private _key;
    bool private _t0;

    function kos(
        PulseLaunchpad lp,
        address quote,
        address likiditeKasasi,
        uint256 alim,
        uint256 teminat,
        uint256 vergiPpm,
        address hedefVarlik
    ) external returns (Sonuc memory s) {
        _pm = IPoolManager(lp.poolManager());

        s.alim = alim;
        s.teminat = teminat;

        KurucuC2 kurucu = new KurucuC2();
        s.kurucu = address(kurucu);
        IERC20C2(quote).transfer(address(kurucu), alim + teminat);

        uint256 idOnce = lp.launchCount();

        try kurucu.launch(lp, quote, "Arc Pulse", "PULSE", hedefVarlik,
                          vergiPpm, alim, teminat)
            returns (address t, address k)
        {
            s.launchGecti = true;
            s.token = t;
            s.kasa = k;
        } catch (bytes memory e) {
            s.launchSebep = e;
            return s;
        }

        PulseLaunchpad.Kayit memory kay = lp.launchAt(idOnce);
        s.acici = kay.acici;
        s.kurucuToken = kay.kurucuToken;
        s.net = kay.teklif;
        s.ucret = alim - s.net;
        s.arz = IERC20C2(s.token).totalSupply();
        s.merdiven = s.arz - s.kurucuToken;
        _t0 = s.token < quote;
        s.tokenSifirinci = _t0;

        (s.beklenenSqrtP,,) = lp.acilisBandi(s.token);
        _key = lp.havuzAnahtari(s.token);
        (s.havuzSqrtP, s.havuzTick) = _slot0();

        s.kasadakiUsdc = IERC20C2(quote).balanceOf(s.kasa);
        s.aciciKalanToken = IERC20C2(s.token).balanceOf(s.acici);
        s.aciciKalanQuote = IERC20C2(quote).balanceOf(s.acici);
        s.bildirilenTeklif = PulseAcici(s.acici).havuzdakiQuote();

        s.dolasim = IKasaC2(s.kasa).dolasim();
        s.havuzdakiToken = IERC20C2(s.token).balanceOf(address(_pm));
        /* Computed from balances here so it shares no code with the vault.
           The founder still holds its share at this point, so wallets are
           everything minus the pool's unsold inventory and the ladder's
           remainder. */
        s.cuzdandaki = s.arz - s.havuzdakiToken - s.aciciKalanToken;
        s.hak = IKasaC2(s.kasa).hak(quote);

        kurucu.gonder(s.token, address(this), IERC20C2(s.token).balanceOf(address(kurucu)));

        /* ---- exact-input buy: the beforeSwap leg ------------------- */
        {
            uint256 k0 = IERC20C2(quote).balanceOf(s.kurucu);
            uint256 v0 = IERC20C2(quote).balanceOf(s.kasa);
            uint256 d0 = IERC20C2(quote).balanceOf(s.acici);
            uint256 l0 = IERC20C2(quote).balanceOf(likiditeKasasi);
            s.giristenOdenen = s.net / 20;
            try this.takas(-int256(s.giristenOdenen), true) returns (uint256 a, uint256) {
                s.giristenGecti = true;
                s.giristenAlinan = a;
            } catch (bytes memory e) { s.giristenSebep = e; }
            s.giristenKurucuArtti = IERC20C2(quote).balanceOf(s.kurucu) - k0;
            s.giristenKasaArtti = IERC20C2(quote).balanceOf(s.kasa) - v0;
            s.giristenDerinlikArtti = IERC20C2(quote).balanceOf(s.acici) - d0;
            s.giristenLikiditeArtti = IERC20C2(quote).balanceOf(likiditeKasasi) - l0;
        }

        /* ---- exact-output buy: the old hole ----------------------- */
        {
            uint256 k0 = IERC20C2(quote).balanceOf(s.kurucu);
            uint256 v0 = IERC20C2(quote).balanceOf(s.kasa);
            uint256 d0 = IERC20C2(quote).balanceOf(s.acici);
            s.ciktidanIstenen = s.giristenAlinan == 0 ? 1_000_000e18 : s.giristenAlinan / 2;
            try this.takas(int256(s.ciktidanIstenen), true) returns (uint256, uint256 o) {
                s.ciktidanGecti = true;
                s.ciktidanOdenen = o;
            } catch (bytes memory e) { s.ciktidanSebep = e; }
            s.ciktidanKurucuArtti = IERC20C2(quote).balanceOf(s.kurucu) - k0;
            s.ciktidanKasaArtti = IERC20C2(quote).balanceOf(s.kasa) - v0;
            s.ciktidanDerinlikArtti = IERC20C2(quote).balanceOf(s.acici) - d0;
        }

        /* ---- a sale ---------------------------------------------- */
        {
            uint256 v0 = IERC20C2(quote).balanceOf(s.kasa);
            s.satilanToken = IERC20C2(s.token).balanceOf(address(this)) / 4;
            if (s.satilanToken > 0) {
                try this.takas(-int256(s.satilanToken), false) returns (uint256 a, uint256) {
                    s.satisGecti = true;
                    s.satistanAlinan = a;
                } catch (bytes memory e) { s.satisSebep = e; }
            }
            s.satistanKasaArtti = IERC20C2(quote).balanceOf(s.kasa) - v0;
        }

        /* ---- and out of the vault -------------------------------- */
        {
            s.hakIadeOncesi = IKasaC2(s.kasa).hak(quote);
            uint256 elde = IERC20C2(s.token).balanceOf(address(this));
            s.iadeYakilan = elde / 4;
            if (s.iadeYakilan > 0 && s.hakIadeOncesi > 0) {
                /* HAK_OLCEGI is 1e36, not 1e18. Divided by 1e18 once and
                   the expected payout came out as
                   $84.984.351.872.924.860 against an actual $0,08 —
                   caught only because it was absurd. */
                s.iadeBeklenen = (s.iadeYakilan * s.hakIadeOncesi) / 1e36;
                IERC20C2(s.token).approve(s.kasa, type(uint256).max);
                try IKasaC2(s.kasa).iade(s.iadeYakilan) returns (uint256 odenen, uint256) {
                    s.iadeGecti = true;
                    s.iadeAlinan = odenen;
                } catch (bytes memory e) { s.iadeSebep = e; }
            }
            s.hakIadeSonrasi = IKasaC2(s.kasa).hak(quote);
        }
    }

    /// `miktar` negative is exact-input, positive is exact-output.
    /// `alim` true spends the quote to get tokens.
    function takas(int256 miktar, bool alim) external returns (uint256 alinan, uint256 odenen) {
        bytes memory r = _pm.unlock(abi.encode(miktar, alim));
        return abi.decode(r, (uint256, uint256));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (int256 miktar, bool alim) = abi.decode(data, (int256, bool));
        /* Buying means spending the quote, which is currency1 when the
           token sorts first — so zeroForOne is false then. Derived from
           the ordering, never hardcoded: the flag means opposite things
           for the two orderings and this has been got backwards before. */
        bool zeroForOne = alim ? !_t0 : _t0;

        BalanceDelta delta = _pm.swap(
            _key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: miktar,
                sqrtPriceLimitX96: zeroForOne
                    ? TickMath.MIN_SQRT_PRICE + 1
                    : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        int128 d0 = delta.amount0();
        int128 d1 = delta.amount1();
        int128 tokenD = _t0 ? d0 : d1;
        int128 quoteD = _t0 ? d1 : d0;
        _ode(_key.currency0, d0);
        _ode(_key.currency1, d1);

        uint256 a = alim
            ? (tokenD > 0 ? uint256(uint128(tokenD)) : 0)
            : (quoteD > 0 ? uint256(uint128(quoteD)) : 0);
        uint256 o = alim
            ? (quoteD < 0 ? uint256(uint128(-quoteD)) : 0)
            : (tokenD < 0 ? uint256(uint128(-tokenD)) : 0);
        return abi.encode(a, o);
    }

    function _ode(Currency para, int128 delta) internal {
        if (delta > 0) {
            _pm.take(para, address(this), uint256(uint128(delta)));
            return;
        }
        if (delta == 0) return;
        uint256 borc = uint256(uint128(-delta));
        _pm.sync(para);
        IERC20C2(Currency.unwrap(para)).transfer(address(_pm), borc);
        _pm.settle();
    }

    function _slot0() internal view returns (uint160, int24) {
        bytes32 slot = keccak256(abi.encode(PoolId.unwrap(_key.toId()), uint256(6)));
        bytes32 raw = _pm.extsload(slot);
        return (uint160(uint256(raw)), int24(uint24(uint256(raw) >> 160)));
    }
}
