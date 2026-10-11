// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CrossChainAccounting} from "../CrossChainAccounting.sol";
import {CrossChainAssetRegistry} from "../CrossChainAssetRegistry.sol";
import {KopruKasasi, IYakilabilirK} from "../KopruKasasi.sol";
import {SahteJeton} from "./SahteJeton.sol";

interface IERC20A {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// The buyback's counterparty. Stands for a keeper that bought tokens
/// cheaply somewhere and brings them back: it receives the lent quote and
/// leaves `birakilacak` tokens behind.
contract SahteGeriAlimci {
    SahteJeton public immutable jeton;
    uint256 public birakilacak;

    constructor(SahteJeton _jeton) {
        jeton = _jeton;
    }

    function ayarla(uint256 _birakilacak) external {
        birakilacak = _birakilacak;
    }

    function geriAlimCagrisi(address, uint256, bytes calldata) external {
        jeton.transfer(msg.sender, birakilacak);
    }

    function cagir(KopruKasasi kasa, uint256 harcama) external returns (uint256, uint256) {
        return kasa.geriAl(harcama, "");
    }
}

/// @notice AŞAMA 8 — asenkron iade ve geri alım muhasebesi
///
/// THE QUESTION
///   A holder redeems while part of the reserve is on another chain. Three
///   things must all be true at once, and any protocol can get two of them:
///
///     1. the redeemer is not short-changed — they are owed their full
///        share and the unpaid part becomes a claim, not a loss;
///     2. the holders who STAYED see no change in their claim — the
///        redeemer's exit must not inflate it either, which is the part
///        that is easy to get wrong in the generous direction;
///     3. the buyback cannot spend money that is owed.
///
///   The old vault failed (1) outright: measured, a redeemer at 60%
///   bridged was paid $2.00 instead of $5.00 — short and permanently.
///
/// WHY THE BRIDGE BURN HERE IS REAL
///   Every ledger entry below is the same entry the production path writes,
///   in the same order, and the outbound burn goes through Arc's real
///   TokenMessengerV2 — so the vault's balance really falls. The harness
///   stands in for the manager only in the sense that it calls the same two
///   functions the manager calls, in the same order.
contract TestAsenkronIade {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant TOKEN_MESSENGER = 0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d;
    address constant MESAJ_TASIYICI = 0x81D40F21F12A8F0E3252Bccb954D722d4c464B64;

    uint32 constant ETH_DOMAIN = 0;
    uint256 constant TOKEN_ID = 7;
    address constant UZAK_FABRIKA = address(uint160(0xFAB71CA));
    bytes32 constant UZAK_INIT = keccak256("RemoteCollateralVault.initcode.v1");

    /* Two addresses that hold nothing, so circulating supply is the whole
       supply and the arithmetic below has one fewer moving part. */
    address constant EGRI = address(uint160(0xE671));
    address constant ACICI = address(uint160(0xAC1C1));

    CrossChainAssetRegistry public kayit;
    KopruKasasi public kasa;
    SahteJeton public jeton;
    SahteGeriAlimci public alimci;

    function _kur(uint256 arz) private {
        CrossChainAssetRegistry.Zincir[] memory z = new CrossChainAssetRegistry.Zincir[](1);
        z[0] = CrossChainAssetRegistry.Zincir({
            cctpDomain: ETH_DOMAIN, zincirId: 1,
            uzakFabrika: UZAK_FABRIKA, initKodHash: UZAK_INIT,
            uzakQuote: address(uint160(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)),
            ad: "Ethereum"
        });
        kayit = new CrossChainAssetRegistry(z);
        jeton = new SahteJeton(arz, address(this));
        kasa = new KopruKasasi(
            kayit, USDC, TOKEN_ID, TOKEN_MESSENGER, MESAJ_TASIYICI,
            IYakilabilirK(address(jeton)), EGRI, ACICI
        );
        /* The harness takes the manager's seat, so it can write the same
           cross-chain transitions the manager writes. */
        kasa.yoneticiyiAyarla(address(this));
        alimci = new SahteGeriAlimci(jeton);
    }

    /// Fund the vault and credit it, the way a launch deposit does.
    function _fonla(uint256 miktar) private {
        IERC20A(USDC).transfer(address(kasa), miktar);
        kasa.supur();
    }

    /// Send quote abroad: the ledger entry first, then the REAL CCTP burn —
    /// exactly the order CrossChainCollateralManager uses.
    function _yollaAbroad(uint256 miktar) private {
        CrossChainAccounting d = kasa.defter();
        d.yolaCikti(USDC, miktar, keccak256("t"));
        /* Real CCTP rejects an empty hook outright — "Hook data is empty" —
           so the body has to be the real one. The manager sends
           abi.encode(tokenId, transferId) and so does this. Failing closed
           on an empty hook is the right behaviour; discovering it here
           rather than on mainnet is the point of calling the real contract. */
        kasa.kopruyeGonder(
            ETH_DOMAIN, miktar, kayit.uzakKasaBytes32(ETH_DOMAIN, TOKEN_ID), 0, 2000,
            abi.encode(TOKEN_ID, keccak256("t"))
        );
    }

    /// Bring it home: the mint arrives as a real balance, then the entry.
    function _eveDon(uint256 miktar) private {
        IERC20A(USDC).transfer(address(kasa), miktar);
        kasa.defter().geriDondu(USDC, miktar, keccak256("t"));
    }

    struct Durum {
        uint256 musait;
        uint256 yolda;
        uint256 borc;
        uint256 ekonomik;
        uint256 harcanabilir;
        uint256 dolasim;
        uint256 hak;
        uint256 kasaBakiye;
    }

    function _durum() private view returns (Durum memory s) {
        CrossChainAccounting.Kova memory k = kasa.defter().kova(USDC);
        s.musait = k.musait;
        s.yolda = k.yolda;
        s.borc = k.borc;
        s.ekonomik = kasa.defter().ekonomik(USDC);
        s.harcanabilir = kasa.defter().harcanabilir(USDC);
        s.dolasim = kasa.dolasim();
        s.hak = kasa.hak();
        s.kasaBakiye = IERC20A(USDC).balanceOf(address(kasa));
    }

    /* ==================================================================
     * 1 — a queued redemption, and the claim that must not move
     * ================================================================== */

    struct KuyrukSonucu {
        Durum baslangic;
        Durum yollandiktanSonra;
        Durum iadeSonrasi;
        Durum eveDonduktenSonra;
        Durum kuyrukOdendikten;

        uint256 hakEdilen;
        uint256 hemenOdenen;
        uint256 kuyruga;
        uint256 iadeciAldi;          // measured on the token holder's balance

        uint256 bekleyenAdet;
        uint256 bekleyenToplam;

        bool geriAlimReddedildi;     // while a ticket is open
        bytes geriAlimSebep;

        uint256 kuyruktaOdenen;
        uint256 iadeciToplam;
    }

    function kuyrukRun(uint256 arz, uint256 fon, uint256 abroad, uint256 yakilacak)
        external
        returns (KuyrukSonucu memory s)
    {
        _kur(arz);
        _fonla(fon);
        s.baslangic = _durum();

        _yollaAbroad(abroad);
        s.yollandiktanSonra = _durum();

        /* ---- the redemption, with the money partly abroad ----------- */
        uint256 once = IERC20A(USDC).balanceOf(address(this));
        (s.hemenOdenen, s.kuyruga) = kasa.iade(yakilacak);
        s.iadeciAldi = IERC20A(USDC).balanceOf(address(this)) - once;
        s.hakEdilen = s.hemenOdenen + s.kuyruga;
        s.iadeSonrasi = _durum();
        (s.bekleyenAdet, s.bekleyenToplam) = kasa.bekleyenTalep();

        /* ---- the defence may not be funded out of a redeemer -------- */
        /* Nothing is spendable: MUSAIT is zero and the debt is real. A
           buyback here would be spending money that is owed. */
        try alimci.cagir(kasa, 1) {
            s.geriAlimReddedildi = false;
        } catch (bytes memory e) {
            s.geriAlimReddedildi = true;
            s.geriAlimSebep = e;
        }

        /* ---- the money comes home, the queue settles ---------------- */
        _eveDon(abroad);
        s.eveDonduktenSonra = _durum();

        uint256 once2 = IERC20A(USDC).balanceOf(address(this));
        s.kuyruktaOdenen = kasa.kuyrukOde(5);
        s.iadeciToplam = s.iadeciAldi + (IERC20A(USDC).balanceOf(address(this)) - once2);
        s.kuyrukOdendikten = _durum();
    }

    /* ==================================================================
     * 2 — FIFO: an earlier redeemer is not jumped
     * ================================================================== */

    struct FifoSonucu {
        uint256 birinciHemen;
        uint256 birinciKuyruk;
        uint256 ikinciHemen;
        uint256 ikinciKuyruk;

        uint256 adet;
        uint256 toplam;

        /* after a partial return, only enough for the first ticket */
        uint256 kismiOdenen;
        uint256 basTalepKalan;
        uint256 ikinciTalepKalan;
        uint256 siraBasi;
    }

    /// Two redemptions with nothing spendable, then money for roughly one
    /// ticket. The head must take it; the second must still be owed in
    /// full. If settlement were by id, the later redeemer could take it.
    function fifoRun(uint256 arz, uint256 fon, uint256 abroad, uint256 yakilacak)
        external
        returns (FifoSonucu memory s)
    {
        _kur(arz);
        _fonla(fon);
        _yollaAbroad(abroad);

        (s.birinciHemen, s.birinciKuyruk) = kasa.iade(yakilacak);
        (s.ikinciHemen, s.ikinciKuyruk) = kasa.iade(yakilacak);
        (s.adet, s.toplam) = kasa.bekleyenTalep();

        /* Exactly the first ticket's size comes home. */
        _eveDon(s.birinciKuyruk);
        s.kismiOdenen = kasa.kuyrukOde(5);

        (, s.basTalepKalan, ) = kasa.kuyruk(0);
        (, s.ikinciTalepKalan, ) = kasa.kuyruk(1);
        s.siraBasi = kasa.siraBasi();
    }

    /* ==================================================================
     * 3 — the ordinary case: fully local, no ticket at all
     * ================================================================== */

    struct YerelSonucu {
        uint256 hemen;
        uint256 kuyruga;
        uint256 adet;
        uint256 hakOnce;
        uint256 hakSonra;
    }

    function yerelRun(uint256 arz, uint256 fon, uint256 yakilacak)
        external
        returns (YerelSonucu memory s)
    {
        _kur(arz);
        _fonla(fon);
        s.hakOnce = kasa.hak();
        (s.hemen, s.kuyruga) = kasa.iade(yakilacak);
        (s.adet, ) = kasa.bekleyenTalep();
        s.hakSonra = kasa.hak();
    }

    /* ==================================================================
     * 4 — the buyback, once nothing is owed
     * ================================================================== */

    struct GeriAlimSonucu {
        uint256 serbest;
        uint256 islemTavani;
        uint256 donemTavani;

        uint256 hakOnce;
        uint256 harcama;
        uint256 yakilan;
        uint256 odul;
        uint256 hakSonra;
        bool gecti;
        bytes sebep;

        bool tavanAsimiReddedildi;
        bool pencereAsimiReddedildi;
        uint256 pencereHarcanan;
        uint256 pencereCagriSayisi;
        /* WHICH limit stopped the sequence, not merely that something did.
           An earlier version of this harness called with a FIXED size while
           the per-call ceiling shrank with the reserve, so the loop ended on
           IslemTavani after a single call and the suite reported it as the
           window ceiling holding — green, and asserting the wrong thing: the
           window had spent $144 of $400. The reason is captured now. */
        bytes pencereSebep;
    }

    function geriAlimRun(uint256 arz, uint256 fon, uint256 abroad, uint256 birakilacak)
        external
        returns (GeriAlimSonucu memory s)
    {
        _kur(arz);
        _fonla(fon);
        if (abroad > 0) _yollaAbroad(abroad);

        s.serbest = kasa.defter().harcanabilir(USDC);
        s.islemTavani = (s.serbest * kasa.ISLEM_TAVANI_BPS()) / 10_000;
        s.donemTavani = (s.serbest * kasa.DONEM_TAVANI_BPS()) / 10_000;

        /* The keeper needs tokens to bring back. */
        /* Five lots, so the window ceiling is what stops the loop and not
           an empty keeper. Conflating the two would let this suite report a
           rate limit that is really a funding accident. */
        jeton.transfer(address(alimci), birakilacak * 10);
        alimci.ayarla(birakilacak);

        /* One unit over the per-call ceiling must be refused. */
        try alimci.cagir(kasa, s.islemTavani + 1) {
            s.tavanAsimiReddedildi = false;
        } catch {
            s.tavanAsimiReddedildi = true;
        }

        s.hakOnce = kasa.hak();
        s.harcama = s.islemTavani;
        try alimci.cagir(kasa, s.harcama) returns (uint256 y, uint256 o) {
            s.gecti = true;
            s.yakilan = y;
            s.odul = o;
        } catch (bytes memory e) {
            s.gecti = false;
            s.sebep = e;
        }
        s.hakSonra = kasa.hak();
        (, s.pencereHarcanan, ) = kasa.donem();

        /* Keep going in the same window until the WINDOW stops it.
           Each call asks for the largest size the per-call ceiling then
           allows, recomputed every time — because that ceiling is 2% of
           what is still spendable and the reserve shrinks as the sequence
           runs. Calling with a fixed size instead ends the loop on the
           per-call limit after one call, which is a different promise. */
        for (uint256 i = 0; i < 60; i++) {
            uint256 bu = (kasa.defter().harcanabilir(USDC) * kasa.ISLEM_TAVANI_BPS()) / 10_000;
            if (bu == 0) break;
            try alimci.cagir(kasa, bu) {
                s.pencereCagriSayisi++;
            } catch (bytes memory e) {
                s.pencereAsimiReddedildi = true;
                s.pencereSebep = e;
                break;
            }
        }
        (, s.pencereHarcanan, ) = kasa.donem();
    }
}
