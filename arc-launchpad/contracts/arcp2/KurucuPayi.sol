// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20K {
    function transfer(address to, uint256 v) external returns (bool);
}

interface IAcilisK {
    function acilisZamani() external view returns (uint256);
}

/// @title KurucuPayi — the founder's 15%, counted from the day the pool opens.
///
/// THE RULE (owner, 9 Nov 2026)
///   Half straight away, half over twelve months. "Straight away" is the
///   opening, not the deployment: before the pool exists nobody holds the
///   token, the founder included, so nobody can stake ahead of the presale
///   buyers or be seen holding a liquid 7.5% while they wait. The twelve
///   months start at the opening too, so a long presale does not quietly
///   shorten them.
///
///   Monthly steps, as Vesting: one twelfth of the second half each 30
///   days, visible and checkable. No cliff beyond that, no revocation, no
///   owner, no way to change the beneficiary.
contract KurucuPayi {
    uint256 public constant AY = 30 days;
    uint256 public constant AYLAR = 12;

    IERC20K public immutable token;
    IAcilisK public immutable kaynak;
    address public immutable kurucu;
    uint256 public immutable hemen;
    uint256 public immutable vadeli;

    uint256 public alinan;

    event Alindi(uint256 miktar, uint256 toplamAlinan);

    error HenuzYok();
    error TransferOlmadi();

    constructor(IERC20K _token, IAcilisK _kaynak, address _kurucu, uint256 _hemen, uint256 _vadeli) {
        token = _token;
        kaynak = _kaynak;
        kurucu = _kurucu;
        hemen = _hemen;
        vadeli = _vadeli;
    }

    function gecenAy() public view returns (uint256) {
        uint256 a = kaynak.acilisZamani();
        if (a == 0) return 0;
        uint256 m = (block.timestamp - a) / AY;
        return m > AYLAR ? AYLAR : m;
    }

    function serbest() public view returns (uint256) {
        if (kaynak.acilisZamani() == 0) return 0;
        return hemen + (vadeli * gecenAy()) / AYLAR;
    }

    function alinabilir() public view returns (uint256) {
        uint256 s = serbest();
        return s > alinan ? s - alinan : 0;
    }

    /// Anyone may trigger it; it only pays the founder fixed at birth.
    function al() external returns (uint256 m) {
        m = alinabilir();
        if (m == 0) revert HenuzYok();
        alinan += m;
        if (!token.transfer(kurucu, m)) revert TransferOlmadi();
        emit Alindi(m, alinan);
    }
}
