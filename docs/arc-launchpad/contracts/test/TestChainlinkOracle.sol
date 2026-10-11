// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainlinkOracle} from "../ChainlinkOracle.sol";

/// @notice Does the decimal arithmetic give the right number against the
///         real feeds, or only against the one worked example in the
///         comment?
///
/// This is the check worth running, because every decimal mistake this
/// project has made looked fine in the source and was off by a power of ten
/// on the chain. cirBTC is eight decimals, WETH is eighteen, USDC is six,
/// and the feeds answer at eight — four different scales in one expression.
///
/// Run against Arc mainnet, so the feeds are the live ones and the answers
/// are whatever BTC and ETH are actually worth when the test runs. The
/// assertions are therefore bounds and ratios, not fixed figures: a test
/// pinned to $83,009.89 would start failing for the wrong reason tomorrow.
contract TestChainlinkOracle {
    struct Sonuc {
        address oracle;
        /// One whole unit of each asset, valued in quote raw units.
        uint256 birBtc;
        uint256 birEth;
        /// Ten whole units, to catch a scale error that cancels at one.
        uint256 onBtc;
        /// A thousandth, to catch truncation at the small end.
        uint256 bindeBirBtc;
        bool btcDegerlenebilir;
        bool ethDegerlenebilir;
        bool bilinmeyenDegerlenebilir;
    }

    function run(
        address usdc,
        address cirbtc,
        address weth,
        address btcFeed,
        address ethFeed,
        address bilinmeyen
    ) external returns (Sonuc memory s) {
        address[] memory varliklar = new address[](2);
        address[] memory feedler = new address[](2);
        uint64[] memory yaslar = new uint64[](2);
        varliklar[0] = cirbtc; feedler[0] = btcFeed; yaslar[0] = 7 days;
        varliklar[1] = weth;   feedler[1] = ethFeed; yaslar[1] = 7 days;

        ChainlinkOracle o = new ChainlinkOracle(usdc, varliklar, feedler, yaslar);
        s.oracle = address(o);

        s.birBtc = o.deger(cirbtc, 1e8);          // cirBTC has 8 decimals
        s.onBtc = o.deger(cirbtc, 10 * 1e8);
        s.bindeBirBtc = o.deger(cirbtc, 1e8 / 1000);
        s.birEth = o.deger(weth, 1e18);           // WETH has 18

        s.btcDegerlenebilir = o.degerlenebilir(cirbtc);
        s.ethDegerlenebilir = o.degerlenebilir(weth);
        s.bilinmeyenDegerlenebilir = o.degerlenebilir(bilinmeyen);
    }

    /// A feed that does not answer must be refused at construction, not
    /// discovered dead later.
    function oluDagitim(address usdc, address cirbtc, address oluFeed) external returns (bool revertEtti) {
        address[] memory v = new address[](1);
        address[] memory f = new address[](1);
        uint64[] memory y = new uint64[](1);
        v[0] = cirbtc; f[0] = oluFeed; y[0] = 7 days;
        try new ChainlinkOracle(usdc, v, f, y) {
            revertEtti = false;
        } catch {
            revertEtti = true;
        }
    }
}
