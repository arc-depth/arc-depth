// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CrossChainAccounting} from "../CrossChainAccounting.sol";

/// @notice Does the three-bucket ledger actually close the gap that was
///         measured on the old vault?
///
/// The old vault, measured: $100 reserve, $60 moved toward another chain,
/// and a holder redeeming at that moment was paid $2.00 instead of $5.00 —
/// a permanent 60% loss that tracked the bridged fraction exactly.
///
/// Two things have to be true for the new ledger to have fixed it, and
/// they pull in opposite directions, which is why both are tested:
///
///   1. The claim must NOT move when funds go into flight. If it moved,
///      the loss would still be there, just relabelled.
///
///   2. A redeemer during flight must receive their FULL entitlement —
///      part in cash, the rest as a recorded debt — AND the holders who
///      stayed must see their claim unchanged. If the debt were not
///      subtracted from the claim, the stayers' claim would be inflated by
///      money already promised to somebody who left.
///
/// A design that satisfied only one of those would look correct from one
/// side of the trade and be wrong from the other.
contract TestCrossChainAccounting {
    CrossChainAccounting public defter;

    /* A stand-in asset address. The ledger never touches a token — it is
       pure accounting — so the address only has to be distinct. */
    address constant VARLIK = address(uint160(0xC011A7E8A1));

    struct Durum {
        uint256 musait;
        uint256 yolda;
        uint256 uzak;
        uint256 borc;
        uint256 ekonomik;
        uint256 harcanabilir;
        uint256 hak;
    }

    function _durum(uint256 dolasim) internal view returns (Durum memory d) {
        CrossChainAccounting.Kova memory k = defter.kova(VARLIK);
        d.musait = k.musait;
        d.yolda = k.yolda;
        d.uzak = k.uzak;
        d.borc = k.borc;
        d.ekonomik = defter.ekonomik(VARLIK);
        d.harcanabilir = defter.harcanabilir(VARLIK);
        d.hak = defter.hak(VARLIK, dolasim);
    }

    /* ---- 1. the claim must not move on a transfer ------------------- */

    struct TransferSonucu {
        Durum once;
        Durum yoldayken;
        Durum uzaktayken;
        bool hakSabitKaldi;
    }

    function transferTesti(uint256 rezerv, uint256 kopru, uint256 dolasim)
        external
        returns (TransferSonucu memory s)
    {
        defter = new CrossChainAccounting(address(this));
        defter.girdi(VARLIK, rezerv);
        s.once = _durum(dolasim);

        defter.yolaCikti(VARLIK, kopru, keccak256("t1"));
        s.yoldayken = _durum(dolasim);

        defter.uzaktaOnaylandi(VARLIK, kopru, keccak256("t1"));
        s.uzaktayken = _durum(dolasim);

        /* Exactly equal, not approximately. The old vault's loss was a
           clean fraction, so anything less than equality here would be the
           same bug at a smaller size. */
        s.hakSabitKaldi =
            s.once.hak == s.yoldayken.hak && s.yoldayken.hak == s.uzaktayken.hak;
    }

    /* ---- 2. redemption during flight -------------------------------- */

    struct IadeSonucu {
        Durum once;
        Durum sonra;
        uint256 hakEttigi;        // full entitlement against economic reserve
        uint256 hemenOdenen;      // paid from MUSAIT
        uint256 borcaYazilan;     // recorded as owed
        uint256 dolasimSonra;
        bool tamOdendi;           // paid + owed == entitlement
        bool kalanlarinHakkiSabit;
    }

    /// Redeem `yakilan` of `dolasim` tokens while `kopru` is in flight.
    ///
    /// The vault's own logic lives in the vault; this reproduces only the
    /// part that touches the ledger, which is what is being tested.
    function iadeTesti(
        uint256 rezerv,
        uint256 kopru,
        uint256 dolasim,
        uint256 yakilan
    ) external returns (IadeSonucu memory s) {
        defter = new CrossChainAccounting(address(this));
        defter.girdi(VARLIK, rezerv);
        defter.yolaCikti(VARLIK, kopru, keccak256("t1"));

        s.once = _durum(dolasim);

        /* Entitlement is a share of the ECONOMIC reserve — including what
           is in flight — because that is what the holder owns. */
        s.hakEttigi = (s.once.ekonomik * yakilan) / dolasim;

        /* Pay what is here, owe the rest. */
        uint256 odenebilir = s.once.harcanabilir;
        s.hemenOdenen = s.hakEttigi > odenebilir ? odenebilir : s.hakEttigi;
        s.borcaYazilan = s.hakEttigi - s.hemenOdenen;

        if (s.hemenOdenen > 0) defter.harca(VARLIK, s.hemenOdenen);
        if (s.borcaYazilan > 0) defter.borcYaz(VARLIK, s.borcaYazilan);

        s.dolasimSonra = dolasim - yakilan;
        s.sonra = _durum(s.dolasimSonra);

        s.tamOdendi = s.hemenOdenen + s.borcaYazilan == s.hakEttigi;
        /* The stayers' claim must be untouched. Integer division means the
           two figures can differ by the rounding of one scaled unit; more
           than that is value appearing or vanishing. */
        uint256 a = s.once.hak;
        uint256 b = s.sonra.hak;
        s.kalanlarinHakkiSabit = a > b ? (a - b) <= 1 : (b - a) <= 1;
    }

    /* ---- 3. the guards --------------------------------------------- */

    struct KorumaSonucu {
        bool borcluParaYolaCikamaz;
        bool borcluParaHarcanamaz;
        bool yoldanFazlaOnaylanamaz;
        bool uzaktanFazlaDonemez;
        bool borctanFazlaKapanamaz;
    }

    function korumaTesti(uint256 rezerv, uint256 borc) external returns (KorumaSonucu memory s) {
        defter = new CrossChainAccounting(address(this));
        defter.girdi(VARLIK, rezerv);
        defter.borcYaz(VARLIK, borc);

        /* Everything above the debt is free; one unit more is not. */
        uint256 serbest = rezerv - borc;

        try defter.yolaCikti(VARLIK, serbest + 1, keccak256("x")) {
            s.borcluParaYolaCikamaz = false;
        } catch { s.borcluParaYolaCikamaz = true; }

        try defter.harca(VARLIK, serbest + 1) {
            s.borcluParaHarcanamaz = false;
        } catch { s.borcluParaHarcanamaz = true; }

        try defter.uzaktaOnaylandi(VARLIK, 1, keccak256("x")) {
            s.yoldanFazlaOnaylanamaz = false;      // nothing is in flight
        } catch { s.yoldanFazlaOnaylanamaz = true; }

        try defter.donusBasladi(VARLIK, 1, keccak256("x")) {
            s.uzaktanFazlaDonemez = false;         // nothing is remote
        } catch { s.uzaktanFazlaDonemez = true; }

        try defter.borcKapat(VARLIK, borc + 1) {
            s.borctanFazlaKapanamaz = false;
        } catch { s.borctanFazlaKapanamaz = true; }
    }

    /* ---- 4. only the vault may write ------------------------------- */

    /// A second contract tries to write to a ledger it does not own.
    function yabanciTesti(uint256 rezerv) external returns (bool reddedildi) {
        defter = new CrossChainAccounting(address(this));
        defter.girdi(VARLIK, rezerv);
        Yabanci y = new Yabanci();
        try y.dene(defter) { reddedildi = false; } catch { reddedildi = true; }
    }

    /* ---- 5. the round trip ends where it started ------------------- */

    struct TurSonucu {
        uint256 baslangicHak;
        uint256 bitisHak;
        uint256 bitisMusait;
        uint256 bitisYolda;
        uint256 bitisUzak;
        bool kapandi;
    }

    function turTesti(uint256 rezerv, uint256 kopru, uint256 dolasim)
        external
        returns (TurSonucu memory s)
    {
        defter = new CrossChainAccounting(address(this));
        defter.girdi(VARLIK, rezerv);
        s.baslangicHak = defter.hak(VARLIK, dolasim);

        bytes32 t = keccak256("tur");
        defter.yolaCikti(VARLIK, kopru, t);
        defter.uzaktaOnaylandi(VARLIK, kopru, t);
        defter.donusBasladi(VARLIK, kopru, t);
        defter.geriDondu(VARLIK, kopru, t);

        CrossChainAccounting.Kova memory k = defter.kova(VARLIK);
        s.bitisMusait = k.musait;
        s.bitisYolda = k.yolda;
        s.bitisUzak = k.uzak;
        s.bitisHak = defter.hak(VARLIK, dolasim);
        /* A full circuit must restore the exact starting state: anything
           retained in YOLDA or UZAK after a completed round trip is an
           amount the ledger has lost track of. */
        s.kapandi = k.musait == rezerv && k.yolda == 0 && k.uzak == 0
            && s.bitisHak == s.baslangicHak;
    }
}

/// A contract that is not the vault.
contract Yabanci {
    function dene(CrossChainAccounting d) external {
        d.girdi(address(uint160(0xBAD)), 1);
    }
}
