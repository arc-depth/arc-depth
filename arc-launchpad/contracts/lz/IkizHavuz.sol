// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId, PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { ModifyLiquidityParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { PulseAcici, IERC20P } from "../PulseAcici.sol";

interface IERC20H2 {
    function transferFrom(address f, address t, uint256 v) external returns (bool);
}

/// The home chain's price for a token, as sqrtPriceX96 with the TOKEN as
/// currency0 and its stable quote as currency1, and when it was read there.
/// USDC and USDG both have 6 decimals, so the raw price carries over.
interface IEvFiyati {
    function evFiyati(address ikizToken) external view returns (uint160 sqrtTokenBasina, uint64 zaman);
}

/// @title IkizKilitHook — the twin pool's hook: liquidity in, never out
/// @notice Permissions beforeAddLiquidity + beforeRemoveLiquidity (address
///         low bits 0xA00). Only the pool's own opener may add; any removal
///         with a non-zero delta reverts. Same rule as PulseHook on Arc,
///         without the launch registry: the factory that created this hook
///         registers each pool's opener, once.
contract IkizKilitHook {
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    address public immutable fabrika;
    mapping(PoolId => address) public aciciOf;

    error NotPoolManager();
    error SadeceFabrika();
    error ZatenKayitli();
    error OnlyAcici();
    error LikiditeKilitli();

    constructor(IPoolManager pm, address fabrika_) {
        poolManager = pm;
        fabrika = fabrika_;
    }

    function kaydet(PoolId id, address acici) external {
        if (msg.sender != fabrika) revert SadeceFabrika();
        if (aciciOf[id] != address(0)) revert ZatenKayitli();
        aciciOf[id] = acici;
    }

    function beforeAddLiquidity(address sender, PoolKey calldata key, ModifyLiquidityParams calldata, bytes calldata)
        external view returns (bytes4)
    {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        address a = aciciOf[key.toId()];
        if (a == address(0) || sender != a) revert OnlyAcici();
        return IHooks.beforeAddLiquidity.selector;
    }

    /// A zero delta is how the opener realises accrued fees before re-adding
    /// them (PulseAcici.biriktir), so it is allowed; it cannot withdraw.
    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata p, bytes calldata)
        external view returns (bytes4)
    {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        if (p.liquidityDelta != 0) revert LikiditeKilitli();
        return IHooks.beforeRemoveLiquidity.selector;
    }
}

/// @title IkizHavuzFabrika — opens a twin's pool on the other chain
/// @notice Uses the unchanged PulseAcici, so the pool is opened the same way
///         a launch pool is on Arc: twin tokens as a ladder above the price,
///         real USDG as a bid below it, both locked forever. PulseAcici
///         already refuses a one-sided open.
///
///         Two guards, because a v4 pool key can be initialised exactly once
///         and the opening is therefore permanent:
///           - the price must be within ASAMA_PPM of the home chain's price,
///             so nobody can open the twin's only pool at a price that
///             leaves its liquidity out of range forever;
///           - the bid must be at least ASGARI_TEKLIF, so the pool opens
///             with real money in it — FTHM's own pool showed $7,489 of
///             liquidity on the chart and $4 of real exit.
///
///         Anyone may open, with their own money; it stays in the pool.
contract IkizHavuzFabrika {
    using PoolIdLibrary for PoolKey;

    uint24 public constant POOL_FEE = 0;
    int24 public constant TICK_SPACING = 60;
    uint256 public constant ASGARI_TEKLIF = 50e6;       // $50 of USDG
    uint256 public constant ASAMA_PPM = 50_000;         // 5%
    uint64 public constant AZAMI_YAS = 1 hours;
    uint256 private constant Q192 = 1 << 192;

    IPoolManager public immutable poolManager;
    address public immutable usdg;
    IEvFiyati public immutable referans;
    IkizKilitHook public hook;

    mapping(address => address) public aciciOf;

    event IkizHavuzAcildi(address indexed ikiz, address acici, PoolId havuz, uint160 sqrtP, uint256 ikizMiktar, uint256 usdgMiktar);
    error KotuKurulum();
    error HookZatenVar();
    error ZatenAcik();
    error TeklifAz(uint256 verilen, uint256 asgari);
    error ReferansYok();
    error FiyatUzak(uint256 oranPpm);
    error TransferOlmadi();

    constructor(IPoolManager pm, address usdg_, IEvFiyati referans_) {
        if (address(pm) == address(0) || usdg_ == address(0) || address(referans_) == address(0)) revert KotuKurulum();
        poolManager = pm;
        usdg = usdg_;
        referans = referans_;
    }

    /// One-time: point at the hook. The hook's address must carry the 0xA00
    /// permission bits, so it is deployed separately (salt-mined CREATE2)
    /// with this factory as its `fabrika`; the check below refuses any
    /// other.
    function hookuBagla(IkizKilitHook h) external {
        if (address(hook) != address(0)) revert HookZatenVar();
        if (h.fabrika() != address(this) || address(h.poolManager()) != address(poolManager)) revert KotuKurulum();
        if (uint160(address(h)) & 0x3FFF != 0xA00) revert KotuKurulum();
        hook = h;
    }

    /// The home price, in THIS pool's token order.
    function hedefSqrtP(address ikiz) public view returns (uint160) {
        (uint160 s, uint64 z) = referans.evFiyati(ikiz);
        if (s == 0 || z > block.timestamp || block.timestamp - z > AZAMI_YAS) revert ReferansYok();
        return ikiz < usdg ? s : uint160(Q192 / s);
    }

    function ac(address ikiz, uint160 sqrtP, int24 alt, int24 ust, uint256 ikizMiktar, uint256 usdgMiktar)
        external returns (address acici)
    {
        if (address(hook) == address(0)) revert KotuKurulum();
        if (aciciOf[ikiz] != address(0)) revert ZatenAcik();
        if (usdgMiktar < ASGARI_TEKLIF) revert TeklifAz(usdgMiktar, ASGARI_TEKLIF);

        /* (sqrtP / target)^2 within 1 +- 5%, compared in sqrt space at 1e6:
           sqrt(0.95) = 0.974679, sqrt(1.05) = 1.024695. */
        uint256 oran = (uint256(sqrtP) * 1e6) / hedefSqrtP(ikiz);
        if (oran < 974_679 || oran > 1_024_695) revert FiyatUzak((oran * oran) / 1e6);

        acici = address(new PulseAcici(
            poolManager, IERC20P(ikiz), IERC20P(usdg), IHooks(address(hook)), POOL_FEE, TICK_SPACING, address(this)
        ));
        aciciOf[ikiz] = acici;

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(ikiz < usdg ? ikiz : usdg),
            currency1: Currency.wrap(ikiz < usdg ? usdg : ikiz),
            fee: POOL_FEE, tickSpacing: TICK_SPACING, hooks: IHooks(address(hook))
        });
        hook.kaydet(key.toId(), acici);

        if (!IERC20H2(ikiz).transferFrom(msg.sender, acici, ikizMiktar)) revert TransferOlmadi();
        if (!IERC20H2(usdg).transferFrom(msg.sender, acici, usdgMiktar)) revert TransferOlmadi();
        PulseAcici(acici).ac(sqrtP, alt, ust);

        emit IkizHavuzAcildi(ikiz, acici, key.toId(), sqrtP, ikizMiktar, usdgMiktar);
    }
}
