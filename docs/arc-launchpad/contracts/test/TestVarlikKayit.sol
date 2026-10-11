// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {VarlikKayit} from "../VarlikKayit.sol";
import {ChainlinkOracle} from "../ChainlinkOracle.sol";

/// @notice Does the registry admit what it should and refuse what it should?
///
/// The refusals matter more than the admissions. A registry that accepts
/// everything would pass a test that only tried valid assets, so every gate
/// is driven from the failing side too: an address with no code, a chain
/// with no adapter, a duplicate, a remote asset nobody can price, and an
/// oracle that cannot value the asset it was handed.
contract TestVarlikKayit {
    struct Sonuc {
        address kayit;
        address oracle;
        /* What went in. */
        bool cirbtcKayitli;
        bool cirbtcCevrilebilir;
        uint8 cirbtcOndalik;
        bool oraclesizKayitli;
        bool oraclesizCevrilebilir;
        uint256 toplamKayit;
        /* What was refused. */
        bool kodsuzRed;
        bool desteksizZincirRed;
        bool mukerrerRed;
        bool uzakOraclesizRed;
        bool yanlisOracleRed;
    }

    function run(
        address usdc,
        address cirbtc,
        address weth,
        address btcFeed,
        address ethFeed,
        address kodsuz
    ) external returns (Sonuc memory s) {
        uint256[] memory zincirler = new uint256[](2);
        zincirler[0] = 5042;        // Arc
        zincirler[1] = 1;           // Ethereum, adapter assumed elsewhere
        VarlikKayit kayit = new VarlikKayit(zincirler);
        s.kayit = address(kayit);

        address[] memory v = new address[](2);
        address[] memory f = new address[](2);
        uint64[] memory y = new uint64[](2);
        v[0] = cirbtc; f[0] = btcFeed; y[0] = 7 days;
        v[1] = weth;   f[1] = ethFeed; y[1] = 7 days;
        ChainlinkOracle o = new ChainlinkOracle(usdc, v, f, y);
        s.oracle = address(o);

        /* 1. a local asset with a working oracle: valuable and convertible */
        kayit.kaydet(5042, cirbtc, address(o));
        VarlikKayit.Varlik memory a = kayit.oku(5042, cirbtc);
        s.cirbtcKayitli = a.kayitli;
        s.cirbtcOndalik = a.ondalik;
        s.cirbtcCevrilebilir = kayit.cevrilebilir(5042, cirbtc);

        /* 2. a local asset with NO oracle: holdable, not convertible. USDC
              itself stands in for it — a real ERC20 the oracle was not
              given a feed for. */
        kayit.kaydet(5042, usdc, address(0));
        s.oraclesizKayitli = kayit.oku(5042, usdc).kayitli;
        s.oraclesizCevrilebilir = kayit.cevrilebilir(5042, usdc);

        s.toplamKayit = kayit.sayi();

        /* 3-7. the refusals */
        try kayit.kaydet(5042, kodsuz, address(0)) { s.kodsuzRed = false; }
        catch { s.kodsuzRed = true; }

        try kayit.kaydet(999999, cirbtc, address(o)) { s.desteksizZincirRed = false; }
        catch { s.desteksizZincirRed = true; }

        try kayit.kaydet(5042, cirbtc, address(o)) { s.mukerrerRed = false; }
        catch { s.mukerrerRed = true; }

        /* A remote asset with no oracle: Arc cannot read that chain and
           cannot price the asset, so there is nothing to verify. */
        try kayit.kaydet(1, cirbtc, address(0)) { s.uzakOraclesizRed = false; }
        catch { s.uzakOraclesizRed = true; }

        /* An oracle that exists but has no feed for THIS asset. The
           dangerous case: a real adapter handed the wrong asset. */
        try kayit.kaydet(5042, kodsuz, address(o)) { s.yanlisOracleRed = false; }
        catch { s.yanlisOracleRed = true; }
    }
}
