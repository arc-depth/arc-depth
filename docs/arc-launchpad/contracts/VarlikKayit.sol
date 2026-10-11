// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IOracle} from "./IOracle.sol";

interface IProbe {
    function decimals() external view returns (uint8);
    function balanceOf(address) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

/// @title VarlikKayit — which assets may be collateral, decided by checks
///        rather than by us.
/// @notice Permissionless. Anyone may register an asset; nobody may bless
///         one.
///
/// WHY NOT AN ALLOWLIST
///   An allowlist needs an owner, and an owner is the one thing this
///   project does not have anywhere else. It also cannot be written
///   honestly: "has a USDC pair" is met by 31,787 tokens on Arc and costs
///   gas to fake, and one of them has the symbol "USDC" while being
///   "Unconditional Support Dog Coin" — a billion supply, twenty-six USDC
///   pools, and not the canonical address.
///
///   So nothing is forbidden and nothing is blessed. What an asset must do
///   is pass checks, and the checks are mechanical.
///
/// NEW TOKEN IS NOT NEW CHAIN
///   Registering a token on a chain this system already reaches needs no
///   code and no permission. Reaching a NEW chain needs an adapter — a
///   bridge route, a swap route, a vault, a message path — and that is
///   code somebody has to write and audit. The two are deliberately
///   separate, because conflating them would let a permissionless call
///   claim support for infrastructure that does not exist.
///
/// THE ORACLE IS OPTIONAL, AND WHAT THAT COSTS
///   An asset with no oracle may still be HELD: a vault can keep it and a
///   holder can redeem a proportional share of it, because redemption is a
///   ratio and ratios need no price.
///
///   What it may NOT be is a conversion target. Converting USDC into an
///   asset means accepting an exchange rate, and the only rate available
///   without an oracle is the pool's own — which is what an attacker moves
///   for one block. So:
///
///       oracle present  ->  holdable, valuable, convertible
///       oracle absent   ->  holdable only; value counted as ZERO
///
///   Counting it as zero rather than as "unknown" is deliberate. An
///   unverifiable number added to a guaranteed floor makes the floor
///   unverifiable; a zero makes it understated, which is the safe
///   direction.
///
/// WHAT THIS CONTRACT DOES NOT PROVE
///   That an asset can be SOLD. A pool existing proves nothing — liquidity
///   placed for one block leaves in the next, transfer taxes and blacklists
///   can be added after registration, and there is no general way to prove
///   the absence of a honeypot on chain. `scripts/olc-varlik-sondasi.js`
///   runs a round-trip probe (dust in, dust back out) which catches the
///   cheap cases at the size and the moment it runs, and that is the
///   strongest evidence available — not a proof. The mitigation that does
///   hold is the one above: an asset nobody can value adds nothing to any
///   floor, so a honeypot cannot inflate one.
contract VarlikKayit {
    /// Arc. An asset here can be reached atomically; anything else needs a
    /// route, and routes are chain adapters rather than registry entries.
    uint256 public constant YEREL_ZINCIR = 5042;

    struct Varlik {
        uint256 zincirId;
        address yerelAdres;
        /// Zero means holdable but not valuable and not convertible.
        address oracle;
        uint8 ondalik;
        uint64 kayitBloku;
        bool kayitli;
    }

    /// Keyed by (chainId, address) because a token address means nothing
    /// without the chain it is on — two chains can carry the same address
    /// with different contracts behind it.
    mapping(bytes32 => Varlik) private varliklar;
    bytes32[] private anahtarlar;

    /// Chains this system can actually reach. Set at construction; adding
    /// one is a new deployment, because reaching a chain is code.
    mapping(uint256 => bool) public zincirDestekli;

    event VarlikKaydedildi(
        bytes32 indexed anahtar,
        uint256 indexed zincirId,
        address indexed varlik,
        address oracle,
        uint8 ondalik,
        bool degerlenebilir
    );

    error KotuKurulum();
    error ZincirDesteksiz();
    error ZatenKayitli();
    error KodYok();
    error ProbeBasarisiz();
    error OracleCevapsiz();

    constructor(uint256[] memory zincirler) {
        if (zincirler.length == 0) revert KotuKurulum();
        bool yerelVar;
        for (uint256 i = 0; i < zincirler.length; i++) {
            zincirDestekli[zincirler[i]] = true;
            if (zincirler[i] == YEREL_ZINCIR) yerelVar = true;
        }
        /* Arc has to be one of them. A registry that cannot name the chain
           its own launches live on would accept remote assets and reject
           the local ones. */
        if (!yerelVar) revert KotuKurulum();
    }

    function anahtar(uint256 zincirId, address varlik) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(zincirId, varlik));
    }

    function oku(uint256 zincirId, address varlik) external view returns (Varlik memory) {
        return varliklar[anahtar(zincirId, varlik)];
    }

    function sayi() external view returns (uint256) {
        return anahtarlar.length;
    }

    function anahtarAt(uint256 i) external view returns (bytes32) {
        return anahtarlar[i];
    }

    /// Can this asset be a conversion target — not merely held?
    function cevrilebilir(uint256 zincirId, address varlik) external view returns (bool) {
        Varlik memory v = varliklar[anahtar(zincirId, varlik)];
        if (!v.kayitli || v.oracle == address(0)) return false;
        return IOracle(v.oracle).degerlenebilir(varlik);
    }

    /// Register an asset. Anyone may call this; what decides the outcome is
    /// the checks, not the caller.
    ///
    /// @param oracle an IOracle that can value this asset, or the zero
    ///        address to register it as holdable-only. A non-zero adapter
    ///        that cannot actually value the asset is rejected here rather
    ///        than discovered later by a vault that needed a number.
    function kaydet(uint256 zincirId, address varlik, address oracle) external returns (bytes32 k) {
        if (varlik == address(0)) revert KotuKurulum();
        if (!zincirDestekli[zincirId]) revert ZincirDesteksiz();
        k = anahtar(zincirId, varlik);
        if (varliklar[k].kayitli) revert ZatenKayitli();

        uint8 ondalik;
        if (zincirId == YEREL_ZINCIR) {
            /* Local, so the chain can be asked directly. */
            if (varlik.code.length == 0) revert KodYok();
            /* The three calls a vault will make. Probed now, because a
               token that does not answer them is a vault full of a balance
               nobody can read or move. */
            (bool a, bytes memory ob) = varlik.staticcall(abi.encodeWithSelector(IProbe.decimals.selector));
            (bool b,) = varlik.staticcall(abi.encodeWithSelector(IProbe.balanceOf.selector, address(this)));
            (bool c,) = varlik.staticcall(abi.encodeWithSelector(IProbe.totalSupply.selector));
            if (!a || !b || !c || ob.length < 32) revert ProbeBasarisiz();
            ondalik = abi.decode(ob, (uint8));
        } else {
            /* Remote. Arc cannot read that chain, so the only thing that
               can be verified from here is that something can PRICE the
               asset — which is why a remote asset without an oracle is not
               accepted at all. Its routes are the chain adapter's
               business, and an adapter is code. */
            if (oracle == address(0)) revert OracleCevapsiz();
        }

        bool deger;
        if (oracle != address(0)) {
            deger = IOracle(oracle).degerlenebilir(varlik);
            if (!deger) revert OracleCevapsiz();
        }

        varliklar[k] = Varlik({
            zincirId: zincirId,
            yerelAdres: varlik,
            oracle: oracle,
            ondalik: ondalik,
            kayitBloku: uint64(block.number),
            kayitli: true
        });
        anahtarlar.push(k);
        emit VarlikKaydedildi(k, zincirId, varlik, oracle, ondalik, deger);
    }
}
