// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title LaunchpadTeshis — one read of a launch's health, for anyone
///
/// GENESIS's diagnosis of an ARC PULSE launch on Arc, from the chain alone:
/// the basket lines in the Defter (dollars waiting, which are at or above the
/// $50 lot and still here, which failed lately), the redemption orders still
/// queued with what sending each costs now, the launch's tax bucket and
/// whether it would pass its dollars on, the founder's income waiting in the
/// launch's KurucuVekili, and the pool's sqrt price. Every remedy it points
/// to is a permissionless call (Defter.bekleyenleriGonder / emirGonder,
/// VergiKovasi.gonder, KurucuVekili.ilet).
///
/// View only. No owner, no storage of its own, nothing to upgrade: the
/// addresses it reads are fixed at construction.
interface ITeshisDefter {
    struct Kalem { uint32 zincir; bytes32 varlik; uint256 dolar; }
    function launchlar(uint64) external view returns (uint32 zincir, bytes32 token, uint256 arz, uint256 agirlikToplam, uint256 vergi, bool var_);
    function idOf(uint32, bytes32) external view returns (uint64);
    function sepet(uint64) external view returns (Kalem[] memory);
    function biriken(uint64, uint256) external view returns (uint256);
    function sonHata(uint64, uint256) external view returns (uint256);
    function kasaDolu(uint64, uint32) external view returns (bool);
    function emirler(uint256) external view returns (uint32 zincir, uint64 id, uint256 bahsis, bool gitti, bytes memory veri);
    function emirSayisi() external view returns (uint256);
    function emirUcreti(uint256) external view returns (uint256);
    function ESIK() external view returns (uint256);
    function BEKLEME() external view returns (uint256);
}

interface ITeshisLaunchpad {
    struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
    struct Kayit { address token; address acici; address kasa; uint256 teminat; address kurucu; uint256 kurucuToken; uint256 teklif; uint256 vergiPpm; uint64 zaman; }
    function havuzAnahtari(address token) external view returns (PoolKey memory);
    function launchIdOfPool(bytes32) external view returns (uint256);
    function launchAt(uint256) external view returns (Kayit memory);
}

interface ITeshisKova { function gonderimVar() external view returns (bool); }
interface ITeshisKapi { function vekilOf(address) external view returns (address); }
interface ITeshisErc20 { function balanceOf(address) external view returns (uint256); }
interface ITeshisPM { function extsload(bytes32) external view returns (bytes32); }

contract LaunchpadTeshis {
    ITeshisDefter public immutable defter;
    ITeshisLaunchpad public immutable launchpad;
    ITeshisKapi public immutable kapi;
    ITeshisErc20 public immutable usdc;
    ITeshisPM public immutable poolManager;
    uint32 public immutable arcDomain;

    struct Satir {
        uint32 zincir;        // CCTP domain of the line's vault
        bytes32 varlik;
        uint256 agirlik;      // the founder's dollars on the line (its weight)
        uint256 biriken;      // dollars waiting in the Defter for this line
        bool lotHazir;        // at or above the $50 lot and still here
        bool bekliyor;        // failed lately: the automatic path waits BEKLEME
        uint256 sonHata;
        bool kasaDolu;        // the vault ever received this launch's dollars
    }

    struct Rapor {
        bool var_;
        uint64 id;            // the Defter's launch id
        uint256 launchNo;     // launchpad index (launchAt)
        address kova;         // the launch's tax bucket (VergiKovasi)
        uint256 kovaDolar;    // USDC in the bucket now
        bool kovaGonderir;    // the bucket would pass its dollars on (gonder) now
        address vekil;        // the founder's KurucuVekili
        uint256 vekilDolar;   // founder income waiting there
        uint256 arz;          // supply still carrying a claim
        uint256 vergi;
        uint256 toplamBiriken;
        uint256 lotHazirSayisi;
        Satir[] satirlar;
        uint160 sqrtPriceX96; // pool price (slot0)
        int24 tick;
    }

    struct Emir {
        uint256 sira;         // index in Defter.emirler (for emirGonder)
        uint32 zincir;
        uint256 ucret;        // messenger fee to send it now (6 decimals)
        uint256 bahsis;       // tip reserved for the sender (0: taken from waiting dollars at send)
    }

    constructor(ITeshisDefter _defter, ITeshisLaunchpad _launchpad, ITeshisKapi _kapi, ITeshisErc20 _usdc, ITeshisPM _pm, uint32 _arcDomain) {
        defter = _defter;
        launchpad = _launchpad;
        kapi = _kapi;
        usdc = _usdc;
        poolManager = _pm;
        arcDomain = _arcDomain;
    }

    /// Everything about the Arc launch of `token` in one call.
    function rapor(address token) external view returns (Rapor memory r) {
        r.id = defter.idOf(arcDomain, bytes32(uint256(uint160(token))));
        (, , uint256 arz, , uint256 vergi, bool var_) = defter.launchlar(r.id);
        r.var_ = var_;
        r.arz = arz;
        r.vergi = vergi;

        ITeshisLaunchpad.PoolKey memory k = launchpad.havuzAnahtari(token);
        bytes32 havuzId = keccak256(abi.encode(k));
        uint256 no = launchpad.launchIdOfPool(havuzId);   // counts from 1
        if (no > 0) {
            r.launchNo = no - 1;
            r.kova = launchpad.launchAt(no - 1).kasa;
            r.kovaDolar = usdc.balanceOf(r.kova);
            try ITeshisKova(r.kova).gonderimVar() returns (bool g) { r.kovaGonderir = g && r.kovaDolar > 0; } catch {}
        }
        r.vekil = kapi.vekilOf(token);
        if (r.vekil != address(0)) r.vekilDolar = usdc.balanceOf(r.vekil);

        /* slot0 of pools[id] in the PoolManager (StateLibrary: POOLS_SLOT 6) */
        bytes32 s0 = poolManager.extsload(keccak256(abi.encode(havuzId, uint256(6))));
        r.sqrtPriceX96 = uint160(uint256(s0));
        r.tick = int24(int256(uint256(s0) >> 160));

        if (!var_) return r;
        ITeshisDefter.Kalem[] memory s = defter.sepet(r.id);
        uint256 esik = defter.ESIK();
        uint256 bekleme = defter.BEKLEME();
        r.satirlar = new Satir[](s.length);
        for (uint256 i = 0; i < s.length; i++) {
            Satir memory x = r.satirlar[i];
            x.zincir = s[i].zincir;
            x.varlik = s[i].varlik;
            x.agirlik = s[i].dolar;
            x.biriken = defter.biriken(r.id, i);
            x.sonHata = defter.sonHata(r.id, i);
            x.lotHazir = x.biriken >= esik;
            x.bekliyor = x.sonHata != 0 && block.timestamp < x.sonHata + bekleme;
            x.kasaDolu = defter.kasaDolu(r.id, s[i].zincir);
            r.toplamBiriken += x.biriken;
            if (x.lotHazir) r.lotHazirSayisi++;
        }
    }

    /// Redemption orders of launch `id` still queued, scanning Defter.emirler
    /// from `bas` for at most `adet` entries (the queue is global; page it).
    function kuyruk(uint64 id, uint256 bas, uint256 adet) external view returns (Emir[] memory e, uint256 sonraki) {
        uint256 n = defter.emirSayisi();
        uint256 son = bas + adet > n ? n : bas + adet;
        uint256 say;
        for (uint256 i = bas; i < son; i++) {
            (, uint64 eid, , bool gitti, ) = defter.emirler(i);
            if (eid == id && !gitti) say++;
        }
        e = new Emir[](say);
        uint256 j;
        for (uint256 i = bas; i < son; i++) {
            (uint32 z, uint64 eid, uint256 b, bool gitti, ) = defter.emirler(i);
            if (eid != id || gitti) continue;
            uint256 u;
            try defter.emirUcreti(i) returns (uint256 x) { u = x; } catch {}
            e[j++] = Emir(i, z, u, b);
        }
        sonraki = son;
    }
}
