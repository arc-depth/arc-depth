// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IV3Fabrika {
    function getPool(address a, address b, uint24 fee) external view returns (address);
}

interface IV3Havuz {
    function liquidity() external view returns (uint128);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityX128s);
    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;
}

/// @title HavuzFiyat — bir kontrat adresinden fiyat türeten kaynak
///
/// NEDEN BU SÖZLEŞME VAR
///   Teminat olarak kullanılabilecek varlıkların bir LİSTESİ yok ve
///   olmayacak. Kullanıcı yalnızca kontrat adresini veriyor; hangi havuzda
///   işlem göreceği, fiyatının ne olduğu ve "çalışıp çalışmadığı" buradan
///   TÜRETİLİYOR.
///
///   Bu, uzak kasanın adresini CREATE2 ile türetip kimseden almamakla aynı
///   desen. Kullanıcıdan alınan tek şey hangi tokeni istediği; havuz
///   adresi, kademe ve fiyat alınmıyor.
///
/// NEDEN BESLEYİCİ ADRESİ KULLANICIDAN ALINAMAZ
///   Alınsa şu olurdu: X tokenini ekler, "besleyici" olarak kendi yazdığı
///   sözleşmeyi gösterir, o da X'i bir milyon dolar sayar. Kasanın taban
///   hesabı o fiyattan yapılır ve $2.000'lık teminat karşılığında 0,002 X
///   kabul edilir — rezerv boşalır, taban dekoratif kalır.
///
///   Burada hiçbir adres kullanıcıdan alınmıyor. Fabrika adresi değişmez,
///   `getPool` saf bir fonksiyon, fiyat o havuzun kendi geçmişinden
///   okunuyor.
///
/// EN DERİN HAVUZ, ÇÜNKÜ FARK 160 KAT
///   Ölçüldü — DEGEN'in Base'deki dört kademesi:
///
///     kademe   100                      0
///     kademe   500      26.884.250.352.574
///     kademe  3000   4.305.542.504.445.202   <- en derin
///     kademe 10000     445.022.291.174.402
///
///   Yanlış kademeyi seçmek 160 kat daha ince bir havuzda fiyat okumak
///   demek. O yüzden kademe verilmiyor, taranıp en likit olan bulunuyor.
///
/// ÜÇ ŞART, VE HİÇBİRİ VARLIĞA KALİTE KAPISI DEĞİL
///   Kullanıcının kuralı net: eleme yok, likidite tabanı gibi vekil
///   ölçütler yok, meme coin de dahil çalışan her şey girer. Buradaki üç
///   şart varlığı yargılamıyor — fiyatının ÖLÇÜLEBİLİR olmasını istiyor:
///
///     1. Havuz var mı          yoksa alınıp satılacak bir şey yok
///     2. Likidite sıfır değil  ölçüldü: PEPE'nin Base'deki iki havuzunun
///                              da likiditesi sıfır ama observe() yine bir
///                              fiyat döndürüyor — kimsenin işlem
///                              yapamayacağı bir fiyat
///     3. Gözlem geçmişi var    kardinalite 1 ise TWAP anlık fiyatın
///                              kendisidir ve tek işlemde oynatılabilir
///
///   Üçüncüsü kalıcı bir ret değil: `gecmisiAc` ile HERKES bir havuzun
///   gözlem geçmişini açabilir, bir kerelik gaz. Yani bir tokeni teminat
///   olarak isteyen kişi, eksikse kendisi tamamlar.
contract HavuzFiyat {
    /// Uniswap v3'ün kanonik fabrikası. Değişmez: ayarlanabilir olsa,
    /// ayarlayan kişi kendi "fabrikasını" gösterip her fiyatı uydurabilirdi.
    IV3Fabrika public immutable fabrika;

    /// Fiyatın ölçüldüğü para birimi — USDC. Değişmez, aynı sebeple.
    address public immutable quote;

    /* Taranan kademeler. Uniswap v3'ün kanonik dördü; bir havuz bunların
       dışında bir kademede olamaz.

       BİR FONKSİYON, DEVİL BİR DIZI — ve bu fark ölçülerek bulundu.
       State dizisi olarak yazıldığında değer KURUCUDA storage'a
       yazılıyor. Bu sözleşme ise testlerde `eth_call` durum geçersiz
       kılmasıyla enjekte ediliyor ve o yolda kurucunun storage yazmaları
       ATILIYOR. Sonuç: dizi sıfır kalıyor, getPool(varlik, quote, 0)
       çağrılıyor ve her varlık için "havuz yok" dönüyor — WETH dahil.
       Kodun içinde durduğu için artık enjeksiyonda da aynı. */
    function _kademe(uint256 i) internal pure returns (uint24) {
        if (i == 0) return 100;
        if (i == 1) return 500;
        if (i == 2) return 3000;
        return 10000;
    }

    /// TWAP penceresi. Otuz dakika, çünkü bir kademeyi otuz dakika boyunca
    /// oynatmak likiditeyle doğru orantılı gerçek para gerektiriyor; anlık
    /// fiyat ise tek işlemde oynatılabilir.
    uint32 public constant TWAP_PENCERE = 1800;

    /// Gözlem geçmişi için istenen asgari. İkiden küçükse `observe` bir
    /// ortalama değil anlık fiyat döndürür.
    uint16 public constant ASGARI_KARDINALITE = 2;

    error FabrikaYok();
    error HavuzYok(address varlik);
    error HavuzBos(address varlik, address havuz);
    error GecmisYok(address varlik, address havuz, uint16 kardinalite);

    constructor(IV3Fabrika _fabrika, address _quote) {
        if (address(_fabrika) == address(0) || _quote == address(0)) revert FabrikaYok();
        fabrika = _fabrika;
        quote = _quote;
    }

    /// The deepest pool for `varlik` against the quote, and what it costs to
    /// read a price from it.
    ///
    /// Returns zeros rather than reverting, so a caller can ASK whether an
    /// asset works before trying to use it. The interface needs this: a
    /// form that only finds out by sending a transaction is a form that
    /// charges somebody gas to be told no.
    function enDerinHavuz(address varlik)
        public
        view
        returns (address havuz, uint24 kademe, uint128 likidite, uint16 kardinalite)
    {
        for (uint256 i = 0; i < 4; i++) {
            uint24 k = _kademe(i);
            address p = fabrika.getPool(varlik, quote, k);
            if (p == address(0)) continue;
            uint128 L = IV3Havuz(p).liquidity();
            if (L <= likidite) continue;
            (, , , uint16 kard, , , ) = IV3Havuz(p).slot0();
            havuz = p;
            kademe = k;
            likidite = L;
            kardinalite = kard;
        }
    }

    /// Can a price be measured for this asset right now, and if not, why?
    ///
    /// `duzeltilebilir` separates the two kinds of no: a pool with no
    /// liquidity needs somebody to supply it, which this system cannot do;
    /// a pool with no observation history needs one permissionless call,
    /// which anybody can make.
    function olculebilirMi(address varlik)
        external
        view
        returns (bool olculebilir, string memory sebep, bool duzeltilebilir)
    {
        (address havuz, , uint128 L, uint16 kard) = enDerinHavuz(varlik);
        if (havuz == address(0)) return (false, "havuz yok", false);
        if (L == 0) return (false, "en derin havuzun likiditesi sifir", false);
        if (kard < ASGARI_KARDINALITE) {
            return (false, "gozlem gecmisi yok: gecmisiAc ile acilabilir", true);
        }
        return (true, "", false);
    }

    /// Open a pool's observation history. Permissionless and idempotent in
    /// effect: Uniswap only ever raises the target, so calling it with a
    /// smaller number does nothing.
    ///
    /// This exists so that "this token has no history yet" is something the
    /// person who wants it as collateral can fix themselves, in one
    /// transaction, without asking anybody.
    function gecmisiAc(address varlik, uint16 hedef) external {
        (address havuz, , , ) = enDerinHavuz(varlik);
        if (havuz == address(0)) revert HavuzYok(varlik);
        IV3Havuz(havuz).increaseObservationCardinalityNext(hedef);
    }

    /// The time-weighted average tick of the deepest pool.
    ///
    /// Reverts rather than returning a sentinel: every caller of this is
    /// about to size a trade, and a zero tick is a real price (1:1 before
    /// decimals) rather than an absence.
    function ortalamaTick(address varlik) public view returns (int24 tick, address havuz) {
        uint128 L;
        uint16 kard;
        (havuz, , L, kard) = enDerinHavuz(varlik);
        if (havuz == address(0)) revert HavuzYok(varlik);
        if (L == 0) revert HavuzBos(varlik, havuz);
        if (kard < ASGARI_KARDINALITE) revert GecmisYok(varlik, havuz, kard);

        uint32[] memory ne = new uint32[](2);
        ne[0] = TWAP_PENCERE;
        ne[1] = 0;
        (int56[] memory birikimli, ) = IV3Havuz(havuz).observe(ne);

        int56 fark = birikimli[1] - birikimli[0];
        tick = int24(fark / int56(uint56(TWAP_PENCERE)));
        /* Uniswap's own library floors toward negative infinity here, and
           the difference matters for a negative tick: truncating toward
           zero reports a price slightly HIGHER than the average, which on
           the buy side is a floor slightly too generous to the executor. */
        if (fark < 0 && (fark % int56(uint56(TWAP_PENCERE)) != 0)) tick--;
    }

    /// How much of `varlik` a quote amount is worth, at the average tick.
    ///
    /// Derived from the tick rather than from `sqrtPriceX96`: the tick is
    /// what the TWAP produces, and converting the spot sqrt price instead
    /// would quietly use a number nobody averaged.
    /**
     * How much of `varlik` `quoteMiktari` buys at the average price.
     *
     * ONDALIK DUZELTMESI YOK — VE OLMAMASI GEREKIYOR
     *   Bu bir kez yanlis yazildi ve olcum yakaladi: tetikten turetilen
     *   fiyat ZATEN ham birimde, yani "bir ham token basina kac ham
     *   quote". Ustune bir de 10^(varlikOndalik - quoteOndalik) carpani
     *   uygulaninca sonuc 10^12 kat sapti — olculdu, VIRTUAL icin
     *   2.715 yerine 2.725.437.764.577.311 cikti.
     *
     *   O yuzden varlik ondaligi bu hesaba HIC girmiyor; girmemesi
     *   gerektigi icin fonksiyon onu parametre olarak da almiyor.
     *   Alsaydi, cagiran dogru deger verdiginde bile yanlis sonuc
     *   uretirdi ve yanlisligi cagirana yuklenmis gorunurdu.
     *
     *   Gosterilecek fiyat baska bir sey: orada olcek gerekiyor ve
     *   arayuzdeki `fiyatCevir` onu uyguluyor. Burasi miktar hesabi.
     */
    function quoteIleAlinabilir(address varlik, uint256 quoteMiktari)
        external
        view
        returns (uint256 beklenen, address havuz, int24 tick)
    {
        (tick, havuz) = ortalamaTick(varlik);

        /* price(token1/token0) = 1.0001^tick, and which of the two the
           asset is decides whether the exponent is used or inverted. Read
           from the pool rather than compared by address order, because the
           ordering rule is Uniswap's and restating it here is one more
           place to get it wrong. */
        bool varlikSifirinci = IV3Havuz(havuz).token0() == varlik;

        uint256 X96 = _tickSqrtX96(varlikSifirinci ? -tick : tick);
        /* sqrtP is the square root of the price of currency1 in currency0,
           so the price itself is sqrtP^2 / 2^192. Multiplied in two steps
           to keep the intermediate inside 256 bits. */
        uint256 pay = (quoteMiktari * X96) >> 96;
        beklenen = (pay * X96) >> 96;
    }
    /**
     * The mirror: how much quote `varlikMiktari` is worth.
     *
     * Needed because collateral moves in both directions. Arc's defence
     * sells collateral back to the quote, and that side needs a floor
     * derived the same way the buy side is — from the same pool, the same
     * window, the same tick. Deriving one side from the pool and the other
     * from somewhere else would leave a gap between them that a round trip
     * could be run through.
     *
     * Ondalik duzeltmesi burada da yok, ayni sebeple: tetik ham birim
     * oranini veriyor.
     */
    function quoteKarsiligi(address varlik, uint256 varlikMiktari)
        external
        view
        returns (uint256 beklenen, address havuz, int24 tick)
    {
        (tick, havuz) = ortalamaTick(varlik);

        /* The inverse of the buy side: there the asset's own tick is
           negated, so here it is not. */
        bool varlikSifirinci = IV3Havuz(havuz).token0() == varlik;

        uint256 X96 = _tickSqrtX96(varlikSifirinci ? tick : -tick);
        uint256 pay = (varlikMiktari * X96) >> 96;
        beklenen = (pay * X96) >> 96;
    }



    /* ---- tick -> sqrtPriceX96 -------------------------------------
     *
     * Uniswap's TickMath, inlined. Imported it would be cleaner; inlined it
     * is auditable without resolving a dependency, and this is the one
     * piece of arithmetic in this contract that nobody should have to trust
     * a library for — a wrong value here moves every floor.
     */
    function _tickSqrtX96(int24 tick) internal pure returns (uint160) {
        uint256 abs = uint256(tick < 0 ? -int256(tick) : int256(tick));
        require(abs <= 887272, "tick");

        uint256 r = abs & 0x1 != 0
            ? 0xfffcb933bd6fad37aa2d162d1a594001
            : 0x100000000000000000000000000000000;
        if (abs & 0x2 != 0) r = (r * 0xfff97272373d413259a46990580e213a) >> 128;
        if (abs & 0x4 != 0) r = (r * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (abs & 0x8 != 0) r = (r * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
        if (abs & 0x10 != 0) r = (r * 0xffcb9843d60f6159c9db58835c926644) >> 128;
        if (abs & 0x20 != 0) r = (r * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (abs & 0x40 != 0) r = (r * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
        if (abs & 0x80 != 0) r = (r * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (abs & 0x100 != 0) r = (r * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
        if (abs & 0x200 != 0) r = (r * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
        if (abs & 0x400 != 0) r = (r * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
        if (abs & 0x800 != 0) r = (r * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
        if (abs & 0x1000 != 0) r = (r * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
        if (abs & 0x2000 != 0) r = (r * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
        if (abs & 0x4000 != 0) r = (r * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
        if (abs & 0x8000 != 0) r = (r * 0x31be135f97d08fd981231505542fcfa6) >> 128;
        if (abs & 0x10000 != 0) r = (r * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
        if (abs & 0x20000 != 0) r = (r * 0x5d6af8dedb81196699c329225ee604) >> 128;
        if (abs & 0x40000 != 0) r = (r * 0x2216e584f5fa1ea926041bedfe98) >> 128;
        if (abs & 0x80000 != 0) r = (r * 0x48a170391f7dc42444e8fa2) >> 128;

        if (tick > 0) r = type(uint256).max / r;
        /* Rounding up, as Uniswap does: the value is used as a lower bound
           on what a trade must return, and rounding down would make that
           bound a shade looser than the average it came from. */
        return uint160((r >> 32) + (r % (1 << 32) == 0 ? 0 : 1));
    }
}
