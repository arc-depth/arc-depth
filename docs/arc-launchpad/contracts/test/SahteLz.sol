// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {
    MessagingParams, MessagingReceipt, MessagingFee, Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

/* Shared by the LayerZero suites: a test FTHM and a queued endpoint. In
 * their own file so that a suite imports these and not another suite. */

/// @notice A plain ERC-20 standing in for FTHM: 18 decimals, approve and
///         transferFrom, nothing else — the same surface the live FTHM
///         exposes to the adapter.
contract KopruJeton {
    string public name = "Fathom (test)";
    string public symbol = "FTHM";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint256 arz, address kime) { totalSupply = arz; balanceOf[kime] = arz; }

    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; return true; }
    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v; balanceOf[to] += v; return true;
    }
    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        allowance[f][msg.sender] -= v; balanceOf[f] -= v; balanceOf[to] += v; return true;
    }
}

/// @notice The smallest LayerZero endpoint the OApp actually talks to:
///         `send` queues the message instead of handing it to DVNs, and
///         `teslim` delivers it the way the real executor would — by calling
///         `lzReceive` from the endpoint address with the sender's origin.
///         Fees are zero; the real endpoint's fee and DVN path is not what
///         this suite measures.
contract SahteUcNokta {
    uint32 public immutable eid;
    mapping(address => address) public delegates;

    struct Bekleyen { uint32 dstEid; bytes32 receiver; address sender; bytes message; uint64 nonce; }
    Bekleyen[] public kuyruk;
    uint64 private sayac;

    constructor(uint32 eid_) { eid = eid_; }

    function setDelegate(address d) external { delegates[msg.sender] = d; }

    function quote(MessagingParams calldata, address) external pure returns (MessagingFee memory f) { return f; }

    function send(MessagingParams calldata p, address) external payable returns (MessagingReceipt memory r) {
        sayac++;
        kuyruk.push(Bekleyen(p.dstEid, p.receiver, msg.sender, p.message, sayac));
        r.guid = keccak256(abi.encode(eid, msg.sender, sayac));
        r.nonce = sayac;
    }

    function sonIndeks() external view returns (uint256) { return kuyruk.length - 1; }

    /// Delivers queued message `i` (sent on `kaynak`) to its receiver here.
    function teslim(SahteUcNokta kaynak, uint256 i) external {
        (, bytes32 receiver, address sender, bytes memory message, uint64 nonce) = kaynak.kuyruk(i);
        Origin memory o = Origin(kaynak.eid(), bytes32(uint256(uint160(sender))), nonce);
        IAlici(address(uint160(uint256(receiver)))).lzReceive(o, bytes32(i), message, address(this), "");
    }

    /* OFT compose: the OFT calls sendCompose on receipt; the real executor
       later calls lzCompose on the target from the endpoint. Same here, by
       hand, with `composeTeslim`. */
    struct Bileske { address from; address to; bytes32 guid; bytes message; }
    Bileske[] public bileskeler;

    function sendCompose(address to, bytes32 guid, uint16, bytes calldata message) external {
        bileskeler.push(Bileske(msg.sender, to, guid, message));
    }

    function bileskeSayisi() external view returns (uint256) { return bileskeler.length; }

    function composeTeslim(uint256 i) external {
        Bileske memory b = bileskeler[i];
        IBilesen(b.to).lzCompose(b.from, b.guid, b.message, address(this), "");
    }

    /// Calls lzCompose claiming the compose came from `sahteFrom`.
    function sahteCompose(address to, address sahteFrom, bytes calldata message) external {
        IBilesen(to).lzCompose(sahteFrom, bytes32(0), message, address(this), "");
    }

    /// Delivers an arbitrary message claiming to come from `sahteGonderen`.
    function sahteTeslim(address alici, uint32 srcEid, address sahteGonderen, bytes calldata message) external {
        Origin memory o = Origin(srcEid, bytes32(uint256(uint160(sahteGonderen))), 99);
        IAlici(alici).lzReceive(o, bytes32(0), message, address(this), "");
    }
}

interface IBilesen {
    function lzCompose(address, bytes32, bytes calldata, address, bytes calldata) external payable;
}

interface IAlici {
    function lzReceive(Origin calldata, bytes32, bytes calldata, address, bytes calldata) external payable;
}

