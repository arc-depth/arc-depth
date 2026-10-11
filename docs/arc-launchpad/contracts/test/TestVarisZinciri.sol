// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RemoteVaultFactory} from "../RemoteVaultFactory.sol";
import {RemoteCollateralVault} from "../RemoteCollateralVault.sol";
import {RemoteSwapExecutor, IUzakKasa} from "../RemoteSwapExecutor.sol";
import {HavuzFiyat, IV3Fabrika} from "../HavuzFiyat.sol";

interface IERC20V {
    function transfer(address to, uint256 v) external returns (bool);
    function approve(address who, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// Uniswap's SwapRouter02. Chosen because it is deployed at a known address
/// on every chain this project will reach, with byte-identical code — so
/// one route builder works everywhere and the harness has no per-chain
/// special case. Measured: 24,497 bytes on both Ethereum and Base.
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata p)
        external payable returns (uint256 amountOut);
}

/// A hostile executor: takes the loan, delivers almost nothing, keeps the
/// rest. It needs nothing clever — before the floor existed, a bound of 1
/// was enough.
contract KotuYurutucuV {
    address public kasa;
    address public router;
    address public usdc;
    address public hedef;
    uint24 public kademe;
    uint256 public hakkiylaHarca;

    function soy(
        IUzakKasa k, uint256 miktar, uint256 asgari, uint256 harca,
        address _router, address _usdc, address _hedef, uint24 _kademe
    ) external returns (uint256) {
        kasa = address(k);
        router = _router; usdc = _usdc; hedef = _hedef; kademe = _kademe;
        hakkiylaHarca = harca;
        return k.takasEt(miktar, asgari, address(this), "");
    }

    function takasCagrisi(address verilen, uint256, address alinan, uint256, bytes calldata)
        external
    {
        require(msg.sender == kasa, "kasa degil");
        IERC20V(verilen).approve(router, hakkiylaHarca);
        ISwapRouter02(router).exactInputSingle(ISwapRouter02.ExactInputSingleParams({
            tokenIn: usdc, tokenOut: hedef, fee: kademe, recipient: address(this),
            amountIn: hakkiylaHarca, amountOutMinimum: 0, sqrtPriceLimitX96: 0
        }));
        /* Hand over the pittance and keep every dollar not spent. */
        IERC20V(alinan).transfer(msg.sender, IERC20V(alinan).balanceOf(address(this)));
    }

    /* There is deliberately no balance getter here. The first version had
       one and it reverted: a reverted soy() also undoes the storage write
       that set the token address, so the getter then called balanceOf on
       the zero address and took the whole measurement down with it.

       Reading the attacker through the attacker was the wrong shape
       anyway. The harness measures this contract's balance from outside,
       where nothing the attacker does can shape the answer. */
}

/// @notice STAGES 5-10 — the destination side, on ANY verified chain
///
/// WHY THIS IS ONE HARNESS AND NOT ONE PER CHAIN
///   The first version of this was Ethereum-only, with every address a
///   constant. Extending to a second chain by copying it would have
///   created two files testing the same contract paths — and a copied test
///   nobody compares is how a fee table agreed with itself for weeks while
///   the arithmetic underflowed.
///
///   So the chain is a parameter. The same suite runs against Ethereum and
///   Base, and what it proves is stronger than before: not "the design
///   works on Ethereum" but "the design does not know which chain it is
///   on". If a third chain needs a line of code here, that is a finding.
///
/// WHAT IS REAL AND WHAT CANNOT BE
///   Real: the chain, its USDC, its WETH, its Uniswap pool, its Chainlink
///   feed, and its own CCTP TokenMessengerV2 — which the return leg calls
///   for real, aimed at Arc's domain 26.
///
///   Not real, and not producible anywhere: the INBOUND delivery. CCTP's
///   MessageTransmitter accepts only a message carrying Circle's off-chain
///   attestation, and no attestation exists for a burn that happened in a
///   simulation. The factory is therefore deployed with this harness as the
///   transmitter, and the harness calls the vault's handler exactly as CCTP
///   would. Each end is measured against the real contract that performs
///   it; the hand-off between them belongs to Circle and is measured on
///   neither. Calling that an end-to-end cross-chain test would be
///   claiming something no test environment can produce.
contract TestVarisZinciri {
    uint32 constant ARC_DOMAIN = 26;
    uint256 constant TOKEN_ID = 7;
    /* Stands for the Arc-side bridge vault. Fixed, because every remote
       vault inherits it and nothing can change it. */
    address constant ARC_KASA = address(uint160(0xA2C0A55E7));

    struct Zincir {
        address usdc;
        address hedefVarlik;        // the reserve asset: WETH on both chains
        address besleyici;          // Chainlink PROXY, never an aggregator
        uint8 varlikOndalik;
        uint8 besleyiciOndalik;
        uint32 azamiYas;            // this feed's heartbeat plus margin
        address router;             // SwapRouter02
        uint24 kademe;              // the pool's fee tier
        address tokenMessenger;
        address v3Fabrika;          // the chain's Uniswap v3 factory
        /* An asset with NO Chainlink feed but a real pool. Before the
           permit list came out this proved refusal; now it proves the
           opposite half — that such an asset WORKS, and that the floor
           protecting it comes from the pool. */
        address besleyicisizVarlik;
        /* That asset's DEEPEST USDC tier, which is not the reserve
           asset's. Measured: PEPE/USDC on Ethereum is deepest at 10000
           (tier 3000 holds 57.7M against 173.5 quadrillion), DEGEN/USDC
           on Base at 3000. Routing the honest trade through the reserve
           asset's 500 tier would hit a pool that does not exist and the
           test would fail for a reason that is not the thing being
           measured. */
        uint24 besleyicisizKademe;
    }

    function _tablo(Zincir memory z)
        private
        pure
        returns (RemoteVaultFactory.Besleyici[] memory t)
    {
        t = new RemoteVaultFactory.Besleyici[](1);
        t[0] = RemoteVaultFactory.Besleyici({
            varlik: z.hedefVarlik,
            besleyici: z.besleyici,
            varlikOndalik: z.varlikOndalik,
            besleyiciOndalik: z.besleyiciOndalik,
            azamiYas: z.azamiYas
        });
    }

    function _kur(Zincir memory z, address hedefVarlik, uint256 fon)
        private
        returns (RemoteVaultFactory f, RemoteCollateralVault k)
    {
        f = new RemoteVaultFactory(
            ARC_DOMAIN, bytes32(uint256(uint160(ARC_KASA))),
            z.tokenMessenger, address(this), z.usdc,
            /* The chain's REAL pool source: a HavuzFiyat pointing at that
               chain's own Uniswap v3 factory. The target asset here is a
               real asset with a real pool, so the pool half of the floor
               is derived from live liquidity rather than a stub — which is
               the only place that can happen. */
            address(new HavuzFiyat(IV3Fabrika(z.v3Fabrika), z.usdc)),
            _tablo(z)
        );
        k = RemoteCollateralVault(f.kasaKur(TOKEN_ID));
        IERC20V(z.usdc).transfer(address(k), fon);
        k.handleReceiveFinalizedMessage(
            ARC_DOMAIN, bytes32(uint256(uint160(ARC_KASA))), 2000,
            abi.encode(RemoteCollateralVault.Emir.FONLA, TOKEN_ID, hedefVarlik, fon, keccak256("f"))
        );
    }

    /// The route, built the same way on every chain. `amountOutMinimum` is
    /// ZERO on purpose: the vault's own floor is the thing being measured,
    /// and a stricter bound here would hide whether it holds.
    function _rota(Zincir memory z, address alici, uint256 miktar, bool alis)
        private
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(
            ISwapRouter02.exactInputSingle.selector,
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: alis ? z.usdc : z.hedefVarlik,
                tokenOut: alis ? z.hedefVarlik : z.usdc,
                fee: z.kademe,
                recipient: alici,
                amountIn: miktar,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
    }

    struct Sonuc {
        /* 1 — the derivation, on this real chain */
        bytes32 initKodHash;
        address turetilen;
        address dagitilan;
        bool adresAyni;

        /* 2 — funding and the hook */
        uint256 kasaUsdc;
        uint256 bekleyenQuote;
        address hedefVarlik;

        /* 3 — the floor the vault built for itself */
        uint256 taban;
        uint256 besleyiciFiyati;    // scaled by 10^besleyiciOndalik

        /* 4 — the honest purchase */
        bool alisGecti;
        bytes alisSebep;
        uint256 alinan;
        uint256 tutulan;
        uint256 alisOdulu;

        /* 5 — the hostile executor */
        bool soygunGecti;
        bytes soygunSebep;
        uint256 soyguncudaKalan;

        /* 6 — an asset with no feed */
        uint256 besleyicisizTaban;      // non-zero only if the POOL answered
        bool besleyicisizGecti;         // the honest route, which must pass
        uint256 besleyicisizAlinan;
        bytes besleyicisizSebep;
        bool besleyicisizSoygunGecti;   // the hostile one, which must not
        bytes besleyicisizSoygunSebep;

        /* 7 — the sale under sell pressure, bounded by Arc's grant */
        uint256 izin;
        bool fazlaReddedildi;
        bool satisGecti;
        bytes satisSebep;
        uint256 satilanTutar;
        uint256 gelenQuote;
        uint256 izinSonra;

        /* 8 — the return leg, through this chain's real CCTP */
        bool arcaGectiMi;
        bytes arcaSebep;
        uint256 arcaGiden;
        uint256 kasadaKalan;
        uint256 kasaUsdcSonra;   // the real balance, not the ledger's view
    }

    function run(Zincir memory z, uint256 fon, uint256 harcama, uint256 satisOrani)
        external
        returns (Sonuc memory s)
    {
        RemoteSwapExecutor yurutucu = new RemoteSwapExecutor();

        /* ---- 1 + 2 ---------------------------------------------------- */
        (RemoteVaultFactory f, RemoteCollateralVault k) = _kur(z, z.hedefVarlik, fon);
        s.initKodHash = f.initKodHash();
        s.turetilen = f.kasaAdresi(TOKEN_ID);
        s.dagitilan = address(k);
        s.adresAyni = s.turetilen == s.dagitilan;
        s.kasaUsdc = IERC20V(z.usdc).balanceOf(address(k));
        s.bekleyenQuote = k.bekleyenQuote();
        s.hedefVarlik = k.hedefVarlik();

        /* ---- 3 -------------------------------------------------------- */
        uint256 odul = (harcama * k.YURUTUCU_ODUL_BPS()) / 10_000;
        s.taban = k.alisTabani(z.hedefVarlik, harcama - odul);
        (, int256 cevap, , , ) = IBesleyiciV(z.besleyici).latestRoundData();
        s.besleyiciFiyati = uint256(cevap);

        /* ---- 4: the honest purchase ----------------------------------- */
        {
            uint256 once = IERC20V(z.usdc).balanceOf(address(this));
            try yurutucu.al(
                IUzakKasa(address(k)), harcama, 0, z.router,
                _rota(z, address(yurutucu), harcama - odul, true)
            ) returns (uint256 a) {
                s.alisGecti = true;
                s.alinan = a;
            } catch (bytes memory e) {
                s.alisGecti = false;
                s.alisSebep = e;
            }
            /* The fee is forwarded to whoever called the executor, which is
               this harness. Read off the balance, not assumed. */
            s.alisOdulu = IERC20V(z.usdc).balanceOf(address(this)) - once;
            s.tutulan = k.tutulan(z.hedefVarlik);
        }

        /* ---- 7: the sale, bounded by Arc's grant ---------------------- */
        {
            s.satilanTutar = (s.tutulan * satisOrani) / 100;
            k.handleReceiveFinalizedMessage(
                ARC_DOMAIN, bytes32(uint256(uint160(ARC_KASA))), 2000,
                abi.encode(RemoteCollateralVault.Emir.SAT, TOKEN_ID, z.hedefVarlik,
                           s.satilanTutar, keccak256("s"))
            );
            s.izin = k.satisIzni(z.hedefVarlik);

            /* One unit over the grant. The vault holds far more than the
               grant, so this can only fail on the permission. */
            try yurutucu.sat(
                IUzakKasa(address(k)), s.satilanTutar + 1, 0, z.router,
                _rota(z, address(yurutucu), s.satilanTutar + 1, false)
            ) {
                s.fazlaReddedildi = false;
            } catch {
                s.fazlaReddedildi = true;
            }

            try yurutucu.sat(
                IUzakKasa(address(k)), s.satilanTutar, 0, z.router,
                _rota(z, address(yurutucu), s.satilanTutar, false)
            ) returns (uint256 q) {
                s.satisGecti = true;
                s.gelenQuote = q;
            } catch (bytes memory e) {
                s.satisGecti = false;
                s.satisSebep = e;
            }
            s.izinSonra = k.satisIzni(z.hedefVarlik);
        }

        /* ---- 8: home, through this chain's real CCTP ------------------ */
        s.arcaGiden = k.bekleyenQuote();
        try k.arcaGonder(s.arcaGiden, 0, 2000, keccak256("geri")) {
            s.arcaGectiMi = true;
        } catch (bytes memory e) {
            s.arcaGectiMi = false;
            s.arcaSebep = e;
        }
        s.kasadaKalan = k.bekleyenQuote();
        s.kasaUsdcSonra = IERC20V(z.usdc).balanceOf(address(k));

        /* ---- 5: the hostile executor, on a fresh vault ---------------- */
        {
            (, RemoteCollateralVault k2) = _kur(z, z.hedefVarlik, fon);
            KotuYurutucuV kotu = new KotuYurutucuV();
            try kotu.soy(
                IUzakKasa(address(k2)), harcama, 1, 1_000_000,
                z.router, z.usdc, z.hedefVarlik, z.kademe
            ) {
                s.soygunGecti = true;
            } catch (bytes memory e) {
                s.soygunGecti = false;
                s.soygunSebep = e;
            }
            s.soyguncudaKalan = IERC20V(z.usdc).balanceOf(address(kotu));
        }

        /* ---- 6: an asset with NO FEED, which must now WORK -----------
         *
         * WHAT CHANGED AND WHY THIS IS THE ASSERTION THAT MATTERS
         *   This block used to prove that an asset without a Chainlink
         *   feed could never be converted into. The user removed that
         *   rule: *"Arc'da dogrulamasi gerekmiyor, sadece calisan tum
         *   adaylari koy, hatta insanlarin eklemesine de izin ver."*
         *
         *   So the claim being measured is inverted, and inverting a
         *   safety assertion is exactly where a hole gets opened quietly.
         *   Both halves are therefore measured, on the same vault, with
         *   the same asset:
         *
         *     honest route  -> must PASS   (the asset really is usable)
         *     hostile route -> must FAIL   (the floor really is there)
         *
         *   If only the first ran, "it works now" would be
         *   indistinguishable from "nothing checks it any more".
         */
        {
            (, RemoteCollateralVault k3) = _kur(z, z.besleyicisizVarlik, fon);

            /* The floor for this asset can only have come from the pool:
               the factory's feed table has one row and it is not this
               asset. A non-zero number here IS the pool source working. */
            try k3.alisTabani(z.besleyicisizVarlik, harcama) returns (uint256 tb) {
                s.besleyicisizTaban = tb;
            } catch { s.besleyicisizTaban = 0; }

            RemoteSwapExecutor yur = new RemoteSwapExecutor();
            uint256 odul3 = (harcama * k3.YURUTUCU_ODUL_BPS()) / 10_000;
            bytes memory rota3 = abi.encodeWithSelector(
                ISwapRouter02.exactInputSingle.selector,
                ISwapRouter02.ExactInputSingleParams({
                    tokenIn: z.usdc,
                    tokenOut: z.besleyicisizVarlik,
                    fee: z.besleyicisizKademe,
                    recipient: address(yur),
                    amountIn: harcama - odul3,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            );
            try yur.al(IUzakKasa(address(k3)), harcama, 0, z.router, rota3)
                returns (uint256 alinan) {
                s.besleyicisizGecti = true;
                s.besleyicisizAlinan = alinan;
            } catch (bytes memory e) {
                s.besleyicisizGecti = false;
                s.besleyicisizSebep = e;
            }

            /* And the hostile route against the same asset. */
            KotuYurutucuV kotu = new KotuYurutucuV();
            try kotu.soy(
                IUzakKasa(address(k3)), harcama, 1, 1_000_000,
                z.router, z.usdc, z.besleyicisizVarlik, z.besleyicisizKademe
            ) {
                s.besleyicisizSoygunGecti = true;
            } catch (bytes memory e) {
                s.besleyicisizSoygunGecti = false;
                s.besleyicisizSoygunSebep = e;
            }
        }
    }
}

interface IBesleyiciV {
    function latestRoundData()
        external view
        returns (uint80, int256, uint256, uint256, uint80);
}
