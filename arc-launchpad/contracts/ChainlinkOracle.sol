// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IOracle} from "./IOracle.sol";

interface IChainlinkFeed {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function decimals() external view returns (uint8);
}

interface IOndalik {
    function decimals() external view returns (uint8);
}

/// @title ChainlinkOracle — values assets from Chainlink feeds on Arc.
/// @notice One adapter, many assets. The feed for each is fixed at
///         construction and can never be repointed.
///
/// WHY THIS IS AN ADAPTER AND NOT THE INTERFACE
///   Chainlink is the only oracle this project could VERIFY on Arc
///   mainnet — 29 feeds, discovered by scanning AnswerUpdated logs rather
///   than by reading documentation, because the documentation disagreed
///   with itself about whether Arc was testnet or mainnet. Pyth's two
///   candidate addresses on Arc are not Pyth: priceFeedExists is absent and
///   getValidTimePeriod reverts. RedStone leaves no logs to find.
///
///   That is a fact about today, not a preference. So the vault talks to
///   IOracle and this is one implementation of it; when Pyth or Data
///   Streams do arrive, a second adapter is written and nothing else
///   changes.
///
/// THE DECIMALS ARE DONE HERE, ONCE
///   quote = miktar * answer * 10^quoteDec / (10^feedDec * 10^assetDec)
///
///   Worked through with the real numbers so the shape is checkable: one
///   whole cirBTC is 1e8 raw units, BTC/USD answers 8_300_989_000_000 at
///   eight decimals, USDC has six. That gives
///   1e8 * 8.300989e12 * 1e6 / (1e8 * 1e8) = 83_009_890_000 raw USDC,
///   which is $83,009.89 — the figure the feed was showing when this was
///   written.
///
/// STALE MEANS REVERT
///   An answer older than its asset's heartbeat is not returned. A caller
///   cannot tell a stale value from a fresh one, and a vault that valued a
///   basket from last week's prices would let a buyback through that this
///   week's prices forbid.
contract ChainlinkOracle is IOracle {
    address public immutable quote;
    uint8 public immutable quoteOndalik;

    struct Besleyici {
        address feed;
        uint8 varlikOndalik;
        uint8 feedOndalik;
        /// How old an answer may be. Per asset, because Chainlink's own
        /// heartbeats differ and one global number would either reject
        /// healthy feeds or accept dead ones.
        uint64 azamiYas;
    }

    mapping(address => Besleyici) public besleyici;

    error KotuKurulum();
    error BesleyiciYok();
    error Bayat();
    error KotuCevap();

    event Kaydedildi(address indexed varlik, address indexed feed, uint8 varlikOndalik, uint8 feedOndalik, uint64 azamiYas);

    /// Assets and their feeds, fixed here and nowhere else. There is no
    /// setter: a repointable oracle is an oracle somebody can repoint.
    constructor(
        address _quote,
        address[] memory varliklar,
        address[] memory feedler,
        uint64[] memory yaslar
    ) {
        if (_quote == address(0)) revert KotuKurulum();
        if (varliklar.length == 0) revert KotuKurulum();
        if (varliklar.length != feedler.length || varliklar.length != yaslar.length) revert KotuKurulum();
        quote = _quote;
        quoteOndalik = IOndalik(_quote).decimals();

        for (uint256 i = 0; i < varliklar.length; i++) {
            address v = varliklar[i];
            address f = feedler[i];
            if (v == address(0) || f == address(0) || yaslar[i] == 0) revert KotuKurulum();
            if (besleyici[v].feed != address(0)) revert KotuKurulum();   // no duplicates

            /* Both ends are read from the chain, not taken on trust. A
               wrong decimal figure here is a silent factor of ten
               thousand, and the contracts that know the right answer are
               the asset and the feed themselves. */
            uint8 vo = IOndalik(v).decimals();
            uint8 fo = IChainlinkFeed(f).decimals();

            /* And the feed has to actually answer, now, before it is
               accepted. A feed registered on the strength of its address
               would be discovered dead the first time a vault needed it. */
            (, int256 cevap,, uint256 guncellendi,) = IChainlinkFeed(f).latestRoundData();
            if (cevap <= 0 || guncellendi == 0) revert KotuCevap();

            besleyici[v] = Besleyici({feed: f, varlikOndalik: vo, feedOndalik: fo, azamiYas: yaslar[i]});
            emit Kaydedildi(v, f, vo, fo, yaslar[i]);
        }
    }

    function degerlenebilir(address varlik) external view override returns (bool) {
        Besleyici memory b = besleyici[varlik];
        if (b.feed == address(0)) return false;
        (, int256 cevap,, uint256 guncellendi,) = IChainlinkFeed(b.feed).latestRoundData();
        if (cevap <= 0 || guncellendi == 0) return false;
        return block.timestamp <= guncellendi + b.azamiYas;
    }

    function deger(address varlik, uint256 miktar) external view override returns (uint256) {
        Besleyici memory b = besleyici[varlik];
        if (b.feed == address(0)) revert BesleyiciYok();

        (, int256 cevap,, uint256 guncellendi,) = IChainlinkFeed(b.feed).latestRoundData();
        if (cevap <= 0 || guncellendi == 0) revert KotuCevap();
        if (block.timestamp > guncellendi + b.azamiYas) revert Bayat();

        /* Multiplied before divided, and the divisor assembled separately,
           so nothing truncates to zero on the way through. */
        uint256 pay = miktar * uint256(cevap) * (10 ** quoteOndalik);
        uint256 bol = (10 ** b.feedOndalik) * (10 ** b.varlikOndalik);
        return pay / bol;
    }

    /// What the quote asset itself is worth: itself. Registered like any
    /// other asset when a USDC/USD feed exists, but a vault holding USDC
    /// should not need a round trip through a price to know what it has.
    function quoteDegeri(uint256 miktar) external pure returns (uint256) {
        return miktar;
    }
}
