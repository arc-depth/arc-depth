// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { OApp, Origin, MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId, PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { StateLibrary } from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import { ZincirTablosu } from "./ZincirTablosu.sol";
import { IkizFabrikaAg, IkizOFTFabrikaAg } from "./IkizAg.sol";
import { IEvFiyati } from "./IkizHavuz.sol";

address constant OLU_C = 0x000000000000000000000000000000000000dEaD;
uint256 constant Q192_C = 1 << 192;

interface IAdliC {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

interface ILaunchpadC {
    function havuzAnahtari(address token) external view returns (PoolKey memory);
    function launchIdOfPool(PoolId id) external view returns (uint256);
}

/// @title FiyatAgi — home-chain prices, carried to every other chain
/// @notice ONE address on all nine chains: the constructor takes only the
///         deployer and the twin factory, both identical everywhere, so its
///         peers are itself on every other chain and are set — with the two
///         required DVNs — before the constructor returns. No owner after.
///
///         Sending: give it a token whose home is this chain and a target
///         chain. The price is read from the token's canonical pool only —
///         a launch pool the local launchpad derives and registered, or for
///         FTHM on Arc the FTHM pool named once at setup — never from a pool
///         the caller names. Permissionless; the caller pays LayerZero.
///
///         Receiving: the price is filed under the token's TWIN address on
///         this chain, derived from the home token, its home adapter, name
///         and symbol through the same factory that creates twins — no
///         registry. Prices only move forward in time. Rescaled to this
///         chain's dollar: USDC is 18 decimals on BNB and 6 elsewhere, and a
///         raw price from one would be off by 1e12 on the other.
///
/// @dev `kur` is the one setup call, by the deployer, once: it names the
///      local launchpad, this chain's dollar, and (Arc only) FTHM, its lock
///      adapter and its pool. It moves no money and can never be repeated.
contract FiyatAgi is OApp, IEvFiyati {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    address public immutable kurulumcu;
    IkizFabrikaAg public immutable ikizFabrika;

    bool public kuruldu;
    IPoolManager public havuzYoneticisi;
    ILaunchpadC public launchpad;
    uint8 public dolarOndalik;
    address public fthm;
    address public fthmAdapter;
    PoolKey public fthmAnahtar;

    mapping(address => uint160) public sqrtTokenBasina;
    mapping(address => uint64) public zaman;

    event Kuruldu(address launchpad, uint8 dolarOndalik, address fthm);
    event FiyatGonderildi(address indexed token, uint32 hedef, uint160 sqrtTokenBasina, uint64 zaman);
    event FiyatAlindi(address indexed evToken, address indexed ikiz, uint32 evEid, uint160 sqrtTokenBasina, uint64 zaman);
    error SadeceKurulumcu();
    error ZatenKuruldu();
    error Kaynaksiz();

    constructor(address kurulumcu_, IkizFabrikaAg ikizFabrika_)
        OApp(ZincirTablosu.burasi().endpoint, address(this))
        Ownable(msg.sender)
    {
        kurulumcu = kurulumcu_;
        ikizFabrika = ikizFabrika_;
        uint32 burada = ZincirTablosu.burasi().eid;
        for (uint256 i; i < ZincirTablosu.ADET; i++) {
            uint32 e = ZincirTablosu.sira(i).eid;
            if (e != burada) _setPeer(e, bytes32(uint256(uint160(address(this)))));
        }
        ZincirTablosu.dvnYaz(address(this));
        endpoint.setDelegate(OLU_C);
        _transferOwnership(address(0));
    }

    function kur(IPoolManager pm, ILaunchpadC lp, uint8 dolarOndalik_, address fthm_, address fthmAdapter_, PoolKey calldata fthmAnahtar_)
        external
    {
        if (msg.sender != kurulumcu) revert SadeceKurulumcu();
        if (kuruldu) revert ZatenKuruldu();
        kuruldu = true;
        havuzYoneticisi = pm;
        launchpad = lp;
        dolarOndalik = dolarOndalik_;
        fthm = fthm_;
        fthmAdapter = fthmAdapter_;
        fthmAnahtar = fthmAnahtar_;
        emit Kuruldu(address(lp), dolarOndalik_, fthm_);
    }

    /// The price of `token` (dollars per token, token as currency0, raw
    /// units of this chain's dollar) and its lock adapter here.
    function kaynak(address token) public view returns (uint160 s, address adapter) {
        PoolKey memory key;
        if (token == fthm && fthm != address(0)) {
            key = fthmAnahtar;
            adapter = fthmAdapter;
        } else {
            if (address(launchpad) == address(0)) revert Kaynaksiz();
            key = launchpad.havuzAnahtari(token);
            if (launchpad.launchIdOfPool(key.toId()) == 0) revert Kaynaksiz();
            adapter = ikizFabrika.adapterAdresi(token);
        }
        (uint160 sqrtP,,,) = havuzYoneticisi.getSlot0(key.toId());
        if (sqrtP == 0) revert Kaynaksiz();
        s = Currency.unwrap(key.currency0) == token ? sqrtP : uint160(Q192_C / sqrtP);
    }

    function mesaj(address token) public view returns (bytes memory) {
        (uint160 s, address adapter) = kaynak(token);
        return abi.encode(token, IAdliC(token).name(), IAdliC(token).symbol(), adapter, s, dolarOndalik,
            uint64(block.timestamp), ZincirTablosu.burasi().eid);
    }

    function ucret(address token, uint32 hedef, bytes calldata secenekler) external view returns (MessagingFee memory) {
        return _quote(hedef, mesaj(token), secenekler, false);
    }

    function gonder(address token, uint32 hedef, bytes calldata secenekler) external payable {
        bytes memory m = mesaj(token);
        _lzSend(hedef, m, secenekler, MessagingFee(msg.value, 0), payable(msg.sender));
        (,,,, uint160 s,, uint64 z,) = abi.decode(m, (address, string, string, address, uint160, uint8, uint64, uint32));
        emit FiyatGonderildi(token, hedef, s, z);
    }

    function evFiyati(address ikiz) external view returns (uint160, uint64) {
        return (sqrtTokenBasina[ikiz], zaman[ikiz]);
    }

    function _lzReceive(Origin calldata, bytes32, bytes calldata m, address, bytes calldata) internal override {
        (address evToken, string memory ad, string memory sembol, address adapter, uint160 s, uint8 evOndalik,
            uint64 z, uint32 evEid) = abi.decode(m, (address, string, string, address, uint160, uint8, uint64, uint32));
        address ikiz = ikizFabrika.ikizFabrika().ikizAdresi(evToken, evEid, adapter, ad, sembol);
        if (z <= zaman[ikiz]) return;
        /* dollars per token scales with 10^(dollar decimals); its square
           root with 10^(difference / 2). The chains differ by 0 or 12. */
        uint8 burada = dolarOndalik;
        if (burada > evOndalik) s = uint160(uint256(s) * (10 ** ((burada - evOndalik) / 2)));
        else if (evOndalik > burada) s = uint160(uint256(s) / (10 ** ((evOndalik - burada) / 2)));
        sqrtTokenBasina[ikiz] = s;
        zaman[ikiz] = z;
        emit FiyatAlindi(evToken, ikiz, evEid, s, z);
    }
}

/// @title DaoElcisiAg — the Arc DAO's voice on every other chain
/// @notice Only the Governor may send, and the Governor only calls after a
///         vote and its timelock. Pays LayerZero from its own balance (the
///         Governor forwards no value); anyone may top it up, nobody can
///         take it out. Its peers are UzakYurutucuAg — one address on all
///         eight chains — set once at deployment, then the owner is burned.
contract DaoElcisiAg is OApp {
    address public immutable dao;

    event KararGonderildi(uint32 hedefEid, address hedef, bytes veri, bytes32 guid, uint256 ucret);
    error SadeceDao();
    error AlinmazMesaj();
    error GazYetersiz(uint256 gerekli, uint256 mevcut);

    /// @param yurutucu UzakYurutucuAg's address, the same on every chain.
    /// @param istisnaEid one chain whose executor predates this generation
    ///        (Robinhood: its developer fund's allocator is the first
    ///        UzakYurutucu, deployed 14 Oct 2026); 0 for none.
    /// @param istisnaYurutucu that chain's executor.
    constructor(address dao_, address yurutucu, uint32 istisnaEid, address istisnaYurutucu)
        OApp(ZincirTablosu.burasi().endpoint, address(this))
        Ownable(msg.sender)
    {
        dao = dao_;
        uint32 burada = ZincirTablosu.burasi().eid;
        for (uint256 i; i < ZincirTablosu.ADET; i++) {
            uint32 e = ZincirTablosu.sira(i).eid;
            if (e != burada) _setPeer(e, bytes32(uint256(uint160(e == istisnaEid ? istisnaYurutucu : yurutucu))));
        }
        ZincirTablosu.dvnYaz(address(this));
        endpoint.setDelegate(OLU_C);
        _transferOwnership(address(0));
    }

    receive() external payable {}

    function ucret(uint32 hedefEid, address hedef, bytes calldata veri, bytes calldata secenekler)
        external view returns (MessagingFee memory)
    {
        return _quote(hedefEid, abi.encode(hedef, veri), secenekler, false);
    }

    function gonder(uint32 hedefEid, address hedef, bytes calldata veri, bytes calldata secenekler) external {
        if (msg.sender != dao) revert SadeceDao();
        bytes memory m = abi.encode(hedef, veri);
        MessagingFee memory f = _quote(hedefEid, m, secenekler, false);
        bytes32 guid = _lzSend(hedefEid, m, secenekler, f, payable(address(this))).guid;
        emit KararGonderildi(hedefEid, hedef, veri, guid, f.nativeFee);
    }

    function _payNative(uint256 nativeFee) internal view override returns (uint256) {
        if (address(this).balance < nativeFee) revert GazYetersiz(nativeFee, address(this).balance);
        return nativeFee;
    }

    function _lzReceive(Origin calldata, bytes32, bytes calldata, address, bytes calldata) internal pure override {
        revert AlinmazMesaj();
    }
}

/// @title UzakYurutucuAg — runs the Arc DAO's decisions on this chain
/// @notice Same address on all eight chains: its only constructor argument
///         is the Arc DAO messenger, which is one address. Accepts messages
///         from that messenger on Arc and nothing else; peers and DVNs are
///         fixed at birth and nobody owns it. It holds no money: it is the
///         allocator of this chain's developer fund.
///
///         The messenger's address is computed before either exists: the
///         messenger takes this contract's address as its argument, and
///         this one takes the messenger's — the deploy script breaks the
///         circle by placing the messenger with CREATE at a known nonce.
contract UzakYurutucuAg is OApp {
    uint32 private constant ARC = 30417;

    event KararYurutuldu(uint64 nonce, address hedef, bytes veri);
    error CagriBasarisiz(bytes sebep);

    constructor(address arcElcisi)
        OApp(ZincirTablosu.burasi().endpoint, address(this))
        Ownable(msg.sender)
    {
        _setPeer(ARC, bytes32(uint256(uint160(arcElcisi))));
        ZincirTablosu.dvnYaz(address(this));
        endpoint.setDelegate(OLU_C);
        _transferOwnership(address(0));
    }

    function _lzReceive(Origin calldata o, bytes32, bytes calldata m, address, bytes calldata) internal override {
        (address hedef, bytes memory veri) = abi.decode(m, (address, bytes));
        (bool ok, bytes memory ret) = hedef.call(veri);
        if (!ok) revert CagriBasarisiz(ret);
        emit KararYurutuldu(o.nonce, hedef, veri);
    }
}
