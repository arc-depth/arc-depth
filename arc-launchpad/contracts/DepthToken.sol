// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title DepthToken — Arc Depth (DEPTH)
/// @notice One billion, minted once, and never again.
///
/// WHAT IS DELIBERATELY NOT HERE
///   No mint. Not a guarded mint, not an owner-only mint, not a mint behind
///   a vote — the function does not exist, so supply can only ever go down.
///   The token this replaces had no mint either; what killed it was 60% of
///   supply sitting in a contract that paid out on a clock with a
///   three-year half-life — 123,000,000 in the first year against roughly
///   90,000,000 circulating.
///
///   There IS a staking emission here: 400,000,000 placed in the Stake
///   contract at genesis and released over thirty years, halving every ten.
///   The difference is the half-life and the ratio, not the existence of
///   one: about 26,800,000 in the first year against a 383,000,000 float.
///   It is a pool that empties and can never be topped up, because nothing
///   in this system can mint.
///
///   No owner, no pause, no blocklist, no upgrade, no fee on transfer. The
///   last one matters mechanically as well as politically: a token that
///   takes a cut on transfer breaks Uniswap v4, because the pool credits
///   what it sent while the recipient receives less and the accounting
///   drifts. Every rule this project has lives in the curve and the hook,
///   not in here.
///
/// BURN
///   Burning is how the graduation gap gets closed. The curve seeds the
///   permanent pool with only as many tokens as the collected money
///   supports at the curve's closing price, and burns the rest — so the
///   pool opens where the curve finished instead of below it. Those tokens
///   were never sold, so nobody's holdings pay for it, and supply falls for
///   good, which raises the share of everyone who did buy.
///
///   Anyone may burn their own balance. There is no way to burn somebody
///   else's.
///
/// THE NAME
///   The project measures how deep an Arc token's market actually is —
///   that is what arc-depth does, quoting a full round trip through every
///   pool a token has. The previous token died of having none: its entire
///   book was $115 and a $1,000 buyer could not be filled. Naming this
///   after the property is a commitment to a number that can be checked,
///   not a slogan.
contract DepthToken {
    string public constant name = "Arc Depth";
    string public constant symbol = "DEPTH";
    uint8 public constant decimals = 18;

    /// Fixed at construction. Falls only through `burn`.
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Burned(address indexed from, uint256 value);

    error SifirAdres();
    error Yetersiz();
    error KotuDagitim();

    /// Everything is placed at construction and nothing can be added later.
    ///
    /// The shares are passed in rather than hard-coded so the deployment
    /// script is the single place the split is stated, and the constructor
    /// refuses any set that does not add up — a distribution that silently
    /// leaves tokens in this contract would be supply nobody can account
    /// for.
    constructor(
        uint256 toplamArz,
        address egri,
        uint256 egriPayi,
        address stake,
        uint256 stakePayi,
        address kurucu,
        uint256 kurucuPayi,
        address vesting,
        uint256 vestingPayi
    ) {
        if (egri == address(0) || stake == address(0)) revert SifirAdres();
        if (kurucu == address(0) || vesting == address(0)) revert SifirAdres();
        if (egriPayi + stakePayi + kurucuPayi + vestingPayi != toplamArz) revert KotuDagitim();
        if (toplamArz == 0 || egriPayi == 0 || stakePayi == 0) revert KotuDagitim();

        totalSupply = toplamArz;
        balanceOf[egri] = egriPayi;
        balanceOf[stake] = stakePayi;
        balanceOf[kurucu] = kurucuPayi;
        balanceOf[vesting] = vestingPayi;

        emit Transfer(address(0), egri, egriPayi);
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
