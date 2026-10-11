"use strict";
/* ===========================================================================
 * kaynak.js — zinciri okuyan taraf
 *
 * ÖLÇÜLMÜŞ KISITLAR, VARSAYILMIŞ DEĞİL
 *   Arc'ın genel RPC'si `eth_getLogs` için iki ayrı sınır uyguluyor ve
 *   ikisi de ölçüldü:
 *
 *     ARALIK   toBlock - fromBlock en çok 9.999. 10.000 "requested range
 *              too large" ile reddediliyor; 9.999 geçiyor. İkili aramayla
 *              bulundu, tahmin edilmedi.
 *
 *     HIZ      istekler ayrıca "rate limit exceeded" ile reddediliyor ve
 *              bu reddin aralıkla ilgisi yok — test setleri aynı RPC'yi
 *              kullanırken 1.000 bloklu istek bile reddedildi.
 *
 *   İkisinin birleşimi şunu söylüyor: 25,25 milyon bloklu tam geçmiş 2.526
 *   pencere eder. Bu, geri çekilmeli ve kaldığı yerden devam eden bir
 *   tarayıcıyla bir buçuk saatlik iş; tek seferde bitmesi beklenen bir iş
 *   DEĞİL. Kesintiden devam etmek olağan hal.
 *
 * NEDEN HER PENCERE KENDİ İŞLEMİNDE YAZILIYOR
 *   Bir pencerenin logları ve imlecin ilerlemesi aynı veritabanı işleminde
 *   gidiyor. Böylece çöküş hiçbir zaman imleci, okuduğunu iddia ettiği
 *   verinin önünde bırakamaz. Olayların anahtarı da (zincir, islem_hash,
 *   log_indeksi) olduğundan, aynı pencereyi yeniden taramak zararsız —
 *   yani "biraz geriden devam et" güvenli bir seçim.
 * =========================================================================== */

/* Measured, not chosen: 9,999 passes and 10,000 does not. */
const AZAMI_PENCERE = 9_999;

/* Rate-limit backoff. Starts polite and doubles; capped so a long stall
   does not become an infinite sleep. */
const ILK_GECIKME = 1_000;
const AZAMI_GECIKME = 32_000;
const AZAMI_DENEME = 8;

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const HIZ_KALIBI = /rate limit|too many|429|exceeded/i;
const ARALIK_KALIBI = /range too large|exceeds max block range|too many results|query returned more than/i;

class Zincir {
  constructor(rpc, zincirId, opts) {
    this.rpc = rpc;
    this.zincirId = zincirId;
    this.istek = 0;
    this.red = 0;
    /* A floor between requests, so a tight loop does not spend its whole
       budget discovering the rate limit over and over. */
    this.araVer = (opts && opts.araVer) || 250;
    this.sonIstek = 0;
  }

  async _cagir(m, p) {
    const bosluk = Date.now() - this.sonIstek;
    if (bosluk < this.araVer) await bekle(this.araVer - bosluk);
    this.sonIstek = Date.now();
    this.istek++;

    const r = await fetch(this.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.istek, method: m, params: p }),
      signal: AbortSignal.timeout(60_000)
    });
    return r.json();
  }

  /// A call that retries ONLY on rate limiting. Anything else is returned
  /// as an error, because retrying a malformed request just burns the
  /// quota that the retry-worthy calls need.
  async cagir(m, p) {
    let gecikme = ILK_GECIKME;
    for (let k = 0; k < AZAMI_DENEME; k++) {
      let j;
      try {
        j = await this._cagir(m, p);
      } catch (e) {
        /* A timeout or a socket error. Worth retrying, same as a rate
           limit — the request never reached a decision. */
        this.red++;
        if (k === AZAMI_DENEME - 1) throw e;
        await bekle(gecikme);
        gecikme = Math.min(gecikme * 2, AZAMI_GECIKME);
        continue;
      }
      if (!j.error) return j.result;
      if (!HIZ_KALIBI.test(j.error.message)) {
        const e = new Error(j.error.message);
        e.aralikMi = ARALIK_KALIBI.test(j.error.message);
        e.data = j.error.data;
        throw e;
      }
      this.red++;
      if (k === AZAMI_DENEME - 1) {
        throw new Error("hiz siniri " + AZAMI_DENEME + " denemede gecilemedi");
      }
      await bekle(gecikme);
      gecikme = Math.min(gecikme * 2, AZAMI_GECIKME);
    }
  }

  async blokNo() {
    return Number(BigInt(await this.cagir("eth_blockNumber", [])));
  }

  async blokZamani(no) {
    const b = await this.cagir("eth_getBlockByNumber", ["0x" + no.toString(16), false]);
    return b ? Number(BigInt(b.timestamp)) : null;
  }

  /// Logs for one window. The window is capped here rather than at the
  /// caller, so no caller can accidentally ask for a range the node will
  /// refuse — and if a node ever tightens the limit, HALVING is the
  /// response, because a smaller window is always valid.
  async loglar(adresler, ilk, son) {
    if (son - ilk > AZAMI_PENCERE) {
      throw new Error("pencere " + (son - ilk) + " > " + AZAMI_PENCERE);
    }
    const sorgu = {
      fromBlock: "0x" + ilk.toString(16),
      toBlock: "0x" + son.toString(16)
    };
    if (adresler && adresler.length) sorgu.address = adresler;

    try {
      return await this.cagir("eth_getLogs", [sorgu]);
    } catch (e) {
      /* The node refused the range even inside the measured limit — too
         many results, most likely. Halve and recurse: the sum of the two
         halves is exactly the same set of logs, and the event key makes
         an overlap harmless anyway. */
      if (e.aralikMi && son > ilk) {
        const orta = ilk + Math.floor((son - ilk) / 2);
        const a = await this.loglar(adresler, ilk, orta);
        const b = await this.loglar(adresler, orta + 1, son);
        return a.concat(b);
      }
      throw e;
    }
  }

  /// Walk `ilk..son` in windows, handing each window's logs to `isle`.
  /// `isle` is called with (loglar, pencereIlk, pencereSon) and is where
  /// the caller writes its transaction — the cursor moves inside it, not
  /// here, so the two can never disagree.
  async tara(adresler, ilk, son, isle) {
    let p = ilk;
    while (p <= son) {
      const ucu = Math.min(p + AZAMI_PENCERE, son);
      const loglar = await this.loglar(adresler, p, ucu);
      await isle(loglar, p, ucu);
      p = ucu + 1;
    }
  }

  durum() {
    return { istek: this.istek, red: this.red };
  }
}

module.exports = { Zincir, AZAMI_PENCERE };
