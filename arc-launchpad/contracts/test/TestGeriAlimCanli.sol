// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EgriFabrika} from "../EgriFabrika.sol";
import {AciciFabrika} from "../AciciFabrika.sol";
import {EgriLaunchpad} from "../EgriLaunchpad.sol";
import {KasaFabrika} from "../KasaFabrika.sol";
import {YoneticiFabrika} from "../YoneticiFabrika.sol";
import {CrossChainAssetRegistry} from "../CrossChainAssetRegistry.sol";
import {HavuzAcici, IERC20H} from "../HavuzAcici.sol";
import {ChainlinkOracle} from "../ChainlinkOracle.sol";
import {IOracle} from "../IOracle.sol";
import {SwapRouter} from "../SwapRouter.sol";
import {GeriAlimRobotu} from "../GeriAlimRobotu.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

interface IERC20Onay2 {
    function approve(address who, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// IERC20H has no totalSupply — the opener never needs one. Declared here
/// rather than widened in the interface the production contracts use.
interface IArzT {
    function totalSupply() external view returns (uint256);
}

interface IEgriMezun {
    function al(uint256, uint256) external returns (uint256);
    function mezunEt() external;
    function toplanan() external view returns (uint256);
    function ESIK() external view returns (uint256);
    function mezun() external view returns (bool);
    function vergi() external view returns (uint256);
}

interface IAciciMezun {
    function acildi() external view returns (bool);
    function egri() external view returns (address);
}

interface IEgriT {
    function al(uint256 quoteMiktari, uint256 asgariToken) external returns (uint256);
}

interface IKasaT {
    function besle(address varlik, uint256 miktar) external;
    function hak(address varlik) external view returns (uint256);
    function bakiye(address varlik) external view returns (uint256);
    function dolasim() external view returns (uint256);
    function bosluk(address varlik, uint256 harcama, uint256 donecek) external view returns (uint256);
    function ISLEM_TAVANI_BPS() external view returns (uint256);
}

/// @notice Does the buyback actually buy, on a real pool, with a real
///         reserve, and does it refuse when it should?
///
/// WHY A REAL LAUNCH IS PART OF THE TEST
///   A buyback needs a token with a market, and the market has to be one
///   the vault did not create. So this runs the whole launch — factories,
///   launchpad, curve, pool — and then attacks the result. Anything less
///   tests the arithmetic twice and the plumbing never.
///
/// WHEN A BUYBACK IS EVEN POSSIBLE
///   Only when the market price sits BELOW the reserve's claim per token.
///   At launch it does not: the reserve holds $20 against 22.3M circulating
///   tokens priced at $0.0000035, so the claim is roughly a quarter of the
///   price and any buyback would lower it. The vault refuses — and that
///   refusal is the first thing worth proving, because a contract that
///   bought anyway would be handing the reserve to whoever called.
///
///   Feeding the reserve is what changes the answer, and it is not a
///   contrivance: it is what the collateral tax does on every trade, slowly.
///   So `besleme` is the one dial this test turns, and it turns it to both
///   sides of the boundary.
/// A seller that is nobody else. The fee test needs the creator's slice
/// to be the ONLY reason the creator's balance moves, and a harness that
/// also receives the swap output cannot give that. So the tokens and the
/// proceeds live here instead.
contract Satici {
    function sat(
        SwapRouter router,
        PoolKey calldata key,
        address token,
        bool zeroForOne,
        uint256 miktar
    ) external {
        IERC20Onay2(token).approve(address(router), miktar);
        router.swap(key, zeroForOne, miktar, 0);
    }
}

contract TestGeriAlimCanli {
    struct Sonuc {
        address token;
        address kasa;
        address acici;
        address robot;
        uint256 dolasimOnce;
        uint256 kasaOnce;
        uint256 hakOnce;
        uint256 harcama;
        uint256 yakilan;
        uint256 odul;
        uint256 dolasimSonra;
        uint256 kasaSonra;
        uint256 hakSonra;
        uint256 cagiraninOdulu;
        uint256 robotunKalani;
        uint256 robottakiToken;
        bool revertEtti;
        bytes sebep;
        /* The opener's token balance, before and after. A buy pays its
           fee in the launch token and EgriHook sends all of it here, and
           dolasim() excludes this balance — so circulation falls by the
           burn PLUS this, and a test that measured only the burn would
           report a working buyback as broken. */
        uint256 acicidakiTokenOnce;
        uint256 acicidakiTokenSonra;
        /* The crash scenario's own numbers. */
        uint256 egridenAlinan;      // tokens bought from the curve, to dump
        uint256 dokulen;            // tokens actually sold into the pool
        uint256 fiyatOnce;          // sqrtPriceX96 before the dump
        uint256 fiyatSonra;         // and after
        /// How far the scenario got. A bare revert reports nothing, and
        /// "it failed" is not a diagnosis.
        uint8 asama;
        /// Which side of the pool the launch token sits on. sqrtPriceX96
        /// is currency1 per currency0, so without this the runner cannot
        /// tell a crash from a rally — and a sell moves it UP when the
        /// token is currency1.
        bool tokenSifirinci;
    }

    IERC20H public quote;

    function _launch(
        IPoolManager poolManager,
        IERC20H _quote,
        IHooks hook,
        address gelistirici,
        address likidite,
        address isletme,
        address okunabilirVarlik,
        address okunabilirFeed
    ) internal returns (EgriLaunchpad lp, address token, address acici, address kasa, address egri) {
        quote = _quote;
        address[] memory ov = new address[](1);
        address[] memory of_ = new address[](1);
        uint64[] memory oy = new uint64[](1);
        ov[0] = okunabilirVarlik; of_[0] = okunabilirFeed; oy[0] = 30 days;
        IOracle orc = IOracle(address(new ChainlinkOracle(address(_quote), ov, of_, oy)));

        EgriFabrika f = new EgriFabrika();
        AciciFabrika af = new AciciFabrika();
        /* The vault is cross-chain capable now, so the launch deploys
           KopruKasasi, its ledger and its manager. The registry carries ONE
           remote chain so the derivation path is exercised; nothing is
           deployed on the far side and nothing needs to be, because Arc
           computes the remote address rather than storing it.

           These three deployments shift the launchpad's nonce, which the
           runner predicts in order to bake the hook's launchpad address.
           Off by one there reverts as
           WrappedError(hook, beforeAddLiquidity, <empty>). */
        CrossChainAssetRegistry.Zincir[] memory zincirler =
            new CrossChainAssetRegistry.Zincir[](1);
        zincirler[0] = CrossChainAssetRegistry.Zincir({
            cctpDomain: 0, zincirId: 1,
            uzakFabrika: address(uint160(0xFAB71CA)),
            initKodHash: keccak256("RemoteCollateralVault.initcode.v1"),
            uzakQuote: address(uint160(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)),
            ad: "Ethereum"
        });
        CrossChainAssetRegistry kayit = new CrossChainAssetRegistry(zincirler);
        KasaFabrika kf = new KasaFabrika(new YoneticiFabrika());

        lp = new EgriLaunchpad(
            f, af, _quote, poolManager, hook,
            1 days, 5, gelistirici, likidite, isletme,
            kf, kayit,
            0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d,   // CCTP TokenMessengerV2
            0x81D40F21F12A8F0E3252Bccb954D722d4c464B64    // CCTP MessageTransmitterV2
        );

        EgriLaunchpad.SepetKalem[] memory sepet = new EgriLaunchpad.SepetKalem[](1);
        sepet[0] = EgriLaunchpad.SepetKalem({varlik: address(_quote), agirlikBps: 10_000});

        IERC20Onay2(address(_quote)).approve(address(lp), type(uint256).max);
        /* Both addresses, from the launch itself. The opener has a field
           called `egri`, but it holds whoever may call ac() — the
           launchpad — not the curve. Reading the curve off it sent
           al() to a contract without that function, which reverts with
           no data at all and says nothing about why. */
        (token, egri) = lp.launch("Test Coin", "TEST", sepet, 10_000, 100e6, 20e6, 0);
        EgriLaunchpad.Kayit memory k = lp.launchAt(0);
        acici = k.acici;
        kasa = k.kasa;
    }

    /// The launch pool's key, assembled from what the opener actually
    /// deployed with. Rebuilding it from constants would be the same guess
    /// that has already cost a debugging round once.
    function _tokenKey(HavuzAcici m) internal view returns (PoolKey memory) {
        address t = address(m.token());
        address q = address(m.quote());
        bool tokenSifirinci = t < q;
        return PoolKey({
            currency0: Currency.wrap(tokenSifirinci ? t : q),
            currency1: Currency.wrap(tokenSifirinci ? q : t),
            fee: m.fee(),
            tickSpacing: m.tickSpacing(),
            hooks: m.hook()
        });
    }

    /// Crash the price, then ask the floor to catch it.
    ///
    /// NOTHING IS ADDED TO THE RESERVE. It holds only the $20 the launch
    /// put there. The buyback becomes possible because the PRICE came
    /// down to meet the claim, which is the only way it happens in
    /// practice and the only version of this test that proves anything
    /// about a floor.
    ///
    /// The dump has to come from somewhere, so the harness buys from the
    /// curve first. That is a real purchase at a real price — the curve
    /// is the deep side at launch — and the tokens are then sold into the
    /// thin pool, which is exactly the shape of a sell-off: size arrives
    /// where the liquidity is not.
    function cokusTesti(
        IPoolManager poolManager,
        IERC20H _quote,
        IHooks hook,
        address gelistirici,
        address likidite,
        address isletme,
        address okunabilirVarlik,
        address okunabilirFeed,
        uint256 egridenAlim,
        uint256 dokmeOrani
    ) external returns (Sonuc memory s) {
        (, address token, address acici, address kasa, address egri) =
            _launch(poolManager, _quote, hook, gelistirici, likidite, isletme,
                    okunabilirVarlik, okunabilirFeed);
        s.token = token; s.kasa = kasa; s.acici = acici;

        SwapRouter router = new SwapRouter(poolManager);
        GeriAlimRobotu robot = new GeriAlimRobotu(router);
        s.robot = address(robot);
        PoolKey memory tk = _tokenKey(HavuzAcici(acici));

        /* Buy from the curve. The launchpad already approved the quote
           to itself; the curve needs its own approval. */
        s.asama = 1;                                  // launched
        IERC20Onay2(address(_quote)).approve(egri, type(uint256).max);
        try IEgriT(egri).al(egridenAlim, 0) returns (uint256 a) {
            s.egridenAlinan = a;
            s.asama = 2;                              // bought from the curve
        } catch (bytes memory e) {
            s.revertEtti = true; s.sebep = e; return s;
        }

        /* Dump into the pool. The share is a parameter because the size
           needed to break the level is what this test is measuring, not
           something to hardcode. */
        s.dokulen = (s.egridenAlinan * dokmeOrani) / 10_000;
        s.tokenSifirinci = Currency.unwrap(tk.currency0) == token;
        s.fiyatOnce = _sqrtFiyat(poolManager, tk);
        s.asama = 3;                                  // price read, so extsload works
        if (s.dokulen > 0) {
            IERC20Onay2(token).approve(address(router), type(uint256).max);
            bool tokenSifirinci = Currency.unwrap(tk.currency0) == token;
            /* The first trade this project has ever routed through
               EgriHook. The launch test opens the pool and stops, so
               every fee path below afterSwap is untried until here. */
            try router.swap(tk, tokenSifirinci, s.dokulen, 0) {
                s.asama = 4;                          // the dump went through
            } catch (bytes memory e) {
                s.revertEtti = true; s.sebep = e; return s;
            }
        }
        s.fiyatSonra = _sqrtFiyat(poolManager, tk);
        s.asama = 5;                                  // price read again

        s.acicidakiTokenOnce = IERC20H(token).balanceOf(acici);
        s.dolasimOnce = IKasaT(kasa).dolasim();
        s.kasaOnce = IKasaT(kasa).bakiye(address(_quote));
        s.hakOnce = IKasaT(kasa).hak(address(_quote));
        s.harcama = (s.kasaOnce * 200) / 10_000;        // the 2% the vault allows

        PoolKey memory bos;
        uint256 odulOnce = IERC20Onay2(address(_quote)).balanceOf(address(this));
        try robot.tetikle(kasa, address(_quote), s.harcama, tk, bos, false, 0, 0)
            returns (uint256 y, uint256 o)
        { s.yakilan = y; s.odul = o; }
        catch (bytes memory e) { s.revertEtti = true; s.sebep = e; return s; }

        s.acicidakiTokenSonra = IERC20H(token).balanceOf(acici);
        s.dolasimSonra = IKasaT(kasa).dolasim();
        s.kasaSonra = IKasaT(kasa).bakiye(address(_quote));
        s.hakSonra = IKasaT(kasa).hak(address(_quote));
        s.cagiraninOdulu = IERC20Onay2(address(_quote)).balanceOf(address(this)) - odulOnce;
        s.robotunKalani = IERC20Onay2(address(_quote)).balanceOf(address(robot));
        s.robottakiToken = IERC20H(token).balanceOf(address(robot));
    }

    struct Ucret {
        uint256 cikti;        // the swap's quote output, gross of fees
        uint256 toplam;       // what the hook took out of the pool
        uint256 kurucu;       // derived, see the note on the harness
        uint256 rewards;
        uint256 gelistirici;
        uint256 likidite;
        uint256 isletme;
        uint256 kasa;         // the collateral tax
        uint256 acici;        // depth, the unclaimed remainder
        uint256 satilan;      // tokens sold to produce it
    }

    /// Weigh every destination after one real sale through EgriHook.
    ///
    /// WHY THE CURVE'S TEST DID NOT COVER THIS
    ///   EgriLaunch carries the same fee table and olc-egri-ucret.js
    ///   measures it there, on a curve purchase. The hook is a separate
    ///   implementation of the same split, on the pool, and it was wrong:
    ///   it sized the five protocol slices against protocol+tax and then
    ///   subtracted the tax, underflowing on every sell. The table audit
    ///   compares CONSTANTS between the two contracts and cannot see an
    ///   arithmetic difference at all.
    function ucretTesti(
        IPoolManager poolManager,
        IERC20H _quote,
        IHooks hook,
        address gelistirici,
        address likidite,
        address isletme,
        address okunabilirVarlik,
        address okunabilirFeed,
        uint256 egridenAlim,
        uint256 satilacak
    ) external returns (Ucret memory u) {
        (EgriLaunchpad lp, address token, address acici, address kasa, address egri) =
            _launch(poolManager, _quote, hook, gelistirici, likidite, isletme,
                    okunabilirVarlik, okunabilirFeed);
        /* Named access, through the real struct. The positional version
           of this line read the vault where it meant to read the rewards
           contract, which counted the collateral tax twice and reported
           all seven slices as wrong. */
        address rewards = lp.launchAt(0).rewards;

        IERC20Onay2(address(_quote)).approve(egri, type(uint256).max);
        uint256 elde = IEgriT(egri).al(egridenAlim, 0);
        u.satilan = satilacak > elde ? elde : satilacak;

        SwapRouter router = new SwapRouter(poolManager);
        PoolKey memory tk = _tokenKey(HavuzAcici(acici));

        /* The seller is a separate contract, so this harness's quote
           balance moves for exactly one reason: it is the creator. */
        Satici satici = new Satici();
        IERC20H(token).transfer(address(satici), u.satilan);

        uint256[7] memory once = [
            IERC20Onay2(address(_quote)).balanceOf(rewards),
            IERC20Onay2(address(_quote)).balanceOf(gelistirici),
            IERC20Onay2(address(_quote)).balanceOf(likidite),
            IERC20Onay2(address(_quote)).balanceOf(isletme),
            IERC20Onay2(address(_quote)).balanceOf(kasa),
            IERC20Onay2(address(_quote)).balanceOf(acici),
            IERC20Onay2(address(_quote)).balanceOf(address(this))
        ];

        bool tokenSifirinci = Currency.unwrap(tk.currency0) == token;
        satici.sat(router, tk, token, tokenSifirinci, u.satilan);

        u.rewards     = IERC20Onay2(address(_quote)).balanceOf(rewards) - once[0];
        u.gelistirici = IERC20Onay2(address(_quote)).balanceOf(gelistirici) - once[1];
        u.likidite    = IERC20Onay2(address(_quote)).balanceOf(likidite) - once[2];
        u.isletme     = IERC20Onay2(address(_quote)).balanceOf(isletme) - once[3];
        u.kasa        = IERC20Onay2(address(_quote)).balanceOf(kasa) - once[4];
        u.acici       = IERC20Onay2(address(_quote)).balanceOf(acici) - once[5];
        u.kurucu = IERC20Onay2(address(_quote)).balanceOf(address(this)) - once[6];

        /* Seven measured destinations, and the gross output is what the
           seller kept plus every fee. No part of the table is used to
           compute any of these, so the runner can check the table
           against the chain rather than against itself. */
        u.toplam = u.kurucu + u.rewards + u.gelistirici + u.likidite
                 + u.isletme + u.kasa + u.acici;
        u.cikti = IERC20Onay2(address(_quote)).balanceOf(address(satici)) + u.toplam;
    }

    struct Kalkan {
        uint256 dolasim;        // what the ppm figures are measured against
        uint256 dilim;          // tokens sold per slice
        uint256[8] kasaya;      // the vault's gain on each slice
        /* What the SELLER kept on each slice. The gross output is not
           readable from outside the hook — v4 hands the trader a delta
           already net of the hook's take — but the ratio of vault gain
           to seller proceeds rises with the shield regardless. */
        uint256[8] hasilat;
        uint256 kasaToplam;
    }

    /// Sell the same amount `adet` times inside ONE transaction, and
    /// report what the vault received each time.
    ///
    /// WHY ONE TRANSACTION
    ///   Because that is the evasion. A whale does not need many wallets
    ///   or many blocks: a single contract can loop a swap twenty times,
    ///   and against a per-TRADE threshold every iteration is under it.
    ///   The shield accumulates per pool per BLOCK, and every iteration
    ///   of one transaction is in the same block no matter how it is
    ///   routed or who signed it — so this loop is the shield's real
    ///   test, and a per-trade design fails it.
    function kalkanTesti(
        IPoolManager poolManager,
        IERC20H _quote,
        IHooks hook,
        address gelistirici,
        address likidite,
        address isletme,
        address okunabilirVarlik,
        address okunabilirFeed,
        uint256 egridenAlim,
        uint256 dilim,
        uint256 adet
    ) external returns (Kalkan memory r) {
        (, address token, address acici, address kasa, address egri) =
            _launch(poolManager, _quote, hook, gelistirici, likidite, isletme,
                    okunabilirVarlik, okunabilirFeed);

        IERC20Onay2(address(_quote)).approve(egri, type(uint256).max);
        IEgriT(egri).al(egridenAlim, 0);

        SwapRouter router = new SwapRouter(poolManager);
        PoolKey memory tk = _tokenKey(HavuzAcici(acici));
        bool tokenSifirinci = Currency.unwrap(tk.currency0) == token;

        r.dolasim = IKasaT(kasa).dolasim();
        r.dilim = dilim;
        if (adet > 8) adet = 8;

        for (uint256 j = 0; j < adet; j++) {
            uint256 kasaOnce = IERC20Onay2(address(_quote)).balanceOf(kasa);
            /* A fresh seller each slice, so the gross output of THIS
               slice is readable on its own. Reusing one seller would
               mix every slice's proceeds into one balance. */
            Satici sat = new Satici();
            IERC20H(token).transfer(address(sat), dilim);
            sat.sat(router, tk, token, tokenSifirinci, dilim);
            r.kasaya[j] = IERC20Onay2(address(_quote)).balanceOf(kasa) - kasaOnce;
            r.hasilat[j] = IERC20Onay2(address(_quote)).balanceOf(address(sat));
            r.kasaToplam += r.kasaya[j];
        }
    }

    struct Tavan {
        uint256 rezervBas;
        uint256 hakBas;
        uint256 adet;             // how many calls went through
        uint256[12] harcanan;
        uint256[12] yakilan;
        uint256[12] hak;          // the claim after each call
        uint256 rezervSon;
        uint256 hakSon;
        bytes durduranSebep;      // why the next one was refused
    }

    /// Call the buyback until the vault refuses, inside one transaction.
    ///
    /// Each call asks for the full 2% a single call is allowed, so the
    /// only thing that can stop the loop is the window ceiling — or the
    /// invariant, if the price has been bought up past the claim, which
    /// is itself a valid stop and is reported by name rather than
    /// counted as the same thing.
    function tavanTesti(
        IPoolManager poolManager,
        IERC20H _quote,
        IHooks hook,
        address gelistirici,
        address likidite,
        address isletme,
        address okunabilirVarlik,
        address okunabilirFeed,
        uint256 besleme,
        uint256 azamiDeneme
    ) external returns (Tavan memory t) {
        (, address token, address acici, address kasa,) =
            _launch(poolManager, _quote, hook, gelistirici, likidite, isletme,
                    okunabilirVarlik, okunabilirFeed);
        token;

        SwapRouter router = new SwapRouter(poolManager);
        GeriAlimRobotu robot = new GeriAlimRobotu(router);
        PoolKey memory tk = _tokenKey(HavuzAcici(acici));
        PoolKey memory bos;

        IERC20Onay2(address(_quote)).approve(kasa, type(uint256).max);
        IKasaT(kasa).besle(address(_quote), besleme);

        t.rezervBas = IKasaT(kasa).bakiye(address(_quote));
        t.hakBas = IKasaT(kasa).hak(address(_quote));
        if (azamiDeneme > 12) azamiDeneme = 12;

        for (uint256 j = 0; j < azamiDeneme; j++) {
            uint256 b = IKasaT(kasa).bakiye(address(_quote));
            uint256 harcama = (b * 200) / 10_000;        // the whole per-call allowance
            if (harcama == 0) break;
            try robot.tetikle(kasa, address(_quote), harcama, tk, bos, false, 0, 0)
                returns (uint256 y, uint256)
            {
                t.harcanan[j] = harcama;
                t.yakilan[j] = y;
                t.hak[j] = IKasaT(kasa).hak(address(_quote));
                t.adet = j + 1;
            } catch (bytes memory e) {
                t.durduranSebep = e;
                break;
            }
        }

        t.rezervSon = IKasaT(kasa).bakiye(address(_quote));
        t.hakSon = IKasaT(kasa).hak(address(_quote));
    }

    struct Mezuniyet {
        uint256 esik;
        uint256 toplanan;
        bool esikGecildi;
        bool havuzZatenAcik;
        address aciciYetkilisi;
        address launchpad;
        address egri;
        bool mezunOldu;
        bool revertEtti;
        bytes sebep;
        /* Graduation does not open a second pool. It hands the curve's
           takings to the launchpad, which forwards them to the opener and
           calls biriktir, deepening the pool the launch already made.
           These are the numbers that show whether that happened. */
        uint256 likiditeOnce;
        uint256 likiditeSonra;
        uint256 arzOnce;
        uint256 arzSonra;
        uint256 havuzdaUsdcOnce;
        uint256 havuzdaUsdcSonra;
        uint256 aciciUsdcSonra;
        uint256 aciciTokenSonra;
        uint256 egriVergi;
        uint256 launchpadUsdcSonra;
        uint256 kasaUsdcOnce;
        uint256 kasaUsdcSonra;
        uint256 hakOnceM;
        uint256 hakSonraM;
    }

    /// Fill the curve past its threshold and try to graduate.
    ///
    /// The anti-snipe tax is why the gross figure is so large: at second
    /// zero SNIPE_PPM is 990_000, so 99% of the input never reaches the
    /// curve and about $620,000 gross is needed to collect $6,000.
    function mezuniyetTesti(
        IPoolManager poolManager,
        IERC20H _quote,
        IHooks hook,
        address gelistirici,
        address likidite,
        address isletme,
        address okunabilirVarlik,
        address okunabilirFeed,
        uint256 brutAlim
    ) external returns (Mezuniyet memory m) {
        (EgriLaunchpad lp, address token, address acici, address kasa, address egri) =
            _launch(poolManager, _quote, hook, gelistirici, likidite, isletme,
                    okunabilirVarlik, okunabilirFeed);
        m.launchpad = address(lp);
        m.egri = egri;
        m.aciciYetkilisi = IAciciMezun(acici).egri();
        m.havuzZatenAcik = IAciciMezun(acici).acildi();
        m.esik = IEgriMezun(egri).ESIK();

        IERC20Onay2(address(_quote)).approve(egri, type(uint256).max);
        IEgriMezun(egri).al(brutAlim, 0);
        m.toplanan = IEgriMezun(egri).toplanan();
        m.esikGecildi = m.toplanan >= m.esik;
        m.egriVergi = IEgriMezun(egri).vergi();
        m.kasaUsdcOnce = IKasaT(kasa).bakiye(address(_quote));
        m.hakOnceM = IKasaT(kasa).hak(address(_quote));

        m.likiditeOnce = HavuzAcici(acici).likidite();
        m.arzOnce = IArzT(token).totalSupply();
        /* The manager custodies every pool on Arc, so only the DELTA
           across graduation says anything about this one. */
        m.havuzdaUsdcOnce = _quote.balanceOf(address(poolManager));

        try IEgriMezun(egri).mezunEt() {
            m.mezunOldu = IEgriMezun(egri).mezun();
            m.likiditeSonra = HavuzAcici(acici).likidite();
            m.arzSonra = IArzT(token).totalSupply();
            m.havuzdaUsdcSonra = _quote.balanceOf(address(poolManager));
            m.aciciUsdcSonra = _quote.balanceOf(acici);
            m.aciciTokenSonra = IERC20H(token).balanceOf(acici);
            m.launchpadUsdcSonra = _quote.balanceOf(address(lp));
            m.kasaUsdcSonra = IKasaT(kasa).bakiye(address(_quote));
            m.hakSonraM = IKasaT(kasa).hak(address(_quote));
        } catch (bytes memory e) {
            m.revertEtti = true;
            m.sebep = e;
        }
    }

    /// The pool's own price. Read from the manager rather than inferred
    /// from a swap result, so the crash is reported as what it is.
    function _sqrtFiyat(IPoolManager pm, PoolKey memory key) internal view returns (uint256) {
        (uint160 sqrtP,,,) = _slot0(pm, key);
        return uint256(sqrtP);
    }

    function _slot0(IPoolManager pm, PoolKey memory key)
        internal view returns (uint160, int24, uint24, uint24)
    {
        bytes32 id = keccak256(abi.encode(key));
        bytes32 slot = keccak256(abi.encodePacked(id, uint256(6)));
        bytes32 v = pm.extsload(slot);
        return (
            uint160(uint256(v)),
            int24(uint24(uint256(v) >> 160)),
            uint24(uint256(v) >> 184),
            uint24(uint256(v) >> 208)
        );
    }

    /// @param besleme extra quote pushed into the reserve before the
    ///        buyback. Zero means "try it at launch", which must fail.
    /// @param harcamaBps what share of the reserve balance to spend, in bps
    ///        of the balance. The vault caps a single call at 2%, so a
    ///        larger figure here is how the cap itself gets tested.
    function run(
        IPoolManager poolManager,
        IERC20H _quote,
        IHooks hook,
        address gelistirici,
        address likidite,
        address isletme,
        address okunabilirVarlik,
        address okunabilirFeed,
        uint256 besleme,
        uint256 harcamaBps
    ) external returns (Sonuc memory s) {
        (, address token, address acici, address kasa,) =
            _launch(poolManager, _quote, hook, gelistirici, likidite, isletme,
                    okunabilirVarlik, okunabilirFeed);
        s.token = token;
        s.kasa = kasa;
        s.acici = acici;

        SwapRouter router = new SwapRouter(poolManager);
        GeriAlimRobotu robot = new GeriAlimRobotu(router);
        s.robot = address(robot);

        if (besleme > 0) {
            IERC20Onay2(address(_quote)).approve(kasa, type(uint256).max);
            IKasaT(kasa).besle(address(_quote), besleme);
        }

        s.acicidakiTokenOnce = IERC20H(token).balanceOf(acici);
        s.dolasimOnce = IKasaT(kasa).dolasim();
        s.kasaOnce = IKasaT(kasa).bakiye(address(_quote));
        s.hakOnce = IKasaT(kasa).hak(address(_quote));
        s.harcama = (s.kasaOnce * harcamaBps) / 10_000;

        PoolKey memory tk = _tokenKey(HavuzAcici(acici));
        PoolKey memory bos;

        uint256 odulOnce = IERC20Onay2(address(_quote)).balanceOf(address(this));

        try robot.tetikle(kasa, address(_quote), s.harcama, tk, bos, false, 0, 0)
            returns (uint256 y, uint256 o)
        {
            s.yakilan = y;
            s.odul = o;
        } catch (bytes memory e) {
            s.revertEtti = true;
            s.sebep = e;
            return s;
        }

        s.acicidakiTokenSonra = IERC20H(token).balanceOf(acici);
        s.dolasimSonra = IKasaT(kasa).dolasim();
        s.kasaSonra = IKasaT(kasa).bakiye(address(_quote));
        s.hakSonra = IKasaT(kasa).hak(address(_quote));
        s.cagiraninOdulu = IERC20Onay2(address(_quote)).balanceOf(address(this)) - odulOnce;
        /* The robot must be empty afterwards. A router that keeps the
           reward is a router that collects it, and this one is supposed to
           hold nothing at all. */
        s.robotunKalani = IERC20Onay2(address(_quote)).balanceOf(address(robot));
        s.robottakiToken = IERC20H(token).balanceOf(address(robot));
    }
}
