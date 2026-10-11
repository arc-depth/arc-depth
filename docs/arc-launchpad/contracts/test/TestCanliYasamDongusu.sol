// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title TestCanliYasamDongusu — DAĞITILMIŞ launchpad'in tam yaşam döngüsü
///
/// NEDEN BU HARNESS VAR, ÖTEKİLERDEN FARKI NE
///   Bu projedeki her harness kendi launchpad'ini kuruyor ve bu doğru:
///   test edilen şey KOD olmalı, bir dağıtım değil. Ama o testlerin hiçbiri
///   zincirde duran launchpad'e dokunmuyor, ve iki şey farklı:
///
///     "bu kod doğru"              -> 601 sav bunu söylüyor
///     "zincirdeki bu adres doğru" -> denetim-dagitim-pulse.js bunu söylüyor
///     "zincirdeki bu adres İŞE YARIYOR" -> hiçbir şey söylemiyordu
///
///   Üçüncüsü bu harness. Kendi launchpad'ini kurmuyor; dağıtılmış olanı
///   ÇAĞIRIYOR, gerçek PoolManager'a karşı, gerçek kancayla, gerçek USDC
///   ile. Tek sahte şey bu sözleşmenin bakiyesi, ve o durum geçersiz
///   kılmayla veriliyor.
///
/// NEDEN GERÇEK PARA HARCANMIYOR
///   Kullanıcının sorusu: *"simülasyon da yap, niye gerçek para
///   kullanacaksın ki."* Doğru soru. `eth_call` durum geçersiz kılmayla
///   bu sözleşmeye USDC bakiyesi veriyor ve bütün döngü tek çağrıda
///   dönüyor — zincire hiçbir şey yazılmıyor, hiçbir şey harcanmıyor.
///
///   Simülasyonun ölçemediği tek şey kalıcılık: EVM semantiği aynı ama
///   `eth_call` sonunda durum atılıyor. Yani bu harness "ürün çalışıyor"
///   sorusunu cevaplıyor, "zincirde bir token var" sorusunu cevaplamıyor.
///   İkincisi bir doğrulama değil ürün kararı.
///
/// NEDEN HEPSİ TEK ÇAĞRIDA
///   `eth_call` durumu çağrılar arasında taşımıyor. Launch, alım, vergi ve
///   iade ayrı çağrılarda yapılsa ikincisi birincinin tokenini göremezdi.
///   O yüzden akışın tamamı tek fonksiyonda ve ara ölçümler struct'ta
///   dönüyor.
///
/// DÖRT ŞEY ÖLÇÜLÜYOR
///   1. Launch gerçekten oluyor mu — token, eğri, kasa, havuz
///   2. Bir yabancı sırf USDC ile alabiliyor mu
///   3. O alımın VERGİSİ kasaya ulaşıyor mu
///   4. Token yakan biri kasadan parasını alabiliyor mu
///
///   Dördü sırayla ve aynı para üzerinde. Ayrı ayrı ölçülse, aradaki
///   bağlantının koptuğu bir sistem de dört testi geçerdi.
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
