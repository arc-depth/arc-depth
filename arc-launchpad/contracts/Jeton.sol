// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title Jeton — a fixed-supply token whose name is given at birth.
///
/// WHY THIS EXISTS SEPARATELY FROM DepthToken
///   DepthToken hard-codes its name and symbol, which was right when there
///   was one token. A launchpad mints a token per customer, and this one
///   is being used for the protocol's own second attempt, so the name has
///   to be an argument. Changing DepthToken instead would have moved it
///   out from under 432 passing checks and under a token already live on
///   chain, for a string.
///
///   Everything else is the same contract, deliberately: the supply is
///   placed at construction and can never be added to, the four shares are
///   passed in so the deployment script is the single place the split is
///   stated, and the constructor refuses any set that does not add up.
///   Tokens left stranded inside a token contract are supply nobody can
///   account for, and this project has already lost 9.37 million that way.
///
/// WHAT NOBODY CAN DO
///   There is no mint, no owner, no pause, no blacklist and no upgrade.
///   The only functions that write are approve, transfer, transferFrom and
///   burn, and burn only ever reduces the caller's own balance.
///
/// STORAGE ORDER
///   totalSupply, balanceOf and allowance keep slots 0, 1 and 2, the same
///   as DepthToken, so a tool that reads one by slot reads the other. The
///   two strings are appended after them for that reason and no other.
contract Jeton {
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
        address piyasa,
        uint256 piyasaPayi,
        address stake,
        uint256 stakePayi,
        address kurucu,
        uint256 kurucuPayi,
        address vesting,
        uint256 vestingPayi
    ) {
        if (bytes(_ad).length == 0 || bytes(_sembol).length == 0) revert BosAd();
        if (piyasa == address(0) || stake == address(0)) revert SifirAdres();
        if (kurucu == address(0) || vesting == address(0)) revert SifirAdres();
        if (piyasaPayi + stakePayi + kurucuPayi + vestingPayi != toplamArz) revert KotuDagitim();
        if (toplamArz == 0 || piyasaPayi == 0 || stakePayi == 0) revert KotuDagitim();

        name = _ad;
        symbol = _sembol;
        totalSupply = toplamArz;
        balanceOf[piyasa] = piyasaPayi;
        balanceOf[stake] = stakePayi;
        balanceOf[kurucu] = kurucuPayi;
        balanceOf[vesting] = vestingPayi;

        emit Transfer(address(0), piyasa, piyasaPayi);
        emit Transfer(address(0), stake, stakePayi);
        emit Transfer(address(0), kurucu, kurucuPayi);
        emit Transfer(address(0), vesting, vestingPayi);
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
