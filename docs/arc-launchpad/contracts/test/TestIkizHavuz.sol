// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IkizHavuzFabrika, IkizKilitHook, IEvFiyati } from "../lz/IkizHavuz.sol";
import { PulseAcici } from "../PulseAcici.sol";
import { KopruJeton } from "./SahteLz.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { ModifyLiquidityParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";

interface IERC20T { function approve(address s, uint256 v) external returns (bool); function balanceOf(address) external view returns (uint256); }

contract SahteReferans is IEvFiyati {
    mapping(address => uint160) public s;
    mapping(address => uint64) public z;
    function koy(address t, uint160 s_, uint64 z_) external { s[t] = s_; z[t] = z_; }
    function evFiyati(address t) external view returns (uint160, uint64) { return (s[t], z[t]); }
}

/// Tries to add or remove liquidity on the twin pool as a stranger, through
/// the real PoolManager, so the hook is exercised exactly as v4 calls it.
contract YabanciLp {
    IPoolManager public immutable pm;
    constructor(IPoolManager p) { pm = p; }
    struct V { PoolKey key; int24 alt; int24 ust; int256 delta; }
    function dene(PoolKey calldata key, int24 alt, int24 ust, int256 delta) external returns (bool ok) {
        try pm.unlock(abi.encode(V(key, alt, ust, delta))) { ok = true; } catch { ok = false; }
    }
    function unlockCallback(bytes calldata d) external returns (bytes memory) {
        V memory v = abi.decode(d, (V));
        pm.modifyLiquidity(v.key, ModifyLiquidityParams(v.alt, v.ust, v.delta, bytes32(0)), "");
        return "";
    }
}

/// @title TestIkizHavuz — a twin's pool on Robinhood, against the real PoolManager
contract TestIkizHavuz {
    struct Sonuc {
        bool azTeklifReddedildi; bool uzakFiyatReddedildi; bool bayatReferansReddedildi; bool yanlisHookReddedildi;
        bool acildi; uint160 havuzSqrtP; uint160 beklenenSqrtP;
        uint256 havuzdakiUsdg; uint256 aciciKalanIkiz; uint256 aciciKalanUsdg;
        bool yabanciCekemedi; bool yabanciEkleyemedi; bool ikinciAcilisReddedildi;
    }

    function run(IPoolManager pm, address usdg, IkizKilitHook hook, uint160 refSqrtTokenBasina)
        external returns (Sonuc memory s)
    {
        SahteReferans ref = new SahteReferans{ salt: bytes32(uint256(1)) }();
        IkizHavuzFabrika f = new IkizHavuzFabrika{ salt: bytes32(uint256(2)) }(pm, usdg, ref);
        KopruJeton ikiz = new KopruJeton(1_000_000_000e18, address(this));

        /* A hook whose factory is someone else is refused. */
        try f.hookuBagla(IkizKilitHook(address(ikiz))) { s.yanlisHookReddedildi = false; } catch { s.yanlisHookReddedildi = true; }
        f.hookuBagla(hook);

        IERC20T(usdg).approve(address(f), type(uint256).max);
        ikiz.approve(address(f), type(uint256).max);

        uint160 hedef = address(ikiz) < usdg ? refSqrtTokenBasina : uint160((uint256(1) << 192) / refSqrtTokenBasina);
        int24 t = TickMath.getTickAtSqrtPrice(hedef);
        int24 k = t / 60; if (t < 0 && k * 60 != t) k -= 1;
        int24 alt = (k - 2000) * 60;
        int24 ust = (k + 1 + 2000) * 60;

        /* Stale reference: refused. */
        ref.koy(address(ikiz), refSqrtTokenBasina, uint64(block.timestamp - 2 hours));
        try f.ac(address(ikiz), hedef, alt, ust, 10_000_000e18, 100e6) { s.bayatReferansReddedildi = false; }
        catch { s.bayatReferansReddedildi = true; }
        ref.koy(address(ikiz), refSqrtTokenBasina, uint64(block.timestamp));

        /* Under $50 of bid: refused. */
        try f.ac(address(ikiz), hedef, alt, ust, 10_000_000e18, 10e6) { s.azTeklifReddedildi = false; }
        catch { s.azTeklifReddedildi = true; }

        /* 20% away from the home price: refused. */
        uint160 uzak = uint160((uint256(hedef) * 1_095_445) / 1_000_000);   // sqrt(1.2)
        try f.ac(address(ikiz), uzak, alt, ust, 10_000_000e18, 100e6) { s.uzakFiyatReddedildi = false; }
        catch { s.uzakFiyatReddedildi = true; }

        /* The real open: $100 bid, 10M twin ladder, at the home price. */
        address acici = f.ac(address(ikiz), hedef, alt, ust, 10_000_000e18, 100e6);
        s.acildi = acici != address(0);
        s.beklenenSqrtP = hedef;
        s.havuzSqrtP = PulseAcici(acici).acilisSqrtPriceX96();
        s.havuzdakiUsdg = PulseAcici(acici).havuzdakiQuote();
        s.aciciKalanIkiz = ikiz.balanceOf(acici);
        s.aciciKalanUsdg = IERC20T(usdg).balanceOf(acici);

        PoolKey memory key = PoolKey(
            Currency.wrap(address(ikiz) < usdg ? address(ikiz) : usdg),
            Currency.wrap(address(ikiz) < usdg ? usdg : address(ikiz)),
            0, 60, IHooks(address(hook))
        );
        YabanciLp y = new YabanciLp(pm);
        s.yabanciCekemedi = !y.dene(key, alt, ust, -1);
        s.yabanciEkleyemedi = !y.dene(key, alt, ust, 1e18);

        try f.ac(address(ikiz), hedef, alt, ust, 10_000_000e18, 100e6) { s.ikinciAcilisReddedildi = false; }
        catch { s.ikinciAcilisReddedildi = true; }
    }
}
