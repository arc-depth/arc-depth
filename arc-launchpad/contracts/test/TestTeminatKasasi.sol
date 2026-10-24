// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TeminatKasasi, IERC20K, IGeriAlimAlicisi} from "../TeminatKasasi.sol";
import {LaunchToken} from "../LaunchToken.sol";
import {MockERC20} from "./TestRedemption.sol";
import {IOracle} from "../IOracle.sol";

/// A stand-in value adapter. The real one is tested separately against the
/// live Chainlink feeds on Arc — here the point is the vault's claim
/// arithmetic, which never reads a price at all: redemption is a ratio and
/// the buyback compares the claim with itself. So this exists only to
/// satisfy the constructor, and a rate of one keeps it out of the way.
contract SahteOracle is IOracle {
    function deger(address, uint256 miktar) external pure override returns (uint256) {
        return miktar;
    }
    function degerlenebilir(address) external pure override returns (bool) {
        return true;
    }
}

/// @notice Does the vault's claim arithmetic actually hold, or only in the
///         spreadsheet?
///
/// Two things are worth testing and nothing else is:
///
///   1. A redemption must leave EVERY asset's claim per token exactly where
///      it was. Not approximately — the arithmetic is a pure ratio and any
///      drift means an ordering mistake, like computing a share after an
///      earlier transfer has already moved the denominator.
///
///   2. A buyback must raise the spent asset's claim or revert. The
///      direction depends only on price, so the test drives it from both
///      sides: below the claim it has to pass, above it has to fail. A test
///      that only drove the passing side would prove nothing, because a
///      contract with the check deleted would also pass it.
///
/// The buyback is a loan, so this contract is also the borrower: it takes
/// the asset, hands back launch tokens at a price the test chooses, and the
/// vault decides whether that was acceptable.
contract TestTeminatKasasi is IGeriAlimAlicisi {
    struct Durum {
        uint256 dolasim;
        uint256[] bakiyeler;
        uint256[] haklar;
    }

    LaunchToken public token;
    TeminatKasasi public kasa;
    MockERC20[3] public varlik;
    address[] public varlikAdres;

    /// How many launch tokens the borrower returns per unit of borrowed
    /// asset, scaled by 1e18. The test sets it to buy above or below the
    /// claim on purpose.
    uint256 public oran;
    /// Tokens this contract holds to hand back, minted at construction.
    uint256 public stok;

    uint256 private constant ARZ = 1_000_000_000 ether;

    function _kur() internal {
        token = new LaunchToken("Test", "TST", ARZ, address(this));
        for (uint256 i = 0; i < 3; i++) {
            varlik[i] = new MockERC20(1_000_000 ether, address(this));
            varlikAdres.push(address(varlik[i]));
        }
        /* egri and acici are given addresses that hold nothing, so the whole
           supply counts as circulating and the ratios are easy to read. */
        /* Weights that close and are deliberately uneven, so a bug that
           only works for equal shares shows. varlik[0] doubles as the quote
           — the vault's pending currency — because this test never
           converts and the choice only decides which asset is valued at
           face. */
        uint16[] memory agirliklar = new uint16[](3);
        agirliklar[0] = 5_000; agirliklar[1] = 3_000; agirliklar[2] = 2_000;
        kasa = new TeminatKasasi(
            IERC20K(address(token)),
            address(uint160(0xE1)),
            address(uint160(0xAC)),
            varlikAdres[0],
            IOracle(address(new SahteOracle())),
            varlikAdres,
            agirliklar
        );
        for (uint256 i = 0; i < 3; i++) {
            varlik[i].approve(address(kasa), type(uint256).max);
        }
        /* Deliberately uneven, so a bug that works for equal balances shows. */
        kasa.besle(varlikAdres[0], 600 ether);
        kasa.besle(varlikAdres[1], 250 ether);
        kasa.besle(varlikAdres[2], 7 ether);
    }

    function _durum() internal view returns (Durum memory d) {
        d.dolasim = kasa.dolasim();
        d.bakiyeler = new uint256[](3);
        d.haklar = new uint256[](3);
        for (uint256 i = 0; i < 3; i++) {
            d.bakiyeler[i] = kasa.bakiye(varlikAdres[i]);
            d.haklar[i] = kasa.hak(varlikAdres[i]);
        }
    }

    /* ---- 1. redemption preserves every claim exactly ---------------- */

    function iadeTesti(uint256 yakilacak)
        external
        returns (Durum memory once, Durum memory sonra, uint256[] memory odenen, bool hepsiAyni)
    {
        _kur();
        once = _durum();
        token.approve(address(kasa), type(uint256).max);
        odenen = kasa.iade(yakilacak);
        sonra = _durum();
        hepsiAyni = true;
        for (uint256 i = 0; i < 3; i++) {
            if (sonra.haklar[i] != once.haklar[i]) hepsiAyni = false;
        }
    }

    /* ---- 2. the buyback, driven from both sides --------------------- */

    /// @param katBps what the borrower pays relative to the claim, in bps.
    ///        10_000 is exactly at the claim, 9_000 is a 10% discount,
    ///        12_000 is 20% above and must revert.
    function geriAlimTesti(uint256 harcama, uint256 katBps)
        external
        returns (
            Durum memory once,
            Durum memory sonra,
            uint256 yakilan,
            uint256 odul,
            uint256 beklenenBosluk
        )
    {
        _kur();
        /* Stock to hand back. Minted separately so the vault's own supply
           accounting is not disturbed by the borrower's inventory. */
        stok = token.balanceOf(address(this));
        once = _durum();

        /* tokens returned = harcama / (claim * kat). At kat = 1 the borrower
           returns exactly what the spend was worth, which leaves the claim
           flat; below 1 it returns more and the claim rises. */
        uint256 hakVarlik = once.haklar[0];                    // scaled 1e36
        uint256 tokenBasinaHarcama = (hakVarlik * katBps) / 10_000;
        oran = tokenBasinaHarcama;                             // 1e36-scaled
        beklenenBosluk = kasa.bosluk(varlikAdres[0], harcama, _donecekToken(harcama));

        (yakilan, odul) = kasa.geriAl(varlikAdres[0], harcama, "");
        sonra = _durum();
    }

    function _donecekToken(uint256 harcama) internal view returns (uint256) {
        if (oran == 0) return 0;
        return (harcama * kasa.HAK_OLCEGI()) / oran;
    }

    /// The loan callback. The asset has already arrived; launch tokens have
    /// to be in the vault before this returns.
    function geriAlimCagrisi(address, uint256 harcama, bytes calldata) external override {
        uint256 donecek = _donecekToken(harcama);
        token.transfer(address(kasa), donecek);
    }

    /* ---- 3. a borrower that returns nothing ------------------------- */

    function kacanBorclu(uint256 harcama) external returns (bool revertEtti) {
        _kur();
        oran = 0;                      // _donecekToken returns 0 -> nothing sent
        try kasa.geriAl(varlikAdres[0], harcama, "") {
            revertEtti = false;
        } catch {
            revertEtti = true;
        }
    }
}
