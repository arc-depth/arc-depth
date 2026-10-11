"use strict";
/* ===========================================================================
 * cozucu.js — log'u anlamlı hale getiren taraf
 *
 * NEDEN TABLO build/ DİZİNİNDEN KURULUYOR
 *   topic0 → olay eşlemesi elle yazılmıyor; derlenmiş her sözleşmenin
 *   ABI'sinden otomatik kuruluyor. Yeni bir sözleşme yazıp derlemek, onun
 *   olaylarını çözülebilir yapmaya yetiyor — ayrıca bir yere kaydetmek
 *   gerekmiyor.
 *
 *   Bu, "büyüme mekanizması tasarımın parçası" kuralının buradaki hali.
 *   Elle tutulan bir eşleme, bir olay eklendiği gün sessizce eksik kalır
 *   ve indeksleyici o olayı "çözülemedi" diye bırakır — ki kimse bakmaz.
 *
 * ÇÖZÜLEMEYEN LOG SİLİNMİYOR
 *   `olay` tablosuna her log ham haliyle yazılıyor, çözülüp çözülmediğine
 *   bakılmaksızın. Çözülemeyen bir log bir hata değil: üçüncü taraf bir
 *   sözleşmenin olayı ya da henüz derlemediğimiz bir sürüm olabilir. Ama
 *   SAYISI görünür olmalı, çünkü büyük bir çözülemeyen yığını, eşlemenin
 *   geride kaldığının tek işareti.
 *
 * AYNI topic0 İKİ FARKLI OLAY OLABİLİR
 *   Farklı sözleşmelerde aynı imzaya sahip olaylar aynı topic0'ı taşır ve
 *   bu bir çakışma değil — aynı olaydır. Ama farklı İMZA aynı topic0'a
 *   düşerse (keccak çakışması, pratikte olmaz) ya da bir ad iki farklı
 *   imzayla kaydedilirse bu bir bulgudur ve sayılıyor.
 * =========================================================================== */
const { Interface, id } = require("ethers");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "build");

function imza(e) {
  return e.name + "(" + e.inputs.map((i) => _tip(i)).join(",") + ")";
}

function _tip(i) {
  if (i.type === "tuple") return "(" + i.components.map(_tip).join(",") + ")";
  if (i.type === "tuple[]") return "(" + i.components.map(_tip).join(",") + ")[]";
  return i.type;
}

function tabloKur() {
  const tablo = new Map();     // topic0 -> { ad, imza, abi, kaynaklar:Set }
  const cakisma = [];
  let sozlesme = 0;

  for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith(".json"))) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")); } catch (e) { continue; }
    if (!Array.isArray(j.abi)) continue;
    sozlesme++;
    for (const e of j.abi.filter((x) => x.type === "event")) {
      const s = imza(e);
      const t = id(s);
      const var_ = tablo.get(t);
      if (!var_) {
        tablo.set(t, { ad: e.name, imza: s, abi: e, kaynaklar: new Set([j.contractName || f]) });
      } else {
        var_.kaynaklar.add(j.contractName || f);
        /* Same topic0 with a different signature would mean a real
           collision. Recorded rather than overwritten, because silently
           keeping one of the two is how a log gets decoded as the wrong
           event. */
        if (var_.imza !== s) cakisma.push({ topic0: t, a: var_.imza, b: s });
      }
    }
  }
  return { tablo, cakisma, sozlesme };
}

class Cozucu {
  constructor() {
    const { tablo, cakisma, sozlesme } = tabloKur();
    this.tablo = tablo;
    this.cakisma = cakisma;
    this.sozlesmeSayisi = sozlesme;
    this._iface = new Map();
  }

  /// Decode one log, or return null. Never throws: a log this cannot read
  /// still has to be stored, and an exception in the middle of a window
  /// would abandon the whole window's work.
  coz(log) {
    const t = (log.topics && log.topics[0]) || null;
    if (!t) return null;
    const kayit = this.tablo.get(t.toLowerCase()) || this.tablo.get(t);
    if (!kayit) return null;

    let iface = this._iface.get(kayit.imza);
    if (!iface) {
      iface = new Interface([kayit.abi]);
      this._iface.set(kayit.imza, iface);
    }
    try {
      const sonuc = iface.parseLog({ topics: log.topics, data: log.data });
      if (!sonuc) return null;
      const alanlar = {};
      sonuc.fragment.inputs.forEach((inp, i) => {
        const v = sonuc.args[i];
        alanlar[inp.name || String(i)] =
          typeof v === "bigint" ? v.toString() : String(v);
      });
      return { ad: kayit.ad, imza: kayit.imza, alanlar };
    } catch (e) {
      return null;
    }
  }

  ozet() {
    return {
      olaySayisi: this.tablo.size,
      sozlesmeSayisi: this.sozlesmeSayisi,
      cakisma: this.cakisma
    };
  }
}

module.exports = { Cozucu, imza };
