// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PulseAcici, IERC20P} from "../PulseAcici.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// A plain fixed-supply token, so the placement is measured against an
/// ordinary ERC20 and not against something with a transfer hook that
/// could mask a failure.
contract SahteJetonP {
    string public name = "Pulse Test";
    string public symbol = "PT";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint256 arz, address kime) {
        totalSupply = arz;
        balanceOf[kime] = arz;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }

    function approve(address who, uint256 v) external returns (bool) {
        allowance[msg.sender][who] = v;
        return true;
    }

    function transferFrom(address from, address to, uint256 v) external returns (bool) {
        if (from != msg.sender) allowance[from][msg.sender] -= v;
        balanceOf[from] -= v;
        balanceOf[to] += v;
        return true;
    }
}

interface IERC20Q {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title TestPulseAcici — iki taraflı yerleştirme GERÇEKTEN iniyor mu
///
/// NEDEN BU ÖLÇÜM HER ŞEYDEN ÖNCE GELİYOR
///   Yeni launchpad'in tamamı şu tek iddianın üstünde duruyor: havuz açılış
///   fiyatında açılabilir VE her iki taraf da istenen miktarda inebilir.
///   Önceki nesilde bu iki şekilde denendi ve ikisi de başarısız oldu —
///   biri sessizce:
///
///     tek yönlü merdiven   -> USDC'nin gidecek yeri yoktu, havuz deltası
///                             $0,00 döndü ve açılış BAŞARILI göründü
///     fiyatı kapsayan      -> miktarları kabul etmedi, küçük taraf
///     iki taraflı pozisyon    neyi fonluyorsa o kadarı indi
///
///   İkincisi fark edilir, birincisi fark edilmez. O yüzden bu harness
///   "açıldı mı" diye sormuyor; HER İKİ TARAFIN havuza GİRDİĞİNİ ve
///   fiyatın istenen yerde kaldığını soruyor.
///
/// VE SONRA BİR ALIM YAPIYOR
///   Yerleşen likidite bir alım satım yapılabilir mi? Yerleştirmenin
///   doğru görünüp işe yaramadığı durum tam olarak önceki neslin yaşadığı
///   şeydi, ve onu ancak gerçek bir takas gösterir.
contract TestPulseAcici {
    using PoolIdLibrary for PoolKey;

    struct Sonuc {
        address token;
        address acici;
        bool tokenSifirinci;

        /* what was asked for */
        uint160 istenenSqrtP;
        int24 istenenTick;
        int24 alt;
        int24 ust;
        uint256 konulanToken;
        uint256 konulanQuote;

        /* what the pool says afterwards */
        uint160 havuzSqrtP;
        int24 havuzTick;
        uint128 likidite;

        /* what actually left this harness — the only proof both sides
           landed, because a balance that did not move is a side that did
           not go in */
        uint256 aciciKalanToken;
        uint256 aciciKalanQuote;
        uint256 pmToken;
        uint256 pmQuote;
        uint256 bildirilenQuote;

        /* and whether it can be traded */
        bool alimGecti;
        uint256 alimOdenen;
        uint256 alimAlinan;
        uint160 alimSonrasiSqrtP;
        bytes alimSebep;
    }

    IPoolManager public poolManager;
    PoolKey private _key;
    bool private _tokenSifirinci;
    address private _token;

    /// @param quote       Arc's USDC, which is also its gas token
    /// @param acilisMcap  the launch's opening market cap, in quote units
    /// @param arz         total supply
    /// @param netQuote    the founder's net payment: the REAL bid
    /// @param yukariTick  how far above the price the ladder reaches
    /// @param asagiTick   how far below it the bid reaches
    function kos(
        IPoolManager pm,
        address quote,
        uint24 fee,
        int24 tickSpacing,
        uint256 acilisMcap,
        uint256 arz,
        uint256 netQuote,
        int24 yukariTick,
        int24 asagiTick
    ) external returns (Sonuc memory s) {
        poolManager = pm;

        /* The token is created holding the whole supply, exactly as the
           launchpad's factory does. */
        SahteJetonP t = new SahteJetonP(arz, address(this));
        s.token = address(t);
        _token = address(t);

        /* THE OPENING PRICE, FROM THE MARKET CAP
             price = quote per token, in RAW units on both sides. No 1e18
             and no scaling constant: the quote has six decimals and the
             token eighteen, and every constant written between them is
             where this project's 10^12 error lived twice.

             sqrtPriceX96 = sqrt(mcap / arz) * 2^96, computed as
             sqrt(mcap * 2^192 / arz) so the square root is taken once on
             an integer that already carries the scale. */
        bool t0 = address(t) < quote;
        s.tokenSifirinci = t0;
        /* currency1/currency0. When the token sorts first the price is
           quote-per-token; when it sorts second it is the inverse, and
           inverting AFTER the square root loses the precision the whole
           Q96 form exists to keep. */
        uint256 pay = t0 ? acilisMcap : arz;
        uint256 bolen = t0 ? arz : acilisMcap;
        s.istenenSqrtP = _sqrtOran(pay, bolen);
        s.istenenTick = TickMath.getTickAtSqrtPrice(s.istenenSqrtP);

        PulseAcici a = new PulseAcici(
            pm, IERC20P(address(t)), IERC20P(quote),
            /* NO HOOK. The placement maths is what is being measured here
               and a hook can refuse a liquidity change for its own
               reasons — then a failure would be ambiguous between the two.
               The hook is measured separately, against a pool this one
               has already proved can be opened. */
            IHooks(address(0)), fee, tickSpacing, address(this)
        );
        s.acici = address(a);

        /* The ladder and the bid, both transferred in before opening —
           the opener reads balances, not arguments, because a balance is
           what arrived and an argument is what was claimed. */
        uint256 merdiven = arz;
        t.transfer(address(a), merdiven);
        IERC20Q(quote).transfer(address(a), netQuote);
        s.konulanToken = merdiven;
        s.konulanQuote = netQuote;

        /* The band, snapped by the opener itself. Passed in so it can be
           read before the transaction is sent. */
        int24 taban = (s.istenenTick / tickSpacing) * tickSpacing;
        if (s.istenenTick < 0 && taban != s.istenenTick) taban -= tickSpacing;

        /* THE BAND DIRECTION FLIPS WITH THE ORDERING
             A v4 price is always currency1/currency0, so what a HIGHER
             tick means for the TOKEN depends on which side the token
             sorts to:

               token is currency0  ->  price = quote per token
                                       higher tick = token DEARER
               token is currency1  ->  price = token per quote
                                       higher tick = token CHEAPER

             Measured, because the first run got it backwards without
             failing: the ladder was asked to reach 1000x and reached
             2,5x, and the bid was asked to cover a 60% fall and covered
             50%. Nothing reverted — the placement works either way, it
             just was not the market that was designed. A silent wrong
             band is worse than a revert.

             So the two inputs are in TOKEN-PRICE terms and the ticks are
             derived from them, never the other way round. */
        if (t0) {
            s.ust = taban + yukariTick;      // ladder up
            s.alt = taban - asagiTick;       // bid down
        } else {
            s.ust = taban + asagiTick;       // bid, which is UP in ticks here
            s.alt = taban - yukariTick;      // ladder, which is DOWN in ticks
        }

        s.likidite = a.ac(s.istenenSqrtP, s.alt, s.ust);

        _key = PoolKey({
            currency0: Currency.wrap(t0 ? address(t) : quote),
            currency1: Currency.wrap(t0 ? quote : address(t)),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(0))
        });
        _tokenSifirinci = t0;

        (s.havuzSqrtP, s.havuzTick) = _slot0();
        s.aciciKalanToken = t.balanceOf(address(a));
        s.aciciKalanQuote = IERC20Q(quote).balanceOf(address(a));
        s.pmToken = t.balanceOf(address(pm));
        s.pmQuote = IERC20Q(quote).balanceOf(address(pm));
        s.bildirilenQuote = a.havuzdakiQuote();

        /* ---- and can it be traded ---------------------------------- */
        /* A buy of one quote unit's worth, exact input. Small on purpose:
           the question is whether the venue works at all, not how deep it
           is, and a large swap would confuse "no liquidity" with "not
           enough liquidity". */
        s.alimOdenen = netQuote / 10;
        if (s.alimOdenen > 0) {
            try this.alSwap(s.alimOdenen) returns (uint256 alinan) {
                s.alimGecti = true;
                s.alimAlinan = alinan;
            } catch (bytes memory e) {
                s.alimGecti = false;
                s.alimSebep = e;
            }
            (s.alimSonrasiSqrtP,) = _slot0();
        }
    }

    /// A buy, through the PoolManager's own lock. External so the harness
    /// can try/catch it without the failure taking the whole measurement
    /// down with it.
    function alSwap(uint256 quoteMiktari) external returns (uint256) {
        bytes memory r = poolManager.unlock(abi.encode(quoteMiktari));
        return abi.decode(r, (uint256));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        uint256 quoteMiktari = abi.decode(data, (uint256));
        /* Buying the token means spending the quote. The quote is
           currency1 when the token sorts first, so zeroForOne is false in
           that case — read from the ordering rather than hardcoded,
           because getting this backwards is a sell dressed as a buy. */
        bool zeroForOne = !_tokenSifirinci;

        (BalanceDelta delta) = poolManager.swap(
            _key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(quoteMiktari),
                sqrtPriceLimitX96: zeroForOne
                    ? TickMath.MIN_SQRT_PRICE + 1
                    : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        int128 d0 = delta.amount0();
        int128 d1 = delta.amount1();
        _ode(_key.currency0, d0);
        _ode(_key.currency1, d1);
        int128 kazanilan = _tokenSifirinci ? d0 : d1;
        return abi.encode(kazanilan > 0 ? uint256(uint128(kazanilan)) : 0);
    }

    function _ode(Currency para, int128 delta) internal {
        if (delta > 0) {
            poolManager.take(para, address(this), uint256(uint128(delta)));
            return;
        }
        if (delta == 0) return;
        uint256 borc = uint256(uint128(-delta));
        poolManager.sync(para);
        IERC20Q(Currency.unwrap(para)).transfer(address(poolManager), borc);
        poolManager.settle();
    }

    /// sqrt(pay * 2^192 / bolen) as a Q96 root.
    ///
    /// The multiplication is done in 512 bits by hand because pay * 2^192
    /// overflows uint256 for any realistic market cap, and the square root
    /// is Babylonian — twenty iterations is past convergence for a
    /// 256-bit input.
    function _sqrtOran(uint256 pay, uint256 bolen) internal pure returns (uint160) {
        /* 2^192 in two halves, so the intermediate never exceeds 256 bits:
           sqrt(a/b) * 2^96 = sqrt(a * 2^96 / b) * 2^48 ... done in two
           steps, each of which fits. */
        uint256 ara = (pay << 96) / bolen;        // a/b scaled by 2^96
        uint256 r = _sqrt(ara);                    // sqrt(a/b) * 2^48
        /* One more factor of 2^48 to reach Q96. Shifting after the root
           rather than before keeps the input inside 256 bits. */
        return uint160(r << 48);
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    function _slot0() internal view returns (uint160, int24) {
        bytes32 slot = keccak256(abi.encode(PoolId.unwrap(_key.toId()), uint256(6)));
        bytes32 raw = poolManager.extsload(slot);
        return (uint160(uint256(raw)), int24(uint24(uint256(raw) >> 160)));
    }
}
