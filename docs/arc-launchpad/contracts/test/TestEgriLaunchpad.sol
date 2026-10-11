// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EgriFabrika} from "../EgriFabrika.sol";
import {AciciFabrika} from "../AciciFabrika.sol";
import {EgriLaunchpad} from "../EgriLaunchpad.sol";
import {KasaFabrika} from "../KasaFabrika.sol";
import {YoneticiFabrika} from "../YoneticiFabrika.sol";
import {CrossChainAssetRegistry} from "../CrossChainAssetRegistry.sol";
import {HavuzAcici, IERC20H} from "../HavuzAcici.sol";
import {IOracle} from "../IOracle.sol";
import {ChainlinkOracle} from "../ChainlinkOracle.sol";
import {EgriLaunch} from "../EgriLaunch.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @notice Does a curve launch actually happen, against the real Arc
///         PoolManager?
///
/// WHY THIS TEST EXISTS
///   Everything else about the curve launchpad was proved by compiling it
///   and by simulating its arithmetic in JavaScript, and both of those were
///   reported as if they meant it worked. They did not. The first version
///   of this architecture used ArcLaunchHook, whose `beforeAddLiquidity`
///   refuses any caller but the single address it was constructed with —
///   and the ladder is a different contract for every launch. Every launch
///   would have reverted while opening its own market, and no amount of
///   simulation would have said so, because the simulation never asked
///   Uniswap anything.
///
///   So this runs the real thing: deploy the factories and the launchpad,
///   call `launch`, and let v4 accept or reject the ladder. A pass means
///   the pool exists and holds what it should. A revert means it does not,
///   which is the answer that was missing.
///
/// HOW THE HOOK GETS A LEGAL ADDRESS
///   v4 reads a hook's permissions out of the low bits of its address, so
///   a hook cannot simply be `new`ed here. The runner builds its runtime
///   code separately and injects it at an address carrying the right bits,
///   then passes that address in. The launchpad is deployed third, so the
///   runner can predict its address with CREATE and bake it into the hook
///   before either exists.
interface IERC20Onay {
    function approve(address spender, uint256 v) external returns (bool);
}

interface IKasaOku {
    function sepet() external view returns (address[] memory);
    function bakiye(address) external view returns (uint256);
    function hak(address) external view returns (uint256);
    function dolasim() external view returns (uint256);
}

contract TestEgriLaunchpad {
    /* CCTP v2 on Arc. Measured at the same deterministic addresses on
       Arc, Ethereum and Base. */
    address constant TOKEN_MESSENGER = 0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d;
    address constant MESAJ_TASIYICI = 0x81D40F21F12A8F0E3252Bccb954D722d4c464B64;

    struct Sonuc {
        address launchpad;
        address token;
        address egri;
        address acici;
        address rewards;
        bytes32 havuzId;
        /// What the ladder is holding once it has opened. The whole point:
        /// a launch that costs nothing still puts half the supply on sale.
        /* Zero after opening, and that is the pass: everything the ladder
           was sent went into the pool as liquidity. The first version of
           this test asserted half the supply was still SITTING here, which
           described a ladder that had failed to place anything. */
        uint256 merdivendekiToken;
        /// Where those tokens actually are now.
        uint256 havuzdakiToken;
        uint256 merdivenLikidite;
        bool merdivenAcildi;
        /// The curve's side, for the same reason.
        uint256 egridekiToken;
        uint256 egriFantom;
        uint256 egriSanalToken;
        uint256 egriEsik;
        /// Nobody was given anything.
        uint256 kurucununTokeni;
        uint256 launchpadinTokeni;
        uint160 acilisSqrtP;
        /* What the payment actually did. */
        address kasa;
        uint256 kasadakiUsdc;
        uint256 havuzdakiUsdc;
        uint256 gelistiriciAldi;
        uint256 likiditeAldi;
        uint256 isletmeAldi;
        uint256 launchpadinUsdcKalani;
    }

    function run(
        IPoolManager poolManager,
        IERC20H quote,
        IHooks hook,
        address gelistirici,
        address likidite,
        address isletme,
        address okunabilirVarlik,
        address okunabilirFeed
    ) external returns (Sonuc memory s) {
        /* The vault needs a value adapter even when the basket is USDC
           only — the quote is worth itself, but the constructor has to be
           given something that satisfies IOracle. A real adapter with a
           real USDC/USD feed, so the test does not depend on a stub that
           would hide a mismatch. */
        address[] memory ov = new address[](1);
        address[] memory of_ = new address[](1);
        uint64[] memory oy = new uint64[](1);
        /* cirBTC with the BTC/USD aggregator, which answers external
           calls. The USDC/USD one does not: it is an
           AccessControlledOffchainAggregator and reverts with "No access".
           The vault never asks the oracle about the quote — degerle()
           returns face value for it — so this is the honest registration
           rather than a convenient one. */
        ov[0] = okunabilirVarlik; of_[0] = okunabilirFeed; oy[0] = 30 days;
        IOracle orc = IOracle(address(new ChainlinkOracle(address(quote), ov, of_, oy)));
        EgriFabrika f = new EgriFabrika();              // nonce 0
        AciciFabrika af = new AciciFabrika();           // nonce 1
        /* What the new vault needs. The registry is built with ONE remote
           chain so the derivation path is exercised; nothing is deployed on
           the far side and nothing needs to be, because Arc COMPUTES the
           remote address rather than storing it. */
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
        EgriLaunchpad lp = new EgriLaunchpad(
            f, af, quote, poolManager, hook,
            1 days, 5, gelistirici, likidite, isletme,
            kf, kayit, TOKEN_MESSENGER, MESAJ_TASIYICI
        );
        s.launchpad = address(lp);

        /* Basket: USDC only, weight 10_000. USDC is not privileged here —
           it is simply the one asset that needs no conversion, so step 3
           can be tested without also exercising step 4's swap path. */
        EgriLaunchpad.SepetKalem[] memory sepet = new EgriLaunchpad.SepetKalem[](1);
        sepet[0] = EgriLaunchpad.SepetKalem({varlik: address(quote), agirlikBps: 10_000});

        /* The PoolManager custodies EVERY pool on Arc — $3.2M of USDC. Its
           total balance measures the chain, not this launch, so the delta
           across the launch is what this launch actually put in. The first
           version asserted against the total and reported a working launch
           as broken by a factor of forty thousand. */
        uint256 pmOnce = quote.balanceOf(address(poolManager));
        uint256 gOnce = quote.balanceOf(gelistirici);
        uint256 lOnce = quote.balanceOf(likidite);
        uint256 iOnce = quote.balanceOf(isletme);

        IERC20Onay(address(quote)).approve(address(lp), type(uint256).max);
        (address token, address egri) = lp.launch(
            "Test Coin", "TEST", sepet, 10_000, 100e6, 20e6, 0
        );
        s.token = token;
        s.egri = egri;

        EgriLaunchpad.Kayit memory k = lp.launchAt(0);
        s.acici = k.acici;
        s.rewards = k.rewards;
        s.havuzId = PoolId.unwrap(lp.havuzAnahtari(token).toId());

        HavuzAcici m = HavuzAcici(k.acici);
        s.merdivenAcildi = m.acildi();
        s.merdivenLikidite = m.likidite();
        s.acilisSqrtP = m.acilisSqrtPriceX96();
        s.merdivendekiToken = IERC20H(token).balanceOf(k.acici);
        s.havuzdakiToken = IERC20H(token).balanceOf(address(poolManager));

        EgriLaunch e = EgriLaunch(egri);
        s.egridekiToken = IERC20H(token).balanceOf(egri);
        s.egriFantom = e.FANTOM();
        s.egriSanalToken = e.SANAL_TOKEN();
        s.egriEsik = e.ESIK();

        /* The launcher is this contract, so "the creator got nothing" is
           this contract's balance. The launchpad's own balance has to be
           zero too: it holds the ladder's share for a few opcodes and must
           not keep any of it. */
        s.kurucununTokeni = IERC20H(token).balanceOf(address(this));
        s.launchpadinTokeni = IERC20H(token).balanceOf(address(lp));

        s.kasa = k.kasa;
        s.kasadakiUsdc = quote.balanceOf(k.kasa);
        /* The DELTA, not the balance. The manager custodies every pool on
           the chain; its total says nothing about this one. */
        s.havuzdakiUsdc = quote.balanceOf(address(poolManager)) - pmOnce;
        s.gelistiriciAldi = quote.balanceOf(gelistirici) - gOnce;
        s.likiditeAldi = quote.balanceOf(likidite) - lOnce;
        s.isletmeAldi = quote.balanceOf(isletme) - iOnce;
        s.launchpadinUsdcKalani = quote.balanceOf(address(lp));
    }

    struct UcretSonuc {
        address egri;
        address rewards;
        uint256 odenen;          // what went in, gross
        uint256 alinanToken;
        uint256 toplanan;        // the curve's real reserve after
        uint256 vergi;           // snipe tax + the depth slice, held back
        uint256 kurucuAldi;
        uint256 rewardsAldi;
        uint256 gelistiriciAldi;
        uint256 likiditeAldi;
        uint256 isletmeAldi;
        uint256 snipeOrani;      // ppm, at the moment of the buy
        /* The collateral tax, read from the vault rather than from the
           code that is supposed to send it there. */
        address kasa;
        uint256 kasayaGiden;
        uint256 vergiPpm;
    }

    /// Buy on the curve and report where every slice of the fee landed.
    ///
    /// The creator's slice is paid to whoever called `launch`, and here
    /// that is this contract — which is also the buyer. So the creator's
    /// receipt is measured as a delta across the buy rather than as a
    /// balance, or the money spent would be netted against the money
    /// earned and both would be wrong.
    ///
    /// `block.timestamp` cannot be moved inside an eth_call, so the buy
    /// always lands in the curve's opening second and pays the full 99%
    /// snipe tax. That is not worked around: the tax is reported, and the
    /// deposit is large enough that the 2% taken from what survives is
    /// still big enough to divide six ways and check.
    function ucretTesti(
        IPoolManager poolManager,
        IERC20H quote,
        IHooks hook,
        address gelistirici,
        address likidite,
        address isletme,
        uint256 alim,
        address okunabilirVarlik,
        address okunabilirFeed
    ) external returns (UcretSonuc memory u) {
        address[] memory ov = new address[](1);
        address[] memory of_ = new address[](1);
        uint64[] memory oy = new uint64[](1);
        /* cirBTC with the BTC/USD aggregator, which answers external
           calls. The USDC/USD one does not: it is an
           AccessControlledOffchainAggregator and reverts with "No access".
           The vault never asks the oracle about the quote — degerle()
           returns face value for it — so this is the honest registration
           rather than a convenient one. */
        ov[0] = okunabilirVarlik; of_[0] = okunabilirFeed; oy[0] = 30 days;
        IOracle orc = IOracle(address(new ChainlinkOracle(address(quote), ov, of_, oy)));
        EgriFabrika f = new EgriFabrika();
        AciciFabrika af = new AciciFabrika();
        /* What the new vault needs. The registry is built with ONE remote
           chain so the derivation path is exercised; nothing is deployed on
           the far side and nothing needs to be, because Arc COMPUTES the
           remote address rather than storing it. */
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
        EgriLaunchpad lp = new EgriLaunchpad(
            f, af, quote, poolManager, hook,
            1 days, 5, gelistirici, likidite, isletme,
            kf, kayit, TOKEN_MESSENGER, MESAJ_TASIYICI
        );
        EgriLaunchpad.SepetKalem[] memory sepet2 = new EgriLaunchpad.SepetKalem[](1);
        sepet2[0] = EgriLaunchpad.SepetKalem({varlik: address(quote), agirlikBps: 10_000});
        IERC20Onay(address(quote)).approve(address(lp), type(uint256).max);
        /* 3%, not the 1% default, so a rate that was hardcoded anywhere
           instead of read from the registry would be visible. */
        (, address egri) = lp.launch("Fee Coin", "FEE", sepet2, 30_000, 100e6, 20e6, 0);
        EgriLaunchpad.Kayit memory k = lp.launchAt(0);
        u.egri = egri;
        u.rewards = k.rewards;

        uint256 kasaOnce = quote.balanceOf(k.kasa);
        uint256 kurucuOnce = quote.balanceOf(address(this));
        uint256 rwOnce = quote.balanceOf(k.rewards);
        uint256 gOnce = quote.balanceOf(gelistirici);
        uint256 lOnce = quote.balanceOf(likidite);
        uint256 iOnce = quote.balanceOf(isletme);

        EgriLaunch e = EgriLaunch(egri);
        u.snipeOrani = e.snipeOrani(0);
        IERC20Onay(address(quote)).approve(egri, alim);
        u.alinanToken = e.al(alim, 0);
        u.odenen = alim;
        u.toplanan = e.toplanan();
        u.vergi = e.vergi();

        /* The buyer paid `alim` and the creator was paid its slice, both to
           this one address. Adding `alim` back is what separates them. */
        u.kurucuAldi = quote.balanceOf(address(this)) + alim - kurucuOnce;
        u.rewardsAldi = quote.balanceOf(k.rewards) - rwOnce;
        u.gelistiriciAldi = quote.balanceOf(gelistirici) - gOnce;
        u.likiditeAldi = quote.balanceOf(likidite) - lOnce;
        u.isletmeAldi = quote.balanceOf(isletme) - iOnce;
        u.kasa = k.kasa;
        u.kasayaGiden = quote.balanceOf(k.kasa) - kasaOnce;
        u.vergiPpm = k.vergiPpm;
    }
}
