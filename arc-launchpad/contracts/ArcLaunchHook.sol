// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// What the hook needs from the launchpad: which contracts a pool belongs to.
interface ILaunchRegistry {
    function rewardsOfPool(PoolId) external view returns (address);
    function vaultOfPool(PoolId) external view returns (address);
    function tokenOfPool(PoolId) external view returns (address);
}

interface IVaultCollateral {
    function collateral() external view returns (address);
}

interface IBurnableToken {
    function burn(uint256 amount) external;
}

interface IExtsload {
    function extsload(bytes32 slot) external view returns (bytes32);
}

interface IERC20Move {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address from, address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title ArcLaunchHook
/// @notice The rule book of a collateral-backed launch, written into the pool itself.
///
/// WHY THIS IS A HOOK AND NOT A SEPARATE CONTRACT
///   A v4 pool id is keccak(PoolKey) and the hook address is one of PoolKey's
///   five fields. So the moment a pool is initialised, its hook is fixed for
///   the life of the chain. Putting the lock here means "liquidity cannot be
///   pulled" is not a promise anyone makes — it is part of the pool's identity,
///   and changing it would produce a different pool.
///
///   The alternative, a third-party locker contract, only moves the trust: the
///   buyer still has to believe somebody. Here they can verify instead. The
///   hook's capabilities are declared in the low bits of its own address, so a
///   buyer reads the pool id, recovers the PoolKey (the registry at
///   0x0B3dD19678eba80fFd986B970FE0aeD54E7Ef801 does exactly this), checks the
///   bits, and reads this code. Three steps, all on chain, nobody's word needed.
///
/// WHY EVERY CAPABILITY IS DECLARED UP FRONT
///   Those same address bits mean a hook cannot grow features later. Adding fee
///   collection to a lock-only hook would change its address, which would change
///   the PoolKey, which would be a different pool. So all four jobs are here
///   from the first line: the liquidity lock, the swap fee, the route to the
///   floor, and the permission on who may add liquidity.
///
/// WHAT IT DELIBERATELY DOES NOT DO
///   There is no owner, no pause, no upgrade path and no function that moves
///   pool liquidity anywhere. And there is no function that pays anybody: the
///   fee has one destination, the floor, reached either by burning the launch
///   token or by adding to the vault. We cannot drain a pool and neither can
///   the launch's founder — not because we promise, because the function does
///   not exist.
contract ArcLaunchHook is IHooks {
    using PoolIdLibrary for PoolKey;

    /// Total take on every swap, in hundredths of a basis point (1e6 = 100%).
    /// 5000 = 0.50%.
    uint256 public constant FEE_PPM = 5000;

    /// THE WHOLE FEE GOES TO THE FLOOR AND THERE IS NO SPLIT.
    ///
    /// There used to be three shares here — holders, the outside developer
    /// pool, the protocol — with their own buckets and their own sweep
    /// functions. They are not set to zero; they are gone. A bucket that
    /// exists is a bucket somebody can later be paid from, and the point of
    /// this design is that nobody can be. The fee has one destination and
    /// the contract has no function that sends it anywhere else.
    ///
    /// The protocol therefore earns nothing from trading. That is deliberate:
    /// a protocol paid out of its own pools' swaps has a reason to want churn.
    /// Revenue comes from the launch fee and from subscriptions instead.

    IPoolManager public immutable poolManager;

    /// The only address allowed to add liquidity. Anyone else adding would be
    /// donating: they could never remove it again, because removal reverts for
    /// everyone. Rejecting it is kinder than taking it.
    address public immutable launchpad;

    /* holderRewards, devRewards and protocol used to be immutables here,
       set at construction and read by the three sweeps. With nothing to
       pay there is nobody to pay it to, and leaving the addresses in place
       would advertise a payout route the code no longer has. */

    /// The opening buy tax, in hundredths of a basis point: 99%. It falls
    /// by four every second and is gone after SNIPE_SURESI.
    uint256 public constant SNIPE_PPM = 990000;
    uint64 public constant SNIPE_SURESI = 5;

    /// When each pool's liquidity was first placed, which is the launch
    /// transaction itself. Written in beforeAddLiquidity — the only caller
    /// is the launchpad and it happens once — so the swap path needs no
    /// extra call and a founder has nothing to set.
    mapping(PoolId => uint64) public acilisZamani;

    /// The buy tax at `gecen` seconds after a pool opened, in hundredths
    /// of a basis point. 99% immediately, falling by four each second, and
    /// nothing at all once the window has passed.
    ///
    /// Public and pure so the schedule can be read and checked without a
    /// trade: every test in this project runs inside a single call where
    /// block.timestamp cannot move, which would otherwise leave the decay
    /// permanently untested at every point except zero.
    function snipeOrani(uint256 gecen) public pure returns (uint256) {
        if (gecen >= SNIPE_SURESI) return 0;
        uint256 oran = SNIPE_PPM >> (2 * gecen);
        return oran > FEE_PPM ? oran : 0;
    }

    /// The money side of every pool this hook serves — USDC. Held here so
    /// afterSwap can tell a fee taken in dollars from one taken in the
    /// launch token without asking the launchpad on every single swap.
    address public immutable quote;

    /// Fees waiting to be moved into the floor, per pool, per currency.
    /// One bucket, because there is one destination.
    mapping(PoolId => mapping(Currency => uint256)) public floorAccrued;

    event FeeTaken(PoolId indexed poolId, Currency indexed currency, uint256 amount);
    event Swept(PoolId indexed poolId, Currency indexed currency, address indexed to, uint256 amount);

    error OnlyPoolManager();
    error LiquidityIsLocked();
    error OnlyLaunchpad();
    error NothingAccrued();
    error UnknownPool();
    error WrongCurrency();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        _;
    }

    constructor(
        IPoolManager _poolManager,
        address _launchpad,
        address _quote
    ) {
        poolManager = _poolManager;
        launchpad = _launchpad;
        quote = _quote;
    }

    // ---------------------------------------------------------------- locks

    /// Liquidity may only be added by the launchpad, and may never be removed
    /// by anyone. The launch's LP position is burned at creation, so there is
    /// no owner to remove it even if this did not revert — this is the second
    /// lock, not the only one.
    /// It also starts the pool clock. This runs exactly once per launch,
    /// inside the launch transaction, and only the launchpad can reach it —
    /// so it is the cheapest honest place to record when a pool opened, and
    /// there is nothing here a founder could set to a time of their
    /// choosing.
    function beforeAddLiquidity(address sender, PoolKey calldata key, ModifyLiquidityParams calldata, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != launchpad) revert OnlyLaunchpad();
        PoolId id = key.toId();
        if (acilisZamani[id] == 0) acilisZamani[id] = uint64(block.timestamp);
        return IHooks.beforeAddLiquidity.selector;
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        revert LiquidityIsLocked();
    }

    // ----------------------------------------------------------------- fee

    /// Takes FEE_PPM of the unspecified side of the swap and books it to the
    /// four buckets.
    ///
    /// The fee is charged on the UNSPECIFIED currency — the side the trader did
    /// not pin down — because that is the only side v4 lets a hook adjust
    /// without rewriting the swap the trader asked for. For an exact-INPUT
    /// trade that is the amount coming out: the launch token on a buy, dollars
    /// on a sale. For an exact-OUTPUT trade it is the amount going IN, and the
    /// trader pays the fee on top of it rather than out of what they receive.
    ///
    /// Both are charged, because a fee only one of them pays is a fee anyone
    /// can decline by rephrasing the same trade — and every router already
    /// speaks both. The trader is charged once either way, and never on a
    /// redemption, which does not pass through this pool at all.
    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        // The unspecified side is the one the trader did not fix.
        bool exactInput = params.amountSpecified < 0;
        (Currency feeCurrency, int128 unspecified) = exactInput
            ? (params.zeroForOne ? key.currency1 : key.currency0, params.zeroForOne ? delta.amount1() : delta.amount0())
            : (params.zeroForOne ? key.currency0 : key.currency1, params.zeroForOne ? delta.amount0() : delta.amount1());

        /* EXACT OUTPUT. This used to read `if (unspecified <= 0) return 0`,
           on the reasoning that only an amount LEAVING the pool can carry a
           fee. That reasoning was wrong, and it cost the floor every
           exact-output trade — which is the leg aggregators and cross-chain
           routers use whenever they have to hit a precise target.

           When the trader fixes the OUTPUT, the side they left unspecified
           is the INPUT, and its delta is negative because they are paying
           it. v4 does not care which: Hooks.afterSwap applies the returned
           delta to the unspecified slot and then does
           `swapDelta = swapDelta - hookDelta`, so a positive return makes
           the trader OWE more input just as surely as it makes them RECEIVE
           less output. Charging on the way in is the same fee collected one
           step earlier.

           So the magnitude is what matters and the sign only says which.
           Zero still means there is nothing to charge. */
        if (unspecified == 0) return (IHooks.afterSwap.selector, 0);
        PoolId id = key.toId();
        /* Negated in int256, where an int128 cannot overflow. */
        int256 g = int256(unspecified);
        uint256 out = uint256(g < 0 ? -g : g);

        /* The opening tax, on BUYS.
           
           This used to ask whether the fee currency was the quote asset,
           which answered the right question only for exact-input trades. On
           an exact-OUTPUT buy the fee is charged on the input — which IS the
           quote — so the test said "not a buy" and the surcharge was
           skipped. A sniper willing to phrase their purchase as exact-output
           paid the ordinary fee during the window the surcharge exists for.
           
           Direction is the thing being asked about, so direction is what is
           measured: a buy is a swap whose OUTPUT is the launch token. That
           is true in both modes and cannot be reworded. */
        bool alim = Currency.unwrap(params.zeroForOne ? key.currency1 : key.currency0) != quote;
        uint256 oran = FEE_PPM;
        uint256 ekstra;
        if (alim) {
            uint64 t0 = acilisZamani[id];
            if (t0 != 0) {
                uint256 snipe = snipeOrani(block.timestamp - t0);
                if (snipe > 0) { oran = snipe; ekstra = snipe - FEE_PPM; }
            }
        }

        /* `toplam` is what leaves the pool and what v4 is told about; the
           rest of this function only decides who it is owed to. Reducing
           one without the other would credit a bucket with tokens the hook
           never pulled. */
        uint256 toplam = (out * oran) / 1_000_000;
        if (toplam == 0) return (IHooks.afterSwap.selector, 0);

        /* EVERY FEE, BOTH SIDES, GOES TO THE FLOOR. Nobody is paid.

           This replaces a three-way split — holders, the outside developer
           pool, the protocol — and the split is gone rather than
           zeroed-but-present, because a bucket that exists is a bucket
           somebody can later be paid from.

           WHICH CURRENCY THE FEE ARRIVES IN DOES NOT FOLLOW FROM THE
           DIRECTION OF THE TRADE. It follows from which side the trader
           left unspecified, and that flips with the billing mode:

             exact-input  buy   fee in the LAUNCH TOKEN  (the output)
             exact-input  sell  fee in MONEY             (the output)
             exact-output buy   fee in MONEY             (the input)
             exact-output sell  fee in the LAUNCH TOKEN  (the input)

           This comment used to say "on a buy the fee arrives in the launch
           token", which is true of half the buys. Anything that reads the
           currency off a buy/sell label gets the other half backwards.

           Either currency reaches the floor, by its own route. In the
           launch token: burning it leaves the collateral untouched while
           the supply falls, so collateral per token rises for everyone who
           stayed and nobody has to sell anything for it to happen. In
           money: the vault is denominated in it, so it goes straight into
           backing — unless the collateral is something else, and then
           tabanaDonustur converts it.

           The anti-snipe surcharge is no longer a separate case: it was
           already going here, and now so is the ordinary fee, so there is
           one destination and one line.

           What this costs: the protocol earns nothing from trading. Revenue
           has to come from the launch fee and from subscriptions, which is
           where it belongs — a protocol paid out of its own pools' swaps is
           a protocol with a reason to want churn. */
        floorAccrued[id][feeCurrency] += toplam;

        /* TAKE OR MINT, and the difference is not cosmetic.
       
           take() moves real ERC20 out of the PoolManager's own balance.
           When the fee is charged on the side LEAVING the pool, that
           balance is guaranteed: the pool's reserve of that currency is
           already sitting in the manager, and the fee is a fraction of
           what is leaving it.
       
           On an exact-output swap the fee is charged on the side coming
           IN, and the trader has not paid it yet — v4 settles at the end
           of the unlock, not here. So take() reaches for money that is
           not there yet. It does not revert cleanly either: the mock
           USDC underflowed with Panic(17) inside
           WrappedError(hook, afterSwap) -> ERC20TransferFailed, which is
           a long way from "the fee has not been paid in yet". Measured,
           at every size down to a single token.
       
           On a live chain the manager usually holds plenty of the quote
           from unrelated pools and take() would have worked — by
           spending other pools' reserves for the rest of the
           transaction. Correct under v4's accounting, and still the wrong
           thing to depend on: it makes this fee work or fail according to
           a global balance that has nothing to do with this pool.
       
           mint() has no such dependency. It credits this contract with an
           ERC-6909 claim and moves no tokens, so it cannot fail for want
           of a balance, and the claim is backed the moment the trader
           settles. It is redeemed for real tokens in a later transaction
           by alacagiBozdur, which sweepFloor and tabanaDonustur call
           before they spend anything. */
        if (unspecified > 0) {
            poolManager.take(feeCurrency, address(this), toplam);
        } else {
            poolManager.mint(address(this), feeCurrency.toId(), toplam);
            emit AlacakYazildi(id, feeCurrency, toplam);
        }

        emit FeeTaken(id, feeCurrency, toplam);
        return (IHooks.afterSwap.selector, int128(uint128(toplam)));
    }

    // ------------------------------------------------------------ alacak

    event AlacakYazildi(PoolId indexed poolId, Currency indexed currency, uint256 miktar);
    /// NOT POOL-SCOPED, ON PURPOSE. alacagiBozdur redeems this contract's
    /// WHOLE 6909 balance for a currency, which may have accrued across
    /// several pools, so there is no single poolId this belongs to and
    /// none is emitted. An indexer that attributes it to one pool will be
    /// wrong whenever more than one launch shares a fee currency — which
    /// is every launch quoted in USDC.
    event AlacakBozduruldu(Currency indexed currency, uint256 miktar);

    error NotUnlocking();

    /// Set only for the duration of our own unlock, so unlockCallback
    /// cannot be driven by anybody else's.
    bool private _kilitAcik;

    /// Turns this contract's ERC-6909 claims into real tokens.
    ///
    /// Permissionless and free to skip: it does nothing when there is no
    /// claim, so the sweeps can call it unconditionally without paying for
    /// an unlock they do not need. Anyone may call it directly; the only
    /// thing it can do is move this contract's own fee from one form of
    /// the same asset to another, which is a step the floor needs taken
    /// and nobody can profit from taking.
    function alacagiBozdur(Currency currency) public {
        _alacagiBozdur(currency);
    }

    function _alacagiBozdur(Currency currency) internal {
        uint256 claim = poolManager.balanceOf(address(this), currency.toId());
        if (claim == 0) return;
        _kilitAcik = true;
        poolManager.unlock(abi.encode(currency, claim));
        _kilitAcik = false;
        emit AlacakBozduruldu(currency, claim);
    }

    /// burn credits this contract and take debits it, so the two net to
    /// zero and the unlock closes. By now the trader whose fee this was
    /// has settled, so the manager holds the tokens the claim stands for.
    function unlockCallback(bytes calldata veri) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        if (!_kilitAcik) revert NotUnlocking();
        (Currency currency, uint256 miktar) = abi.decode(veri, (Currency, uint256));
        poolManager.burn(address(this), currency.toId(), miktar);
        poolManager.take(currency, address(this), miktar);
        return "";
    }

    // ---------------------------------------------------------------- sweep

    /// There is ONE sweep and it only ever raises the floor.
    ///
    /// sweepHolder, sweepDev and sweepProtocol used to live here, each
    /// moving its own bucket to an address fixed at construction. All three
    /// are deleted rather than left accruing nothing, because a function
    /// that pays somebody is a function somebody can be paid by — and the
    /// claim this design makes is that nobody can be. Read the contract:
    /// from a swap there is no path to any address except the token's own
    /// supply and its own vault.
    ///
    /// Re-adding the fee as pool liquidity was the original plan and is
    /// worse. Liquidity needs both sides in a ratio, the fee arrives on one
    /// side only, and pairing it would mean swapping half of it back inside
    /// a hook at a price the fee itself just moved. It would also be
    /// tradeable away by the next buyer, while a burn is not.
    ///
    /// Permissionless — it can only
    /// raise what every holder can redeem, so there is nobody to restrict
    /// it to.
    ///
    /// Two currencies, two routes, because the floor is reached differently
    /// by each. The launch token is BURNED: backing stays and supply falls,
    /// so collateral per token rises. Money is TRANSFERRED TO THE VAULT:
    /// supply stays and backing rises. Either way the number a holder can
    /// redeem goes up.
    ///
    /// The money route refuses a currency the vault is not denominated in.
    /// Sending it anyway would park an asset in a contract whose backing()
    /// only counts its own collateral — the fee would leave the hook, never
    /// reach the floor, and be stuck in a vault with no function to move
    /// it. A loud revert is the only safe answer.
    function sweepFloor(PoolKey calldata key, Currency currency) external {
        PoolId id = key.toId();
        uint256 a = floorAccrued[id][currency];
        if (a == 0) revert NothingAccrued();

        /* Part of what is owed may still be a claim rather than a token.
           Redeemed first, or this would burn and transfer a balance that
           is not here — no-op when there is nothing to redeem. */
        _alacagiBozdur(currency);

        address token = ILaunchRegistry(launchpad).tokenOfPool(id);
        if (token == address(0)) revert UnknownPool();

        floorAccrued[id][currency] = 0;

        if (Currency.unwrap(currency) == token) {
            IBurnableToken(token).burn(a);
            emit Swept(id, currency, address(0), a);
        } else {
            address v = ILaunchRegistry(launchpad).vaultOfPool(id);
            if (v == address(0)) revert UnknownPool();
            if (IVaultCollateral(v).collateral() != Currency.unwrap(currency))
                revert WrongCurrency();
            currency.transfer(v, a);
            emit Swept(id, currency, v, a);
        }
    }

    /// Turns the money side of the fee into the vault's own collateral,
    /// paid for by whoever does it.
    ///
    /// WHY THIS EXISTS
    ///   The fee on a sale arrives as the quote asset. It reaches the floor
    ///   by entering the vault, and a vault's backing() counts only its own
    ///   collateral — so for any launch whose collateral is not the quote,
    ///   sweepFloor refuses the money and it sits here forever. Every sale
    ///   would quietly lose its fee. This is the way out, and it is the
    ///   reason collateral no longer has to equal quote.
    ///
    /// WHY NOBODY HAS TO BE PAID TO RUN IT
    ///   An internal swap was the other option, and it has a hole: the
    ///   function would be permissionless, the caller would pay the gas and
    ///   receive nothing, so nobody would ever call it and the fee would
    ///   strand exactly as before. Here the caller delivers collateral and
    ///   takes the money, keeping the difference. They do it for their own
    ///   reasons, which is the only incentive that needs no upkeep.
    ///
    /// WHAT STOPS THEM TAKING IT FOR NOTHING
    ///   The amount they must deliver is computed from the collateral/quote
    ///   pool's own price on this chain, read out of PoolManager storage,
    ///   less TOLERANS. That spread is their fee and it is paid out of the
    ///   swap fee rather than out of the floor's principal.
    ///
    ///   Spot can be pushed within a block. Two things bound what that is
    ///   worth: the sum at stake is the fee from recent trades rather than
    ///   the vault, and the caller still has to hand over real collateral at
    ///   the price they pushed it to. A manipulator profits by TOLERANS on
    ///   that sum, which is why the tolerance is small and not generous.
    ///
    /// The floor cannot fall here under any price. Collateral only enters
    /// the vault and supply does not move, so backing per token rises
    /// whatever the ratio turns out to be — the pricing decides who gets
    /// the spread, never whether holders lose.
    uint256 public constant TOLERANS = 200;   // 2%, in basis points

    error FiyatYok();
    error AzTeminat();

    function tabanaDonustur(PoolKey calldata key, PoolKey calldata teminatKey, uint256 enAzAlacagim)
        external
        returns (uint256 odenenTeminat, uint256 alinanPara)
    {
        PoolId id = key.toId();
        Currency para = Currency.wrap(quote);
        alinanPara = floorAccrued[id][para];
        if (alinanPara == 0) revert NothingAccrued();
        if (alinanPara < enAzAlacagim) revert AzTeminat();
        _alacagiBozdur(para);

        address v = ILaunchRegistry(launchpad).vaultOfPool(id);
        if (v == address(0)) revert UnknownPool();
        address teminat = IVaultCollateral(v).collateral();
        /* Nothing to convert when the vault already holds the quote —
           sweepFloor handles that case directly and more cheaply. */
        if (teminat == quote) revert WrongCurrency();

        /* teminatKey has to be the collateral/quote pool and nothing else,
           or a caller could point this at a pool they control and name
           their own price. Checked by its currencies rather than trusted. */
        address c0 = Currency.unwrap(teminatKey.currency0);
        address c1 = Currency.unwrap(teminatKey.currency1);
        bool teminatSifir = (c0 == teminat && c1 == quote);
        if (!teminatSifir && !(c0 == quote && c1 == teminat)) revert WrongCurrency();

        odenenTeminat = _gerekenTeminat(teminatKey, alinanPara, teminatSifir);
        if (odenenTeminat == 0) revert FiyatYok();

        /* Collateral in first, money out second: a caller who cannot pay
           reverts before anything leaves. */
        floorAccrued[id][para] = 0;
        if (!IERC20Move(teminat).transferFrom(msg.sender, v, odenenTeminat))
            revert TransferFailed();
        para.transfer(msg.sender, alinanPara);

        emit Donusturuldu(id, teminat, odenenTeminat, alinanPara, msg.sender);
    }

    event Donusturuldu(
        PoolId indexed poolId, address indexed teminat,
        uint256 odenenTeminat, uint256 alinanPara, address indexed cagiran
    );
    error TransferFailed();

    /// How much collateral 'paraMiktari' is worth at the pool's own price,
    /// less the tolerance that pays the caller.
    ///
    /// Pools live at slot 6 of PoolManager and slot0 holds sqrtPriceX96 in
    /// its low 160 bits. price = (sqrt/2^96)^2 is currency1 per currency0,
    /// so which way to divide depends on which side the collateral is —
    /// getting that backwards is how a depth figure in this project once
    /// came out inverted, and it is why the direction is passed in rather
    /// than guessed.
    function _gerekenTeminat(PoolKey calldata teminatKey, uint256 paraMiktari, bool teminatSifir)
        internal
        view
        returns (uint256)
    {
        bytes32 slot = keccak256(abi.encode(teminatKey.toId(), uint256(6)));
        bytes32 ham = IExtsload(address(poolManager)).extsload(slot);
        uint256 sqrtP = uint256(uint160(uint256(ham)));
        if (sqrtP == 0) return 0;

        uint256 Q96 = 2 ** 96;
        uint256 gereken;
        if (teminatSifir) {
            /* collateral is currency0: price = quote per collateral, so
               collateral = money * 2^192 / sqrt^2. Split to keep the
               intermediate inside 256 bits. */
            gereken = (((paraMiktari * Q96) / sqrtP) * Q96) / sqrtP;
        } else {
            /* collateral is currency1: collateral = money * sqrt^2 / 2^192 */
            gereken = (((paraMiktari * sqrtP) / Q96) * sqrtP) / Q96;
        }
        return (gereken * (10000 - TOLERANS)) / 10000;
    }

    // ------------------------------------------------- unused hook callbacks

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        return IHooks.beforeInitialize.selector;
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        return IHooks.afterInitialize.selector;
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        return (IHooks.afterAddLiquidity.selector, BalanceDelta.wrap(0));
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        return (IHooks.afterRemoveLiquidity.selector, BalanceDelta.wrap(0));
    }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        pure
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IHooks.beforeDonate.selector;
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IHooks.afterDonate.selector;
    }
}
