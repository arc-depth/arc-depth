// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ILzUcNokta2, LzParams2, LzOrigin2 } from "../sepet/HaberciLZ.sol";

/// @title AktarmaLZ — the hop between Arc and the Sui / Aptos twin gates
///
/// LayerZero does not connect Arc to Sui or Aptos (Arc's endpoint:
/// isSupportedEid false, measured 18 Oct); Base is connected to all three.
/// This contract, on Base, passes messages along and nothing else:
///   from the Arc twin hub:  abi.encode(uint32 hedefEid, bytes ic) -> `ic` to that chain's gate
///   from a gate:            `ic` -> the Arc hub as abi.encode(uint32 kaynakEid, bytes ic)
/// Both hops are run by LayerZero's executor. The second hop's fee is paid
/// from the native value the first hop delivered with it (set in the
/// sender's options), and from this contract's balance; a hop that cannot
/// be paid stays with the endpoint and anyone may retry it with value.
/// The hub and the gates are set once; no owner after `kilitle`.
contract AktarmaLZ {
    ILzUcNokta2 public immutable ucNokta;
    address public kurucu;
    uint32 public arcEid;
    bytes32 public hub;
    mapping(uint32 => bytes32) public kapi;       // Sui / Aptos eid -> its twin gate
    mapping(uint32 => bytes) public secenek;      // LayerZero options toward each (Arc included)

    event Aktarildi(uint32 kaynakEid, uint32 hedefEid, uint256 ucret);

    error SadeceKurucu();
    error ZatenBagli();
    error SadeceUcNokta();
    error KotuKaynak();
    error KapiYok(uint32 eid);
    error UcretYetersiz(uint256 gerekli, uint256 eldeki);

    constructor(ILzUcNokta2 _uc) {
        ucNokta = _uc;
        kurucu = msg.sender;
        _uc.setDelegate(msg.sender);
    }

    receive() external payable {}

    function hubKur(uint32 _arcEid, bytes32 _hub, bytes calldata s) external {
        if (msg.sender != kurucu || hub != bytes32(0) || _hub == bytes32(0)) revert SadeceKurucu();
        arcEid = _arcEid;
        hub = _hub;
        secenek[_arcEid] = s;
    }

    function kapiEkle(uint32 eid, bytes32 karsi, bytes calldata s) external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        if (kapi[eid] != bytes32(0) || karsi == bytes32(0) || eid == arcEid) revert ZatenBagli();
        kapi[eid] = karsi;
        secenek[eid] = s;
    }

    function kilitle() external {
        if (msg.sender != kurucu) revert SadeceKurucu();
        kurucu = address(0);
        ucNokta.setDelegate(0x000000000000000000000000000000000000dEaD);
    }

    function lzReceive(LzOrigin2 calldata o, bytes32, bytes calldata m, address, bytes calldata) external payable {
        if (msg.sender != address(ucNokta)) revert SadeceUcNokta();
        if (o.srcEid == arcEid && o.sender == hub && hub != bytes32(0)) {
            (uint32 hedef, bytes memory ic) = abi.decode(m, (uint32, bytes));
            bytes32 k = kapi[hedef];
            if (k == bytes32(0)) revert KapiYok(hedef);
            emit Aktarildi(o.srcEid, hedef, _gonder(hedef, k, ic));
        } else if (kapi[o.srcEid] == o.sender && o.sender != bytes32(0)) {
            emit Aktarildi(o.srcEid, arcEid, _gonder(arcEid, hub, abi.encode(o.srcEid, m)));
        } else {
            revert KotuKaynak();
        }
    }

    function _gonder(uint32 eid, bytes32 alici, bytes memory m) internal returns (uint256 u) {
        LzParams2 memory p = LzParams2(eid, alici, m, secenek[eid], false);
        u = ucNokta.quote(p, address(this)).nativeFee;
        if (address(this).balance < u) revert UcretYetersiz(u, address(this).balance);
        ucNokta.send{ value: u }(p, address(this));
    }

    function allowInitializePath(LzOrigin2 calldata o) external view returns (bool) {
        return (o.srcEid == arcEid && o.sender == hub && hub != bytes32(0)) || (kapi[o.srcEid] == o.sender && o.sender != bytes32(0));
    }
    function nextNonce(uint32, bytes32) external pure returns (uint64) { return 0; }
}
