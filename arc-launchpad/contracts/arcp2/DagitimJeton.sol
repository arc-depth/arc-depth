// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title DagitimJeton — the second ARCP: Jeton with any number of shares.
///
/// WHY NOT Jeton
///   Jeton takes exactly four shares (market, stake, founder, vesting). The
///   second ARCP has six — ladder, stake, founder, presale, marketing and
///   airdrop — and every one of them is a contract, so the split is again
///   stated in a single place and refused unless it adds up to the supply.
///
///   Everything else is Jeton, deliberately: same storage order, same four
///   writing functions, no mint, no owner, no pause, no blacklist, no
///   upgrade. burn only ever reduces the caller's own balance.
contract DagitimJeton {
    uint256 public totalSupply;                                   // slot 0
    mapping(address => uint256) public balanceOf;                 // slot 1
    mapping(address => mapping(address => uint256)) public allowance; // slot 2
    string public name;                                           // slot 3
    string public symbol;                                         // slot 4

    uint8 public constant decimals = 18;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Burned(address indexed from, uint256 value);

    error SifirAdres();
    error Yetersiz();
    error KotuDagitim();
    error BosAd();

    constructor(
        string memory _ad,
        string memory _sembol,
        uint256 toplamArz,
        address[] memory alicilar,
        uint256[] memory paylar
    ) {
        if (bytes(_ad).length == 0 || bytes(_sembol).length == 0) revert BosAd();
        if (toplamArz == 0 || alicilar.length == 0 || alicilar.length != paylar.length) revert KotuDagitim();

        name = _ad;
        symbol = _sembol;
        totalSupply = toplamArz;
        uint256 toplam;
        for (uint256 i; i < alicilar.length; ++i) {
            if (alicilar[i] == address(0)) revert SifirAdres();
            if (paylar[i] == 0 || balanceOf[alicilar[i]] != 0) revert KotuDagitim();
            balanceOf[alicilar[i]] = paylar[i];
            toplam += paylar[i];
            emit Transfer(address(0), alicilar[i], paylar[i]);
        }
        if (toplam != toplamArz) revert KotuDagitim();
    }

    function transfer(address to, uint256 v) external returns (bool) {
        _tasi(msg.sender, to, v);
        return true;
    }

    function approve(address spender, uint256 v) external returns (bool) {
        allowance[msg.sender][spender] = v;
        emit Approval(msg.sender, spender, v);
        return true;
    }

    function transferFrom(address from, address to, uint256 v) external returns (bool) {
        uint256 izin = allowance[from][msg.sender];
        if (izin != type(uint256).max) {
            if (izin < v) revert Yetersiz();
            allowance[from][msg.sender] = izin - v;
        }
        _tasi(from, to, v);
        return true;
    }

    /// Destroy your own tokens. Supply falls and never comes back.
    function burn(uint256 v) external {
        uint256 b = balanceOf[msg.sender];
        if (b < v) revert Yetersiz();
        balanceOf[msg.sender] = b - v;
        totalSupply -= v;
        emit Transfer(msg.sender, address(0), v);
        emit Burned(msg.sender, v);
    }

    function _tasi(address from, address to, uint256 v) internal {
        if (to == address(0)) revert SifirAdres();
        uint256 b = balanceOf[from];
        if (b < v) revert Yetersiz();
        balanceOf[from] = b - v;
        balanceOf[to] += v;
        emit Transfer(from, to, v);
    }
}
