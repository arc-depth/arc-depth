// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title DavetKaydi — ARC PULSE referral registry on Arc
 * @notice Who invited whom, written once by the invited wallet itself.
 *
 *   - bagla(davetci): the caller (the invited wallet, "davetli") records
 *     `davetci` as the wallet that invited it. Once per wallet, forever:
 *     first touch wins and nobody, the admin included, can change it.
 *     No self-referral, no zero address, and no two-wallet loop (A invited
 *     by B when B is already invited by A).
 *   - kodAl(kod): a wallet takes a short invite code (3..16 characters,
 *     a-z 0-9 and '-', not starting or ending with '-'), so links can read
 *     ?ref=<code> instead of an address. One code per wallet; a code
 *     belongs to the first wallet that takes it. kodBirak() frees it (links
 *     with the old code then stop resolving; bindings already made stay).
 *   - koduylaBagla(kod): bagla() with the wallet behind a code.
 *
 *   The registry holds no money and has NO ADMIN: no one can bind, unbind,
 *   or move a referral for anyone else. It only records the link; what a
 *   referrer earns is computed from public on-chain activity and paid by
 *   DavetOdemesi (see that contract).
 *   Nothing about a person is kept: an address, the block it was bound in,
 *   and an optional code the wallet chose itself.
 */
contract DavetKaydi {
    uint256 public constant KOD_EN_AZ = 3;
    uint256 public constant KOD_EN_COK = 16;

    /// davetli -> davetci (zero = not bound)
    mapping(address => address) public davetciOf;
    /// davetli -> the block its link was written in
    mapping(address => uint64) public baglantiBlogu;
    /// davetci -> how many wallets bound to it
    mapping(address => uint256) public davetliSayisi;
    /// code (left-aligned bytes) -> its wallet
    mapping(bytes32 => address) public kodSahibi;
    /// wallet -> its code (zero = none)
    mapping(address => bytes32) public kodOf;
    uint256 public toplamBaglanti;

    event Baglandi(address indexed davetli, address indexed davetci, uint64 blok);
    event KodAlindi(address indexed sahip, bytes32 indexed kod, string metin);
    event KodBirakildi(address indexed sahip, bytes32 indexed kod);

    error SifirAdres();
    error ZatenBagli(address davetci);
    error KendiniDavet();
    error Dongu();
    error KotuKod();
    error KodAlinmis(address sahip);
    error KodunVar(bytes32 kod);
    error KodYok();

    /* ------------------------------------------------------------ binding */

    /// Record `davetci` as the wallet that invited the caller. Once, forever.
    function bagla(address davetci) public {
        if (davetci == address(0)) revert SifirAdres();
        if (davetci == msg.sender) revert KendiniDavet();
        address var_ = davetciOf[msg.sender];
        if (var_ != address(0)) revert ZatenBagli(var_);
        if (davetciOf[davetci] == msg.sender) revert Dongu();
        davetciOf[msg.sender] = davetci;
        uint64 b = uint64(block.number);
        baglantiBlogu[msg.sender] = b;
        unchecked {
            ++davetliSayisi[davetci];
            ++toplamBaglanti;
        }
        emit Baglandi(msg.sender, davetci, b);
    }

    /// bagla() with the wallet that owns invite code `kod`.
    function koduylaBagla(string calldata kod) external {
        address s = kodSahibi[_kodAnahtari(kod)];
        if (s == address(0)) revert KodYok();
        bagla(s);
    }

    /* -------------------------------------------------------------- codes */

    /// Take invite code `kod` for the caller (lower-case a-z, 0-9, '-').
    function kodAl(string calldata kod) external {
        bytes32 k = _kodAnahtari(kod);
        bytes32 eski = kodOf[msg.sender];
        if (eski != bytes32(0)) revert KodunVar(eski);
        address s = kodSahibi[k];
        if (s != address(0)) revert KodAlinmis(s);
        kodSahibi[k] = msg.sender;
        kodOf[msg.sender] = k;
        emit KodAlindi(msg.sender, k, kod);
    }

    /// Free the caller's code (another wallet may take it later).
    function kodBirak() external {
        bytes32 k = kodOf[msg.sender];
        if (k == bytes32(0)) revert KodYok();
        delete kodOf[msg.sender];
        delete kodSahibi[k];
        emit KodBirakildi(msg.sender, k);
    }

    /* -------------------------------------------------------------- views */

    /// The wallet behind code `kod` (zero when the code is free or malformed).
    function kodCoz(string calldata kod) external view returns (address) {
        (bool gecerli, bytes32 k) = _kodDene(bytes(kod));
        return gecerli ? kodSahibi[k] : address(0);
    }

    /// Everything the site shows for one wallet, in one call.
    function bilgi(address kim) external view returns (address davetci, uint64 blok, uint256 davetli, bytes32 kod) {
        return (davetciOf[kim], baglantiBlogu[kim], davetliSayisi[kim], kodOf[kim]);
    }

    /// Whether `kim` could bind to `davetci` right now (0 = yes; 1 zero address,
    /// 2 self, 3 already bound, 4 loop).
    function baglanabilir(address kim, address davetci) external view returns (uint8) {
        if (davetci == address(0)) return 1;
        if (davetci == kim) return 2;
        if (davetciOf[kim] != address(0)) return 3;
        if (davetciOf[davetci] == kim) return 4;
        return 0;
    }

    /* ----------------------------------------------------------- internal */

    function _kodAnahtari(string calldata kod) internal pure returns (bytes32 k) {
        bool gecerli;
        (gecerli, k) = _kodDene(bytes(kod));
        if (!gecerli) revert KotuKod();
    }

    function _kodDene(bytes memory b) internal pure returns (bool, bytes32 k) {
        uint256 n = b.length;
        if (n < KOD_EN_AZ || n > KOD_EN_COK) return (false, 0);
        if (b[0] == "-" || b[n - 1] == "-") return (false, 0);
        for (uint256 i; i < n; ++i) {
            bytes1 c = b[i];
            bool ok = (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "-";
            if (!ok) return (false, 0);
        }
        assembly { k := mload(add(b, 32)) }
        /* clear the bytes past the code (mload read 32) */
        k &= bytes32(type(uint256).max << ((32 - n) * 8));
        return (true, k);
    }
}
