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

/// The buyer HAS TO be a separate address.
///
/// If the harness is the developer and the customer at once, the 80/20
/// split closes inside itself and the measurement says nothing. That exact
/// mistake was made once in this project and the result was an underflow.
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

/// @notice Does the DEPLOYED Pazar contract work?
///
/// WHY A SEPARATE MEASUREMENT
///   `olc-pazar.js` measures a copy the harness deploys ITSELF, so it
///   answers "is the compiled code correct". This measurement calls the
///   mainnet address: "is the code ON CHAIN correct". They are not the same
///   question — in this project a deployed hook once pointed at the wrong
///   vault while the compiled code was flawless.
///
///   Everything happens inside a single `eth_call`: the registration, the
///   product, the purchase and the rating. The state changes are discarded
///   when the call ends, nothing is written to the chain and not a cent is
///   spent.
contract TestPazarCanli {
    struct Sonuc {
        address pazar;
        address alici;
        uint256 oncekiUrunSayisi;

        /* registration and publishing */
        bool kayitOldu;
        uint256 urunId;
        uint256 sonrakiUrunSayisi;
        bool yabanciGuncelleRed;

        /* the sale and the split */
        uint256 fiyat;
        uint256 devArtis;
        uint256 isletmeArtis;
        uint256 aliciDusus;
        uint256 pazardaKalan;
        uint256 zincirPpm;

        /* lisans */
        bool lisansli;
        uint64 bitis;

        /* closing and reputation */
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

        /* ---- registration and publishing ---------------------------- */
        p.kaydol("ipfs://canli-olcum");
        s.kayitOldu = true;

        /* Deliberately not divisible by five, so the rounding direction is
           visible rather than hidden by a round number. */
        s.fiyat = 77e6 + 7;
        s.urunId = p.urunEkle(s.fiyat, 0, "ipfs://canli-urun");
        s.sonrakiUrunSayisi = p.urunSayisi();

        s.yabanciGuncelleRed = alici.deneGuncelle(p, s.urunId);

        /* ---- the sale ------------------------------------------------ */
        uint256 dev0 = usdc.balanceOf(address(this));
        uint256 is0 = usdc.balanceOf(isletme);
        uint256 al0 = usdc.balanceOf(address(alici));

        s.bitis = alici.al(p, s.urunId);

        s.devArtis = usdc.balanceOf(address(this)) - dev0;
        s.isletmeArtis = usdc.balanceOf(isletme) - is0;
        s.aliciDusus = al0 - usdc.balanceOf(address(alici));
        s.pazardaKalan = p.tutulan();
        s.lisansli = p.lisansliMi(s.urunId, address(alici));

        /* ---- closing must not break a sold licence ------------------- */
        p.urunGuncelle(s.urunId, s.fiyat, false, "ipfs://canli-urun");
        s.kapaliSatisRed = alici.deneAl(p, s.urunId);
        s.kapandiktanSonraLisansDuruyor = p.lisansliMi(s.urunId, address(alici));

        /* ---- reputation only from a payer --------------------------- */
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
