// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title TweetKayit — where a wallet hands in the link to its ARCP post.
///
/// WHY A CONTRACT
///   The site has no server, and the owner's rule is that nothing about a
///   visitor is kept anywhere. So the submission is a transaction: the
///   wallet that sends it is the signature, the link is the only payload,
///   and both are public by design. The weekly reward round reads these
///   events, opens each post, checks that it carries the sender's own code
///   (sitede: "ARCP-" + the first 8 hex of keccak256(wallet)) and scores it.
///
/// No storage, no owner, no funds. It cannot do anything but log.
contract TweetKayit {
    uint256 public constant EN_UZUN = 200;

    event Bildirildi(address indexed kim, string link);

    error KotuLink();

    function bildir(string calldata link) external {
        uint256 n = bytes(link).length;
        if (n == 0 || n > EN_UZUN) revert KotuLink();
        emit Bildirildi(msg.sender, link);
    }
}
