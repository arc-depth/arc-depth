// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {KopruKanit} from "./KopruKanit.sol";

interface IStock {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title StockVault  (deploys on Robinhood Chain)
/// @notice Locks a Stock Token so a wrapped claim can exist on Arc.
///
/// WHY SHARES AND NOT AMOUNTS
///   Robinhood's Stock Token carries a multiplier — the on-chain code says
///   "New multiplier must be greater t…" — which is how a stock split is
///   represented. A split changes every balance, including this vault's. If
///   the vault recorded amounts, a split would silently break the one-to-one
///   relationship with the wrapped supply on Arc, and it would break it in
///   the direction nobody checks until somebody cannot redeem.
///
///   So deposits are recorded as SHARES of the vault's balance, the way a
///   rebasing-token wrapper does it. A split multiplies the balance and every
///   share with it; the ratio each depositor owns does not move. This also
///   means the vault never needs to read the multiplier or know its
///   interface, which is the part most likely to change.
///
/// WHAT THE RELAYER CAN AND CANNOT DO
///   An earlier version of this comment said the relayer "cannot change
///   where the stock goes: the recipient travels with the notice". That was
///   false. The recipient, the size and the burn id were all parameters the
///   relayer filled in, and nothing compared them to anything, so one key
///   could call release(newId, itself, totalShares) and take the lot. The
///   comment was worse than the hole, because it is the sentence an auditor
///   reads instead of the function.
///
///   Now a release needs a notice signed by M of N signers, and the
///   recipient and the share count are inside what they signed. Whoever
///   submits it cannot alter a field without invalidating every signature.
///   Per-transaction and per-window caps bound what even M compromised keys
///   can move, and the bound is on chain rather than in a procedure.
///
///   Still true, and still the honest part: Arc has no general message
///   bridge — LayerZero and CCIP are both absent, verified on chain — so
///   there is no light client to make this trustless. M of N is a smaller
///   trust than one key. It is not no trust.
///
///   What has not changed: a burn id is usable once, every lock and release
///   is an event, and the vault's balance on one chain and the wrapped
///   supply on the other must match and can be compared by anyone.
contract StockVault is KopruKanit {
    IStock public immutable stock;

    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;
    mapping(bytes32 => bool) public usedBurnId;

    event Locked(address indexed from, address indexed arcRecipient, uint256 amount, uint256 shares);
    event Released(bytes32 indexed burnId, address indexed to, uint256 shares, uint256 amount);

    error ZeroAmount();
    error AlreadyUsed();
    error NotEnoughShares();
    error TransferFailed();

    /// @param _imzacilar the signer set; @param _esik how many must sign
    /// @param _kaynakZincir Arc's chain id — the chain burns happen on
    /// @param _islemTavani most shares one release may move
    /// @param _pencere,_pencereTavani and the most inside one window
    constructor(
        IStock _stock,
        address[] memory _imzacilar,
        uint256 _esik,
        uint256 _kaynakZincir,
        uint256 _islemTavani,
        uint256 _pencere,
        uint256 _pencereTavani
    ) KopruKanit(_imzacilar, _esik, _kaynakZincir, _islemTavani, _pencere, _pencereTavani) {
        stock = _stock;
    }

    /// Stock currently held. Moves on its own when the issuer applies a split.
    function balance() public view returns (uint256) {
        return stock.balanceOf(address(this));
    }

    /// Lock stock and ask for the wrapped claim to be minted on Arc to
    /// `arcRecipient`. The relayer watches for this event.
    function lock(uint256 amount, address arcRecipient) external returns (uint256 shares) {
        if (amount == 0) revert ZeroAmount();

        uint256 before = balance();
        if (!stock.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        uint256 received = balance() - before;

        // First deposit sets the share price at 1:1; after that shares are
        // priced against the balance that was already here.
        shares = (totalShares == 0 || before == 0) ? received : (received * totalShares) / before;
        if (shares == 0) revert ZeroAmount();

        totalShares += shares;
        sharesOf[msg.sender] += shares;

        emit Locked(msg.sender, arcRecipient, received, shares);
    }

    /// Release stock against a burn that happened on Arc.
    ///
    /// `burnId` is the id WrappedStock.burn generated and emitted — derived
    /// there from the chain, the contract, the burner, a running count and
    /// the share amount. An earlier version of this comment called it "the
    /// Arc transaction's identifier", which it is not, and a release keyed
    /// on the transaction instead would record a number appearing nowhere
    /// in the burn. The two chains have to be comparable by anyone, and
    /// that only works if both sides name the same id.
    ///
    /// Recording it is what stops the same burn being presented twice — the
    /// single most likely way a bridge of this shape leaks, whether by a
    /// buggy relayer replaying a notice or a dishonest one doing it on
    /// purpose.
    /// Anyone may submit; only the signatures carry authority. Making
    /// submission permissionless is deliberate — a relayer that goes down
    /// should not be able to strand a withdrawal, and it holds no power
    /// worth protecting.
    function release(bytes32 burnId, address to, uint256 shares, bytes[] calldata imzalar)
        external
        returns (uint256 amount)
    {
        if (shares == 0) revert ZeroAmount();
        if (shares > totalShares) revert NotEnoughShares();

        /* Verifies the signatures over exactly (burnId, to, shares), marks
           the id used and charges the caps. Reverts on any of them. */
        _kanitla(burnId, to, shares, imzalar);
        usedBurnId[burnId] = true;

        amount = (balance() * shares) / totalShares;
        totalShares -= shares;

        if (!stock.transfer(to, amount)) revert TransferFailed();
        emit Released(burnId, to, shares, amount);
    }

    /// Stock per share, scaled by 1e18. Anyone comparing the two chains uses
    /// this: wrapped supply on Arc multiplied by this number must equal the
    /// balance held here.
    function sharePrice() external view returns (uint256) {
        if (totalShares == 0) return 1e18;
        return (balance() * 1e18) / totalShares;
    }
}
