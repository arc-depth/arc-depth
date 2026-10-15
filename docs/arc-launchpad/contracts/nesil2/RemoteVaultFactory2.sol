// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RemoteCollateralVault2} from "./RemoteCollateralVault2.sol";

/// @title RemoteVaultFactory — one vault per token, at an address Arc can
///        compute without being told
///
/// THE CONSTRAINT THAT SHAPES EVERYTHING HERE
///   Arc derives a remote vault's address as
///   CREATE2(factory, keccak256(tokenId), initCodeHash), and the registry
///   holds a SINGLE initCodeHash per chain. That only works if every vault
///   on that chain has byte-identical creation code — which means the vault
///   can take NO constructor arguments at all. Appending even one would
///   change the hash per deployment, Arc's derivation would point at an
///   address with no code, and a CCTP mint would land somewhere nobody
///   holds.
///
///   So the vault takes nothing and asks instead. `bekleyenTokenId` is set
///   immediately before the CREATE2 and cleared immediately after; the
///   vault reads it in its constructor, along with the chain-wide addresses
///   this factory holds immutably. Uniswap's pair factory does the same
///   thing for the same reason.
///
/// WHAT IS IMMUTABLE HERE AND WHY
///   The Arc side's identity — the CCTP domain and the vault address that
///   collateral may be returned to — is fixed at construction and inherited
///   by every vault. A settable version would be an admin key that could
///   redirect every remote vault's funds at once, which is precisely the
///   withdraw this architecture is built to make inexpressible.
/// SECOND GENERATION: one factory per HOME chain, and the home vault is
/// derived per token instead of being one constant. The first generation's
/// constant was Arc's vault factory, an address that cannot move money, so
/// every return trip would have minted into it. Here
///
///     home vault(tokenId) = CREATE2(evKasaFabrika, keccak256(tokenId), evKasaInitHash)
///
/// which is KasaFabrika2's own derivation on the home chain. A remote vault
/// built here accepts money and instructions only from that address on that
/// domain, and sends money and reports only to it.
contract RemoteVaultFactory2 {
    /// CCTP's domain for Arc. Measured on chain: Arc's
    /// MessageTransmitterV2.localDomain() answers 26.
    uint32 public immutable arcDomain;

    /// The Arc-side vault that is the ONLY address collateral may be
    /// returned to. Not a parameter of any function — a constant of the
    /// whole deployment.
    address public immutable evKasaFabrika;
    bytes32 public immutable evKasaInitHash;

    /// This chain's CCTP contracts and its USDC.
    address public immutable tokenMessenger;
    address public immutable mesajTasiyici;
    address public immutable usdc;

    /// Set for the length of one CREATE2 and cleared after. Storage rather
    /// than a constructor argument, for the reason in the contract notes.
    uint256 public bekleyenTokenId;
    bool public dagitimda;

    mapping(uint256 => address) public kasalar;

    /* ---- the price floor's inputs, fixed at construction ------------
     *
     * WHY THESE LIVE HERE AND NOT IN THE MESSAGE
     *   The vault has to derive its own acceptance bound, because the one
     *   it used to enforce came from the caller. Measured on a real fork:
     *   a hostile executor borrowed $2,000.00, set that bound to 1, spent
     *   $1.00 and kept $1,999.00 — a 99.94% loss, and the "check" passed.
     *
     *   The bound therefore needs a price the vault can verify, and the
     *   feed address needs a source the executor does not control. Putting
     *   it in the CCTP order would work too, but the order's shape is
     *   shared with Arc and the registry; putting it here leaves the
     *   message format alone and makes the configuration a constant of the
     *   deployment.
     *
     * WHY THERE IS NO ADD FUNCTION
     *   An admin who can add an asset can add one whose "feed" they
     *   control, which hands back the entire loss this is closing. The list
     *   is fixed at construction, exactly as CrossChainAssetRegistry has no
     *   addChain.
     *
     * WHY THE STALENESS WINDOW IS PER FEED
     *   Measured on Ethereum mainnet at block 26,162,278: ETH/USD had not
     *   updated for 3,552 seconds and USDC/USD for 81,504. A single
     *   one-hour constant would have rejected ETH/USD at that very block,
     *   and USDC/USD always. Chainlink heartbeats differ per feed, so the
     *   window does too — and a window that errs in the generous direction
     *   is how a retired aggregator's stale answer gets used.
     */
    struct Besleyici {
        address varlik;
        address besleyici;         // the Chainlink PROXY, never an aggregator
        uint8 varlikOndalik;
        uint8 besleyiciOndalik;
        uint32 azamiYas;           // seconds: the feed's heartbeat plus margin
    }
    /* ---- THE SECOND PRICE SOURCE, AND WHY THERE ARE TWO ------------
     *
     * The feed table above is fixed at construction and always will be: a
     * function that lets anyone register a "feed" for an asset lets anyone
     * nominate a contract that answers whatever they want, and the floor
     * derived from it would be whatever they chose. That is the withdraw
     * this design exists to prevent, reintroduced as a feature.
     *
     * So the table is not opened. The asset set is opened instead — by a
     * source that needs no registration at all: the asset's own deepest
     * USDC pool and its 30-minute average. Any token with a real pool
     * works, nobody's permission required, and nothing had to be added
     * here for it to work.
     *
     * Where a feed EXISTS it still wins, because it is independent of the
     * pool being traded in and therefore stricter. That blocks nobody: an
     * asset with no feed passes through the pool path.
     */
    address public immutable havuzFiyat;

    mapping(address => Besleyici) private _besleyici;
    address[] public besleyiciVarliklari;

    error KotuKurulum();
    error ZatenVar(uint256 tokenId);
    error DagitimdaDegil();
    error BesleyiciYok(address varlik);

    event KasaDagitildi(uint256 indexed tokenId, address kasa);

    constructor(
        uint32 _arcDomain,
        address _evKasaFabrika,
        bytes32 _evKasaInitHash,
        address _tokenMessenger,
        address _mesajTasiyici,
        address _usdc,
        address _havuzFiyat,
        Besleyici[] memory besleyiciler
    ) {
        if (_evKasaFabrika == address(0) || _evKasaInitHash == bytes32(0)) revert KotuKurulum();
        if (_tokenMessenger == address(0) || _mesajTasiyici == address(0)) revert KotuKurulum();
        if (_usdc == address(0)) revert KotuKurulum();
        /* The pool price source is required, not optional: it is what
           makes an asset with no feed usable at all, and a zero here
           would silently turn the whole permissionless path off. */
        if (_havuzFiyat == address(0)) revert KotuKurulum();
        /* An Arc-side address with anything in its top twelve bytes is not
           an EVM address, and sending a return trip to it would be sending
           it nowhere. */
        arcDomain = _arcDomain;
        evKasaFabrika = _evKasaFabrika;
        evKasaInitHash = _evKasaInitHash;
        tokenMessenger = _tokenMessenger;
        mesajTasiyici = _mesajTasiyici;
        usdc = _usdc;
        havuzFiyat = _havuzFiyat;

        for (uint256 i = 0; i < besleyiciler.length; i++) {
            Besleyici memory b = besleyiciler[i];
            if (b.varlik == address(0) || b.besleyici == address(0)) revert KotuKurulum();
            if (b.azamiYas == 0 || b.besleyiciOndalik == 0) revert KotuKurulum();
            /* A duplicate would be two answers for one asset with no rule
               about which wins. */
            if (_besleyici[b.varlik].besleyici != address(0)) revert KotuKurulum();
            /* The quote is the unit of account and is never the thing being
               priced. A USDC/USD feed here would be a second opinion about
               the number everything else is measured in. */
            if (b.varlik == _usdc) revert KotuKurulum();
            _besleyici[b.varlik] = b;
            besleyiciVarliklari.push(b.varlik);
        }
    }

    /// What a vault reads to build its own floor. Reverts for an asset with
    /// no feed, which is what makes "an asset with no feed cannot be remote
    /// collateral" a property of the code rather than a policy.
    function besleyiciBilgisi(address varlik)
        external
        view
        returns (address besleyici, uint8 varlikOndalik, uint8 besleyiciOndalik, uint32 azamiYas)
    {
        Besleyici memory b = _besleyici[varlik];
        if (b.besleyici == address(0)) revert BesleyiciYok(varlik);
        return (b.besleyici, b.varlikOndalik, b.besleyiciOndalik, b.azamiYas);
    }

    function besleyiciVarMi(address varlik) external view returns (bool) {
        return _besleyici[varlik].besleyici != address(0);
    }

    function besleyiciSayisi() external view returns (uint256) {
        return besleyiciVarliklari.length;
    }

    /// Deploy `tokenId`'s vault. Permissionless: the address is determined
    /// by the salt, so whoever pays the gas cannot influence where it
    /// lands or what it contains.
    ///
    /// Anyone may call this BEFORE Arc sends anything — and should, because
    /// a CCTP mint to an address with no code is a mint into a hole. The
    /// Arc side therefore refuses to send to a chain whose vault is not
    /// yet deployed; this is the function that makes it deployable.
    function kasaKur(uint256 tokenId) external returns (address kasa) {
        if (kasalar[tokenId] != address(0)) revert ZatenVar(tokenId);

        bekleyenTokenId = tokenId;
        dagitimda = true;
        kasa = address(new RemoteCollateralVault2{salt: keccak256(abi.encode(tokenId))}());
        dagitimda = false;
        bekleyenTokenId = 0;

        kasalar[tokenId] = kasa;
        emit KasaDagitildi(tokenId, kasa);
    }

    /// What the vault calls from its constructor. Reverts outside a
    /// deployment so the slot cannot be read as a general oracle.
    function dagitimBilgisi()
        external
        view
        returns (uint256 tokenId, uint32 _arcDomain, bytes32 _arcKasasi,
                 address _tokenMessenger, address _mesajTasiyici, address _usdc)
    {
        if (!dagitimda) revert DagitimdaDegil();
        return (bekleyenTokenId, arcDomain, bytes32(uint256(uint160(evKasasi(bekleyenTokenId)))), tokenMessenger, mesajTasiyici, usdc);
    }

    /// The home vault of `tokenId`: KasaFabrika2's CREATE2 on the home chain.
    function evKasasi(uint256 tokenId) public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), evKasaFabrika, keccak256(abi.encode(tokenId)), evKasaInitHash
        )))));
    }

    /* ---- the derivation, so both sides can be compared -------------- */

    /// The creation code hash Arc's registry must hold for this chain.
    ///
    /// Published as a view so a deployment script can read it off the
    /// factory instead of recomputing it — the two disagreeing is the
    /// failure mode that sends money to an empty address, and it is
    /// invisible until the first transfer.
    function initKodHash() external pure returns (bytes32) {
        return keccak256(type(RemoteCollateralVault2).creationCode);
    }

    /// Where `tokenId`'s vault is, or will be. Same arithmetic Arc uses.
    function kasaAdresi(uint256 tokenId) external view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            keccak256(abi.encode(tokenId)),
            keccak256(type(RemoteCollateralVault2).creationCode)
        )))));
    }
}
