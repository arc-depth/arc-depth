// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LaunchQueue, IERC20Q, ILaunchpadQ} from "../LaunchQueue.sol";

/// A token that counts in six decimals, like the USDC actually deployed on
/// Arc. The existing mock counts in eighteen, which is exactly why the unit
/// bug survived a suite that passed.
contract MockUSDC6 {
    string public name = "Mock USDC";
    string public symbol = "USDC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint256 supply, address to) {
        totalSupply = supply;
        balanceOf[to] = supply;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        balanceOf[f] -= v;
        balanceOf[t] += v;
        return true;
    }
}

/// The same token counting in eighteen decimals, to show the range follows
/// the token rather than having been tuned to one chain. A separate contract
/// because `decimals` is constant and so cannot be overridden.
contract Mock18 {
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint256 supply, address to) { balanceOf[to] = supply; }

    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v; balanceOf[to] += v; return true;
    }
    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v; return true;
    }
    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        balanceOf[f] -= v; balanceOf[t] += v; return true;
    }
}

/// A launchpad that is not this queue, so the queue knows the launchpad is
/// the one charging the fee. The range is what this file measures; the fee
/// has its own section in the suite.
contract SahteLaunchpad {
    function queue() external pure returns (address) { return address(0); }
}

/// @notice Does the deposit range mean dollars on a chain whose USDC does
///         not count in eighteen decimals?
///
/// WHY THIS TEST EXISTS
///   It did not, and the omission cost 300,000,000 ALP. The range was
///   written `100 ether`, Arc's USDC has six decimals, and a hundred
///   dollars became a hundred trillion — a minimum deposit no customer
///   could ever meet. The whole suite passed, because every mock in it
///   counted in eighteen decimals and so agreed with the mistake.
///
///   The same assumption, applied to a Uniswap opening price instead of a
///   limit, put the governance token's liquidity share into a pool quoted
///   at a million and a half dollars per token, where it is now locked
///   beyond anyone's reach.
///
///   So this runs the real contract against a token that counts the way the
///   real one does, and asserts the dollar figures came out as dollars.
contract TestOndalik {
    struct Sonuc {
        uint256 min6;
        uint256 max6;
        uint256 min18;
        uint256 max18;
        bool yuzDolarKabul;   // exactly $100 goes through
        bool azRed;           // one unit under $100 does not
        bool fazlaRed;        // one unit over $1500 does not
        uint256 cekilen;      // what the queue actually pulled
    }

    function _kuyruk(address usdc) internal returns (LaunchQueue q) {
        bytes32[] memory h = new bytes32[](1);
        address[] memory w = new address[](1);
        h[0] = bytes32("NVDA");
        w[0] = address(0xBEEF);
        /* The launchpad is a stand-in: talepEt only asks it who the waived
           queue is, and what is being measured here is the range. */
        q = new LaunchQueue(
            IERC20Q(usdc), ILaunchpadQ(address(new SahteLaunchpad())),
            address(this), address(this), address(0xD1), address(0xD2),
            1800, h, w
        );
    }

    function run() external returns (Sonuc memory s) {
        MockUSDC6 u6 = new MockUSDC6(10_000_000 * 1e6, address(this));
        Mock18 u18 = new Mock18(10_000_000 ether, address(this));

        LaunchQueue q6 = _kuyruk(address(u6));
        LaunchQueue q18 = _kuyruk(address(u18));

        s.min6 = q6.MIN_USDC();
        s.max6 = q6.MAX_USDC();
        s.min18 = q18.MIN_USDC();
        s.max18 = q18.MAX_USDC();

        u6.approve(address(q6), type(uint256).max);

        /* A hundred dollars, written the way a customer's wallet would send
           it on Arc. */
        try q6.talepEt(bytes32("NVDA"), 100 * 1e6, 2500, "Deneme", "DNM", 1) {
            s.yuzDolarKabul = true;
            /* With the launchpad charging, every cent stays here until the
               request is filled or refunded. */
            s.cekilen = u6.balanceOf(address(q6)) + u6.balanceOf(address(0xD1)) + u6.balanceOf(address(0xD2));
        } catch { s.yuzDolarKabul = false; }

        try q6.talepEt(bytes32("NVDA"), 100 * 1e6 - 1, 2500, "Az", "AZ", 1) { s.azRed = false; }
        catch { s.azRed = true; }

        try q6.talepEt(bytes32("NVDA"), 1500 * 1e6 + 1, 2500, "Cok", "COK", 1) { s.fazlaRed = false; }
        catch { s.fazlaRed = true; }
    }
}
