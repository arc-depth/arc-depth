// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title LaunchToken
/// @notice A launch's token. Deliberately the dullest contract in the system.
///
/// WHY IT HAS NO LOGIC IN TRANSFER
///   Every rule this project cares about — the 0.50% fee, the liquidity lock,
///   the split — lives in the pool's hook, not here. That is not a stylistic
///   choice. A token that takes a cut on transfer breaks Uniswap v4: the pool
///   credits what it sent, the recipient receives less, and the accounting
///   drifts apart. Fee-on-transfer tokens are a well-known source of broken
///   pools, and a launchpad that produced them would be shipping a bug in
///   every launch.
///
///   So the token moves exactly the amount it is told to move, and the hook
///   does the rest. One consequence worth stating: anyone can transfer freely,
///   including the founder. The protection is not that selling is blocked —
///   it is that selling cannot take anything away from the other holders,
///   because the liquidity is locked and the collateral is redeemable.
///
/// BURN
///   Burning is how collateral is claimed. The vault burns a holder's tokens
///   and releases their share; supply and collateral fall together, so the
///   floor per token is unchanged for everyone who stayed. There is no mint
///   function at all — supply is fixed at construction and can only ever go
///   down.
contract LaunchToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// When each account's balance last moved, in either direction.
    ///
    /// The holder reward needs to know who has been sitting still, and there
    /// is no way to learn that from the pool: a v4 hook sees the router as
    /// `sender`, not the person behind it, so "who sold" is simply not
    /// available there. It is available here, because every balance change
    /// passes through this contract.
    ///
    /// Both sides are stamped, sender and receiver. Stamping only the seller
    /// would leave an obvious hole — move the tokens to a second wallet, sell
    /// from there, and the first wallet still looks like a patient holder.
    /// Stamping the receiver closes it: freshly arrived tokens start their
    /// own wait, so moving them buys nothing.
    ///
    /// This is a timestamp write, not a transfer tax. The amount that leaves
    /// is exactly the amount that arrives, which is what keeps the token
    /// usable in a Uniswap v4 pool.
    mapping(address => uint64) public lastBalanceChange;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(string memory _name, string memory _symbol, uint256 supply, address to) {
        name = _name;
        symbol = _symbol;
        totalSupply = supply;
        balanceOf[to] = supply;
        emit Transfer(address(0), to, supply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        _spendAllowance(from, value);
        _move(from, to, value);
        return true;
    }

    /// Burn your own tokens. Does not release collateral on its own — the
    /// vault is what pairs a burn with a payout. Burning directly is allowed
    /// but gives nothing back, which is the honest behaviour: this contract
    /// does not know about collateral.
    function burn(uint256 value) external {
        _burn(msg.sender, value);
    }

    /// Burn from an approved account. The vault uses this so a redemption is
    /// one transaction for the holder rather than two.
    function burnFrom(address from, uint256 value) external {
        _spendAllowance(from, value);
        _burn(from, value);
    }

    function _spendAllowance(address from, uint256 value) internal {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < value) revert InsufficientAllowance();
            unchecked { allowance[from][msg.sender] = a - value; }
        }
    }

    function _move(address from, address to, uint256 value) internal {
        uint256 b = balanceOf[from];
        if (b < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = b - value;
            balanceOf[to] += value;
        }
        uint64 t = uint64(block.timestamp);
        lastBalanceChange[from] = t;
        lastBalanceChange[to] = t;
        emit Transfer(from, to, value);
    }

    function _burn(address from, uint256 value) internal {
        uint256 b = balanceOf[from];
        if (b < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = b - value;
            totalSupply -= value;
        }
        lastBalanceChange[from] = uint64(block.timestamp);
        emit Transfer(from, address(0), value);
    }
}
