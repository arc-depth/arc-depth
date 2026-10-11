// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IPazarC {
    function PLATFORM_PPM() external view returns (uint256);
    function isletme() external view returns (address);
    function urunSayisi() external view returns (uint256);
    function kaydol(string calldata uri) external;
    function urunEkle(uint256 fiyat, uint64 periyot, string calldata uri)
        external returns (uint256);
    function urunGuncelle(uint256 id, uint256 fiyat, bool acik, string calldata uri) external;
    function satinAl(uint256 id) external returns (uint64);
    function lisansliMi(uint256 id, address kim) external view returns (bool);
    function puanla(uint256 id, uint8 p) external;
    function gelistiriciKazanci(address who) external view returns (uint256);
    function platformKazanci() external view returns (uint256);
    function tutulan() external view returns (uint256);
}

interface IERC20C {
    function transfer(address to, uint256 v) external returns (bool);
    function approve(address who, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// Alıcı ayrı bir adres olmak ZORUNDA.
///
/// Harness aynı anda geliştirici ve müşteri olursa %80/%20 bölüşmesi kendi
/// içinde kapanır ve ölçüm hiçbir şey söylemez. Bu projede tam bu hata bir
/// kez yapıldı ve sonucu bir underflow oldu.
contract AliciC {
    function hazirla(IERC20C t, address pazar) external {
        t.approve(pazar, type(uint256).max);
    }
    function al(IPazarC p, uint256 id) external returns (uint64) {
        return p.satinAl(id);
    }
    function puanla(IPazarC p, uint256 id, uint8 n) external {
        p.puanla(id, n);
    }
    function deneAl(IPazarC p, uint256 id) external returns (bool) {
        try p.satinAl(id) returns (uint64) { return false; } catch { return true; }
    }
    function deneGuncelle(IPazarC p, uint256 id) external returns (bool) {
        try p.urunGuncelle(id, 1, true, "x") { return false; } catch { return true; }
    }
}

/// @notice DAĞITILMIŞ Pazar sözleşmesi işe yarıyor mu?
///
/// NİYE AYRI BİR ÖLÇÜM
///   `olc-pazar.js` harness'ın KENDİ dağıttığı bir kopyayı ölçüyor, yani
///   "derlenen kod doğru mu" sorusunu cevaplıyor. Bu ölçüm ana ağdaki
///   adresi çağırıyor: "ZİNCİRDEKİ kod doğru mu". İkisi aynı soru değil —
///   bu projede bir kez dağıtılmış bir kanca yanlış bir kasayı
///   gösteriyordu ve derlenen kod kusursuzdu.
///
///   Her şey tek bir `eth_call` içinde oluyor: kayıt, ürün, satın alma ve
///   puan. Durum değişiklikleri çağrı bitince atılıyor, zincire hiçbir şey
///   yazılmıyor ve tek kuruş harcanmıyor.
contract TestPazarCanli {
    struct Sonuc {
        address pazar;
        address alici;
        uint256 oncekiUrunSayisi;

        /* kayıt ve yayın */
        bool kayitOldu;
        uint256 urunId;
        uint256 sonrakiUrunSayisi;
        bool yabanciGuncelleRed;

        /* satış ve bölüşme */
        uint256 fiyat;
        uint256 devArtis;
        uint256 isletmeArtis;
        uint256 aliciDusus;
        uint256 pazardaKalan;
        uint256 zincirPpm;

        /* lisans */
        bool lisansli;
        uint64 bitis;

        /* kapanış ve itibar */
        bool kapaliSatisRed;
        bool kapandiktanSonraLisansDuruyor;
        bool lisanssizPuanRed;

        /* defter */
        uint256 devKazanciArtis;
        uint256 platformKazanciArtis;
    }

    function run(IPazarC p, IERC20C usdc) external returns (Sonuc memory s) {
        s.pazar = address(p);
        s.zincirPpm = p.PLATFORM_PPM();
        s.oncekiUrunSayisi = p.urunSayisi();

        address isletme = p.isletme();
        uint256 devKazanc0 = p.gelistiriciKazanci(address(this));
        uint256 platform0 = p.platformKazanci();

        AliciC alici = new AliciC();
        s.alici = address(alici);
        usdc.transfer(address(alici), 1_000e6);
        alici.hazirla(usdc, address(p));

        /* ---- kayıt ve yayın ------------------------------------------ */
        p.kaydol("ipfs://canli-olcum");
        s.kayitOldu = true;

        /* Deliberately not divisible by five, so the rounding direction is
           visible rather than hidden by a round number. */
        s.fiyat = 77e6 + 7;
        s.urunId = p.urunEkle(s.fiyat, 0, "ipfs://canli-urun");
        s.sonrakiUrunSayisi = p.urunSayisi();

        s.yabanciGuncelleRed = alici.deneGuncelle(p, s.urunId);

        /* ---- satış ---------------------------------------------------- */
        uint256 dev0 = usdc.balanceOf(address(this));
        uint256 is0 = usdc.balanceOf(isletme);
        uint256 al0 = usdc.balanceOf(address(alici));

        s.bitis = alici.al(p, s.urunId);

        s.devArtis = usdc.balanceOf(address(this)) - dev0;
        s.isletmeArtis = usdc.balanceOf(isletme) - is0;
        s.aliciDusus = al0 - usdc.balanceOf(address(alici));
        s.pazardaKalan = p.tutulan();
        s.lisansli = p.lisansliMi(s.urunId, address(alici));

        /* ---- kapatma satılmış lisansı bozmamalı ---------------------- */
        p.urunGuncelle(s.urunId, s.fiyat, false, "ipfs://canli-urun");
        s.kapaliSatisRed = alici.deneAl(p, s.urunId);
        s.kapandiktanSonraLisansDuruyor = p.lisansliMi(s.urunId, address(alici));

        /* ---- itibar yalnızca ödeyenden ------------------------------- */
        s.lisanssizPuanRed = _denePuanla(p, s.urunId);
        alici.puanla(p, s.urunId, 5);

        /* ---- defter -------------------------------------------------- */
        s.devKazanciArtis = p.gelistiriciKazanci(address(this)) - devKazanc0;
        s.platformKazanciArtis = p.platformKazanci() - platform0;
    }

    /* The harness is the developer and holds no license: it must be
       refused, and that refusal is the gate that matters. */
    function _denePuanla(IPazarC p, uint256 id) internal returns (bool) {
        try p.puanla(id, 5) { return false; } catch { return true; }
    }
}
