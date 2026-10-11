// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CrossChainAccounting} from "../CrossChainAccounting.sol";
import {CrossChainAssetRegistry} from "../CrossChainAssetRegistry.sol";
import {CrossChainCollateralManager, IKopruKasasi} from "../CrossChainCollateralManager.sol";
import {KopruKasasi, IYakilabilirK} from "../KopruKasasi.sol";
import {SahteJeton} from "./SahteJeton.sol";

interface IERC20U {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @notice STAGE 4, the whole outbound leg: manager -> vault -> REAL CCTP
///
/// WHAT THE EARLIER TEST LEFT OPEN
///   olc-gercek-cctp.js proved Arc's real TokenMessenger accepts the call.
///   olc-zincir-yonetici.js proved the manager's seven checks and its state
///   machine, against a mock vault. Neither proved the thing in between:
///   that the manager's derived recipient, the vault's independent
///   re-derivation and the real contract's expectations all line up in one
///   transaction.
///
///   This runs the whole outbound chain once, with nothing mocked on the
///   CCTP side. The only thing standing in for production is the remote
///   factory's address and init-code hash, because the remote vault is on
///   another chain and its address is all Arc ever needs to know.
///
/// WHY THE LEDGER IS CHECKED AND NOT JUST THE BALANCE
///   A burn that leaves the ledger unchanged would look like a success and
///   be a disaster: the claim would fall by the burned amount, which is
///   exactly the bug this whole phase exists to remove. So the assertion is
///   that the balance fell AND the economic reserve did not.
contract TestKopruUctanUca {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant TOKEN_MESSENGER = 0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d;
    address constant MESAJ_TASIYICI = 0x81D40F21F12A8F0E3252Bccb954D722d4c464B64;

    uint32 constant ETH_DOMAIN = 0;
    uint256 constant TOKEN_ID = 7;
    /* The remote factory. Any fixed pair works here: what matters is that
       Arc derives the same address twice, not which chain it is on. */
    address constant UZAK_FABRIKA = address(uint160(0xFAB71CA));
    bytes32 constant UZAK_INIT = keccak256("RemoteCollateralVault.initcode.v1");
    /* The vault now knows its token, so it can answer a claim. Neither of
       these holds anything here: this suite measures the bridge, not the
       claim, and giving it a real curve would add a moving part that none
       of its assertions look at. */
    address constant EGRI = address(uint160(0xE671));
    address constant ACICI = address(uint160(0xAC1C1));

    CrossChainAssetRegistry public kayit;
    KopruKasasi public kasa;
    CrossChainCollateralManager public yonetici;

    struct Sonuc {
        address kasaAdresi;
        address yoneticiAdresi;
        bytes32 turetilenAlici;

        uint256 kasaBakiyeOnce;
        uint256 musaitOnce;
        uint256 ekonomikOnce;
        uint256 yoldaOnce;

        bytes32 transferId;
        uint8 durum;

        uint256 kasaBakiyeSonra;
        uint256 musaitSonra;
        uint256 ekonomikSonra;
        uint256 yoldaSonra;

        bool gecti;
        bytes sebep;
    }

    function run(uint256 fon, uint256 transfer, bool hizli) external returns (Sonuc memory s) {
        /* ---- the registry, from what a deployment script would know --- */
        CrossChainAssetRegistry.Zincir[] memory z = new CrossChainAssetRegistry.Zincir[](1);
        z[0] = CrossChainAssetRegistry.Zincir({
            cctpDomain: ETH_DOMAIN,
            zincirId: 1,
            uzakFabrika: UZAK_FABRIKA,
            initKodHash: UZAK_INIT,
            uzakQuote: address(uint160(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)),
            ad: "Ethereum"
        });
        kayit = new CrossChainAssetRegistry(z);

        /* ---- the vault, then the manager, then the one-time wiring ---- */
        kasa = new KopruKasasi(
            kayit, USDC, TOKEN_ID, TOKEN_MESSENGER, MESAJ_TASIYICI,
            IYakilabilirK(address(new SahteJeton(1e27, address(this)))), EGRI, ACICI
        );
        yonetici = new CrossChainCollateralManager(
            kasa.defter(), kayit, IKopruKasasi(address(kasa)), address(kasa)
        );
        kasa.yoneticiyiAyarla(address(yonetici));

        s.kasaAdresi = address(kasa);
        s.yoneticiAdresi = address(yonetici);
        s.turetilenAlici = kayit.uzakKasaBytes32(ETH_DOMAIN, TOKEN_ID);

        /* ---- fund it the way a cross-chain deposit would -------------- */
        /* A plain transfer, with nothing told to the vault — the shape a
           CCTP mint has from the inside. The sweep is what credits it. */
        IERC20U(USDC).transfer(address(kasa), fon);
        kasa.supur();

        s.kasaBakiyeOnce = kasa.bakiye();
        s.musaitOnce = kasa.musait();
        s.ekonomikOnce = kasa.ekonomik();
        s.yoldaOnce = kasa.defter().kova(USDC).yolda;

        /* ---- the whole outbound chain, once -------------------------- */
        try yonetici.transferBaslat(ETH_DOMAIN, transfer, hizli) returns (bytes32 id) {
            s.gecti = true;
            s.transferId = id;
            s.durum = uint8(yonetici.durumu(id));
        } catch (bytes memory e) {
            s.gecti = false;
            s.sebep = e;
        }

        s.kasaBakiyeSonra = kasa.bakiye();
        s.musaitSonra = kasa.musait();
        s.ekonomikSonra = kasa.ekonomik();
        s.yoldaSonra = kasa.defter().kova(USDC).yolda;
    }

    /* ---- the sweep, on its own -------------------------------------- */

    struct SupurSonucu {
        uint256 bakiye;
        uint256 ilkKredi;
        uint256 ikinciKredi;
        uint256 musait;
        bool ikinciBosDondu;
    }

    /// Credit twice. The second must do nothing: the amount is the gap
    /// between the balance and the ledger, so a sweep is idempotent and
    /// cannot be used to credit the same dollar repeatedly.
    function supurTesti(uint256 fon) external returns (SupurSonucu memory s) {
        CrossChainAssetRegistry.Zincir[] memory z = new CrossChainAssetRegistry.Zincir[](1);
        z[0] = CrossChainAssetRegistry.Zincir({
            cctpDomain: ETH_DOMAIN, zincirId: 1,
            uzakFabrika: UZAK_FABRIKA, initKodHash: UZAK_INIT,
            uzakQuote: address(uint160(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)),
            ad: "Ethereum"
        });
        kayit = new CrossChainAssetRegistry(z);
        kasa = new KopruKasasi(
            kayit, USDC, TOKEN_ID, TOKEN_MESSENGER, MESAJ_TASIYICI,
            IYakilabilirK(address(new SahteJeton(1e27, address(this)))), EGRI, ACICI
        );

        IERC20U(USDC).transfer(address(kasa), fon);
        s.bakiye = kasa.bakiye();
        s.ilkKredi = kasa.supur();
        s.ikinciKredi = kasa.supur();
        s.musait = kasa.musait();
        s.ikinciBosDondu = s.ikinciKredi == 0;
    }

    /* ---- the vault refuses a destination it did not derive ---------- */

    function yanlisAliciTesti(uint256 fon) external returns (bool reddedildi) {
        CrossChainAssetRegistry.Zincir[] memory z = new CrossChainAssetRegistry.Zincir[](1);
        z[0] = CrossChainAssetRegistry.Zincir({
            cctpDomain: ETH_DOMAIN, zincirId: 1,
            uzakFabrika: UZAK_FABRIKA, initKodHash: UZAK_INIT,
            uzakQuote: address(uint160(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)),
            ad: "Ethereum"
        });
        kayit = new CrossChainAssetRegistry(z);
        kasa = new KopruKasasi(
            kayit, USDC, TOKEN_ID, TOKEN_MESSENGER, MESAJ_TASIYICI,
            IYakilabilirK(address(new SahteJeton(1e27, address(this)))), EGRI, ACICI
        );
        /* The harness names itself as the manager, so it can ask for a
           destination the registry does not derive. */
        kasa.yoneticiyiAyarla(address(this));
        IERC20U(USDC).transfer(address(kasa), fon);
        kasa.supur();

        bytes32 sahte = bytes32(uint256(uint160(address(uint160(0xBADBAD)))));
        try kasa.kopruyeGonder(ETH_DOMAIN, 100e6, sahte, 0, 2000, "") {
            reddedildi = false;
        } catch { reddedildi = true; }
    }
}
