// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {SwapRouter} from "./SwapRouter.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

interface IERC20R {
    function transfer(address to, uint256 v) external returns (bool);
    function approve(address who, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface IKasa {
    function geriAl(address varlik, uint256 harcama, bytes calldata veri)
        external returns (uint256 yakilan, uint256 odul);
    function bosluk(address varlik, uint256 harcama, uint256 donecek)
        external view returns (uint256);
    function quote() external view returns (address);
    function token() external view returns (address);
    function hak(address varlik) external view returns (uint256);
    function bakiye(address varlik) external view returns (uint256);
}

interface IGeriAlimAlicisiR {
    function geriAlimCagrisi(address varlik, uint256 harcama, bytes calldata veri) external;
}

/// @title GeriAlimRobotu
/// @notice The borrower that makes the vault's buyback happen on a real DEX.
///
/// WHAT WAS MISSING WITHOUT IT
///   `TeminatKasasi.geriAl` lends an asset, calls the borrower back and
///   checks the outcome. That design means the vault knows no DEX — but it
///   also means nothing bought anything until somebody wrote the borrower.
///   Tested only against a mock that hands back tokens at a rate the test
///   picked, a buyback is arithmetic. This routes the borrowed asset through
///   the token's own pool, so the price is the market's.
///
/// THE INVARIANT IS THE TRIGGER
///   There is no sell-pressure detector here, and that is deliberate rather
///   than unfinished. The vault refuses any buyback that does not raise the
///   claim per token, which is true exactly when the market price is BELOW
///   the reserve's claim — which is exactly when the floor needs defending.
///   Above the claim the call reverts on its own. So a price oracle deciding
///   "is now the moment" would be a second, weaker answer to a question the
///   invariant already answers exactly, and it would be a thing to
///   manipulate. The reward — 20% of the captured discount — is what makes
///   somebody call it, and it is zero at the claim, so the incentive
///   vanishes at precisely the point the operation stops being useful.
///
/// TWO HOPS, BECAUSE THE RESERVE IS NOT ONLY DOLLARS
///   A basket can hold any asset, and a buyback may spend one of them. The
///   launch token trades against the quote, not against cirBTC, so spending
///   a non-quote asset needs asset -> quote -> token. `araKey` is that first
///   hop and is skipped when the spent asset already IS the quote.
///
/// IT HOLDS NOTHING AND NOBODY OWNS IT
///   No owner, no pause, no sweep, no stored balance between calls. The
///   reward is forwarded to whoever called in the same transaction. Tokens
///   sent here by mistake are unrecoverable, which is the honest cost of
///   having no privileged function.
contract GeriAlimRobotu is IGeriAlimAlicisiR {
    SwapRouter public immutable router;

    error KasaDegil();
    error TransferOlmadi();
    error AzKazanc(uint256 kazanilan, uint256 istenen);

    event GeriAlimYapildi(
        address indexed cagiran,
        address indexed kasa,
        address indexed varlik,
        uint256 harcama,
        uint256 yakilan,
        uint256 odul
    );

    /// Set for the duration of one call and cleared before it returns.
    /// Not storage that outlives the transaction: a leftover pointer here
    /// would let a later call be driven with a stale route.
    struct Yol {
        address kasa;
        PoolKey tokenKey;       // quote <-> launch token
        PoolKey araKey;         // asset <-> quote; unused when asset == quote
        bool araVar;
        uint256 asgariToken;    // the caller's own slippage bound
    }
    Yol private yol;

    constructor(SwapRouter _router) {
        router = _router;
    }

    /// Borrow `harcama` of `varlik` from `kasa`, buy the launch token with
    /// it on the open market, and leave every token bought in the vault to
    /// be burned.
    ///
    /// `asgariToken` is the caller's floor on what the route must return.
    /// The vault enforces its own invariant regardless, but a caller who
    /// accepted any output would be handing a sandwicher the whole reward.
    function tetikle(
        address kasa,
        address varlik,
        uint256 harcama,
        PoolKey calldata tokenKey,
        PoolKey calldata araKey,
        bool araVar,
        uint256 asgariToken,
        uint256 asgariOdul
    ) external returns (uint256 yakilan, uint256 odul) {
        yol = Yol({
            kasa: kasa,
            tokenKey: tokenKey,
            araKey: araKey,
            araVar: araVar,
            asgariToken: asgariToken
        });

        (yakilan, odul) = IKasa(kasa).geriAl(varlik, harcama, "");

        /* Cleared before anything else can run, so no later call inherits
           this route. */
        delete yol;

        /* The reward arrived here as the borrowed asset. It belongs to
           whoever paid the gas, and it leaves in the same transaction. */
        if (odul > 0) {
            uint256 eldeki = IERC20R(varlik).balanceOf(address(this));
            if (eldeki < asgariOdul) revert AzKazanc(eldeki, asgariOdul);
            if (!IERC20R(varlik).transfer(msg.sender, eldeki)) revert TransferOlmadi();
        } else if (asgariOdul > 0) {
            revert AzKazanc(0, asgariOdul);
        }

        emit GeriAlimYapildi(msg.sender, kasa, varlik, harcama, yakilan, odul);
    }

    /// The loan callback. The borrowed asset is already here; launch tokens
    /// have to be in the vault before this returns.
    function geriAlimCagrisi(address varlik, uint256 harcama, bytes calldata) external override {
        Yol memory y = yol;
        if (msg.sender != y.kasa || y.kasa == address(0)) revert KasaDegil();

        address q = IKasa(y.kasa).quote();
        address tok = IKasa(y.kasa).token();

        uint256 quoteEldeki = harcama;

        /* Hop one, only when the spent asset is not already the quote. */
        if (y.araVar && varlik != q) {
            IERC20R(varlik).approve(address(router), harcama);
            bool sifirBir = Currency.unwrap(y.araKey.currency0) == varlik;
            uint256 once = IERC20R(q).balanceOf(address(this));
            router.swap(y.araKey, sifirBir, harcama, 0);
            quoteEldeki = IERC20R(q).balanceOf(address(this)) - once;
        }

        /* Hop two: quote -> launch token. Direction is read from the key
           rather than assumed: whether the token is currency0 depends on
           address ordering, which is decided at deployment and is not
           something this contract gets to guess. */
        IERC20R(q).approve(address(router), quoteEldeki);
        bool quoteSifirinci = Currency.unwrap(y.tokenKey.currency0) == q;
        uint256 tokenOnce = IERC20R(tok).balanceOf(address(this));
        router.swap(y.tokenKey, quoteSifirinci, quoteEldeki, y.asgariToken);
        uint256 alinan = IERC20R(tok).balanceOf(address(this)) - tokenOnce;

        /* Everything bought goes to the vault. Keeping any of it would be
           keeping tokens the reserve paid for, and the vault would see a
           smaller burn and a smaller claim rise — it would notice, but
           there is no reason to make it check. */
        if (!IERC20R(tok).transfer(y.kasa, alinan)) revert TransferOlmadi();
    }
}
