// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title KopruKanit — a bridge notice has to be proved, not announced.
///
/// WHAT WAS WRONG
///   Both bridge sides took the event AND the amount AND the recipient as
///   parameters from one relayer and checked none of them. StockVault's own
///   comment claimed "it cannot change where the stock goes: the recipient
///   travels with the notice" — but `to` was a parameter the relayer filled
///   in, so the comment described a protection the code did not have. That
///   gap is worse than the missing check, because it is the sentence an
///   auditor reads instead of the function.
///
///   With one key, `release(newId, attacker, totalShares)` empties the
///   vault and `mint(newId, attacker, 1e30)` prints whatever it likes.
///
/// WHAT THIS CHANGES
///   A notice is now a tuple signed by M of N independent signers, and the
///   amount and the recipient are INSIDE what they signed. A relayer can
///   still be the one who submits it — submission is not a privilege — but
///   it cannot alter a single field without invalidating every signature,
///   and no single key is enough.
///
///   The signed digest binds the destination chain, this contract's own
///   address and the source chain, so a signature gathered for one bridge
///   or one direction cannot be replayed on another. The event id is
///   recorded, so the same notice cannot be presented twice.
///
/// WHAT IT DOES NOT CHANGE
///   The signers are still people. M of N compromised keys still steals.
///   What this buys is that it takes M of them, that the theft is bounded
///   per transaction and per window, and that the bound is on chain rather
///   than in an operating procedure. Arc has no general message bridge
///   today — LayerZero and CCIP are both absent, verified on chain — so a
///   light client is not available to make this trustless. Saying the trust
///   is reduced and bounded is the honest claim; saying it is removed would
///   be the same mistake again.
///
/// WHAT THE SIGNERS STILL HAVE TO CHECK THEMSELVES
///   The digest binds the verifying contract, both chain ids and the
///   amount, so a notice cannot be moved between bridges or directions or
///   have its figures edited. It does NOT bind which contract on the
///   source chain emitted the event, and it cannot: the two sides would
///   have to know each other address at deployment and neither exists
///   first. So a signer has to verify, off chain and before signing, that
///   the event came from the counterpart contract, for the right token,
///   and is final — reorg-safe depth, not just mined.
///
///   M of N signatures are an attestation that those checks were done.
///   They are not a proof of reserves and nothing here should be read as
///   one.
///
/// THE CAP IS A FIXED WINDOW, NOT A ROLLING ONE
///   Said plainly because it matters: the counter resets when a window
///   ends, so an attacker who waits at a boundary can move up to twice the
///   cap in quick succession. A rolling window costs storage per bucket. A
///   fixed one is chosen deliberately, and the limit it really provides is
///   2x the cap, not 1x.
abstract contract KopruKanit {
    /// Domain tag, so a digest from this scheme cannot collide with any
    /// other signing this project does.
    bytes32 public constant ALAN = keccak256("ArcDepth.KopruKanit.v1");

    /// secp256k1 order / 2. A signature with a high s has a valid twin with
    /// the same signer, which would let the same approval be counted twice
    /// under two different byte strings.
    uint256 private constant YARI_N =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    mapping(address => bool) public imzaciMi;
    address[] public imzacilar;
    /// How many of them a notice needs.
    uint256 public immutable esik;
    /// The chain the notices come FROM. Part of the digest, so a Robinhood
    /// Chain notice cannot be presented on Arc's side and the reverse.
    uint256 public immutable kaynakZincir;

    /// Most a single notice may move.
    uint256 public immutable islemTavani;
    /// And the most all notices together may move inside one window.
    uint256 public immutable pencere;
    uint256 public immutable pencereTavani;

    uint256 public pencereBasi;
    uint256 public pencereToplam;
    mapping(bytes32 => bool) public kullanildi;

    event KanitKabul(bytes32 indexed olayId, address indexed to, uint256 miktar, uint256 imzaSayisi);

    error ImzaciYok();
    error KotuEsik();
    error KotuTavan();
    error AzImza();
    error SiraliDegil();
    error TanimsizImzaci();
    error KotuImza();
    error ZatenKullanildi();
    error IslemTavaniAsildi();
    error PencereTavaniAsildi();

    constructor(
        address[] memory _imzacilar,
        uint256 _esik,
        uint256 _kaynakZincir,
        uint256 _islemTavani,
        uint256 _pencere,
        uint256 _pencereTavani
    ) {
        if (_imzacilar.length == 0) revert ImzaciYok();
        /* A threshold of one is the thing being fixed, so it is refused
           rather than merely discouraged. */
        if (_esik < 2 || _esik > _imzacilar.length) revert KotuEsik();
        for (uint256 i = 0; i < _imzacilar.length; i++) {
            address s = _imzacilar[i];
            if (s == address(0) || imzaciMi[s]) revert TanimsizImzaci();
            imzaciMi[s] = true;
            imzacilar.push(s);
        }
        /* A zero window silently disables the window cap: the reset
           condition block.timestamp >= pencereBasi + 0 is always true, so
           the running total is cleared on every notice and even two events
           in the SAME BLOCK each get the full allowance. It fails OPEN,
           which is the worst direction, and it was in the first version of
           this file. Caught in review by the other agent.

           The two amounts are refused at zero as well. Those fail closed —
           everything reverts — but a cap that makes the bridge unusable is
           a misconfiguration worth catching at deployment rather than at
           the first withdrawal.

           And a window total below the per-transaction cap is incoherent:
           the larger limit could never be reached, so one of the two
           numbers is not what the deployer thought it was. */
        if (_pencere == 0 || _islemTavani == 0 || _pencereTavani == 0) revert KotuTavan();
        if (_pencereTavani < _islemTavani) revert KotuTavan();

        esik = _esik;
        kaynakZincir = _kaynakZincir;
        islemTavani = _islemTavani;
        pencere = _pencere;
        pencereTavani = _pencereTavani;
        pencereBasi = block.timestamp;
    }

    function imzaciSayisi() external view returns (uint256) {
        return imzacilar.length;
    }

    /// What the signers put their names to. Public so anyone — including a
    /// signer about to sign — can compute it independently instead of
    /// trusting whatever a relayer puts in front of them.
    function ozet(bytes32 olayId, address to, uint256 miktar) public view returns (bytes32) {
        bytes32 ham = keccak256(abi.encode(
            ALAN, block.chainid, address(this), kaynakZincir, olayId, to, miktar));
        /* EIP-191 prefix, so a signer can produce this with a plain
           personal_sign and a hardware wallet rather than needing custom
           signing support. */
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", ham));
    }

    /// Verify a notice, record it, and charge it against the caps.
    ///
    /// `imzalar` must be ordered by signer address, strictly increasing.
    /// That is how duplicates are refused without a second mapping: the
    /// same signer twice cannot be increasing.
    function _kanitla(
        bytes32 olayId,
        address to,
        uint256 miktar,
        bytes[] calldata imzalar
    ) internal {
        if (kullanildi[olayId]) revert ZatenKullanildi();
        if (imzalar.length < esik) revert AzImza();
        if (miktar > islemTavani) revert IslemTavaniAsildi();

        bytes32 d = ozet(olayId, to, miktar);
        address onceki = address(0);
        for (uint256 i = 0; i < imzalar.length; i++) {
            address s = _coz(d, imzalar[i]);
            if (s <= onceki) revert SiraliDegil();
            if (!imzaciMi[s]) revert TanimsizImzaci();
            onceki = s;
        }

        /* The window is charged before the caller moves anything, so a
           reentrant path cannot spend the same allowance twice. */
        if (block.timestamp >= pencereBasi + pencere) {
            pencereBasi = block.timestamp;
            pencereToplam = 0;
        }
        uint256 yeni = pencereToplam + miktar;
        if (yeni > pencereTavani) revert PencereTavaniAsildi();
        pencereToplam = yeni;

        kullanildi[olayId] = true;
        emit KanitKabul(olayId, to, miktar, imzalar.length);
    }

    function _coz(bytes32 d, bytes calldata imza) private pure returns (address) {
        if (imza.length != 65) revert KotuImza();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(imza.offset)
            s := calldataload(add(imza.offset, 32))
            v := byte(0, calldataload(add(imza.offset, 64)))
        }
        if (uint256(s) > YARI_N) revert KotuImza();
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert KotuImza();
        address imzaci = ecrecover(d, v, r, s);
        if (imzaci == address(0)) revert KotuImza();
        return imzaci;
    }
}
