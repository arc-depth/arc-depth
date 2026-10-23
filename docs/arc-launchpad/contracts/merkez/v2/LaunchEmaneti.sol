// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// The launch request MerkezKapi takes (contracts/merkez/MerkezKapi.sol, LaunchIstegi),
/// written out so this contract does not compile the gate in.
struct KalemL { uint32 zincir; bytes32 varlik; uint256 dolar; }
struct LaunchIstegiL {
    string ad;
    string sembol;
    KalemL[] sepet;
    uint256[] teklif;
    uint256 vergiPpm;
    uint256 alim;
    bytes32 kurucu;
    uint32 kurucuZincir;
    uint32 kurucuEid;
    uint32[] ikizler;
    bytes ikizSecenek;
    uint256 ikizUcret;
    bytes gonderSecenek;
    address iade;
    string[] tipler;
    uint32[] uzakIkizler;
    uint256 uzakUcret;
}

interface IMerkezKapiL {
    function launch(LaunchIstegiL calldata r) external payable returns (address token);
}

interface IMesajIletici2 {
    function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool);
}

interface ITokenMesajci2 {
    function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken,
        bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) external;
}

interface IERC20L {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

/// @title LaunchEmaneti — a launch paid with dollars burned on Sui or Aptos
///
/// LayerZero does not reach Arc from Sui or Aptos, and the one hop that
/// does (AktarmaLZ on Base) only carries twin transfers to the IkizHub. A
/// founder there pays with Circle's CCTP instead, and the burn carries the
/// launch with it: the founder burns USDC toward Arc with this contract as
/// both the mint recipient and the only caller allowed to receive it, and
/// the burn's hook data is the launch, abi-encoded:
///     abi.encode(LaunchIstegiL r, address iade)
/// Once Circle attests the burn, ANYONE calls `isle(message, attestation)`:
/// this contract receives the dollars through Circle's MessageTransmitterV2
/// (so the message is Circle's, not the caller's) and in the same call runs
/// MerkezKapi.launch with them. What the launch does not use (the LayerZero
/// fee margin, a launch that reverts, a request that does not decode) goes
/// back: to `iade` on Arc, or, if the request cannot be read, burned back to
/// the sender on its own chain. Nothing stays here between calls.
///
/// The burn must name this contract as destination caller: Circle then
/// accepts the message only from here, so the dollars cannot arrive without
/// their launch. No owner, nothing to configure.
contract LaunchEmaneti {
    IMesajIletici2 public immutable iletici;
    ITokenMesajci2 public immutable tokenMesajci;
    IMerkezKapiL public immutable kapi;
    IERC20L public immutable usdc;
    uint32 public immutable buZincir;

    uint256 private constant OLCEK = 1e12;   // Arc's native dollar has 18 decimals, its ERC-20 view 6
    uint32 private constant KESINLIK = 2000;

    event Islendi(uint32 kaynakZincir, bytes32 gonderen, address token, uint256 net, uint256 iade);
    event Iade(uint32 kaynakZincir, bytes32 gonderen, uint256 miktar, uint8 neden);

    error KotuMesaj();
    error Alinamadi();
    error SadeceKendisi();
    error TransferOlmadi();

    bool private _icerde;

    constructor(IMesajIletici2 iletici_, ITokenMesajci2 tm_, IMerkezKapiL kapi_, IERC20L usdc_, uint32 buZincir_) {
        iletici = iletici_;
        tokenMesajci = tm_;
        kapi = kapi_;
        usdc = usdc_;
        buZincir = buZincir_;
    }

    /// MerkezKapi returns the unused LayerZero value here, during `isle`.
    receive() external payable {}

    /// Anyone: receive Circle's attested burn and launch with it.
    function isle(bytes calldata message, bytes calldata attestation) external returns (address token) {
        if (_icerde) revert SadeceKendisi();
        _icerde = true;
        /* CCTP v2 message: header 148 bytes, then the burn body (hook data from body byte 228) */
        if (message.length < 148 + 228) revert KotuMesaj();
        if (bytes32(message[108:140]) != bytes32(uint256(uint160(address(this))))) revert KotuMesaj();
        uint32 kaynak = uint32(bytes4(message[4:8]));
        bytes calldata govde = message[148:];
        if (bytes32(govde[36:68]) != bytes32(uint256(uint160(address(this))))) revert KotuMesaj();
        bytes32 gonderen = bytes32(govde[100:132]);

        uint256 once = usdc.balanceOf(address(this));
        if (!iletici.receiveMessage(message, attestation)) revert Alinamadi();
        uint256 net = usdc.balanceOf(address(this)) - once;

        (bool okundu, bytes memory r) = address(this).call(abi.encodeCall(this.coz, (govde[228:])));
        if (!okundu) {
            /* not a launch this contract can read: the dollars go back to the burner, on its chain */
            _geriYak(kaynak, gonderen, net);
            emit Iade(kaynak, gonderen, net, 1);
            _icerde = false;
            return address(0);
        }
        (LaunchIstegiL memory q, address iade) = abi.decode(r, (LaunchIstegiL, address));
        q.iade = address(this);
        uint256 toplam = q.alim;
        for (uint256 i = 0; i < q.sepet.length; i++) toplam += q.sepet[i].dolar;
        if (toplam <= net) {
            if (!usdc.approve(address(kapi), toplam)) revert TransferOlmadi();
            /* the rest is the LayerZero value: twins and the founder's tokens; what is unused comes back here */
            try kapi.launch{ value: (net - toplam) * OLCEK }(q) returns (address t) { token = t; } catch {}
            if (!usdc.approve(address(kapi), 0)) revert TransferOlmadi();
        }
        uint256 kalan = usdc.balanceOf(address(this)) - once;
        if (kalan > 0 && !usdc.transfer(iade, kalan)) revert TransferOlmadi();
        if (token == address(0)) emit Iade(kaynak, gonderen, kalan, 2);
        emit Islendi(kaynak, gonderen, token, net, kalan);
        _icerde = false;
    }

    /// Only from `isle`: the hook data, decoded (a revert here is caught there).
    function coz(bytes calldata kanca) external view returns (LaunchIstegiL memory q, address iade) {
        if (msg.sender != address(this)) revert SadeceKendisi();
        (q, iade) = abi.decode(kanca, (LaunchIstegiL, address));
        if (iade == address(0)) revert KotuMesaj();
    }

    function _geriYak(uint32 zincir, bytes32 alici, uint256 miktar) internal {
        if (miktar == 0) return;
        if (zincir == buZincir) {
            if (uint256(alici) >> 160 != 0 || !usdc.transfer(address(uint160(uint256(alici))), miktar)) revert TransferOlmadi();
            return;
        }
        if (!usdc.approve(address(tokenMesajci), miktar)) revert TransferOlmadi();
        tokenMesajci.depositForBurn(miktar, zincir, alici, address(usdc), bytes32(0), 0, KESINLIK);
    }
}
