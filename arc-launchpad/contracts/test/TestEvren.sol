// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainlinkOracle} from "../ChainlinkOracle.sol";
import {IOracle} from "../IOracle.sol";
import {TeminatKasasi, IERC20K} from "../TeminatKasasi.sol";
import {LaunchToken} from "../LaunchToken.sol";

interface IOnayE {
    function transfer(address to, uint256 v) external returns (bool);
}

interface IOndalikE {
    function decimals() external view returns (uint8);
}

/// @notice Can the collateral menu actually be built?
///
/// WHY A LIST IS NOT A MENU
///   teminat-evreni.json says five assets on Arc are both priceable and
///   holdable. That is a claim about the chain. Whether the CONTRACTS
///   accept those five TOGETHER is a different claim, and the places it
///   could fail are the ones that have already cost this project time:
///
///     - ChainlinkOracle reads decimals() from both the asset and the feed
///       at construction and refuses a feed that will not answer. XAUM's
///       feed reports 18 decimals where every other one reports 8, and
///       EURC's token is 6 where WETH is 18. Four scales meet in one
///       expression, and a wrong assumption there is a silent factor of
///       ten thousand.
///
///     - TeminatKasasi requires the weights to close and the quote to be in
///       the basket. Five members is more than any earlier test has used.
///
///   One whole unit of each asset is the right probe: it makes the answer
///   directly comparable to the published price, so a scale error shows as
///   an absurd number instead of a plausible one.
///
/// WHY IT IS SPLIT INTO PIECES
///   Written as one function it did not compile — "Variable memPtr_4 is 1
///   too deep in the stack". The storage fields and the small helpers below
///   exist to keep each frame short, not because the logic wanted them.
contract TestEvren {
    ChainlinkOracle public oracle;
    TeminatKasasi public kasa;
    LaunchToken public token;

    struct Sonuc {
        address oracle;
        address kasa;
        uint8[] varlikOndalik;
        uint8[] feedOndalik;
        uint256[] birBirimDegeri;    // in quote units, 6 decimals
        bool[] degerlenebilir;
        uint256 sepetDegeri;
        bool kasaKuruldu;
    }

    function _oracleKur(address quote, address[] calldata v, address[] calldata f) internal {
        uint64[] memory y = new uint64[](v.length);
        /* The directory gives every one of these an 86400-second
           heartbeat, so two days accepts a feed that is merely late and
           still refuses one that has stopped. */
        for (uint256 i = 0; i < v.length; i++) y[i] = 2 days;
        oracle = new ChainlinkOracle(quote, v, f, y);
    }

    function _kasaKur(address quote, address[] calldata v, uint16[] calldata a) internal {
        token = new LaunchToken("Evren", "EVR", 1_000_000_000 ether, address(this));
        address[] memory vm = new address[](v.length);
        uint16[] memory am = new uint16[](a.length);
        for (uint256 i = 0; i < v.length; i++) { vm[i] = v[i]; am[i] = a[i]; }
        kasa = new TeminatKasasi(
            IERC20K(address(token)),
            address(uint160(0xE1)),
            address(uint160(0xAC)),
            quote,
            IOracle(address(oracle)),
            vm,
            am
        );
    }

    /// Does an UNSOLICITED inbound transfer count?
    ///
    /// This is the whole cross-chain question. CCTP mints to a
    /// `mintRecipient` — it does not call anything. So if the vault counts
    /// its BALANCE rather than tracking deposits, USDC arriving from any of
    /// the 25 CCTP domains becomes part of the floor with no new code, no
    /// new trust and no function that could send anything out.
    ///
    /// Reading bakiye() says it should work. Measuring it is different:
    /// a vault that only credited besle() would silently strand every
    /// cross-chain deposit, and nobody would find out until one arrived.
    function dogrudanTransferTesti(
        address quote,
        address[] calldata varliklar,
        address[] calldata feedler,
        uint16[] calldata agirliklar,
        uint256 miktar
    ) external returns (
        uint256 hakOnce, uint256 bakiyeOnce,
        uint256 hakSonra, uint256 bakiyeSonra,
        uint256 sepetOnce, uint256 sepetSonra
    ) {
        _oracleKur(quote, varliklar, feedler);
        _kasaKur(quote, varliklar, agirliklar);

        hakOnce = kasa.hak(quote);
        bakiyeOnce = kasa.bakiye(quote);
        sepetOnce = kasa.sepetDegeri();

        /* A plain transfer. No approve, no besle(), nothing told to the
           vault — exactly what a CCTP mint looks like from inside. */
        require(IOnayE(quote).transfer(address(kasa), miktar), "transfer olmadi");

        hakSonra = kasa.hak(quote);
        bakiyeSonra = kasa.bakiye(quote);
        sepetSonra = kasa.sepetDegeri();
    }

    function run(
        address quote,
        address[] calldata varliklar,
        address[] calldata feedler,
        uint16[] calldata agirliklar
    ) external returns (Sonuc memory s) {
        _oracleKur(quote, varliklar, feedler);
        _kasaKur(quote, varliklar, agirliklar);

        uint256 n = varliklar.length;
        s.oracle = address(oracle);
        s.kasa = address(kasa);
        s.varlikOndalik = new uint8[](n);
        s.feedOndalik = new uint8[](n);
        s.birBirimDegeri = new uint256[](n);
        s.degerlenebilir = new bool[](n);

        for (uint256 i = 0; i < n; i++) {
            uint8 vo = IOndalikE(varliklar[i]).decimals();
            s.varlikOndalik[i] = vo;
            s.feedOndalik[i] = IOndalikE(feedler[i]).decimals();
            s.birBirimDegeri[i] = oracle.deger(varliklar[i], 10 ** uint256(vo));
            s.degerlenebilir[i] = oracle.degerlenebilir(varliklar[i]);
        }

        s.kasaKuruldu = true;
        /* Empty, so this must be exactly zero. A basket that reports value
           it does not hold would be the failure that matters most. */
        s.sepetDegeri = kasa.sepetDegeri();
    }
}
