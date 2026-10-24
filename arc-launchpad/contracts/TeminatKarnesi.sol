// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20Meta {
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
}

/// @title TeminatKarnesi
/// @notice Grades a collateral token from the chain, at launch, and files
///         the grade next to the launch so a buyer reads a measurement
///         instead of a promise.
///
/// WHY A GRADE AND NOT AN ALLOWLIST
///   An allowlist needs an owner to maintain, and an owner is the one thing
///   this project does not have anywhere else. It also cannot be written
///   honestly, because none of the obvious criteria survive contact with
///   the chain. "Has a USDC pair" is met by 31,787 tokens on Arc and costs
///   gas to fake. "Top 100 by market cap" is off-chain data a contract
///   cannot see. "Deep enough pool" is gameable: liquidity placed for one
///   block leaves in the next.
///
///   So nothing is forbidden and nothing is blessed. The collateral is
///   measured and the measurement is published. A launch backed by a
///   serious asset and one backed by somebody's own token are both allowed,
///   and tell themselves apart.
///
/// THE IMPERSONATION THIS EXISTS FOR
///   Arc carries a token whose symbol is "USDC" and whose name is
///   "Unconditional Support Dog Coin": eighteen decimals, a billion supply,
///   twenty-six USDC pools, and it is not
///   0x3600000000000000000000000000000000000000. Anything trusting a symbol
///   would describe a launch backed by it as USDC-backed. So nothing here
///   reads a symbol, and the canonical address is compared directly.
///
/// HOW THE CAPABILITIES ARE PROBED, AND WHY NOT BY SCANNING CODE
///   The first version of this file copied the token's bytecode into memory
///   and searched it for selectors. Two things were wrong with that. It
///   cost about 1.4 million gas per selector on a 24KB contract, which is
///   more than a launch can afford. And it could not see past a proxy — all
///   four of Arc's major assets are proxies, and a scan of Arc USDC's
///   1,798-byte stub reports no blacklister on a token that has one.
///
///   staticcall fixes both. It costs a few thousand gas and it goes THROUGH
///   the proxy, so what answers is what actually runs. Only view functions
///   can be probed this way, which is why the authority a token holds is
///   read from its getters — masterMinter(), blacklister(), owner() — and
///   not from the state-changing functions they govern.
///
/// WHAT A GRADE CANNOT TELL YOU
///   Whether the asset is worth anything. These are facts about a contract,
///   not a valuation, and a token can answer every probe here and still be
///   worthless. The fields are chosen to make the cheap frauds visible.
///
/// NO OWNER, NO SETTER, NO UPGRADE. A grade is written once per launch and
/// never changes, because what a buyer needs is what was true when the
/// launch was made.
contract TeminatKarnesi {
    /// The only address allowed to file a grade. Launches come from one
    /// place, and a grade for a launch that never happened would be noise
    /// somebody could point at.
    address public immutable launchpad;

    /// The canonical quote asset, so `gercekParaMi` is an address
    /// comparison and not a string anyone can choose.
    address public immutable gercekPara;

    struct Karne {
        address teminat;
        uint8 basamak;          // 255 when the token does not answer
        uint256 arz;
        uint256 kodBoyutu;
        bool gercekParaMi;      // true only at the canonical address
        /* Answered a staticcall, so these are true of the code that
           actually executes, proxy or not. A false means the getter did
           not answer — which is not proof the capability is absent, only
           that it is not exposed under this name. */
        bool sahipVar;          // owner()
        bool mintYetkisiVar;    // masterMinter()
        bool dondurmaVar;       // isBlacklisted(address) / isBlackListed
        bool dondurmaYetkisiVar;// blacklister()
        bool duraklatilabilir;  // paused()
        bool yukseltilebilir;   // implementation()
        uint64 blok;
    }

    mapping(address => Karne) public karnesi;

    event KarneYazildi(address indexed token, address indexed teminat, uint64 blok);

    error OnlyLaunchpad();
    error ZatenVar();

    constructor(address _launchpad, address _gercekPara) {
        launchpad = _launchpad;
        gercekPara = _gercekPara;
    }

    /// Measures `teminat` and files it under `token`. Once only: a grade
    /// that could be rewritten is a grade somebody could improve after the
    /// fact, which is what this exists to prevent.
    function yaz(address token, address teminat) external returns (Karne memory k) {
        if (msg.sender != launchpad) revert OnlyLaunchpad();
        if (karnesi[token].teminat != address(0)) revert ZatenVar();

        k.teminat = teminat;
        k.gercekParaMi = (teminat == gercekPara);
        k.blok = uint64(block.number);

        uint256 boyut;
        assembly { boyut := extcodesize(teminat) }
        k.kodBoyutu = boyut;

        /* An address with no code at all: describe it, do not revert. A
           grade that throws on a bad input tells a caller nothing, and
           try/catch does not save us here — a call to an empty address
           SUCCEEDS with no return data, and decoding that is a panic
           rather than a catchable revert. Found by grading 0x…dEaD. */
        if (boyut == 0) {
            k.basamak = 255;
            karnesi[token] = k;
            emit KarneYazildi(token, teminat, k.blok);
            return k;
        }

        try IERC20Meta(teminat).decimals() returns (uint8 d) { k.basamak = d; }
        catch { k.basamak = 255; }
        try IERC20Meta(teminat).totalSupply() returns (uint256 t) { k.arz = t; }
        catch { k.arz = 0; }

        k.sahipVar            = _cevapVeriyor(teminat, abi.encodeWithSelector(0x8da5cb5b));
        k.mintYetkisiVar      = _cevapVeriyor(teminat, abi.encodeWithSelector(0x35d99f35));
        k.dondurmaYetkisiVar  = _cevapVeriyor(teminat, abi.encodeWithSelector(0xbd102430));
        k.duraklatilabilir    = _cevapVeriyor(teminat, abi.encodeWithSelector(0x5c975abb));
        k.yukseltilebilir     = _cevapVeriyor(teminat, abi.encodeWithSelector(0x5c60da1b));
        /* Two spellings, because USDC uses one and several forks use the
           other, and a token that can freeze a vault under either spelling
           freezes it just the same. */
        k.dondurmaVar =
            _cevapVeriyor(teminat, abi.encodeWithSelector(0xfe575a87, address(this)))
            || _cevapVeriyor(teminat, abi.encodeWithSelector(0xe47d6060, address(this)));

        karnesi[token] = k;
        emit KarneYazildi(token, teminat, k.blok);
    }

    /// Does `hedef` answer this call with data?
    ///
    /// A getter that exists returns a word; one that does not either
    /// reverts or returns nothing, because the fallback of a token is not
    /// going to produce 32 bytes for a selector it has never heard of.
    /// Gas is bounded so a token with a deliberately expensive fallback
    /// cannot make filing a grade unaffordable.
    function _cevapVeriyor(address hedef, bytes memory veri) internal view returns (bool) {
        if (hedef.code.length == 0) return false;
        (bool ok, bytes memory out) = hedef.staticcall{gas: 40000}(veri);
        return ok && out.length >= 32;
    }

    /// Everything a screen needs, in one call.
    function oku(address token) external view returns (Karne memory) {
        return karnesi[token];
    }
}
