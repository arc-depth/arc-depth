// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { OApp, Origin, MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId, PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { StateLibrary } from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import { IkizFabrika, IkizOFTFabrika, IAdli } from "./IkizFabrika.sol";
import { IEvFiyati } from "./IkizHavuz.sol";

address constant DEAD_E = 0x000000000000000000000000000000000000dEaD;
uint256 constant Q192_E = 1 << 192;

interface IPulseLaunchpadE {
    function havuzAnahtari(address token) external view returns (PoolKey memory);
    function launchIdOfPool(PoolId id) external view returns (uint256);
    function poolManager() external view returns (IPoolManager);
}

/// @title HavuzFiyatElcisi — sends a launch pool's price to the other chain
/// @notice Generic over launches: give it a token and it reads the price
///         of THAT token's canonical launch pool — the one the launchpad
///         itself derives and registered — never a pool the caller names.
///         Someone opening their own token/USDC pool at a silly price
///         cannot get it sent, because it is not the registered pool.
///
///         Sent: the token, its name and symbol (so the other side can
///         derive the twin's address without a registry), the price as
///         sqrtPriceX96 with the token as currency0, and the time read.
///         Permissionless; the caller pays the LayerZero fee.
///
/// @dev What this does not stop: moving the home pool's price inside the
///      same transaction before sending. That costs the mover the pool fee
///      and the vault tax both ways, and the twin-pool opener still has to
///      bring both sides of the money at that price. Written down, not
///      claimed away.
contract HavuzFiyatElcisi is OApp {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPulseLaunchpadE public immutable launchpad;
    uint32 public immutable hedefEid;

    event FiyatGonderildi(address indexed token, uint160 sqrtTokenBasina, uint64 zaman);
    event SahiplikYakildi();
    error LaunchDegil();
    error AlinmazMesaj();

    constructor(address lzEndpoint, address kurulumcu, IPulseLaunchpadE launchpad_, uint32 hedefEid_)
        OApp(lzEndpoint, kurulumcu)
        Ownable(kurulumcu)
    {
        launchpad = launchpad_;
        hedefEid = hedefEid_;
    }

    function mesaj(address token) public view returns (bytes memory) {
        PoolKey memory key = launchpad.havuzAnahtari(token);
        PoolId id = key.toId();
        if (launchpad.launchIdOfPool(id) == 0) revert LaunchDegil();
        (uint160 sqrtP,,,) = launchpad.poolManager().getSlot0(id);
        uint160 s = Currency.unwrap(key.currency0) == token ? sqrtP : uint160(Q192_E / sqrtP);
        return abi.encode(token, IAdli(token).name(), IAdli(token).symbol(), s, uint64(block.timestamp));
    }

    function ucret(address token, bytes calldata secenekler) external view returns (MessagingFee memory) {
        return _quote(hedefEid, mesaj(token), secenekler, false);
    }

    function gonder(address token, bytes calldata secenekler) external payable {
        bytes memory m = mesaj(token);
        (,,, uint160 s, uint64 z) = abi.decode(m, (address, string, string, uint160, uint64));
        _lzSend(hedefEid, m, secenekler, MessagingFee(msg.value, 0), payable(msg.sender));
        emit FiyatGonderildi(token, s, z);
    }

    function sahipligiYak() external onlyOwner {
        endpoint.setDelegate(DEAD_E);
        renounceOwnership();
        emit SahiplikYakildi();
    }

    function _lzReceive(Origin calldata, bytes32, bytes calldata, address, bytes calldata) internal pure override {
        revert AlinmazMesaj();
    }
}

/// @title EvFiyatAlici — the home-chain prices, on the other chain
/// @notice Implements IEvFiyati for IkizHavuzFabrika. Accepts only the
///         HavuzFiyatElcisi peer, keys each price by the TWIN's address —
///         derived from the home token, its name and symbol through the
///         same two factories that create the twin — and only lets a
///         price move forward in time.
contract EvFiyatAlici is OApp, IEvFiyati {
    IkizFabrika public immutable ikizFabrika;
    uint32 public immutable evEid;

    mapping(address => uint160) public sqrtTokenBasina;
    mapping(address => uint64) public zaman;

    event FiyatAlindi(address indexed evToken, address indexed ikiz, uint160 sqrtTokenBasina, uint64 zaman);
    event SahiplikYakildi();

    constructor(address lzEndpoint, address kurulumcu, IkizFabrika ikizFabrika_, uint32 evEid_)
        OApp(lzEndpoint, kurulumcu)
        Ownable(kurulumcu)
    {
        ikizFabrika = ikizFabrika_;
        evEid = evEid_;
    }

    function ikizAdresi(address evToken, string memory ad, string memory sembol) public view returns (address) {
        IkizOFTFabrika ofab = ikizFabrika.ikizFabrika();
        address adapter = ikizFabrika.adapterAdresi(evToken, evEid);
        bytes32 h = ofab.ikizKodHash(ad, sembol, evEid, adapter);
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(ofab), ofab.tuz(evToken, evEid), h)))));
    }

    function evFiyati(address ikiz) external view returns (uint160, uint64) {
        return (sqrtTokenBasina[ikiz], zaman[ikiz]);
    }

    function sahipligiYak() external onlyOwner {
        endpoint.setDelegate(DEAD_E);
        renounceOwnership();
        emit SahiplikYakildi();
    }

    function _lzReceive(Origin calldata, bytes32, bytes calldata m, address, bytes calldata) internal override {
        (address evToken, string memory ad, string memory sembol, uint160 s, uint64 z) =
            abi.decode(m, (address, string, string, uint160, uint64));
        address ikiz = ikizAdresi(evToken, ad, sembol);
        if (z <= zaman[ikiz]) return;
        sqrtTokenBasina[ikiz] = s;
        zaman[ikiz] = z;
        emit FiyatAlindi(evToken, ikiz, s, z);
    }
}
