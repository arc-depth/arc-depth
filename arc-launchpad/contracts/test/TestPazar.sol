// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Pazar, IERC20P} from "../Pazar.sol";

interface IERC20T {
    function transfer(address to, uint256 v) external returns (bool);
    function approve(address who, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// A buyer. The harness itself cannot be the buyer, because if one address
/// is both the developer and the customer the 80/20 split closes inside
/// itself and the measurement says nothing — that exact mistake was made
/// once in this project (the harness was the founder and the buyer at the
/// same time, and the result was an underflow).
contract SahteAlici {
    function onayla(IERC20T t, address kime, uint256 v) external {
        t.approve(kime, v);
    }
    function satinAl(Pazar p, uint256 id) external returns (uint64) {
        return p.satinAl(id);
    }
    function puanla(Pazar p, uint256 id, uint8 n) external {
        p.puanla(id, n);
    }
    function dene_satinAl(Pazar p, uint256 id) external returns (bool) {
        try p.satinAl(id) returns (uint64) { return false; } catch { return true; }
    }
    function dene_puanla(Pazar p, uint256 id, uint8 n) external returns (bool) {
        try p.puanla(id, n) { return false; } catch { return true; }
    }
    function dene_urunEkle(Pazar p) external returns (bool) {
        try p.urunEkle(1, 0, "x") returns (uint256) { return false; } catch { return true; }
    }
    function dene_urunGuncelle(Pazar p, uint256 id) external returns (bool) {
        try p.urunGuncelle(id, 1, true, "x") { return false; } catch { return true; }
    }
}

/// @notice Does Pazar really split the money, and does it refuse what it
///         should refuse?
///
/// WHAT MATTERS IS NOT THE SPLIT ITSELF BUT WHERE THE MONEY IS NOT
///   80/20 is a multiplication; verifying it is easy. The hard part, and
///   what this test really measures, is that NO MONEY IS LEFT in the
///   contract when the transaction ends. If there were an intermediate
///   balance, a function would be needed to withdraw it — and that
///   function would have an owner.
contract TestPazar {
    struct Sonuc {
        address pazar;
        address alici;

        /* registration */
        bool kayitOldu;
        bool mukerrerRed;
        bool kayitsizUrunRed;

        /* the product */
        uint256 urunId;
        uint256 aboneId;
        bool yabanciGuncelleRed;

        /* a one-off sale */
        uint256 devOncesi;
        uint256 devSonrasi;
        uint256 isletmeOncesi;
        uint256 isletmeSonrasi;
        uint256 aliciOncesi;
        uint256 aliciSonrasi;
        uint256 pazardaKalan;
        uint64 bitis;
        bool suresizMi;
        bool lisansli;

        /* abonelik */
        uint64 aboneBitis1;
        uint64 aboneBitis2;
        uint64 periyot;

        /* kapatma */
        bool kapaliSatisRed;
        bool kapandiktanSonraLisansDuruyor;

        /* itibar */
        bool lisanssizPuanRed;
        bool mukerrerPuanRed;
        uint256 ortalamaYuzlu;
        uint256 puanAdedi;

        /* defter */
        uint256 devKazanci;
        uint256 platformKazanci;
        uint256 toplamHasilat;

        /* yuvarlama */
        uint256 tekFiyat;
        uint256 tekDev;
        uint256 tekPlatform;
    }

    function run(IERC20T usdc, address isletme) external returns (Sonuc memory s) {
        Pazar p = new Pazar(IERC20P(address(usdc)), isletme);
        s.pazar = address(p);

        SahteAlici alici = new SahteAlici();
        s.alici = address(alici);

        /* The harness holds USDC in this fork; hand the buyer enough to pay
           with and let it approve on its own behalf. */
        usdc.transfer(address(alici), 1_000e6);
        alici.onayla(usdc, address(p), type(uint256).max);

        /* ---- registration -------------------------------------------- */
        s.kayitsizUrunRed = alici.dene_urunEkle(p);   // not registered yet

        p.kaydol("ipfs://gelistirici");
        (bool k, , ) = _profil(p, address(this));
        s.kayitOldu = k;
        s.mukerrerRed = _deneKaydol(p);

        /* ---- products ------------------------------------------------ */
        s.tekFiyat = 101e6 + 3;              // deliberately not divisible
        s.urunId = p.urunEkle(s.tekFiyat, 0, "ipfs://urun");
        s.periyot = 30 days;
        s.aboneId = p.urunEkle(10e6, uint64(s.periyot), "ipfs://abone");

        s.yabanciGuncelleRed = alici.dene_urunGuncelle(p, s.urunId);

        /* ---- a one-off sale ------------------------------------------ */
        s.devOncesi = usdc.balanceOf(address(this));
        s.isletmeOncesi = usdc.balanceOf(isletme);
        s.aliciOncesi = usdc.balanceOf(address(alici));

        s.bitis = alici.satinAl(p, s.urunId);

        s.devSonrasi = usdc.balanceOf(address(this));
        s.isletmeSonrasi = usdc.balanceOf(isletme);
        s.aliciSonrasi = usdc.balanceOf(address(alici));
        s.pazardaKalan = usdc.balanceOf(address(p));

        (bool gecerli, , bool suresiz) = p.lisans(s.urunId, address(alici));
        s.lisansli = gecerli;
        s.suresizMi = suresiz;

        s.tekPlatform = (s.tekFiyat * p.PLATFORM_PPM()) / 1_000_000;
        s.tekDev = s.tekFiyat - s.tekPlatform;

        /* ---- subscription: renewing early MUST NOT LOSE time --------- */
        s.aboneBitis1 = alici.satinAl(p, s.aboneId);
        s.aboneBitis2 = alici.satinAl(p, s.aboneId);

        /* ---- closing must not break a sold licence ------------------- */
        p.urunGuncelle(s.urunId, s.tekFiyat, false, "ipfs://urun");
        s.kapaliSatisRed = alici.dene_satinAl(p, s.urunId);
        s.kapandiktanSonraLisansDuruyor = p.lisansliMi(s.urunId, address(alici));

        /* ---- itibar --------------------------------------------------- */
        /* The harness is the developer and has no license: it must be
           refused, which is the gate that matters. */
        s.lisanssizPuanRed = _denePuanla(p, s.urunId, 5);
        alici.puanla(p, s.urunId, 4);
        s.mukerrerPuanRed = alici.dene_puanla(p, s.urunId, 5);
        (s.ortalamaYuzlu, s.puanAdedi) = p.ortalamaPuan(s.urunId);

        /* ---- defter --------------------------------------------------- */
        s.devKazanci = p.gelistiriciKazanci(address(this));
        s.platformKazanci = p.platformKazanci();
        s.toplamHasilat = p.toplamHasilat();
    }

    function _profil(Pazar p, address who)
        internal view returns (bool, uint64, string memory)
    {
        (bool a, uint64 b, string memory c) = p.gelistirici(who);
        return (a, b, c);
    }

    function _deneKaydol(Pazar p) internal returns (bool) {
        try p.kaydol("ipfs://ikinci") { return false; } catch { return true; }
    }

    function _denePuanla(Pazar p, uint256 id, uint8 n) internal returns (bool) {
        try p.puanla(id, n) { return false; } catch { return true; }
    }
}
