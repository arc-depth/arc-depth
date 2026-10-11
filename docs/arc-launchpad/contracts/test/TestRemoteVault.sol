// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RemoteVaultFactory} from "../RemoteVaultFactory.sol";
import {RemoteCollateralVault} from "../RemoteCollateralVault.sol";
import {RemoteSwapExecutor, IUzakKasa} from "../RemoteSwapExecutor.sol";
import {CrossChainAssetRegistry} from "../CrossChainAssetRegistry.sol";
import {MockERC20} from "./TestRedemption.sol";

/// A venue. Swaps at a fixed rate out of its own inventory, which is all a
/// test needs from a DEX: the vault must not care what it is talking to.
contract SahteMekan {
    MockERC20 public immutable a;
    MockERC20 public immutable b;
    /// b out per a in, scaled 1e18.
    uint256 public oran;

    constructor(MockERC20 _a, MockERC20 _b, uint256 _oran) {
        a = _a; b = _b; oran = _oran;
    }

    function setOran(uint256 o) external { oran = o; }

    /// Pulls `miktar` of `girdi` from the caller and pays the other side.
    function takas(address girdi, uint256 miktar) external {
        if (girdi == address(a)) {
            require(a.transferFrom(msg.sender, address(this), miktar), "a cekilemedi");
            require(b.transfer(msg.sender, (miktar * oran) / 1e18), "b yok");
        } else {
            require(b.transferFrom(msg.sender, address(this), miktar), "b cekilemedi");
            require(a.transfer(msg.sender, (miktar * 1e18) / oran), "a yok");
        }
    }
}

/// A Chainlink feed the test controls.
///
/// WHY THIS MOCK EARNS ITS PLACE
///   Every other price measurement in this project reads a REAL feed,
///   deliberately. But two of the vault's refusals cannot be reached that
///   way: a feed that has stopped updating and a feed that answers zero.
///   Chainlink will not do either on demand, so without a controllable
///   feed those two branches would ship having never executed.
contract SahteBesleyici {
    int256 public cevap;
    uint256 public guncellendi;

    constructor(int256 _cevap, uint256 _guncellendi) {
        cevap = _cevap;
        guncellendi = _guncellendi;
    }

    function ayarla(int256 _cevap, uint256 _guncellendi) external {
        cevap = _cevap;
        guncellendi = _guncellendi;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, cevap, guncellendi, guncellendi, 1);
    }
}

/// The pool price source, made controllable.
///
/// WHY THIS HAS TO EXIST
///   The floor now has two sources and the interesting case is the HAND
///   OVER: a feed goes stale and the pool keeps the floor alive. On a real
///   chain neither half can be driven — Chainlink will not go stale on
///   demand and a real pool's 30-minute average cannot be moved inside a
///   test. So the hand-over would ship having never executed.
///
///   `cevapla` false makes this revert, which is what a real HavuzFiyat
///   does for an asset with no pool, an empty pool, or history shorter
///   than the window. That is the other half: BOTH sources silent must
///   refuse the conversion, not default to a zero floor.
contract SahteHavuzFiyat {
    uint256 public alis;        // asset units per quote unit spent
    uint256 public satis;       // quote units per asset unit sold
    bool public cevapla = true;

    error HavuzYok(address varlik);

    function ayarla(uint256 _alis, uint256 _satis) external {
        alis = _alis;
        satis = _satis;
    }

    function sustur(bool sessiz) external {
        cevapla = !sessiz;
    }

    function quoteIleAlinabilir(address varlik, uint256 quoteMiktari)
        external view returns (uint256, address, int24)
    {
        if (!cevapla) revert HavuzYok(varlik);
        return ((quoteMiktari * alis) / 1e6, address(this), int24(0));
    }

    function quoteKarsiligi(address varlik, uint256 varlikMiktari)
        external view returns (uint256, address, int24)
    {
        if (!cevapla) revert HavuzYok(varlik);
        return ((varlikMiktari * satis) / 1e18, address(this), int24(0));
    }
}

/// Records what CCTP was asked to do, so the test can inspect the only
/// exit this vault has.
contract SahteTokenMessenger {
    uint256 public miktar;
    uint32 public domain;
    bytes32 public alici;
    address public burnToken;
    bytes32 public destinationCaller;
    uint256 public azamiUcret;
    uint32 public kesinlik;
    bytes public kanca;
    uint256 public cagriSayisi;

    function depositForBurnWithHook(
        uint256 _amount,
        uint32 _destinationDomain,
        bytes32 _mintRecipient,
        address _burnToken,
        bytes32 _destinationCaller,
        uint256 _maxFee,
        uint32 _minFinalityThreshold,
        bytes calldata _hookData
    ) external {
        miktar = _amount;
        domain = _destinationDomain;
        alici = _mintRecipient;
        burnToken = _burnToken;
        destinationCaller = _destinationCaller;
        azamiUcret = _maxFee;
        kesinlik = _minFinalityThreshold;
        kanca = _hookData;
        cagriSayisi++;
        /* Burns are not simulated: the vault approved this contract and a
           real TokenMessenger would pull. Pulling here would only make the
           mock's bookkeeping differ from the real one's for no gain. */
    }
}

/// @notice AŞAMA 3 — the remote side, and the one measurement that has to
///         come first.
///
/// THE MEASUREMENT THAT COMES FIRST
///   Arc derives a remote vault's address from (factory, salt, initCodeHash)
///   and sends a CCTP mint there. If the factory actually deploys to a
///   different address, the mint lands where nobody holds and the money is
///   gone — and nothing before the first transfer would reveal it. So the
///   first thing tested is that three independently computed addresses
///   agree: the factory's own view, Arc's registry, and where the contract
///   really ended up.
///
/// AND THE PROPERTY THE WHOLE REMOTE SIDE RESTS ON
///   This vault has exactly one function that moves value out of the chain,
///   and it takes no recipient. Everything else either lends inside one
///   transaction against a checked outcome, or credits. A test can only
///   show that the checks work; that there is no second exit is a
///   structural claim, pinned separately by an audit over the source.
contract TestRemoteVault {
    RemoteVaultFactory public fabrika;
    RemoteCollateralVault public kasa;
    RemoteSwapExecutor public yurutucu;
    CrossChainAssetRegistry public kayit;
    SahteTokenMessenger public messenger;
    SahteMekan public mekan;
    SahteBesleyici public besleyici;
    SahteHavuzFiyat public havuzFiyat;
    MockERC20 public usdc;
    MockERC20 public pepe;

    uint32 constant ARC_DOMAIN = 26;
    uint32 constant ETH_DOMAIN = 0;
    uint256 constant TOKEN_ID = 7;
    /* The Arc-side vault, as a bytes32. Fixed, because every remote vault
       inherits it and no function can change it. */
    address constant ARC_KASA = address(uint160(0xA2C0A55E7));

    function _kur() internal {
        usdc = new MockERC20(100_000_000e6, address(this));
        pepe = new MockERC20(1_000_000_000 ether, address(this));
        messenger = new SahteTokenMessenger();

        /* 31 PEPE per dollar means PEPE is 1/31 of a dollar, which at the
           feed's 8 decimals is 3,225,806. The feed and the venue have to
           agree or the floor would block the venue for a reason that has
           nothing to do with the thing being tested. */
        besleyici = new SahteBesleyici(3_225_806, block.timestamp);

        /* The pool source starts SILENT, so every pre-existing assertion
           keeps measuring the feed alone and nothing it already proved is
           quietly re-proved by a second source. The hand-over test turns
           it on deliberately. */
        havuzFiyat = new SahteHavuzFiyat();
        havuzFiyat.sustur(true);

        RemoteVaultFactory.Besleyici[] memory bt = new RemoteVaultFactory.Besleyici[](1);
        bt[0] = RemoteVaultFactory.Besleyici({
            varlik: address(pepe),
            besleyici: address(besleyici),
            varlikOndalik: 18,
            besleyiciOndalik: 8,
            azamiYas: 3600
        });

        fabrika = new RemoteVaultFactory(
            ARC_DOMAIN,
            bytes32(uint256(uint160(ARC_KASA))),
            address(messenger),
            address(this),            // the harness plays CCTP's transmitter
            address(usdc),
            address(havuzFiyat),
            bt
        );

        /* Arc's registry, built from what the factory publishes. A
           deployment script would do exactly this, and the point of the
           first test is that it is enough. */
        CrossChainAssetRegistry.Zincir[] memory z = new CrossChainAssetRegistry.Zincir[](1);
        z[0] = CrossChainAssetRegistry.Zincir({
            cctpDomain: ETH_DOMAIN,
            zincirId: 1,
            uzakFabrika: address(fabrika),
            initKodHash: fabrika.initKodHash(),
            uzakQuote: address(usdc),
            ad: "Ethereum"
        });
        kayit = new CrossChainAssetRegistry(z);

        yurutucu = new RemoteSwapExecutor();
        /* 31 PEPE per DOLLAR, with the decimal gap folded in: USDC has 6
           places and PEPE has 18, so one USDC unit buys 31e12 raw PEPE.
           The first version used 31e18 and produced 1.24e-8 PEPE for $400 —
           a scale error that the display rounded to zero and the next test
           then failed on. Deliberately not 1, so a rate that was silently
           ignored would still show. */
        mekan = new SahteMekan(usdc, pepe, 31e30);
        pepe.transfer(address(mekan), 500_000_000 ether);
        usdc.transfer(address(mekan), 50_000_000e6);
    }

    /* ---- 1. the addresses must agree -------------------------------- */

    struct AdresSonucu {
        address fabrikaninHesabi;
        address kayittanTuretilen;
        address gercektenDagitilan;
        bytes32 initKodHash;
        bool ucuBirden;
        uint256 kasaTokenId;
        uint32 kasaArcDomain;
        bytes32 kasaArcKasasi;
        bool kimlikDogru;
    }

    function adresTesti() external returns (AdresSonucu memory s) {
        _kur();
        s.initKodHash = fabrika.initKodHash();
        s.fabrikaninHesabi = fabrika.kasaAdresi(TOKEN_ID);
        s.kayittanTuretilen = kayit.uzakKasa(ETH_DOMAIN, TOKEN_ID);

        s.gercektenDagitilan = fabrika.kasaKur(TOKEN_ID);
        kasa = RemoteCollateralVault(s.gercektenDagitilan);

        s.ucuBirden = s.fabrikaninHesabi == s.kayittanTuretilen
            && s.kayittanTuretilen == s.gercektenDagitilan;

        /* And the vault really learned who it is, with no constructor
           argument to carry it. */
        s.kasaTokenId = kasa.tokenId();
        s.kasaArcDomain = kasa.arcDomain();
        s.kasaArcKasasi = kasa.arcKasasi();
        s.kimlikDogru = s.kasaTokenId == TOKEN_ID
            && s.kasaArcDomain == ARC_DOMAIN
            && s.kasaArcKasasi == bytes32(uint256(uint160(ARC_KASA)));
    }

    /* ---- 2. inbound authority --------------------------------------- */

    struct GirisSonucu {
        bool tasiyiciOlmayanRed;
        bool yanlisDomainRed;
        bool yanlisGonderenRed;
        bool yanlisTokenIdRed;
        bool tekrarRed;
        bool dogruGecti;
        uint256 bekleyenQuote;
        address hedefVarlik;
        bool hedefDegistirilemedi;
    }

    function girisTesti() external returns (GirisSonucu memory s) {
        _kur();
        kasa = RemoteCollateralVault(fabrika.kasaKur(TOKEN_ID));

        bytes32 dogru = bytes32(uint256(uint160(ARC_KASA)));
        bytes memory govde = _fonla(TOKEN_ID, address(pepe), 1_000e6, keccak256("t1"));

        YabanciR y = new YabanciR();
        try y.dene(kasa, ARC_DOMAIN, dogru, govde) { s.tasiyiciOlmayanRed = false; }
        catch { s.tasiyiciOlmayanRed = true; }

        try kasa.handleReceiveFinalizedMessage(99, dogru, 2000, govde) { s.yanlisDomainRed = false; }
        catch { s.yanlisDomainRed = true; }

        try kasa.handleReceiveFinalizedMessage(
            ARC_DOMAIN, bytes32(uint256(uint160(0xDEAD))), 2000, govde
        ) { s.yanlisGonderenRed = false; } catch { s.yanlisGonderenRed = true; }

        bytes memory yanlisId = _fonla(999, address(pepe), 1_000e6, keccak256("t2"));
        try kasa.handleReceiveFinalizedMessage(ARC_DOMAIN, dogru, 2000, yanlisId) {
            s.yanlisTokenIdRed = false;
        } catch { s.yanlisTokenIdRed = true; }

        try kasa.handleReceiveFinalizedMessage(ARC_DOMAIN, dogru, 2000, govde) {
            s.dogruGecti = true;
        } catch { s.dogruGecti = false; }

        try kasa.handleReceiveFinalizedMessage(ARC_DOMAIN, dogru, 2000, govde) {
            s.tekrarRed = false;
        } catch { s.tekrarRed = true; }

        s.bekleyenQuote = kasa.bekleyenQuote();
        s.hedefVarlik = kasa.hedefVarlik();

        /* A second funding naming a DIFFERENT asset must be refused: a
           vault whose target can be rewritten is a vault whose collateral
           can be turned into something nobody chose. */
        bytes memory baskaVarlik = _fonla(TOKEN_ID, address(usdc), 500e6, keccak256("t3"));
        try kasa.handleReceiveFinalizedMessage(ARC_DOMAIN, dogru, 2000, baskaVarlik) {
            s.hedefDegistirilemedi = false;
        } catch { s.hedefDegistirilemedi = true; }
    }

    /* ---- 3. buy, through a real route ------------------------------- */

    struct AlisSonucu {
        uint256 bekleyenOnce;
        uint256 alinan;
        uint256 tutulanSonra;
        uint256 bekleyenSonra;
        bool azCiktiRed;
        bool yurutucuBosKaldi;
        uint256 odul;
        uint256 taban;
        uint256 odulCagiranaGitti;
        uint256 beklenenCikti;
    }

    function alisTesti(uint256 fon, uint256 harcama) external returns (AlisSonucu memory s) {
        _kur();
        kasa = RemoteCollateralVault(fabrika.kasaKur(TOKEN_ID));
        _fonlaGonder(fon);
        /* The vault must actually hold the USDC the hook credited. On chain
           a CCTP mint delivers it; here the harness does. */
        usdc.transfer(address(kasa), fon);
        s.bekleyenOnce = kasa.bekleyenQuote();

        /* The vault takes its executor fee off the top, so the route
           receives less than what was borrowed. Building the route for
           the full amount makes it pull more than the executor holds and
           fail on the allowance — a correct failure for the wrong reason,
           and one that would read as the floor rejecting an honest route. */
        s.odul = (harcama * kasa.YURUTUCU_ODUL_BPS()) / 10_000;
        uint256 takasEdilecek = harcama - s.odul;
        bytes memory rota = abi.encodeWithSelector(
            SahteMekan.takas.selector, address(usdc), takasEdilecek
        );

        /* A bound the route cannot meet. */
        try yurutucu.al(IUzakKasa(address(kasa)), harcama, type(uint256).max, address(mekan), rota) {
            s.azCiktiRed = false;
        } catch { s.azCiktiRed = true; }

        /* The venue's rate is 31e30, so the output is 31e12 per USDC unit
           — not 31. The first version wrote the latter, which made the
           minimum a trillion times too small and therefore not a bound at
           all: any route would have cleared it. */
        uint256 beklenen = takasEdilecek * 31e12;
        /* The caller's bound is deliberately ZERO here: the vault's own
           floor is what has to hold, and a stricter number would hide
           whether it does. The bound-too-high case above already proves
           the caller's number is honoured when it is stricter. */
        s.taban = kasa.alisTabani(address(pepe), takasEdilecek);
        s.alinan = yurutucu.al(
            IUzakKasa(address(kasa)), harcama, 0, address(mekan), rota
        );
        s.odulCagiranaGitti = usdc.balanceOf(address(this));
        s.beklenenCikti = beklenen;
        s.tutulanSonra = kasa.tutulan(address(pepe));
        s.bekleyenSonra = kasa.bekleyenQuote();
        s.yurutucuBosKaldi = usdc.balanceOf(address(yurutucu)) == 0
            && pepe.balanceOf(address(yurutucu)) == 0;
    }

    /* ---- 4. sell, bounded by Arc's authorisation -------------------- */

    struct SatisSonucu {
        bool izinsizRed;
        uint256 izin;
        uint256 quoteAlinan;
        uint256 tutulanSonra;
        uint256 izinSonra;
        bool izindenFazlaRed;
    }

    function satisTesti(uint256 fon, uint256 harcama, uint256 satilacak)
        external
        returns (SatisSonucu memory s)
    {
        _kur();
        kasa = RemoteCollateralVault(fabrika.kasaKur(TOKEN_ID));
        _fonlaGonder(fon);
        usdc.transfer(address(kasa), fon);

        /* Same fee-off-the-top adjustment as the buy test. */
        uint256 alOdul = (harcama * kasa.YURUTUCU_ODUL_BPS()) / 10_000;
        bytes memory alRota = abi.encodeWithSelector(
            SahteMekan.takas.selector, address(usdc), harcama - alOdul
        );
        yurutucu.al(IUzakKasa(address(kasa)), harcama, 0, address(mekan), alRota);

        bytes memory satRota = abi.encodeWithSelector(
            SahteMekan.takas.selector, address(pepe), satilacak
        );

        /* Nothing authorised yet. */
        try yurutucu.sat(IUzakKasa(address(kasa)), satilacak, 0, address(mekan), satRota) {
            s.izinsizRed = false;
        } catch { s.izinsizRed = true; }

        /* Arc authorises exactly `satilacak`. */
        _satIzni(satilacak);
        s.izin = kasa.satisIzni(address(pepe));

        s.quoteAlinan = yurutucu.sat(
            IUzakKasa(address(kasa)), satilacak, 0, address(mekan), satRota
        );
        s.tutulanSonra = kasa.tutulan(address(pepe));
        s.izinSonra = kasa.satisIzni(address(pepe));

        /* And one more unit beyond the allowance is refused. */
        bytes memory fazlaRota = abi.encodeWithSelector(
            SahteMekan.takas.selector, address(pepe), uint256(1 ether)
        );
        try yurutucu.sat(IUzakKasa(address(kasa)), 1 ether, 0, address(mekan), fazlaRota) {
            s.izindenFazlaRed = false;
        } catch { s.izindenFazlaRed = true; }
    }

    /* ---- 4b. the floor, and what makes it fail closed ---------------
     *
     * THE GAP THIS CLOSES
     *   Every other price measurement in this project reads a real feed,
     *   on purpose. But three of the vault's branches cannot be reached
     *   that way, because Chainlink will not misbehave on demand:
     *
     *     a feed that stopped updating      -> BesleyiciEskimis
     *     a feed that answers zero          -> BesleyiciSessiz
     *     a price that moved against us     -> TabanAltinda
     *
     *   Without a controllable feed those three would ship having never
     *   executed. The last one matters most: it is the difference
     *   between a floor and a decoration. Move the price and the SAME
     *   route that just succeeded has to be refused.
     */

    struct BesleyiciSonucu {
        uint256 tazeTaban;
        bool tazeGecti;
        uint256 tazeAlinan;

        bool eskimisRed;
        bytes eskimisSebep;

        bool sifirRed;
        bytes sifirSebep;

        bool negatifRed;
        bytes negatifSebep;

        uint256 yuksekTaban;      // the floor after the price doubles
        bool yuksekRed;           // ...and the same route is refused
        bytes yuksekSebep;
    }

    function besleyiciTesti(uint256 fon, uint256 harcama)
        external
        returns (BesleyiciSonucu memory s)
    {
        _kur();
        kasa = RemoteCollateralVault(fabrika.kasaKur(TOKEN_ID));
        _fonlaGonder(fon);
        usdc.transfer(address(kasa), fon);

        uint256 odul = (harcama * kasa.YURUTUCU_ODUL_BPS()) / 10_000;
        uint256 takasEdilecek = harcama - odul;
        bytes memory rota = abi.encodeWithSelector(
            SahteMekan.takas.selector, address(usdc), takasEdilecek
        );

        /* ---- a fresh feed lets an honest route through ------------- */
        s.tazeTaban = kasa.alisTabani(address(pepe), takasEdilecek);
        try yurutucu.al(IUzakKasa(address(kasa)), harcama, 0, address(mekan), rota)
            returns (uint256 a2)
        {
            s.tazeGecti = true;
            s.tazeAlinan = a2;
        } catch { s.tazeGecti = false; }

        /* ---- a feed that stopped updating -------------------------- */
        /* azamiYas is 3600 for this feed, so 7200 seconds old is past it
           by exactly a factor of two. A retired aggregator looks exactly
           like this: it still answers, and the answer is old. */
        besleyici.ayarla(3_225_806, block.timestamp - 7200);
        try yurutucu.al(IUzakKasa(address(kasa)), harcama, 0, address(mekan), rota) {
            s.eskimisRed = false;
        } catch (bytes memory e) { s.eskimisRed = true; s.eskimisSebep = e; }

        /* ---- a feed that answers zero ------------------------------ */
        besleyici.ayarla(0, block.timestamp);
        try yurutucu.al(IUzakKasa(address(kasa)), harcama, 0, address(mekan), rota) {
            s.sifirRed = false;
        } catch (bytes memory e) { s.sifirRed = true; s.sifirSebep = e; }

        /* ---- and one that answers a negative price ----------------- */
        /* latestRoundData returns int256, so a negative answer is
           expressible. Treating it as a price would make the floor
           enormous or wrap; refusing it is the only sound reading. */
        besleyici.ayarla(-1, block.timestamp);
        try yurutucu.al(IUzakKasa(address(kasa)), harcama, 0, address(mekan), rota) {
            s.negatifRed = false;
        } catch (bytes memory e) { s.negatifRed = true; s.negatifSebep = e; }

        /* ---- the floor actually binds ------------------------------ */
        /* The venue's rate does not move, but the feed now says the
           asset is worth twice as much — so the same route delivers half
           of what the vault requires. A decorative floor would wave
           this through. */
        besleyici.ayarla(3_225_806 / 2, block.timestamp);
        s.yuksekTaban = kasa.alisTabani(address(pepe), takasEdilecek);
        try yurutucu.al(IUzakKasa(address(kasa)), harcama, 0, address(mekan), rota) {
            s.yuksekRed = false;
        } catch (bytes memory e) { s.yuksekRed = true; s.yuksekSebep = e; }
    }

    /* ---- 5. the only exit ------------------------------------------- */

    struct CikisSonucu {
        uint32 gidenDomain;
        bytes32 gidenAlici;
        uint256 gidenMiktar;
        bytes32 beklenenAlici;
        bool hedefArc;
        bytes32 destinationCaller;
        bool cagiranSerbest;
        uint256 bekleyenSonra;
        bool fazlasiRed;
    }

    function cikisTesti(uint256 fon, uint256 gonderilecek)
        external
        returns (CikisSonucu memory s)
    {
        _kur();
        kasa = RemoteCollateralVault(fabrika.kasaKur(TOKEN_ID));
        _fonlaGonder(fon);
        usdc.transfer(address(kasa), fon);

        kasa.arcaGonder(gonderilecek, 0, 2000, keccak256("geri"));

        s.gidenDomain = messenger.domain();
        s.gidenAlici = messenger.alici();
        s.gidenMiktar = messenger.miktar();
        s.beklenenAlici = bytes32(uint256(uint160(ARC_KASA)));
        s.hedefArc = s.gidenDomain == ARC_DOMAIN && s.gidenAlici == s.beklenenAlici;
        s.destinationCaller = messenger.destinationCaller();
        s.cagiranSerbest = s.destinationCaller == bytes32(0);
        s.bekleyenSonra = kasa.bekleyenQuote();

        try kasa.arcaGonder(fon, 0, 2000, keccak256("fazla")) { s.fazlasiRed = false; }
        catch { s.fazlasiRed = true; }
    }

    /* ---- helpers ---------------------------------------------------- */

    function _fonla(uint256 id, address varlik, uint256 miktar, bytes32 tid)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(RemoteCollateralVault.Emir.FONLA, id, varlik, miktar, tid);
    }

    function _fonlaGonder(uint256 miktar) internal {
        kasa.handleReceiveFinalizedMessage(
            ARC_DOMAIN,
            bytes32(uint256(uint160(ARC_KASA))),
            2000,
            _fonla(TOKEN_ID, address(pepe), miktar, keccak256(abi.encode("fon", miktar)))
        );
    }

    function _satIzni(uint256 miktar) internal {
        kasa.handleReceiveFinalizedMessage(
            ARC_DOMAIN,
            bytes32(uint256(uint160(ARC_KASA))),
            2000,
            abi.encode(
                RemoteCollateralVault.Emir.SAT, TOKEN_ID, address(pepe), miktar,
                keccak256(abi.encode("sat", miktar))
            )
        );
    }
}

contract YabanciR {
    function dene(
        RemoteCollateralVault k,
        uint32 d,
        bytes32 g,
        bytes calldata govde
    ) external {
        k.handleReceiveFinalizedMessage(d, g, 2000, govde);
    }
}
