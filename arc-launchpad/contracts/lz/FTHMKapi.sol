// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IOFT, SendParam, MessagingFee, OFTReceipt, MessagingReceipt } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { OFTComposeMsgCodec } from "@layerzerolabs/oft-evm/contracts/libs/OFTComposeMsgCodec.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import { SwapParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";

interface IERC20K {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

/// @title FTHMKapi — one FTHM market across Arc and Robinhood Chain
/// @notice One gate per chain, next to that chain's FTHM pool. Between them
///         a holder on either chain can reach either pool:
///
///           satKarsida   send FTHM from here, sell it in the OTHER chain's
///                        pool, receive that chain's dollar (USDC on Arc,
///                        USDG on Robinhood) there
///           alVeGonder   buy FTHM here with this chain's dollar and receive
///                        it on the other chain
///
///         So a seller is never limited to one pool's depth: the other pool
///         is one call away, whichever chain the FTHM sits on. The dollars
///         themselves do not cross — USDG has no route to Arc — so what is
///         unified is the FTHM side, and each pool keeps its own dollar.
///
///         Prices: the Robinhood pool's hook (FTHMFarkHook) charges any trade
///         that captures the gap to the Arc price exactly that gap, so a
///         buyer pays the same effective price on either chain.
///
/// @dev The cross-chain sell rides LayerZero's OFT compose: the FTHM lands
///      in the gate on the far chain and `lzCompose` sells it. Once the
///      message is authentic that call does not revert: if the sale fails or
///      would pay less than the seller's minimum, the FTHM itself goes to the
///      seller on that chain. Nothing is left parked in the gate.
///
///      No owner. `karsiyiBagla` names the gate on the other chain once, by
///      the deployer, and then nobody can change it.
contract FTHMKapi {
    IPoolManager public immutable havuzYoneticisi;
    address public immutable lzUcNokta;
    IOFT public immutable oft;
    address public immutable fthm;
    address public immutable para;
    uint24 public immutable ucret;
    int24 public immutable aralik;
    IHooks public immutable hook;
    bool public immutable fthmSifirinci;
    uint32 public immutable karsiEid;
    address private immutable kurulumcu;

    address public karsiKapi;

    uint8 private constant SAT = 0;
    uint8 private constant AL = 1;

    event KarsidaSatildi(address indexed alici, uint256 fthmGiren, uint256 paraCikan);
    event SatilamadiFthmTeslim(address indexed alici, uint256 fthm);
    event KarsiyaGonderildi(address indexed gonderen, address alici, uint256 miktar, bool satilacak);

    error SadeceKurulumcu();
    error ZatenBagli();
    error Bagsiz();
    error SadeceUcNokta();
    error SadeceOft();
    error SadeceKendisi();
    error SadeceHavuzYoneticisi();
    error AzCikti(uint256 cikti, uint256 asgari);
    error TransferOlmadi();

    constructor(
        IPoolManager havuzYoneticisi_,
        address lzUcNokta_,
        IOFT oft_,
        address para_,
        uint24 ucret_,
        int24 aralik_,
        IHooks hook_,
        uint32 karsiEid_,
        address kurulumcu_
    ) {
        havuzYoneticisi = havuzYoneticisi_;
        lzUcNokta = lzUcNokta_;
        oft = oft_;
        address t = oft_.token();
        fthm = t;
        para = para_;
        ucret = ucret_;
        aralik = aralik_;
        hook = hook_;
        fthmSifirinci = t < para_;
        karsiEid = karsiEid_;
        kurulumcu = kurulumcu_;
        /* The adapter on Arc pulls with transferFrom; the OFT on Robinhood
           burns from the caller and needs no allowance. */
        if (oft_.approvalRequired()) IERC20K(t).approve(address(oft_), type(uint256).max);
    }

    /// Names the gate on the other chain. Once, by the deployer.
    function karsiyiBagla(address k) external {
        if (msg.sender != kurulumcu) revert SadeceKurulumcu();
        if (karsiKapi != address(0)) revert ZatenBagli();
        karsiKapi = k;
    }

    function anahtar() public view returns (PoolKey memory) {
        (address c0, address c1) = fthmSifirinci ? (fthm, para) : (para, fthm);
        return PoolKey(Currency.wrap(c0), Currency.wrap(c1), ucret, aralik, hook);
    }

    /* --------------------------------------------------- outgoing ---- */

    /// Sell `miktar` FTHM held on this chain in the OTHER chain's pool.
    /// `alici` receives the other chain's dollar there, at least `asgari`;
    /// if that cannot be met, `alici` receives the FTHM there instead.
    /// `secenekler` must carry the compose gas (LayerZero type-3 options).
    function satKarsida(uint256 miktar, uint256 asgari, address alici, bytes calldata secenekler)
        external payable returns (uint256 giden)
    {
        if (karsiKapi == address(0)) revert Bagsiz();
        _cek(fthm, miktar);
        giden = _gonder(miktar, karsiKapi, secenekler, abi.encode(alici, asgari));
        _artigiIade(fthm);
        emit KarsiyaGonderildi(msg.sender, alici, giden, true);
    }

    /// Buy FTHM in THIS chain's pool with `girdi` of this chain's dollar and
    /// deliver it to `alici` on the other chain. At least `asgariFthm` must
    /// come out of the pool.
    function alVeGonder(uint256 girdi, uint256 asgariFthm, address alici, bytes calldata secenekler)
        external payable returns (uint256 giden)
    {
        _cek(para, girdi);
        uint256 alinan = abi.decode(havuzYoneticisi.unlock(abi.encode(AL, girdi, address(this))), (uint256));
        if (alinan < asgariFthm) revert AzCikti(alinan, asgariFthm);
        giden = _gonder(alinan, alici, secenekler, "");
        _artigiIade(fthm);
        _artigiIade(para);
        emit KarsiyaGonderildi(msg.sender, alici, giden, false);
    }

    function _gonder(uint256 miktar, address kime, bytes calldata secenekler, bytes memory compose)
        private returns (uint256)
    {
        SendParam memory p = SendParam(karsiEid, _b(kime), miktar, 0, secenekler, compose, "");
        (, OFTReceipt memory r) = oft.send{ value: msg.value }(p, MessagingFee(msg.value, 0), msg.sender);
        return r.amountSentLD;
    }

    /* --------------------------------------------------- incoming ---- */

    /// LayerZero delivers a compose here after the FTHM has been credited
    /// to this gate. Sells it for `alici`, or hands `alici` the FTHM.
    function lzCompose(address from, bytes32, bytes calldata mesaj, address, bytes calldata) external payable {
        if (msg.sender != lzUcNokta) revert SadeceUcNokta();
        if (from != address(oft)) revert SadeceOft();
        uint256 miktar = OFTComposeMsgCodec.amountLD(mesaj);
        bytes memory istek = OFTComposeMsgCodec.composeMsg(mesaj);
        /* Anyone can bridge FTHM to this gate with any payload. A payload
           that is not (alici, asgari) would make every retry revert and
           strand the FTHM here, so it is not decoded: the FTHM goes to
           whoever sent it from the other chain. */
        if (istek.length != 64) {
            address gonderen = OFTComposeMsgCodec.bytes32ToAddress(OFTComposeMsgCodec.composeFrom(mesaj));
            if (!IERC20K(fthm).transfer(gonderen, miktar)) revert TransferOlmadi();
            emit SatilamadiFthmTeslim(gonderen, miktar);
            return;
        }
        (address alici, uint256 asgari) = abi.decode(istek, (address, uint256));
        if (alici == address(0)) alici = OFTComposeMsgCodec.bytes32ToAddress(OFTComposeMsgCodec.composeFrom(mesaj));

        try this.sat(miktar, alici, asgari) returns (uint256 cikan) {
            emit KarsidaSatildi(alici, miktar, cikan);
        } catch {
            if (!IERC20K(fthm).transfer(alici, miktar)) revert TransferOlmadi();
            emit SatilamadiFthmTeslim(alici, miktar);
        }
    }

    /// Only callable by this contract, from `lzCompose`, so that a failed
    /// sale can be caught and turned into a delivery.
    function sat(uint256 miktar, address alici, uint256 asgari) external returns (uint256 cikan) {
        if (msg.sender != address(this)) revert SadeceKendisi();
        cikan = abi.decode(havuzYoneticisi.unlock(abi.encode(SAT, miktar, alici)), (uint256));
        if (cikan < asgari) revert AzCikti(cikan, asgari);
    }

    function unlockCallback(bytes calldata v) external returns (bytes memory) {
        if (msg.sender != address(havuzYoneticisi)) revert SadeceHavuzYoneticisi();
        (uint8 mod, uint256 girdi, address alici) = abi.decode(v, (uint8, uint256, address));
        PoolKey memory k = anahtar();
        /* SAT puts FTHM in, AL puts the dollar in. */
        bool sifirdanBire = (mod == SAT) == fthmSifirinci;
        BalanceDelta d = havuzYoneticisi.swap(
            k,
            SwapParams(sifirdanBire, -int256(girdi),
                sifirdanBire ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1),
            ""
        );
        (int128 giren, int128 cikan) = sifirdanBire ? (d.amount0(), d.amount1()) : (d.amount1(), d.amount0());
        (Currency gc, Currency cc) = sifirdanBire ? (k.currency0, k.currency1) : (k.currency1, k.currency0);

        /* A swap that stops at the price limit takes less than offered; the
           unspent rest stays here and is returned by the caller's path. */
        uint256 odenecek = uint256(uint128(-giren));
        havuzYoneticisi.sync(gc);
        if (!IERC20K(Currency.unwrap(gc)).transfer(address(havuzYoneticisi), odenecek)) revert TransferOlmadi();
        havuzYoneticisi.settle();

        uint256 alinan = uint256(uint128(cikan));
        havuzYoneticisi.take(cc, alici, alinan);
        if (mod == SAT && odenecek < girdi) {
            if (!IERC20K(Currency.unwrap(gc)).transfer(alici, girdi - odenecek)) revert TransferOlmadi();
        }
        return abi.encode(alinan);
    }

    /* ---------------------------------------------------- helpers ---- */

    function _cek(address t, uint256 m) private {
        if (!IERC20K(t).transferFrom(msg.sender, address(this), m)) revert TransferOlmadi();
    }

    /// Dust below the bridge's 6 shared decimals cannot cross, and a buy
    /// stopped at the price limit leaves dollars unspent; both go back to
    /// the caller instead of staying here.
    function _artigiIade(address t) private {
        uint256 kalan = IERC20K(t).balanceOf(address(this));
        if (kalan > 0 && !IERC20K(t).transfer(msg.sender, kalan)) revert TransferOlmadi();
    }

    function _b(address a) private pure returns (bytes32) { return bytes32(uint256(uint160(a))); }
}
