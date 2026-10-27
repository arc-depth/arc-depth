// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IOFT, SendParam, MessagingFee, OFTReceipt } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import { SwapParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";

interface IERC20U {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

interface IKapiAgOku {
    function havuzYoneticisi() external view returns (IPoolManager);
    function oft() external view returns (IOFT);
    function anahtar() external view returns (PoolKey memory);
    function fthm() external view returns (address);
    function para() external view returns (address);
    function fthmSifirinci() external view returns (bool);
}

/// @title KapiUzak — buy FTHM in Arc's pool for a wallet on Solana, Sui or Aptos
/// @notice KapiAg (the FTHM gate on Arc) delivers to a 20-byte EVM address,
///         which a Solana, Sui or Aptos wallet does not have. This gate does
///         the same buy in the same Arc pool and sends the FTHM over the same
///         Arc adapter to a 32-byte recipient on any chain the adapter is
///         wired to. Selling from those chains needs nothing new: their FTHM
///         is sent to KapiAg with the sale in the compose, as from any chain.
///
///         Everything is copied from KapiAg at construction and is immutable:
///         the PoolManager, the adapter, the pool key, FTHM and the dollar.
///         No owner, no setup call, nothing to change later.
contract KapiUzak {
    IPoolManager public immutable havuzYoneticisi;
    IOFT public immutable oft;
    address public immutable fthm;
    address public immutable para;
    bool public immutable fthmSifirinci;
    uint24 private immutable _ucret;
    int24 private immutable _aralik;
    address private immutable _hook;

    event UzagaGonderildi(address indexed gonderen, uint32 hedef, bytes32 alici, uint256 girdi, uint256 miktar);

    error SadeceHavuzYoneticisi();
    error AzCikti(uint256 cikti, uint256 asgari);
    error TransferOlmadi();

    constructor(IKapiAgOku kapi) {
        havuzYoneticisi = kapi.havuzYoneticisi();
        oft = kapi.oft();
        fthm = kapi.fthm();
        para = kapi.para();
        fthmSifirinci = kapi.fthmSifirinci();
        PoolKey memory k = kapi.anahtar();
        _ucret = k.fee;
        _aralik = k.tickSpacing;
        _hook = address(k.hooks);
        IERC20U(fthm).approve(address(oft), type(uint256).max);
    }

    function anahtar() public view returns (PoolKey memory) {
        (address c0, address c1) = fthmSifirinci ? (fthm, para) : (para, fthm);
        return PoolKey(Currency.wrap(c0), Currency.wrap(c1), _ucret, _aralik, IHooks(_hook));
    }

    /// Buy FTHM in Arc's pool with `girdi` USDC and send it to `alici`
    /// (32 bytes: a Solana owner, a Sui or Aptos address) on chain `hedef`.
    /// At least `asgariFthm` must come out of the pool. msg.value pays
    /// LayerZero; unspent dollars and FTHM dust go back to the caller.
    function alVeGonder(uint32 hedef, uint256 girdi, uint256 asgariFthm, bytes32 alici, bytes calldata secenekler)
        external payable returns (uint256 giden)
    {
        if (!IERC20U(para).transferFrom(msg.sender, address(this), girdi)) revert TransferOlmadi();
        uint256 alinan = abi.decode(havuzYoneticisi.unlock(abi.encode(girdi)), (uint256));
        if (alinan < asgariFthm) revert AzCikti(alinan, asgariFthm);
        SendParam memory p = SendParam(hedef, alici, alinan, 0, secenekler, "", "");
        (, OFTReceipt memory r) = oft.send{ value: msg.value }(p, MessagingFee(msg.value, 0), msg.sender);
        giden = r.amountSentLD;
        _iade(fthm);
        _iade(para);
        emit UzagaGonderildi(msg.sender, hedef, alici, girdi, giden);
    }

    function unlockCallback(bytes calldata v) external returns (bytes memory) {
        if (msg.sender != address(havuzYoneticisi)) revert SadeceHavuzYoneticisi();
        uint256 girdi = abi.decode(v, (uint256));
        PoolKey memory k = anahtar();
        /* the dollar goes in */
        bool sifirdanBire = !fthmSifirinci;
        BalanceDelta d = havuzYoneticisi.swap(
            k,
            SwapParams(sifirdanBire, -int256(girdi), sifirdanBire ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1),
            ""
        );
        (int128 giren, int128 cikan) = sifirdanBire ? (d.amount0(), d.amount1()) : (d.amount1(), d.amount0());
        (Currency gc, Currency cc) = sifirdanBire ? (k.currency0, k.currency1) : (k.currency1, k.currency0);
        havuzYoneticisi.sync(gc);
        if (!IERC20U(Currency.unwrap(gc)).transfer(address(havuzYoneticisi), uint256(uint128(-giren)))) revert TransferOlmadi();
        havuzYoneticisi.settle();
        uint256 alinan = uint256(uint128(cikan));
        havuzYoneticisi.take(cc, address(this), alinan);
        return abi.encode(alinan);
    }

    function _iade(address t) private {
        uint256 kalan = IERC20U(t).balanceOf(address(this));
        if (kalan > 0 && !IERC20U(t).transfer(msg.sender, kalan)) revert TransferOlmadi();
    }
}
