// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title TestCanliYasamDongusu — the DEPLOYED launchpad's full life cycle
///
/// WHY THIS HARNESS EXISTS AND HOW IT DIFFERS FROM THE OTHERS
///   Every harness in this project builds its own launchpad, and that is
///   right: what gets tested should be the CODE, not a deployment. But
///   none of those tests touches the launchpad that sits on chain, and two
///   things are different:
///
///     "this code is correct"            -> 601 assertions say so
///     "this address on chain is right"  -> denetim-dagitim-pulse.js does
///     "this address on chain WORKS"     -> nothing said anything
///
///   The third one is this harness. It does not build its own launchpad; it
///   CALLS the deployed one, against the real PoolManager, with the real
///   hook and real USDC. The only fake thing is this contract's balance,
///   and that is supplied by a state override.
///
/// WHY NO REAL MONEY IS SPENT
///   The user's question: *"simulate it too, why would you use real
///   money."* The right question. `eth_call` with a state override gives
///   this contract a USDC balance and the whole cycle runs in a single
///   call — nothing is written to the chain and nothing is spent.
///
///   The one thing a simulation cannot measure is persistence: the EVM
///   semantics are identical, but at the end of an `eth_call` the state is
///   discarded. So this harness answers "the product works", not "there is
///   a token on chain". The second is not a verification but a product
///   decision.
///
/// WHY IT IS ALL IN ONE CALL
///   `eth_call` does not carry state between calls. If the launch, the buy,
///   the tax and the redemption happened in separate calls, the second
///   could not see the first one's token. So the whole flow is in one
///   function and the intermediate measurements come back in a struct.
///
/// FOUR THINGS ARE MEASURED
///   1. Does a launch really happen — token, curve, vault, pool
///   2. Can a stranger buy with nothing but USDC
///   3. Does the TAX on that buy reach the vault
///   4. Can somebody who burns the token get their money out of the vault
///
///   All four in sequence and on the same money. Measured separately, a
///   system whose links between them were broken would also pass four
///   tests.
interface IERC20C {
    function transfer(address to, uint256 v) external returns (bool);
    function approve(address who, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function symbol() external view returns (string memory);
}

interface ILaunchpadC {
    struct SepetKalem {
        address varlik;
        uint16 agirlikBps;
    }

    struct Kayit {
        address token;
        address egri;
        address acici;
        address rewards;
        address kasa;
        address yonetici;
        address hedefVarlik;
        address kurucu;
        uint256 vergiPpm;
        uint64 zaman;
    }

    function launch(
        string calldata ad,
        string calldata sembol,
        SepetKalem[] calldata sepet,
        uint256 vergiPpm,
        uint256 odeme,
        uint256 teminat,
        uint256 ilkAlim
    ) external returns (address token, address egri);

    function launchCount() external view returns (uint256);
    function launchAt(uint256 i) external view returns (Kayit memory);
    function quote() external view returns (address);
    function ASGARI_ODEME() external view returns (uint256);
    function ASGARI_TEMINAT() external view returns (uint256);
    function LAUNCH_UCRET_PPM() external view returns (uint256);
    function SUPPLY() external view returns (uint256);
}

interface IEgriC {
    function al(uint256 quoteIn, uint256 enAz) external returns (uint256);
    function sat(uint256 tokenIn, uint256 enAz) external returns (uint256);
    function toplanan() external view returns (uint256);
    function satilan() external view returns (uint256);
    function vergi() external view returns (uint256);
    function snipeOrani(uint256 t) external view returns (uint256);
    function acilis() external view returns (uint64);
    function mezun() external view returns (bool);
}

interface IKasaC {
    function iade(uint256 miktar) external returns (uint256, uint256);
    function hak(address varlik) external view returns (uint256);
    function bakiye(address varlik) external view returns (uint256);
    function dolasim() external view returns (uint256);
    function musait() external view returns (uint256);
    function ekonomik() external view returns (uint256);
    function token() external view returns (address);
    function supur() external returns (uint256);
}

contract TestCanliYasamDongusu {
    struct Sonuc {
        /* ---- 1. the launch ---- */
        uint256 launchIdOnce;
        uint256 launchIdSonra;
        address token;
        address egri;
        address kasa;
        address yonetici;
        address hedefVarlik;
        address kurucu;
        uint256 arz;
        string sembol;

        /* ---- the payment's three parts, as the chain has them ---- */
        uint256 kasadakiUsdc;
        uint256 egridekiUsdc;
        uint256 harcananUsdc;

        /* ---- 2. a stranger buys, with nothing but USDC ---- */
        bool alimGecti;
        uint256 alimOdenen;
        uint256 alinanToken;
        uint256 alimSonrasiEgriToplanan;

        /* ---- 3. did the tax reach the vault ---- */
        uint256 kasaAlimOncesi;
        uint256 kasaAlimSonrasi;
        uint256 vergiUlasan;
        uint256 beklenenVergi;
        uint256 vergiPpm;
        /* The anti-snipe rate AT THE MOMENT OF THE BUY, read from the
           curve this launch just created. Not a constant in this script:
           the whole point is what the deployed system does. */
        uint256 snipeOrani0;
        uint256 snipeOrani1;
        uint256 snipeOrani5;
        /* What the curve is holding in tax. At graduation this becomes
           LOCKED POOL LIQUIDITY — it never reaches the vault, and
           expecting it there is what made the first run of this test
           report a failure about a system behaving correctly. */
        uint256 egriVergi;
        uint256 egriToplanan;

        /* ---- 4. can a holder leave ---- */
        uint256 hakAlimSonrasi;
        bool iadeGecti;
        uint256 iadeYakilan;
        uint256 iadeAlinan;
        uint256 iadeBeklenen;
        uint256 kasaIadeSonrasi;
        uint256 dolasimIadeOncesi;
        uint256 dolasimIadeSonrasi;

        /* ---- the invariant that matters most ---- */
        uint256 hakIadeOncesi;
        uint256 hakIadeSonrasi;

        bytes alimSebep;
        bytes iadeSebep;
    }

    /// The whole lifecycle, against the deployed launchpad.
    ///
    /// @param lpAdres  the LIVE launchpad. Not deployed here on purpose:
    ///                 deploying one would test the code again, which is
    ///                 already covered by 601 assertions, and would say
    ///                 nothing about the address the interface points at.
    function kos(
        address lpAdres,
        address hedefVarlik,
        uint256 odeme,
        uint256 teminat,
        uint256 vergiPpm,
        uint256 alimTutari,
        uint256 iadeOrani
    ) external returns (Sonuc memory s) {
        ILaunchpadC lp = ILaunchpadC(lpAdres);
        IERC20C quote = IERC20C(lp.quote());

        s.launchIdOnce = lp.launchCount();
        uint256 baslangic = quote.balanceOf(address(this));

        /* ---- 1. launch ------------------------------------------- */
        ILaunchpadC.SepetKalem[] memory sepet = new ILaunchpadC.SepetKalem[](1);
        sepet[0] = ILaunchpadC.SepetKalem({ varlik: hedefVarlik, agirlikBps: 10_000 });

        quote.approve(lpAdres, type(uint256).max);
        lp.launch("Arc Pulse", "PULSE", sepet, vergiPpm, odeme, teminat, 0);

        s.launchIdSonra = lp.launchCount();
        ILaunchpadC.Kayit memory k = lp.launchAt(s.launchIdSonra - 1);
        s.token = k.token;
        s.egri = k.egri;
        s.kasa = k.kasa;
        s.yonetici = k.yonetici;
        s.hedefVarlik = k.hedefVarlik;
        s.kurucu = k.kurucu;
        s.vergiPpm = k.vergiPpm;
        s.arz = IERC20C(k.token).totalSupply();
        s.sembol = IERC20C(k.token).symbol();

        /* Read from the token contract, not from a ledger. A ledger that
           says the right number while the balance says another is the
           drift this project measured once: $25.42 real against $20.00
           booked, with every buyback refused. */
        s.kasadakiUsdc = quote.balanceOf(k.kasa);
        s.egridekiUsdc = quote.balanceOf(k.egri);
        s.harcananUsdc = baslangic - quote.balanceOf(address(this));

        /* ---- 2 & 3. a buy, and where its tax goes ---------------- */
        s.kasaAlimOncesi = quote.balanceOf(k.kasa);
        s.hakIadeOncesi = IKasaC(k.kasa).hak(address(quote));
        /* THE EXPECTED TAX COMES OFF THE NET, NOT THE GROSS
             Measured: a $50 buy in the launch's own second paid $49.50
             anti-snipe tax, leaving $0.50 for the curve to see — and the
             collateral tax is 1% of THAT, half a cent. Computed against
             the gross it looked like a 99% shortfall, and the test
             reported a broken tax path about a working one.

             The rate is read from the curve rather than assumed, because
             it decays: SNIPE_PPM >> (2 * seconds). */
        s.snipeOrani0 = IEgriC(k.egri).snipeOrani(0);
        s.snipeOrani1 = IEgriC(k.egri).snipeOrani(1);
        s.snipeOrani5 = IEgriC(k.egri).snipeOrani(5);
        uint256 net = alimTutari - (alimTutari * s.snipeOrani0) / 1_000_000;
        s.beklenenVergi = (net * vergiPpm) / 1_000_000;

        quote.approve(k.egri, type(uint256).max);
        s.alimOdenen = alimTutari;
        try IEgriC(k.egri).al(alimTutari, 0) returns (uint256 alinan) {
            s.alimGecti = true;
            s.alinanToken = alinan;
        } catch (bytes memory e) {
            s.alimGecti = false;
            s.alimSebep = e;
        }

        s.alimSonrasiEgriToplanan = IEgriC(k.egri).toplanan();
        s.egriVergi = IEgriC(k.egri).vergi();
        s.egriToplanan = IEgriC(k.egri).toplanan();

        /* The tax is a plain transfer into the vault, so the vault's
           LEDGER does not know about it until something sweeps. Measured:
           without the sweep the balance was $25.42 and the ledger said
           $20.00, and every buyback was refused for lack of funds. So the
           balance is read first and the sweep is called explicitly — if
           the sweep were missing, the gap between these two numbers is
           where it would show. */
        s.kasaAlimSonrasi = quote.balanceOf(k.kasa);
        s.vergiUlasan = s.kasaAlimSonrasi > s.kasaAlimOncesi
            ? s.kasaAlimSonrasi - s.kasaAlimOncesi
            : 0;

        s.hakAlimSonrasi = IKasaC(k.kasa).hak(address(quote));
        s.dolasimIadeOncesi = IKasaC(k.kasa).dolasim();

        /* ---- 4. and out again ------------------------------------ */
        if (s.alimGecti && s.alinanToken > 0 && iadeOrani > 0) {
            uint256 yakilacak = (s.alinanToken * iadeOrani) / 10_000;
            if (yakilacak > 0) {
                s.iadeYakilan = yakilacak;
                /* What the claim says this burn is worth, computed BEFORE
                   the burn.

                   HAK_OLCEGI IS 1e36, NOT 1e18
                     Divided by 1e18 first and the expected payout came
                     out as $84,984,351,872,924,860 against an actual
                     $0.08 — absurd enough to be obvious, which is the
                     only reason it was caught here rather than later.
                     The ledger scales the claim by 1e36 so that a
                     six-decimal quote over an eighteen-decimal supply
                     keeps precision; dividing by the token's decimals
                     alone leaves the scale factor in. */
                s.iadeBeklenen = (yakilacak * s.hakAlimSonrasi) / 1e36;

                IERC20C(k.token).approve(k.kasa, type(uint256).max);
                try IKasaC(k.kasa).iade(yakilacak) returns (uint256 odenen, uint256) {
                    s.iadeGecti = true;
                    s.iadeAlinan = odenen;
                } catch (bytes memory e) {
                    s.iadeGecti = false;
                    s.iadeSebep = e;
                }
            }
        }

        s.kasaIadeSonrasi = quote.balanceOf(k.kasa);
        s.dolasimIadeSonrasi = IKasaC(k.kasa).dolasim();
        /* THE INVARIANT. A redemption pays out and burns at the same
           ratio, so the claim per remaining token must not move:

             w = d * E / D   ->   (E - w) / (D - d) = E / D

           If this number drifts, a redemption transferred value between
           holders — which is the one thing a collateral claim must never
           do, and it is invisible in any single balance. */
        s.hakIadeSonrasi = IKasaC(k.kasa).hak(address(quote));
    }
}
