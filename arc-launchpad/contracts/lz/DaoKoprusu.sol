// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { OApp, Origin, MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/* The DAO stays on Arc (user decision, 13 Oct 2026). Robinhood has no DAO
 * and no owner of its own: its revenue is moved only by decisions the Arc
 * DAO has voted and run through its timelock, carried over LayerZero.
 *
 *   Arc Governor --(execute)--> DaoElcisi --(LayerZero)--> UzakYurutucu --(call)--> Robinhood fund
 *
 * Nothing new is needed on the Robinhood side to hold the money: the same
 * GelistiriciFonu deployed on Arc is deployed there with USDG as its quote
 * and UzakYurutucu as its allocator. A grant on Robinhood is then exactly
 * a grant on Arc — irrevocable, withdrawn by the developer — except that
 * the vote happened one chain away. */

address constant DEAD = 0x000000000000000000000000000000000000dEaD;

/// @title DaoElcisi — the Arc DAO's voice on Robinhood Chain
/// @notice Only the Governor may send, and the Governor only calls after a
///         vote and its timelock, so every message is a decision that has
///         already been made in public. The payload is a single
///         (target, data) call for the Robinhood executor.
///
/// @dev The Governor's execute() forwards no value, so the LayerZero fee is
///      paid from this contract's own native balance. Anyone may top it up
///      (plain transfer); nobody can take it out. A message the balance
///      cannot pay for reverts the execute, and the proposal stays Ready
///      until it expires — it can be re-run once funded.
contract DaoElcisi is OApp {
    address public immutable dao;
    uint32 public immutable hedefEid;

    event KararGonderildi(address hedef, bytes veri, bytes32 guid, uint256 ucret);
    event SahiplikYakildi();
    error SadeceDao();
    error AlinmazMesaj();
    error GazYetersiz(uint256 gerekli, uint256 mevcut);

    constructor(address lzEndpoint, address kurulumcu, address dao_, uint32 hedefEid_)
        OApp(lzEndpoint, kurulumcu)
        Ownable(kurulumcu)
    {
        dao = dao_;
        hedefEid = hedefEid_;
    }

    receive() external payable {}

    function ucret(address hedef, bytes calldata veri, bytes calldata secenekler)
        external view returns (MessagingFee memory)
    {
        return _quote(hedefEid, abi.encode(hedef, veri), secenekler, false);
    }

    /// Called by the Governor's execute(), after vote and timelock.
    function gonder(address hedef, bytes calldata veri, bytes calldata secenekler) external {
        if (msg.sender != dao) revert SadeceDao();
        bytes memory m = abi.encode(hedef, veri);
        MessagingFee memory f = _quote(hedefEid, m, secenekler, false);
        bytes32 guid = _lzSend(hedefEid, m, secenekler, f, payable(address(this))).guid;
        emit KararGonderildi(hedef, veri, guid, f.nativeFee);
    }

    /// Pay from this contract's balance instead of msg.value.
    function _payNative(uint256 nativeFee) internal view override returns (uint256) {
        if (address(this).balance < nativeFee) revert GazYetersiz(nativeFee, address(this).balance);
        return nativeFee;
    }

    function sahipligiYak() external onlyOwner {
        endpoint.setDelegate(DEAD);
        renounceOwnership();
        emit SahiplikYakildi();
    }

    function _lzReceive(Origin calldata, bytes32, bytes calldata, address, bytes calldata) internal pure override {
        revert AlinmazMesaj();
    }
}

/// @title UzakYurutucu — executes the Arc DAO's decisions on Robinhood
/// @notice Accepts messages only from the DaoElcisi peer and performs the
///         one call each carries. It holds no money of its own and has no
///         function anyone can call directly: it is the allocator of the
///         Robinhood funds, and the only way to act as it is a vote on Arc.
///
///         A call that fails reverts the delivery, so LayerZero keeps the
///         message and it can be retried (e.g. a grant larger than the
///         fund's free balance, retried after more fees arrive). Each
///         message runs at most once: the endpoint's nonce sees to that.
contract UzakYurutucu is OApp {
    event KararYurutuldu(uint64 nonce, address hedef, bytes veri);
    event SahiplikYakildi();
    error CagriBasarisiz(bytes sebep);

    constructor(address lzEndpoint, address kurulumcu)
        OApp(lzEndpoint, kurulumcu)
        Ownable(kurulumcu)
    {}

    function sahipligiYak() external onlyOwner {
        endpoint.setDelegate(DEAD);
        renounceOwnership();
        emit SahiplikYakildi();
    }

    function _lzReceive(Origin calldata o, bytes32, bytes calldata m, address, bytes calldata) internal override {
        (address hedef, bytes memory veri) = abi.decode(m, (address, bytes));
        (bool ok, bytes memory ret) = hedef.call(veri);
        if (!ok) revert CagriBasarisiz(ret);
        emit KararYurutuldu(o.nonce, hedef, veri);
    }
}
