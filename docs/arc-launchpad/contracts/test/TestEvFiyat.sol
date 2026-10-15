// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { HavuzFiyatElcisi, EvFiyatAlici, IPulseLaunchpadE } from "../lz/EvFiyatKoprusu.sol";
import { IkizFabrika, IkizOFTFabrika } from "../lz/IkizFabrika.sol";
import { IkizHavuzFabrika, IEvFiyati } from "../lz/IkizHavuz.sol";
import { KopruJeton, SahteUcNokta } from "./SahteLz.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId, PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";

/// One slot0 price for every pool, served through extsload.
contract FiyatPM {
    uint160 public sqrtP;
    function koy(uint160 s) external { sqrtP = s; }
    function extsload(bytes32) external view returns (bytes32) { return bytes32(uint256(sqrtP)); }
}

/// Answers the three questions the elci asks of the real PulseLaunchpad.
contract SahteLaunchpad is IPulseLaunchpadE {
    using PoolIdLibrary for PoolKey;
    IPoolManager public immutable pm;
    address public immutable quote;
    mapping(PoolId => uint256) public kayit;
    constructor(IPoolManager p, address q) { pm = p; quote = q; }
    function havuzAnahtari(address t) public view returns (PoolKey memory) {
        return PoolKey(Currency.wrap(t < quote ? t : quote), Currency.wrap(t < quote ? quote : t), 0, 60, IHooks(address(0xACC)));
    }
    function kaydet(address t) external { kayit[havuzAnahtari(t).toId()] = 1; }
    function launchIdOfPool(PoolId id) external view returns (uint256) { return kayit[id]; }
    function poolManager() external view returns (IPoolManager) { return pm; }
}

/// @title TestEvFiyat — a launch pool's price, Arc to Robinhood, to the twin
contract TestEvFiyat {
    uint32 constant ARC = 30417;
    uint32 constant RH = 30416;
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    struct Sonuc {
        bool kayitsizReddedildi;
        address ikizHesaplanan; address ikizGercek;
        uint160 alinan; uint160 beklenen; uint64 alinanZaman;
        bool eskiYokSayildi; bool sahteReddedildi;
        uint160 havuzHedefi; uint160 havuzHedefiBeklenen;
    }

    function _b(address a) private pure returns (bytes32) { return bytes32(uint256(uint160(a))); }

    function run(uint160 havuzSqrtP) external returns (Sonuc memory s) {
        SahteUcNokta epArc = new SahteUcNokta(ARC);
        SahteUcNokta epRh = new SahteUcNokta(RH);
        FiyatPM pm = new FiyatPM();
        pm.koy(havuzSqrtP);
        SahteLaunchpad lp = new SahteLaunchpad(IPoolManager(address(pm)), USDC);

        /* One pair of twin factories, as in production where each sits at
           the same address on both chains. */
        IkizOFTFabrika fo = new IkizOFTFabrika(address(epArc));
        IkizFabrika f = new IkizFabrika(address(epArc), fo);

        HavuzFiyatElcisi elci = new HavuzFiyatElcisi(address(epArc), address(this), lp, RH);
        EvFiyatAlici alici = new EvFiyatAlici(address(epRh), address(this), f, ARC);
        elci.setPeer(RH, _b(address(alici)));
        alici.setPeer(ARC, _b(address(elci)));

        KopruJeton token = new KopruJeton(1_000_000_000e18, address(this));

        /* 1) Not a registered launch pool: nothing is sent. */
        try elci.gonder(address(token), "") { s.kayitsizReddedildi = false; } catch { s.kayitsizReddedildi = true; }
        lp.kaydet(address(token));

        /* 2) The price arrives, keyed by the twin's address. */
        elci.gonder(address(token), "");
        epRh.teslim(epArc, epArc.sonIndeks());
        address adapter = f.evdeKur(address(token), ARC, RH);
        s.ikizGercek = fo.karsidaKur(address(token), ARC, adapter, token.name(), token.symbol());
        s.ikizHesaplanan = alici.ikizAdresi(address(token), token.name(), token.symbol());
        (s.alinan, s.alinanZaman) = alici.evFiyati(s.ikizGercek);
        s.beklenen = address(token) < USDC ? havuzSqrtP : uint160((uint256(1) << 192) / havuzSqrtP);

        /* 3) An older message cannot roll it back; a stranger is refused. */
        epRh.sahteTeslim(address(alici), ARC, address(elci),
            abi.encode(address(token), token.name(), token.symbol(), uint160(1), uint64(s.alinanZaman - 1)));
        (uint160 sonra,) = alici.evFiyati(s.ikizGercek);
        s.eskiYokSayildi = sonra == s.alinan;
        try epRh.sahteTeslim(address(alici), ARC, address(0xBAD),
            abi.encode(address(token), token.name(), token.symbol(), uint160(1), uint64(block.timestamp + 1)))
        { s.sahteReddedildi = false; } catch { s.sahteReddedildi = true; }

        /* 4) The twin-pool factory reads it and turns it into ITS pool's order. */
        IkizHavuzFabrika hf = new IkizHavuzFabrika(IPoolManager(address(pm)), USDG, IEvFiyati(address(alici)));
        s.havuzHedefi = hf.hedefSqrtP(s.ikizGercek);
        s.havuzHedefiBeklenen = s.ikizGercek < USDG ? s.alinan : uint160((uint256(1) << 192) / s.alinan);
    }
}
