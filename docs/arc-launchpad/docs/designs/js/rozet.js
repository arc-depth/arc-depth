/* ===========================================================================
 * designs/js/rozet.js — the Verified designer badge, computed in the browser
 *
 * Nobody grants it and nothing about anyone is stored: every visitor's
 * browser computes it from public Arc history, so anyone can check it.
 *
 * THE RULE (shown on #/verified):
 *   A wallet is a Verified designer when it has
 *     - at least 3 completed sales, or
 *     - at least 1 completed sale and an on-chain profile (a name or a
 *       @handle in ProfilKaydi),
 *   and no strike.
 *   A completed sale = a TasarimNFT2 sale of one of its own designs whose
 *   payment was released to it (SatisKapandi paid to the seller), or a
 *   commission paid to it (SiparisKaydi Odendi).
 *   A strike = a report the moderator upheld: a copy challenge upheld on one
 *   of its designs (ItirazCozuldu kabul), a takedown of one of its designs
 *   (Kaldirildi), or its profile hidden by the moderator (ProfilKaydi
 *   gizli). Reports filed in YorumKaydi count only once the moderator acts
 *   on them in one of these ways; a report alone is not a strike.
 * =========================================================================== */
import { el, S, SO } from "./ortak.js";

export const KURAL = { satis: 3, satisProfille: 1 };
export const KURAL_METNI = "At least 3 completed sales, or 1 completed sale plus an on-chain profile (name or @handle), and no report upheld by the moderator (no copy challenge upheld, no takedown, profile not hidden).";

let _veri = null, _zaman = 0;
/** Sales and strikes per designer (lowercase address), from the public events. One read per page load (60 s). */
export function rozetVerisi() {
  if (_veri && Date.now() - _zaman < 60_000) return _veri;
  _zaman = Date.now();
  _veri = (async () => {
    const p = await S.arc();
    const ifc = S.ifc;
    const konu = (ad) => { try { return ifc.getEvent(ad).topicHash; } catch (e) { return null; } };
    const [yayin, kapandi, cozuldu, kaldirildi] = await Promise.all([
      S.yayinlar(),
      p.getLogs({ address: S.TASARIM.adres, topics: [konu("SatisKapandi")], fromBlock: S.TASARIM.baslangicBloku, toBlock: "latest" }).catch(() => []),
      p.getLogs({ address: S.TASARIM.adres, topics: [konu("ItirazCozuldu")], fromBlock: S.TASARIM.baslangicBloku, toBlock: "latest" }).catch(() => []),
      p.getLogs({ address: S.TASARIM.adres, topics: [konu("Kaldirildi")], fromBlock: S.TASARIM.baslangicBloku, toBlock: "latest" }).catch(() => [])
    ]);
    const tasarimciOf = new Map(yayin.map((t) => [t.id, t.tasarimci.toLowerCase()]));
    const satis = new Map(), sorun = new Map();
    const art = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    for (const l of kapandi) {
      const a = ifc.parseLog(l).args;
      const t = tasarimciOf.get(Number(a.id));
      if (a.saticiyaOdendi && t && String(a.kime).toLowerCase() === t) art(satis, t);
    }
    for (const l of cozuldu) { const a = ifc.parseLog(l).args; const t = tasarimciOf.get(Number(a.id)); if (a.kabul && t) art(sorun, t); }
    for (const l of kaldirildi) { const a = ifc.parseLog(l).args; const t = tasarimciOf.get(Number(a.id)); if (t) art(sorun, t); }
    try {
      const Si = await import("./siparis.js");
      for (const o of await Si.odenenIsler()) art(satis, o.tasarimci.toLowerCase());
    } catch (e) { /* commissions not readable: sales on TasarimNFT2 still count */ }
    return { satis, sorun };
  })();
  _veri.catch(() => { _veri = null; });
  return _veri;
}

/** {dogrulandi, satis, profil, sorun, gizli} for one wallet. */
export async function rozetDurumu(adres) {
  const k = String(adres || "").toLowerCase();
  const v = await rozetVerisi();
  const satis = v.satis.get(k) || 0;
  let profil = false, gizli = false;
  if (SO.PROFIL_VAR) {
    const pr = await SO.profilOku(adres).catch(() => null);
    if (pr) { profil = !!(pr.ad || pr.kullaniciAdi); gizli = !!pr.gizli; }
  }
  const sorun = (v.sorun.get(k) || 0) + (gizli ? 1 : 0);
  const dogrulandi = sorun === 0 && (satis >= KURAL.satis || (satis >= KURAL.satisProfille && profil));
  return { dogrulandi, satis, profil, sorun, gizli };
}

const ONAY = '<svg viewBox="0 0 24 24" width="SZ" height="SZ" aria-hidden="true"><path d="M12 2.6 14.6 5l3.5-.3.8 3.4 3 1.9-1.4 3.2 1.4 3.2-3 1.9-.8 3.4-3.5-.3L12 23.4 9.4 21l-3.5.3-.8-3.4-3-1.9L3.5 12.8 2.1 9.6l3-1.9.8-3.4 3.5.3z" fill="currentColor"/><path d="m8 12.4 2.7 2.7L16.2 9.6" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** An inline badge that appears only when the wallet is verified (empty otherwise). */
export function rozet(adres, boy = 16, { baglanti = true } = {}) {
  /* inside a link (a design tile) it is a plain span: links do not nest */
  const s = baglanti ? el("a", { sinif: "dz-rozet-dogru", attr: { href: "#/verified", hidden: "", "aria-label": "Verified designer", title: "Verified designer: " + KURAL_METNI } })
    : el("span", { sinif: "dz-rozet-dogru", attr: { hidden: "", role: "img", "aria-label": "Verified designer", title: "Verified designer" } });
  s.innerHTML = ONAY.replace(/SZ/g, String(boy));
  s.addEventListener("click", (e) => e.stopPropagation());
  rozetDurumu(adres).then((d) => { if (d.dogrulandi) s.hidden = false; }).catch(() => {});
  return s;
}

/** #/verified: the rule, and (with ?a=0x…) one wallet's figures. */
export async function kuralSayfasi({ param }) {
  const kap = el("div", { sinif: "dz-dogru-sayfa" });
  kap.append(el("div", { sinif: "dz-sayfa-ust" }, [el("h1", {}, ["Verified designer ", rozet("0x0", 22)]), el("p", { yazi: "A badge computed in your browser from public Arc history. Nobody grants it, nobody can buy it, and nothing about anyone is stored." })]));
  kap.querySelector(".dz-rozet-dogru").hidden = false;
  kap.append(el("div", { sinif: "ds-kutu" }, [
    el("h2", { yazi: "The rule" }),
    el("p", { yazi: KURAL_METNI }),
    el("ul", { sinif: "dz-dogru-liste" }, [
      el("li", { yazi: "A completed sale is a sale of the designer's own design on Designs whose payment was released to them after the file key was delivered, or a commission (Jobs) paid to them." }),
      el("li", { yazi: "A profile means a name or an @handle written on Arc (ProfilKaydi)." }),
      el("li", { yazi: "A strike is a report the moderator upheld: a copy challenge upheld on one of their designs, a takedown, or the profile hidden. A report alone (Report button) is not a strike until the moderator acts on it." }),
      el("li", { yazi: "The badge updates by itself: one strike removes it, everywhere, for every visitor." })]),
    el("p", { sinif: "ds-cihaz", yazi: "Verified means a track record on Arc, not an identity check: ARC PULSE has no accounts, no KYC and keeps no data about anyone." })]));
  const a = param && param.get("a");
  if (/^0x[0-9a-fA-F]{40}$/.test(a || "")) {
    const d = await rozetDurumu(a);
    kap.append(el("div", { sinif: "ds-kutu", attr: { "data-dogru": String(d.dogrulandi) } }, [el("h2", { yazi: d.dogrulandi ? "This wallet is verified" : "This wallet is not verified yet" }),
      el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Completed sales" }), el("span", { yazi: String(d.satis) })]),
      el("div", { sinif: "ds-satir" }, [el("span", { yazi: "On-chain profile" }), el("span", { yazi: d.profil ? "yes" : "no" })]),
      el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Strikes" }), el("span", { yazi: String(d.sorun) })])]));
  }
  return kap;
}
