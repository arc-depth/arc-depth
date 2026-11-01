// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/* ===========================================================================
 * TurKaydi — which product a launched token belongs to
 *
 * Owner, 1 Nov 2026: the platform grows from one memecoin launchpad into
 * nine products (meme, community, creator, AI agent, project, DAO, game,
 * basket, designer). All nine launch through the same MerkezKapi with the
 * same rules: $20–500 first buy, a collateral basket, the same trading fee,
 * twelve chains. What tells them apart is this record: a type and a short
 * public description per token, which the site's sections read.
 *
 * WHO MAY WRITE
 *   The token's founder, read from the launch itself: MerkezKapi keeps the
 *   founder's vekil per token (vekilOf) and the vekil holds the founder as
 *   32 bytes. An EVM founder has the same address on Arc, so they sign from
 *   their own wallet. The owner may also write, so a wrong entry can be
 *   corrected (owner's order: keep room to change and fix; nothing locked).
 *
 * WHAT IS STORED
 *   Only what the founder publishes: the type number and a description
 *   (links, an agent's wallet, a game's site), public by design. No user
 *   data of any other kind.
 * =========================================================================== */

interface IMerkezKapiTur { function vekilOf(address token) external view returns (address); }
interface IKurucuVekiliTur { function kurucu() external view returns (bytes32); }

contract TurKaydi {
    /// 0 meme, 1 community, 2 creator, 3 AI agent, 4 project, 5 DAO, 6 game, 7 basket, 8 designer
    uint8 public constant TUR_SAYISI = 9;
    uint256 public constant BILGI_AZAMI = 1024;

    IMerkezKapiTur public immutable kapi;
    address public sahip;

    mapping(address => uint8) public turOf;
    mapping(address => string) public bilgiOf;
    mapping(address => bool) public yazildi;

    event TurYazildi(address indexed token, uint8 indexed tur, string bilgi, address yazan);
    event SahipDegisti(address eski, address yeni);

    error YetkiYok();
    error KotuTur();
    error BilgiUzun();
    error SifirAdres();

    constructor(IMerkezKapiTur kapi_, address sahip_) {
        if (address(kapi_) == address(0) || sahip_ == address(0)) revert SifirAdres();
        kapi = kapi_;
        sahip = sahip_;
    }

    /// The founder of a token launched through MerkezKapi, as an address on Arc (0 if none).
    function kurucuOf(address token) public view returns (address) {
        address vekil = kapi.vekilOf(token);
        if (vekil == address(0)) return address(0);
        bytes32 k = IKurucuVekiliTur(vekil).kurucu();
        /* A non-EVM founder (Solana, Sui, Aptos) is a full 32-byte key, not an
           address; only the owner can write for those tokens. */
        if (uint256(k) >> 160 != 0) return address(0);
        return address(uint160(uint256(k)));
    }

    function yaz(address token, uint8 tur, string calldata bilgi) external {
        if (msg.sender != sahip && (msg.sender != kurucuOf(token) || msg.sender == address(0))) revert YetkiYok();
        if (tur >= TUR_SAYISI) revert KotuTur();
        if (bytes(bilgi).length > BILGI_AZAMI) revert BilgiUzun();
        turOf[token] = tur;
        bilgiOf[token] = bilgi;
        yazildi[token] = true;
        emit TurYazildi(token, tur, bilgi, msg.sender);
    }

    function sahipDegistir(address yeni) external {
        if (msg.sender != sahip) revert YetkiYok();
        if (yeni == address(0)) revert SifirAdres();
        emit SahipDegisti(sahip, yeni);
        sahip = yeni;
    }
}
