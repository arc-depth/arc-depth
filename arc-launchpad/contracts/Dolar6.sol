// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20D6 {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// @title Dolar6 — an 18-decimal dollar, held 1:1, in 6-decimal units
/// @notice Why this exists: USDC on BNB Chain has 18 decimals; on the other
///         eight chains it has 6. The launchpad, its hook and its vaults are
///         written in 6-decimal dollar amounts ($3,500 opening value =
///         3_500e6, $20 minimum collateral = 20e6 …) and are deployed and
///         audited as they are on Arc and Robinhood. Rewriting them for one
///         chain would put a second, unaudited launchpad into production.
///         Wrapping the dollar keeps every one of those contracts unchanged:
///         on BNB the launchpad's quote is this token.
///
///         It is not a new dollar. Every unit is the underlying dollar held
///         here, 10^12 of its wei per unit, and `coz` gives it back at any
///         time to anyone holding units. No owner, no mint without a deposit,
///         no fee, no pause, no upgrade.
///
///         The invariant: underlying.balanceOf(this) >= totalSupply * 1e12.
///         It can only grow (someone sending the underlying directly adds
///         backing nobody can claim) and never shrink below it.
contract Dolar6 {
    IERC20D6 public immutable alttaki;
    uint256 public immutable olcek;

    string public name;
    string public symbol;
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Sarildi(address indexed kim, uint256 alttakiMiktar, uint256 birim);
    event Cozuldu(address indexed kim, uint256 birim, uint256 alttakiMiktar);

    error KotuOndalik();
    error TransferOlmadi();
    error Yetersiz();

    constructor(IERC20D6 alttaki_, string memory ad, string memory sembol) {
        uint8 d = alttaki_.decimals();
        if (d < 6) revert KotuOndalik();
        alttaki = alttaki_;
        olcek = 10 ** (d - 6);
        name = ad;
        symbol = sembol;
    }

    /// Deposit `birim` units' worth of the underlying (birim * olcek wei),
    /// receive `birim` units. Whole units only, so nothing is ever rounded
    /// away from the depositor.
    function sar(uint256 birim) external returns (uint256) {
        if (!alttaki.transferFrom(msg.sender, address(this), birim * olcek)) revert TransferOlmadi();
        totalSupply += birim;
        balanceOf[msg.sender] += birim;
        emit Transfer(address(0), msg.sender, birim);
        emit Sarildi(msg.sender, birim * olcek, birim);
        return birim;
    }

    /// Burn `birim` units, receive `birim * olcek` of the underlying.
    function coz(uint256 birim) external returns (uint256 miktar) {
        if (balanceOf[msg.sender] < birim) revert Yetersiz();
        balanceOf[msg.sender] -= birim;
        totalSupply -= birim;
        miktar = birim * olcek;
        emit Transfer(msg.sender, address(0), birim);
        if (!alttaki.transfer(msg.sender, miktar)) revert TransferOlmadi();
        emit Cozuldu(msg.sender, birim, miktar);
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        emit Approval(msg.sender, s, v);
        return true;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        _tasi(msg.sender, to, v);
        return true;
    }

    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) {
            if (a < v) revert Yetersiz();
            allowance[f][msg.sender] = a - v;
        }
        _tasi(f, to, v);
        return true;
    }

    function _tasi(address f, address to, uint256 v) private {
        if (balanceOf[f] < v) revert Yetersiz();
        balanceOf[f] -= v;
        balanceOf[to] += v;
        emit Transfer(f, to, v);
    }
}
