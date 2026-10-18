// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20I {
    function transferFrom(address, address, uint256) external returns (bool);
}

interface ISembol {
    function symbol() external view returns (string memory);
}

/// @title PulseIsim — `.pulse` names on Arc
///
/// WHAT IT IS
///   A name `ad.pulse` points at an address (a wallet, a token, a vault).
///   Lowercase a-z, 0-9 and inner hyphens, 1 to 32 characters. A name is
///   held for good: no expiry, no renewal, no one who can take it back.
///   Its holder may point it elsewhere or hand it on; any address may name
///   one of the names pointing at it as its own (reverse lookup).
///
/// TWO WAYS TO GET ONE
///   kaydet      anyone, any free name, for UCRET dollars once: 95% to the
///               treasury, 5% to FTHM (the FthmYakici, which buys and burns
///               FTHM). Both recipients are fixed at construction.
///   tokenAdi    free and permissionless for every token launched on one of
///               ARC PULSE's launchpads on Arc (fixed at construction): the
///               name is the token's own symbol, lowercased, pointing at the
///               token and held by its founder, both read from the
///               launchpad's register — no one can name a token they did
///               not launch, nor give a launch someone else's name. If the
///               symbol is taken, the launch's index is appended
///               (`pepe-12`).
///
/// No owner, no admin, no upgrade, no fee change.
contract PulseIsim {
    uint256 public constant UCRET = 1e6;          // 1 USDC (6 decimals)
    uint256 public constant FTHM_PAYI = 50_000;   // 5% in ppm
    uint256 public constant AZAMI = 32;

    IERC20I public immutable usdc;
    address public immutable hazine;
    address public immutable fthmPayi;
    /// a launchpad and the word (0-based) of the founder in its register entry
    struct Launchpad { address adres; uint8 kurucuKelimesi; }
    Launchpad[] private _launchpadlar;

    struct Kayit { address sahip; address hedef; }
    mapping(bytes32 => Kayit) public kayitlar;          // keccak256(name) -> record
    mapping(address => string) private _birincil;       // reverse: address -> name
    /// launchpad -> launch index -> already named
    mapping(address => mapping(uint256 => bool)) public adlandi;

    event Kaydedildi(bytes32 indexed dugum, string ad, address indexed sahip, address hedef);
    event HedefDegisti(bytes32 indexed dugum, address hedef);
    event Devredildi(bytes32 indexed dugum, address yeniSahip);
    event Birincil(address indexed adres, string ad);

    error GecersizAd();
    error AlinmisAd();
    error SadeceSahip();
    error TransferOlmadi();
    error TanimsizLaunchpad();
    error ZatenAdlandi();
    error HedefDegil();

    constructor(IERC20I _usdc, address _hazine, address _fthmPayi, Launchpad[] memory launchpadlar) {
        usdc = _usdc;
        hazine = _hazine;
        fthmPayi = _fthmPayi;
        for (uint256 i = 0; i < launchpadlar.length; i++) _launchpadlar.push(launchpadlar[i]);
    }

    /* ---- names ------------------------------------------------------ */

    /// Whether `ad` is a well-formed label (without ".pulse").
    function gecerli(string memory ad) public pure returns (bool) {
        bytes memory b = bytes(ad);
        if (b.length == 0 || b.length > AZAMI) return false;
        if (b[0] == "-" || b[b.length - 1] == "-") return false;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "-")) return false;
        }
        return true;
    }

    function dugum(string memory ad) public pure returns (bytes32) { return keccak256(bytes(ad)); }

    /// Where `ad` points (address(0) if unregistered).
    function coz(string calldata ad) external view returns (address) { return kayitlar[dugum(ad)].hedef; }

    function sahibi(string calldata ad) external view returns (address) { return kayitlar[dugum(ad)].sahip; }

    /// Register a free name for UCRET dollars (approve first).
    function kaydet(string calldata ad, address hedef) external {
        uint256 f = (UCRET * FTHM_PAYI) / 1_000_000;
        if (!usdc.transferFrom(msg.sender, fthmPayi, f)) revert TransferOlmadi();
        if (!usdc.transferFrom(msg.sender, hazine, UCRET - f)) revert TransferOlmadi();
        _yaz(ad, msg.sender, hedef);
    }

    /// Name launch `i` of `launchpad` after its token's symbol. Anyone may call.
    function tokenAdi(address launchpad, uint256 i) external returns (string memory ad) {
        (bool var_, uint8 k) = _bul(launchpad);
        if (!var_) revert TanimsizLaunchpad();
        if (adlandi[launchpad][i]) revert ZatenAdlandi();
        adlandi[launchpad][i] = true;
        (address token, address kurucu) = _launch(launchpad, i, k);
        ad = _kucuk(ISembol(token).symbol());
        if (bytes(ad).length == 0) ad = "token";
        if (kayitlar[dugum(ad)].sahip != address(0)) ad = string.concat(ad, "-", _ondalik(i));
        _yaz(ad, kurucu, token);
    }

    function hedefle(string calldata ad, address hedef) external {
        bytes32 d = dugum(ad);
        if (kayitlar[d].sahip != msg.sender) revert SadeceSahip();
        kayitlar[d].hedef = hedef;
        emit HedefDegisti(d, hedef);
    }

    function devret(string calldata ad, address yeni) external {
        bytes32 d = dugum(ad);
        if (kayitlar[d].sahip != msg.sender || yeni == address(0)) revert SadeceSahip();
        kayitlar[d].sahip = yeni;
        emit Devredildi(d, yeni);
    }

    /// Name `ad` as the caller's own; it must point at the caller.
    function birincilYap(string calldata ad) external {
        if (kayitlar[dugum(ad)].hedef != msg.sender) revert HedefDegil();
        _birincil[msg.sender] = ad;
        emit Birincil(msg.sender, ad);
    }

    /// The caller-chosen name of `a`, if it still points at `a`.
    function adi(address a) external view returns (string memory) {
        string memory ad = _birincil[a];
        if (bytes(ad).length == 0 || kayitlar[dugum(ad)].hedef != a) return "";
        return ad;
    }

    function launchpadlar() external view returns (Launchpad[] memory) { return _launchpadlar; }

    function _bul(address l) internal view returns (bool, uint8) {
        for (uint256 i = 0; i < _launchpadlar.length; i++) {
            if (_launchpadlar[i].adres == l) return (true, _launchpadlar[i].kurucuKelimesi);
        }
        return (false, 0);
    }

    /* ---- internal --------------------------------------------------- */

    function _yaz(string memory ad, address sahip, address hedef) internal {
        if (!gecerli(ad)) revert GecersizAd();
        bytes32 d = dugum(ad);
        if (kayitlar[d].sahip != address(0)) revert AlinmisAd();
        kayitlar[d] = Kayit(sahip, hedef);
        emit Kaydedildi(d, ad, sahip, hedef);
    }

    /// The register entry `launchAt(i)` of every ARC PULSE launchpad
    /// generation is a static struct whose first field is the token; the
    /// founder is word 6 in nesil2 and word 5 in nesil3 and nesil4.
    function _launch(address launchpad, uint256 i, uint8 k) internal view returns (address token, address kurucu) {
        (bool ok, bytes memory r) = launchpad.staticcall(abi.encodeWithSignature("launchAt(uint256)", i));
        uint256 o = 32 * (uint256(k) + 1);
        if (!ok || r.length < o) revert TanimsizLaunchpad();
        assembly {
            token := mload(add(r, 32))
            kurucu := mload(add(r, o))
        }
    }

    /// Lowercase letters and digits of a symbol; everything else dropped; at most AZAMI - 6.
    function _kucuk(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory o = new bytes(b.length);
        uint256 n;
        for (uint256 i = 0; i < b.length && n < AZAMI - 6; i++) {
            bytes1 c = b[i];
            if (c >= "A" && c <= "Z") o[n++] = bytes1(uint8(c) + 32);
            else if ((c >= "a" && c <= "z") || (c >= "0" && c <= "9")) o[n++] = c;
        }
        assembly { mstore(o, n) }
        return string(o);
    }

    function _ondalik(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        bytes memory b = new bytes(78);
        uint256 n;
        while (v > 0) { b[77 - n++] = bytes1(uint8(48 + (v % 10))); v /= 10; }
        bytes memory o = new bytes(n);
        for (uint256 i = 0; i < n; i++) o[i] = b[78 - n + i];
        return string(o);
    }
}
