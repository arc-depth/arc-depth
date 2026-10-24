// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CrossChainAccounting} from "../CrossChainAccounting.sol";
import {CrossChainAssetRegistry} from "../CrossChainAssetRegistry.sol";
import {CrossChainCollateralManager, IKopruKasasi} from "../CrossChainCollateralManager.sol";

/// A stand-in for the vault that holds the money.
///
/// It exists to prove one property that cannot be tested any other way:
/// the contract holding the funds RE-DERIVES the destination and refuses
/// the manager's word for it. A mock that simply obeyed would make the
/// manager's correctness the only thing between the reserve and an
/// arbitrary address, which is exactly the arrangement the design rejects.
contract SahteKopruKasasi is IKopruKasasi {
    CrossChainAssetRegistry public immutable kayit;
    address public immutable _quote;
    uint256 public immutable _tokenId;
    uint256 public immutable _dolasim;

    uint64 public nonceSayac;

    /* What the last call asked for, so a test can inspect it. */
    uint32 public sonDomain;
    uint256 public sonMiktar;
    bytes32 public sonAlici;
    uint256 public sonAzamiUcret;
    uint32 public sonKesinlik;
    bytes public sonKanca;
    uint256 public cagriSayisi;

    error YanlisAlici(bytes32 istenen, bytes32 beklenen);

    constructor(CrossChainAssetRegistry _kayit, address q, uint256 t, uint256 d) {
        kayit = _kayit;
        _quote = q;
        _tokenId = t;
        _dolasim = d;
    }

    function quote() external view returns (address) { return _quote; }
    function tokenId() external view returns (uint256) { return _tokenId; }
    function dolasim() external view returns (uint256) { return _dolasim; }

    function kopruyeGonder(
        uint32 cctpDomain,
        uint256 miktar,
        bytes32 mintRecipient,
        uint256 azamiUcret,
        uint32 kesinlikEsigi,
        bytes calldata kanca
    ) external returns (uint64) {
        /* THE CHECK THAT MATTERS. The manager derived this address; so does
           the vault, independently, from the same immutable registry. A
           compromised or buggy manager cannot aim the money anywhere,
           because the contract that moves it does not accept a destination
           as input — it accepts a destination and then verifies it is the
           only one possible. */
        bytes32 beklenen = kayit.uzakKasaBytes32(cctpDomain, _tokenId);
        if (mintRecipient != beklenen) revert YanlisAlici(mintRecipient, beklenen);

        sonDomain = cctpDomain;
        sonMiktar = miktar;
        sonAlici = mintRecipient;
        sonAzamiUcret = azamiUcret;
        sonKesinlik = kesinlikEsigi;
        sonKanca = kanca;
        cagriSayisi++;
        return ++nonceSayac;
    }
}

/// @notice Does the manager let the right transfers through and nothing
///         else, and does the ledger close after a full round trip?
///
/// The harness plays two roles on purpose: it is the VAULT that owns the
/// ledger, and it is the MESSAGE TRANSMITTER that delivers inbound reports.
/// Being both is what lets one contract drive a cross-chain sequence that
/// in production spans two chains and several minutes.
contract TestCrossChainManager {
    CrossChainAccounting public defter;
    CrossChainAssetRegistry public kayit;
    CrossChainCollateralManager public yonetici;
    SahteKopruKasasi public kasa;

    /* The remote side's identity. Arbitrary but fixed, so the derived vault
       address is reproducible off chain and the test can check the
       derivation rather than trust it. */
    uint32 constant ETH_DOMAIN = 0;
    uint64 constant ETH_ID = 1;
    address constant ETH_FABRIKA = address(uint160(0xFAB71CA));
    bytes32 constant ETH_INIT = keccak256("RemoteCollateralVault.initcode.v1");
    address constant ETH_USDC = address(uint160(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48));

    address constant QUOTE = address(uint160(0x3600000000000000000000000000000000000000));
    uint256 constant TOKEN_ID = 7;
    uint256 constant DOLASIM = 1_000_000_000 ether;

    function _kur(uint256 rezerv) internal {
        CrossChainAssetRegistry.Zincir[] memory z = new CrossChainAssetRegistry.Zincir[](1);
        z[0] = CrossChainAssetRegistry.Zincir({
            cctpDomain: ETH_DOMAIN,
            zincirId: ETH_ID,
            uzakFabrika: ETH_FABRIKA,
            initKodHash: ETH_INIT,
            uzakQuote: ETH_USDC,
            ad: "Ethereum"
        });
        kayit = new CrossChainAssetRegistry(z);
        kasa = new SahteKopruKasasi(kayit, QUOTE, TOKEN_ID, DOLASIM);

        /* The harness is the vault as far as the ledger is concerned, and
           the transmitter as far as the manager is concerned. */
        defter = new CrossChainAccounting(address(this));
        yonetici = new CrossChainCollateralManager(defter, kayit, kasa, address(this));
        defter.yoneticiyiAyarla(address(yonetici));

        if (rezerv > 0) defter.girdi(QUOTE, rezerv);
    }

    /* ---- 1. the derivation ----------------------------------------- */

    struct TuretmeSonucu {
        address turetilen;
        address bagimsizHesap;
        bool ayni;
        bytes32 bytes32Hali;
        bool ustBitlerTemiz;
        bool yanlisAdresReddedildi;
    }

    function turetmeTesti() external returns (TuretmeSonucu memory s) {
        _kur(0);
        s.turetilen = kayit.uzakKasa(ETH_DOMAIN, TOKEN_ID);

        /* The same CREATE2 arithmetic, written out here independently.
           If the registry ever computed it differently — a different salt
           encoding, a forgotten 0xff — the two would diverge and this is
           the only place that would notice. */
        s.bagimsizHesap = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            ETH_FABRIKA,
            keccak256(abi.encode(TOKEN_ID)),
            ETH_INIT
        )))));
        s.ayni = s.turetilen == s.bagimsizHesap;

        s.bytes32Hali = kayit.uzakKasaBytes32(ETH_DOMAIN, TOKEN_ID);
        s.ustBitlerTemiz = uint256(s.bytes32Hali) >> 160 == 0;

        /* A bytes32 sender with rubbish in its top twelve bytes must not
           match: accepting it would let a 32-byte address collide with a
           20-byte one. */
        bytes32 kirli = bytes32(uint256(uint160(s.turetilen)) | (uint256(1) << 200));
        s.yanlisAdresReddedildi = !kayit.dogruKasaMiBytes32(ETH_DOMAIN, TOKEN_ID, kirli);
    }

    /* ---- 2. the seven checks --------------------------------------- */

    struct RedSonucu {
        bool bilinmeyenZincir;
        bool asgariAlti;
        bool teminattanFazla;
        bool islemTavaniUstu;
        bool pencereTavaniUstu;
        bool borcluParaGonderilemez;
        bool gecerliGecti;
        uint256 gecerliMiktar;
    }

    function redTesti() external returns (RedSonucu memory s) {
        /* $10,000 of reserve: the 20% per-transfer cap is $2,000 and the
           40% window is $4,000, which leaves room to cross one limit at a
           time instead of several at once. */
        _kur(10_000e6);

        try yonetici.transferBaslat(99, 1_000e6, false) { s.bilinmeyenZincir = false; }
        catch { s.bilinmeyenZincir = true; }

        try yonetici.transferBaslat(ETH_DOMAIN, 50e6, false) { s.asgariAlti = false; }
        catch { s.asgariAlti = true; }

        try yonetici.transferBaslat(ETH_DOMAIN, 20_000e6, false) { s.teminattanFazla = false; }
        catch { s.teminattanFazla = true; }

        /* Inside the reserve but above one transfer's share. */
        try yonetici.transferBaslat(ETH_DOMAIN, 3_000e6, false) { s.islemTavaniUstu = false; }
        catch { s.islemTavaniUstu = true; }

        /* A valid one, to prove the limits are limits and not a wall. */
        try yonetici.transferBaslat(ETH_DOMAIN, 2_000e6, false) returns (bytes32) {
            s.gecerliGecti = true;
            s.gecerliMiktar = kasa.sonMiktar();
        } catch { s.gecerliGecti = false; }

        /* Window: $4,000 total, $2,000 already gone. Two more transfers of
           $2,000 would be $6,000, so the third must be refused even though
           each is individually within the per-transfer cap. */
        try yonetici.transferBaslat(ETH_DOMAIN, 2_000e6, false) { } catch { }
        try yonetici.transferBaslat(ETH_DOMAIN, 2_000e6, false) { s.pencereTavaniUstu = false; }
        catch { s.pencereTavaniUstu = true; }

        /* And money owed to a redeemer cannot leave, whatever the limits
           say. A fresh setup, because the window above is now used up. */
        _kur(10_000e6);
        defter.borcYaz(QUOTE, 9_500e6);       // only $500 unencumbered
        try yonetici.transferBaslat(ETH_DOMAIN, 400e6, false) { s.borcluParaGonderilemez = false; }
        catch { s.borcluParaGonderilemez = true; }
    }

    /* ---- 3. inbound authority -------------------------------------- */

    struct GirisSonucu {
        bool tasiyiciOlmayanReddedildi;
        bool yanlisGonderenReddedildi;
        bool tekrarReddedildi;
        bool dogruMesajGecti;
    }

    function girisTesti() external returns (GirisSonucu memory s) {
        _kur(10_000e6);
        bytes32 id = yonetici.transferBaslat(ETH_DOMAIN, 1_000e6, false);

        bytes32 dogruGonderen = kayit.uzakKasaBytes32(ETH_DOMAIN, TOKEN_ID);
        bytes memory govde = abi.encode(
            CrossChainCollateralManager.Rapor.ULASTI, id, address(0), uint256(1_000e6), uint256(0)
        );

        /* Someone who is not CCTP's transmitter. */
        Yabanci2 y = new Yabanci2();
        try y.dene(yonetici, ETH_DOMAIN, dogruGonderen, govde) { s.tasiyiciOlmayanReddedildi = false; }
        catch { s.tasiyiciOlmayanReddedildi = true; }

        /* The transmitter, but a sender that is not the derived vault. */
        bytes32 sahte = bytes32(uint256(uint160(address(uint160(0xDEAD)))));
        try yonetici.handleReceiveFinalizedMessage(ETH_DOMAIN, sahte, 2000, govde) {
            s.yanlisGonderenReddedildi = false;
        } catch { s.yanlisGonderenReddedildi = true; }

        /* The real thing. */
        try yonetici.handleReceiveFinalizedMessage(ETH_DOMAIN, dogruGonderen, 2000, govde) {
            s.dogruMesajGecti = true;
        } catch { s.dogruMesajGecti = false; }

        /* The same message again. */
        try yonetici.handleReceiveFinalizedMessage(ETH_DOMAIN, dogruGonderen, 2000, govde) {
            s.tekrarReddedildi = false;
        } catch { s.tekrarReddedildi = true; }
    }

    /* ---- 4. the full round trip ------------------------------------ */

    struct TurSonucu {
        uint8[6] durumlar;
        uint256 baslangicHak;
        uint256 bitisHak;
        uint256 yoldaOrtada;
        uint256 uzakPepeOrtada;
        uint256 bitisMusait;
        uint256 bitisYolda;
        uint256 bitisUzakPepe;
        bool hakHicDusmedi;
        bool kapandi;
    }

    address constant PEPE = address(uint160(0x6982508145454Ce325dDbE47a25d4ec3d2311933));

    function turTesti(uint256 rezerv, uint256 transfer) external returns (TurSonucu memory s) {
        _kur(rezerv);
        s.baslangicHak = defter.hak(QUOTE, DOLASIM);

        bytes32 id = yonetici.transferBaslat(ETH_DOMAIN, transfer, true);
        s.durumlar[0] = uint8(yonetici.durumu(id));

        bytes32 g = kayit.uzakKasaBytes32(ETH_DOMAIN, TOKEN_ID);
        uint256 araHak = defter.hak(QUOTE, DOLASIM);

        /* FILLED — the remote vault has the quote. */
        _rapor(CrossChainCollateralManager.Rapor.ULASTI, id, g, address(0), transfer, 0);
        s.durumlar[1] = uint8(yonetici.durumu(id));

        /* SWAPPED — it bought PEPE. The quote is gone and a quantity of a
           different token is held, which is the transition the ledger
           needed a dedicated function for. */
        uint256 pepeMiktar = 31_000_000 ether;
        _rapor(CrossChainCollateralManager.Rapor.TAKAS, id, g, PEPE, transfer, pepeMiktar);
        s.durumlar[2] = uint8(yonetici.durumu(id));
        s.yoldaOrtada = defter.kova(QUOTE).yolda;
        s.uzakPepeOrtada = defter.kova(PEPE).uzak;

        /* RETURNING — sold back to the quote. */
        _rapor(CrossChainCollateralManager.Rapor.GERI_TAKAS, id, g, PEPE, pepeMiktar, transfer);
        s.durumlar[3] = uint8(yonetici.durumu(id));

        /* COMPLETED — the quote is back on Arc. */
        _rapor(CrossChainCollateralManager.Rapor.DONDU, id, g, address(0), transfer, 0);
        s.durumlar[4] = uint8(yonetici.durumu(id));
        s.durumlar[5] = s.durumlar[4];

        CrossChainAccounting.Kova memory q = defter.kova(QUOTE);
        s.bitisMusait = q.musait;
        s.bitisYolda = q.yolda;
        s.bitisUzakPepe = defter.kova(PEPE).uzak;
        s.bitisHak = defter.hak(QUOTE, DOLASIM);

        /* The claim must never have dipped at any point in the sequence.
           Checked at the one place it could have — right after the burn. */
        s.hakHicDusmedi = araHak == s.baslangicHak;
        s.kapandi = q.musait == rezerv && q.yolda == 0 && s.bitisUzakPepe == 0
            && s.bitisHak == s.baslangicHak;
    }

    function _rapor(
        CrossChainCollateralManager.Rapor tur,
        bytes32 id,
        bytes32 gonderen,
        address varlik,
        uint256 a,
        uint256 b
    ) internal {
        yonetici.handleReceiveFinalizedMessage(
            ETH_DOMAIN, gonderen, 2000, abi.encode(tur, id, varlik, a, b)
        );
    }

    /* ---- 5. the vault refuses a wrong destination ------------------- */

    function yanlisHedefTesti() external returns (bool reddedildi) {
        _kur(10_000e6);
        bytes32 sahte = bytes32(uint256(uint160(address(uint160(0xBADBAD)))));
        try kasa.kopruyeGonder(ETH_DOMAIN, 1_000e6, sahte, 0, 2000, "") {
            reddedildi = false;
        } catch { reddedildi = true; }
    }

    /* ---- 6. the hook payload carries the token's identity ----------- */

    struct KancaSonucu {
        uint256 kancadakiTokenId;
        bytes32 kancadakiId;
        bool tokenIdDogru;
        uint256 azamiUcret;
        uint32 kesinlik;
    }

    function kancaTesti() external returns (KancaSonucu memory s) {
        _kur(10_000e6);
        bytes32 id = yonetici.transferBaslat(ETH_DOMAIN, 1_000e6, true);
        (uint256 t, bytes32 i) = abi.decode(kasa.sonKanca(), (uint256, bytes32));
        s.kancadakiTokenId = t;
        s.kancadakiId = i;
        s.tokenIdDogru = t == TOKEN_ID && i == id;
        s.azamiUcret = kasa.sonAzamiUcret();
        s.kesinlik = kasa.sonKesinlik();
    }
}

contract Yabanci2 {
    function dene(
        CrossChainCollateralManager y,
        uint32 d,
        bytes32 g,
        bytes calldata govde
    ) external {
        y.handleReceiveFinalizedMessage(d, g, 2000, govde);
    }
}
