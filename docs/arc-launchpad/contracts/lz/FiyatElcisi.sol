// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { OApp, Origin, MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { StateLibrary } from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

/// @title FiyatElcisi — carries the Arc FTHM price to Robinhood Chain
/// @notice The Arc FTHM pool's hook is immutable and has no beforeSwap, so
///         nothing on the Arc side can react to a price gap. It does not
///         need to: every cross-chain arbitrage loop has to trade the
///         Robinhood pool in the direction that captures the gap, and that
///         pool's hook charges it. What the Robinhood hook needs is the Arc
///         price, and this sends it.
///
///         `gonder` is permissionless and the caller pays the LayerZero fee.
///         It reads the Arc pool's slot0 straight from the PoolManager, so a
///         caller cannot choose what price is sent — only when.
///
/// @dev Configured (peer, DVNs) and then frozen with `sahipligiYak`, like
///      the FTHM bridge.
contract FiyatElcisi is OApp {
    using StateLibrary for IPoolManager;

    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IPoolManager public immutable havuzYoneticisi;
    PoolId public immutable havuz;
    bool public immutable fthmToken0;
    uint32 public immutable hedefEid;

    event FiyatGonderildi(uint160 sqrtPriceX96, uint64 zaman, bytes32 guid);
    event SahiplikYakildi();
    error AlinmazMesaj();

    constructor(
        address lzEndpoint,
        address kurulumcu,
        IPoolManager havuzYoneticisi_,
        PoolId havuz_,
        bool fthmToken0_,
        uint32 hedefEid_
    ) OApp(lzEndpoint, kurulumcu) Ownable(kurulumcu) {
        havuzYoneticisi = havuzYoneticisi_;
        havuz = havuz_;
        fthmToken0 = fthmToken0_;
        hedefEid = hedefEid_;
    }

    function mesaj() public view returns (bytes memory) {
        (uint160 sqrtP,,,) = havuzYoneticisi.getSlot0(havuz);
        return abi.encode(sqrtP, uint64(block.timestamp), fthmToken0);
    }

    function ucret(bytes calldata secenekler) external view returns (MessagingFee memory) {
        return _quote(hedefEid, mesaj(), secenekler, false);
    }

    /// @notice Sends the current Arc FTHM price. Anyone may call it.
    function gonder(bytes calldata secenekler) external payable {
        bytes memory m = mesaj();
        (uint160 sqrtP,,) = abi.decode(m, (uint160, uint64, bool));
        bytes32 guid = _lzSend(hedefEid, m, secenekler, MessagingFee(msg.value, 0), payable(msg.sender)).guid;
        emit FiyatGonderildi(sqrtP, uint64(block.timestamp), guid);
    }

    function sahipligiYak() external onlyOwner {
        endpoint.setDelegate(DEAD);
        renounceOwnership();
        emit SahiplikYakildi();
    }

    /// This end only sends.
    function _lzReceive(Origin calldata, bytes32, bytes calldata, address, bytes calldata) internal pure override {
        revert AlinmazMesaj();
    }
}
