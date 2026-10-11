/* ===========================================================================
 * teminat-listesi.js — ÖNERİLEN 50 TEMİNAT VARLIĞI
 *
 * BU DOSYA ÜRETİLDİ — elle düzenlenmemeli.
 *   Kaynak: teminat-derinlik.json
 *   Üreten: scripts/kur-teminat-listesi.js
 *   Ölçüm:  2026-10-10T18:57:03.336Z
 *
 * NASIL ÖLÇÜLDÜ — ÖLÇÜT DOĞRUDAN YAPILACAK İŞİN KENDİSİ
 *   Her satırın arkasında dört zincir ölçümü var: en derin USDC havuzu
 *   bulundu, likiditesi okundu, gözlem geçmişi kontrol edildi ve dört
 *   ayrı tutarda GERÇEKTEN dönüştürülebilir mi diye Uniswap'in kendi
 *   kotasına soruldu.
 *
 *   Likidite tabanı, piyasa değeri eşiği gibi vekil kalite kapıları
 *   kullanılmadı. Sorulan şey bir eşik değil: bu tutar bu havuzda
 *   dönüştürülebiliyor mu.
 *
 * NEDEN TEK BİR "ÇALIŞIYOR" YOK
 *   Fiyatın ölçülebilmesi, o havuzda İŞLEM yapılabileceği anlamına
 *   gelmiyor. Ölçüldü: SHIB'in fiyatı %0,00 tutarlı okunuyor ama
 *   $2.000'lık işlem fiyatı 17,5 kat ittiriyor, çünkü SHIB'in likiditesi
 *   SHIB/USDC'de değil SHIB/WETH'te. Taban marjinal fiyattan türetildiği
 *   için böyle bir dönüşüm REDDEDİLİR.
 *
 *   O yüzden her varlık kaldırdığı EN BÜYÜK tutarla kayıtlı:
 *      $20,000 kadar: 24 varlık
 *       $2,000 kadar: 46 varlık
 *         $200 kadar: 64 varlık
 *          $20 kadar: 73 varlık
 *
 *   Asgari teminat $20 (ASGARI_TEMINAT = 20e6) ama teminat her işlemin
 *   vergisiyle büyüyor ve tavanı yok — bu yüzden tek bir eşik yanlış
 *   cevap olurdu.
 *
 * BU LİSTE BİR KAPI DEĞİL
 *   Launch yapan bu 50 taneden birini seçebilir ya da KONTRAT ADRESİ
 *   yapıştırıp başka bir token seçebilir. Listede olmamak yasak olmak
 *   değil — sayfa CA için de aynı ölçümü yapıyor.
 *
 *   Dönüştürülebildiği ölçülen 73 varlığın 23 tanesi listeye girmedi ve
 *   hepsi CA ile seçilebilir:
 *   ELSA GUSD TOSHI USDP BASECAT FLUX LDO TRUST BITCOIN FET FUN1 ONDO SEAM TOWNS 1INCH cbETH ZEN LUSD REPPO WLD GRT OPG PLUME
 * =========================================================================== */

export const TEMINAT_OLCUMU = "2026-10-10T18:57:03.336Z";

/* The sizes the measurement asked about, smallest first. */
export const OLCULEN_TUTARLAR = ["20000000", "200000000", "2000000000", "20000000000"];

/* How many of the measured assets clear each size. Stated so the page can
   say what it found instead of a bare yes. */
export const DAGILIM = [
  { tutar: "20000000000", adet: 24 },
  { tutar: "2000000000", adet: 46 },
  { tutar: "200000000", adet: 64 },
  { tutar: "20000000", adet: 73 }
];

export const ONERILEN = [
  {
    simge: "USDT",
    ad: "Tether USD",
    ondalik: 6,
    havuz: 20,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0xdAC17F958D2ee523a2206206994597C13D831ec7", kademe: 100, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0001 },
      base: { token: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", kademe: 100, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0002 },
      optimism: { token: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", kademe: 100, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0005 },
      polygon: { token: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", kademe: 100, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0001 },
      avalanche: { token: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", kademe: 100, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0002 }
    }
  },
  {
    simge: "WETH",
    ad: "Wrapped Ether",
    ondalik: 18,
    havuz: 20,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", kademe: 3000, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0031 },
      base: { token: "0x4200000000000000000000000000000000000006", kademe: 3000, havuz: 4, azamiTutar: "20000000000", ittirme: 1.003 },
      arbitrum: { token: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", kademe: 500, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0006 },
      optimism: { token: "0x4200000000000000000000000000000000000006", kademe: 3000, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0034 },
      polygon: { token: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", kademe: 500, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0086 }
    }
  },
  {
    simge: "DAI",
    ad: "Dai Stablecoin",
    ondalik: 18,
    havuz: 18,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0x6B175474E89094C44Da98b954EedeAC495271d0F", kademe: 100, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0001 },
      base: { token: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", kademe: 100, havuz: 4, azamiTutar: "2000000000", ittirme: 1.3437 },
      arbitrum: { token: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", kademe: 100, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0001 },
      optimism: { token: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", kademe: 100, havuz: 2, azamiTutar: "2000000000", ittirme: 1.3747 },
      polygon: { token: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", kademe: 100, havuz: 4, azamiTutar: "2000000000", ittirme: 2.6904 }
    }
  },
  {
    simge: "WBTC",
    ad: "Wrapped BTC",
    ondalik: 8,
    havuz: 16,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", kademe: 3000, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0033 },
      arbitrum: { token: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", kademe: 500, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0008 },
      optimism: { token: "0x68f180fcCe6836688e9084f035309E29Bf0A2095", kademe: 3000, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0223 },
      polygon: { token: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", kademe: 3000, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0131 }
    }
  },
  {
    simge: "AAVE",
    ad: "Aave",
    ondalik: 18,
    havuz: 14,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", kademe: 3000, havuz: 3, azamiTutar: "200000000", ittirme: 1.0908 },
      base: { token: "0x63706e401c06ac8513145b7687A14804d17f814b", kademe: 3000, havuz: 3, azamiTutar: "2000000000", ittirme: 1.0506 },
      arbitrum: { token: "0xba5DdD1f9d7F570dc94a51479a000E3BCE967196", kademe: 3000, havuz: 4, azamiTutar: "2000000000", ittirme: 1.0649 },
      polygon: { token: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", kademe: 3000, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0252 }
    }
  },
  {
    simge: "USDC.e",
    ad: "Bridged USDC",
    ondalik: 6,
    havuz: 12,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      arbitrum: { token: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", kademe: 100, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0001 },
      optimism: { token: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", kademe: 100, havuz: 4, azamiTutar: "2000000000", ittirme: 1.3783 },
      polygon: { token: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", kademe: 100, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0001 }
    }
  },
  {
    simge: "LINK",
    ad: "ChainLink Token",
    ondalik: 18,
    havuz: 11,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0x514910771AF9Ca656af840dff83E8264EcF986CA", kademe: 3000, havuz: 3, azamiTutar: "20000000000", ittirme: 1.0101 },
      arbitrum: { token: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", kademe: 3000, havuz: 4, azamiTutar: "2000000000", ittirme: 1.2398 },
      polygon: { token: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", kademe: 3000, havuz: 4, azamiTutar: "2000000000", ittirme: 1.0377 }
    }
  },
  {
    simge: "cbBTC",
    ad: "Coinbase Wrapped BTC",
    ondalik: 8,
    havuz: 8,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", kademe: 3000, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0264 },
      base: { token: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", kademe: 500, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0008 }
    }
  },
  {
    simge: "EURC",
    ad: "Euro Coin",
    ondalik: 6,
    havuz: 7,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c", kademe: 500, havuz: 3, azamiTutar: "20000000000", ittirme: 1.0007 },
      base: { token: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", kademe: 500, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0131 }
    }
  },
  {
    simge: "MORPHO",
    ad: "Morpho Token",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      base: { token: "0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842", kademe: 10000, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0228 }
    }
  },
  {
    simge: "PAXG",
    ad: "PAX Gold",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0x45804880De22913dAFE09f4980848ECE6EcbAf78", kademe: 500, havuz: 4, azamiTutar: "20000000000", ittirme: 1.002 }
    }
  },
  {
    simge: "PYUSD",
    ad: "PayPal USD",
    ondalik: 6,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8", kademe: 100, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0001 }
    }
  },
  {
    simge: "USDT0",
    ad: "USDT0",
    ondalik: 6,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      arbitrum: { token: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", kademe: 100, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0001 }
    }
  },
  {
    simge: "VIRTUAL",
    ad: "Virtuals Protocol",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      base: { token: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b", kademe: 3000, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0088 }
    }
  },
  {
    simge: "WAVAX",
    ad: "Wrapped AVAX",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      avalanche: { token: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", kademe: 500, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0011 }
    }
  },
  {
    simge: "XAUT",
    ad: "Tether Gold",
    ondalik: 6,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0x68749665FF8D2d112Fa859AA293F07A622782F38", kademe: 3000, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0268 }
    }
  },
  {
    simge: "XDP",
    ad: "Doppler",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      base: { token: "0x07b3D902783c3C12b077508c3B5c00113d1291D0", kademe: 100, havuz: 4, azamiTutar: "20000000000", ittirme: 1.0041 }
    }
  },
  {
    simge: "FRAX",
    ad: "Frax",
    ondalik: 18,
    havuz: 3,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0x853d955aCEf822Db058eb8505911ED77F175b99e", kademe: 500, havuz: 3, azamiTutar: "20000000000", ittirme: 1.0024 }
    }
  },
  {
    simge: "VVV",
    ad: "Venice Token",
    ondalik: 18,
    havuz: 3,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      base: { token: "0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf", kademe: 3000, havuz: 3, azamiTutar: "20000000000", ittirme: 1.0213 }
    }
  },
  {
    simge: "ADI",
    ad: "ADI",
    ondalik: 18,
    havuz: 2,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0x8B1484d57abBE239bB280661377363b03c89CaEa", kademe: 500, havuz: 2, azamiTutar: "20000000000", ittirme: 1.0048 }
    }
  },
  {
    simge: "AEVO",
    ad: "Aevo",
    ondalik: 18,
    havuz: 2,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0xB528edBef013aff855ac3c50b381f253aF13b997", kademe: 3000, havuz: 2, azamiTutar: "20000000000", ittirme: 1.0264 }
    }
  },
  {
    simge: "AUSD",
    ad: "AUSD",
    ondalik: 6,
    havuz: 2,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a", kademe: 100, havuz: 2, azamiTutar: "20000000000", ittirme: 1.0001 }
    }
  },
  {
    simge: "RLUSD",
    ad: "RLUSD",
    ondalik: 18,
    havuz: 1,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0x8292Bb45bf1Ee4d140127049757C2E0fF06317eD", kademe: 100, havuz: 1, azamiTutar: "20000000000", ittirme: 1.0001 }
    }
  },
  {
    simge: "USDG",
    ad: "Global Dollar",
    ondalik: 6,
    havuz: 1,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "20000000000",
    zincirler: {
      ethereum: { token: "0xe343167631d89B6Ffc58B88d6b7fB0228795491D", kademe: 100, havuz: 1, azamiTutar: "20000000000", ittirme: 1.0002 }
    }
  },
  {
    simge: "UNI",
    ad: "Uniswap",
    ondalik: 18,
    havuz: 15,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      ethereum: { token: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", kademe: 3000, havuz: 4, azamiTutar: "2000000000", ittirme: 1.0369 },
      base: { token: "0xc3De830EA07524a0761646a6a4e4be0e114a3C83", kademe: 10000, havuz: 4, azamiTutar: "2000000000", ittirme: 1.1237 },
      arbitrum: { token: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0", kademe: 3000, havuz: 4, azamiTutar: "2000000000", ittirme: 1.0616 },
      polygon: { token: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f", kademe: 3000, havuz: 3, azamiTutar: "200000000", ittirme: 5.182 }
    }
  },
  {
    simge: "AERO",
    ad: "Aerodrome Finance",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      base: { token: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", kademe: 500, havuz: 4, azamiTutar: "2000000000", ittirme: 1.0346 }
    }
  },
  {
    simge: "AIXBT",
    ad: "aixbt by Virtuals",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      base: { token: "0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825", kademe: 3000, havuz: 4, azamiTutar: "2000000000", ittirme: 1.1284 }
    }
  },
  {
    simge: "ARB",
    ad: "Arbitrum",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      arbitrum: { token: "0x912CE59144191C1204E64559FE8253a0e49E6548", kademe: 3000, havuz: 4, azamiTutar: "2000000000", ittirme: 1.0518 }
    }
  },
  {
    simge: "GMX",
    ad: "GMX",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      arbitrum: { token: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", kademe: 10000, havuz: 4, azamiTutar: "2000000000", ittirme: 1.0943 }
    }
  },
  {
    simge: "ICNT",
    ad: "Impossible Cloud Network",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      base: { token: "0xE0Cd4cAcDdcBF4f36e845407CE53E87717b6601d", kademe: 500, havuz: 4, azamiTutar: "2000000000", ittirme: 1.1488 }
    }
  },
  {
    simge: "OP",
    ad: "Optimism",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      optimism: { token: "0x4200000000000000000000000000000000000042", kademe: 3000, havuz: 4, azamiTutar: "2000000000", ittirme: 1.0587 }
    }
  },
  {
    simge: "PENDLE",
    ad: "Pendle",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      arbitrum: { token: "0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8", kademe: 3000, havuz: 4, azamiTutar: "2000000000", ittirme: 1.0566 }
    }
  },
  {
    simge: "USDbC",
    ad: "USD Base Coin",
    ondalik: 6,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      base: { token: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", kademe: 100, havuz: 4, azamiTutar: "2000000000", ittirme: 7.9494 }
    }
  },
  {
    simge: "WMATIC",
    ad: "Wrapped Matic",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      polygon: { token: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", kademe: 500, havuz: 4, azamiTutar: "2000000000", ittirme: 1.0359 }
    }
  },
  {
    simge: "XSGD",
    ad: "XSGD",
    ondalik: 6,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      polygon: { token: "0xDC3326e71D45186F113a2F448984CA0e8D201995", kademe: 500, havuz: 4, azamiTutar: "2000000000", ittirme: 2.0847 }
    }
  },
  {
    simge: "ZORA",
    ad: "Zora",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      base: { token: "0x1111111111166b7FE7bd91427724B487980aFc69", kademe: 3000, havuz: 4, azamiTutar: "2000000000", ittirme: 1.091 }
    }
  },
  {
    simge: "agEUR",
    ad: "agEur",
    ondalik: 18,
    havuz: 3,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      ethereum: { token: "0x1a7e4e63778B4f12a199C062f3eFdD288afCBce8", kademe: 100, havuz: 3, azamiTutar: "2000000000", ittirme: 1.1347 }
    }
  },
  {
    simge: "DOLO",
    ad: "Dolomite",
    ondalik: 18,
    havuz: 3,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      ethereum: { token: "0x0F81001eF0A83ecCE5ccebf63EB302c70a39a654", kademe: 3000, havuz: 3, azamiTutar: "2000000000", ittirme: 1.1267 }
    }
  },
  {
    simge: "EDGE",
    ad: "Definitive",
    ondalik: 18,
    havuz: 3,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      base: { token: "0xED6E000dEF95780fb89734c07EE2ce9F6dcAf110", kademe: 3000, havuz: 3, azamiTutar: "2000000000", ittirme: 1.7053 }
    }
  },
  {
    simge: "FLOCK",
    ad: "Flock",
    ondalik: 18,
    havuz: 3,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      base: { token: "0x5aB3D4c385B400F3aBB49e80DE2fAF6a88A7B691", kademe: 3000, havuz: 3, azamiTutar: "2000000000", ittirme: 1.2239 }
    }
  },
  {
    simge: "USDS",
    ad: "USDS Stablecoin",
    ondalik: 18,
    havuz: 3,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      ethereum: { token: "0xdC035D45d973E3EC169d2276DDab16f1e407384F", kademe: 3000, havuz: 3, azamiTutar: "2000000000", ittirme: 3.3277 }
    }
  },
  {
    simge: "cbXRP",
    ad: "Coinbase Wrapped XRP",
    ondalik: 6,
    havuz: 2,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      base: { token: "0xcb585250f852C6c6bf90434AB21A00f02833a4af", kademe: 10000, havuz: 2, azamiTutar: "2000000000", ittirme: 1.0905 }
    }
  },
  {
    simge: "EIGEN",
    ad: "EigenLayer",
    ondalik: 18,
    havuz: 2,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      ethereum: { token: "0xec53bF9167f50cDEB3Ae105f56099aaaB9061F83", kademe: 10000, havuz: 2, azamiTutar: "2000000000", ittirme: 1.9422 }
    }
  },
  {
    simge: "PROMPT",
    ad: "Prompt",
    ondalik: 18,
    havuz: 2,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      base: { token: "0x30c7235866872213F68cb1F08c37Cb9eCCB93452", kademe: 3000, havuz: 2, azamiTutar: "2000000000", ittirme: 1.3286 }
    }
  },
  {
    simge: "SPX",
    ad: "SPX6900",
    ondalik: 8,
    havuz: 2,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      base: { token: "0x50dA645f148798F68EF2d7dB7C1CB22A6819bb2C", kademe: 10000, havuz: 2, azamiTutar: "2000000000", ittirme: 1.1088 }
    }
  },
  {
    simge: "cbZEC",
    ad: "Coinbase Wrapped ZEC",
    ondalik: 8,
    havuz: 1,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "2000000000",
    zincirler: {
      base: { token: "0xB2000000000000000000008501b13360000cb2EC", kademe: 10000, havuz: 1, azamiTutar: "2000000000", ittirme: 1.1493 }
    }
  },
  {
    simge: "CRV",
    ad: "Curve DAO Token",
    ondalik: 18,
    havuz: 13,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "200000000",
    zincirler: {
      ethereum: { token: "0xD533a949740bb3306d119CC777fa900bA034cd52", kademe: 10000, havuz: 4, azamiTutar: "200000000", ittirme: 1.3558 },
      arbitrum: { token: "0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978", kademe: 3000, havuz: 3, azamiTutar: "20000000", ittirme: 4.4752 },
      optimism: { token: "0x0994206dfE8De6Ec6920FF4D779B0d950605Fb53", kademe: 10000, havuz: 2, azamiTutar: "20000000", ittirme: 50.3312 },
      polygon: { token: "0x172370d5Cd63279eFa6d502DAB29171933a610AF", kademe: 3000, havuz: 4, azamiTutar: "20000000", ittirme: 30.9645 }
    }
  },
  {
    simge: "ZRO",
    ad: "LayerZero",
    ondalik: 18,
    havuz: 7,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "200000000",
    zincirler: {
      base: { token: "0x6985884C4392D348587B19cb9eAAf157F13271cd", kademe: 10000, havuz: 3, azamiTutar: "200000000", ittirme: 1.6039 },
      arbitrum: { token: "0x6985884C4392D348587B19cb9eAAf157F13271cd", kademe: 10000, havuz: 4, azamiTutar: "200000000", ittirme: 7.5042 }
    }
  },
  {
    simge: "AVNT",
    ad: "Avantis",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "200000000",
    zincirler: {
      base: { token: "0x696F9436B67233384889472Cd7cD58A6fB5DF4f1", kademe: 10000, havuz: 4, azamiTutar: "200000000", ittirme: 1.2468 }
    }
  },
  {
    simge: "BUSD",
    ad: "Binance USD",
    ondalik: 18,
    havuz: 4,
    /* The largest measured conversion this asset clears the floor at. */
    azamiTutar: "200000000",
    zincirler: {
      ethereum: { token: "0x4Fabb145d64652a948d72533023f6E7A623C7C53", kademe: 500, havuz: 4, azamiTutar: "200000000", ittirme: 13.9133 }
    }
  }
];

/* Which chains the measurement covered, with what a conversion needs to
   reach them: the CCTP domain, the chain's own USDC, the canonical
   Uniswap v3 factory and the quoter that answered there. The page reads
   all of it directly — the same derivation the contract does, so what the
   page shows and what the chain would accept cannot drift. */
export const ZINCIRLER = {
  ethereum: {
    ad: "Ethereum", id: 1, domain: 0,
    rpc: "https://ethereum-rpc.publicnode.com",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"
  },
  base: {
    ad: "Base", id: 8453, domain: 6,
    rpc: "https://base-rpc.publicnode.com",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    v3Fabrika: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"
  },
  arbitrum: {
    ad: "Arbitrum", id: 42161, domain: 3,
    rpc: "https://arbitrum-one-rpc.publicnode.com",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"
  },
  optimism: {
    ad: "Optimism", id: 10, domain: 2,
    rpc: "https://optimism-rpc.publicnode.com",
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"
  },
  polygon: {
    ad: "Polygon", id: 137, domain: 7,
    rpc: "https://polygon-bor-rpc.publicnode.com",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"
  },
  avalanche: {
    ad: "Avalanche", id: 43114, domain: 1,
    rpc: "https://avalanche-c-chain-rpc.publicnode.com",
    usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    v3Fabrika: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD",
    quoter: "0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F"
  },
  unichain: {
    ad: "Unichain", id: 130, domain: 10,
    rpc: "https://unichain-rpc.publicnode.com",
    usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
    v3Fabrika: "0x1F98400000000000000000000000000000000003",
    quoter: null   /* none answered here — depth reads as unmeasured */
  }
};

/* Uniswap v3's canonical fee tiers. A pool cannot exist outside these, so
   scanning all four is exhaustive rather than a heuristic. */
export const KADEMELER = [100, 500, 3000, 10000];
