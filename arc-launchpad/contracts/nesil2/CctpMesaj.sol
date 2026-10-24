// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title CctpMesaj — reading a CCTP V2 message the way Circle writes it
///
/// WHY THIS EXISTS
///   The first generation assumed CCTP calls the mint recipient with the
///   hook. It does not. MessageTransmitterV2.receiveMessage calls the
///   message's RECIPIENT — for a burn, the destination TokenMessengerV2 —
///   and TokenMessengerV2 mints to `mintRecipient` and executes nothing.
///   Circle: "CCTP does not implement hook execution in the core protocol."
///   (circlefin/evm-cctp-contracts, src/v2/TokenMessengerV2.sol,
///   _handleReceiveMessage.)
///
///   So a vault that wants its hook run must receive the message itself:
///   be the named destinationCaller, call receiveMessage, and read what it
///   just delivered. This library is the reading part.
///
/// LAYOUT (src/messages/v2/MessageV2.sol, BurnMessageV2.sol)
///   header   version 0 | sourceDomain 4 | destinationDomain 8 | nonce 12
///            | sender 44 | recipient 76 | destinationCaller 108
///            | minFinalityThreshold 140 | finalityThresholdExecuted 144
///            | body 148
///   burn     version 0 | burnToken 4 | mintRecipient 36 | amount 68
///            | messageSender 100 | maxFee 132 | feeExecuted 164
///            | expirationBlock 196 | hookData 228
library CctpMesaj {
    uint256 internal constant GOVDE = 148;
    uint256 internal constant KANCA = 228;

    error KisaMesaj(uint256 uzunluk);

    struct Baslik {
        uint32 kaynakDomain;
        uint32 hedefDomain;
        bytes32 gonderen;
        bytes32 alici;
        bytes32 hedefCagiran;
    }

    struct Yakim {
        bytes32 mintAlici;
        uint256 miktar;
        bytes32 mesajGonderen;
        uint256 ucret;
    }

    function _u32(bytes calldata m, uint256 i) private pure returns (uint32) {
        return uint32(bytes4(m[i:i + 4]));
    }

    function _b32(bytes calldata m, uint256 i) private pure returns (bytes32) {
        return bytes32(m[i:i + 32]);
    }

    function baslik(bytes calldata m) internal pure returns (Baslik memory b) {
        if (m.length < GOVDE) revert KisaMesaj(m.length);
        b.kaynakDomain = _u32(m, 4);
        b.hedefDomain = _u32(m, 8);
        b.gonderen = _b32(m, 44);
        b.alici = _b32(m, 76);
        b.hedefCagiran = _b32(m, 108);
    }

    function govde(bytes calldata m) internal pure returns (bytes calldata) {
        if (m.length < GOVDE) revert KisaMesaj(m.length);
        return m[GOVDE:];
    }

    function yakim(bytes calldata g) internal pure returns (Yakim memory y) {
        if (g.length < KANCA) revert KisaMesaj(g.length);
        y.mintAlici = _b32(g, 36);
        y.miktar = uint256(_b32(g, 68));
        y.mesajGonderen = _b32(g, 100);
        y.ucret = uint256(_b32(g, 164));
    }

    function kanca(bytes calldata g) internal pure returns (bytes calldata) {
        if (g.length < KANCA) revert KisaMesaj(g.length);
        return g[KANCA:];
    }

    function b32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }
}

/// The two calls a vault makes on CCTP V2, signatures from Circle's
/// interfaces (IMessageTransmitterV2, ITokenMessengerV2).
interface IMesajTasiyiciV2 {
    function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool);
    function sendMessage(
        uint32 destinationDomain,
        bytes32 recipient,
        bytes32 destinationCaller,
        uint32 minFinalityThreshold,
        bytes calldata messageBody
    ) external;
    function localDomain() external view returns (uint32);
}

interface ITokenMesajciV2 {
    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external;
}
