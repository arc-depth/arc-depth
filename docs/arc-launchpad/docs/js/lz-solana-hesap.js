/* ===========================================================================
 * lz-solana-hesap.js — the accounts LayerZero's Solana endpoint needs for
 * `quote` and `send`, derived from the chain
 *
 * An OApp's CPI into the endpoint passes the endpoint's own accounts, then
 * the send library's (ULN 302) as remaining accounts, then each worker's
 * (the executor, the DVNs) with the price feed it quotes from. Everything is
 * a program-derived address of a public program, or read from the config
 * accounts those programs own:
 *   endpoint  SendLibraryConfig [oapp, eid] / [eid] -> the message library;
 *             MessageLib [library] (its info), Endpoint, Nonce [oapp, eid,
 *             receiver], __event_authority
 *   ULN 302   MessageLib (its settings; treasury), SendConfig [eid, oapp] /
 *             [eid] -> the executor and the DVNs (the OApp's own entries,
 *             else the default), __event_authority
 *   workers   each config account's owner is the worker program; its
 *             price_feed field is the price feed account, whose owner is the
 *             price feed program
 * Account layouts are the programs' Anchor accounts (8-byte discriminator,
 * Borsh fields). Not LayerZero's SDK: written here from those facts.
 * =========================================================================== */

const enc = (s) => new TextEncoder().encode(s);
const eidBE = (e) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, e, false); return b; };

/* a Borsh cursor over an account's data, after the 8-byte discriminator */
function imlec(d, bas = 8) {
  let o = bas;
  const c = {
    u8: () => d[o++],
    u16: () => { const v = d[o] | (d[o + 1] << 8); o += 2; return v; },
    u32: () => { const v = new DataView(d.buffer, d.byteOffset + o, 4).getUint32(0, true); o += 4; return v; },
    u64: () => { const v = new DataView(d.buffer, d.byteOffset + o, 8).getBigUint64(0, true); o += 8; return v; },
    atla: (n) => { o += n; },
    anahtar: () => { const v = d.slice(o, o + 32); o += 32; return v; },
    anahtarlar: () => { const n = c.u32(); const a = []; for (let i = 0; i < n; i++) a.push(c.anahtar()); return a; },
    vektorAtla: (boy) => { const n = c.u32(); o += n * boy; },
  };
  return c;
}
const sifirMi = (b) => b.every((x) => x === 0);

/* ULN 302 SendConfig: bump, UlnConfig { confirmations, required count, optional count, threshold,
   required dvns, optional dvns }, ExecutorConfig { max message size, executor } */
function gonderimAyari(d) {
  if (!d) return null;
  const c = imlec(d);
  c.u8();
  c.u64();
  const zorunluSayi = c.u8(), secmeliSayi = c.u8();
  c.u8();
  const zorunlu = c.anahtarlar(), secmeli = c.anahtarlar();
  c.u32();
  return { zorunluSayi, secmeliSayi, zorunlu, secmeli, yurutucu: c.anahtar() };
}
/* the price feed a worker quotes from: executor config / DVN config field `price_feed` */
function yurutucuFiyat(d) {
  const c = imlec(d);
  c.u8(); c.anahtar();                       // bump, owner
  c.vektorAtla(32); c.vektorAtla(32);        // acl: allow, deny
  c.vektorAtla(32); c.vektorAtla(32); c.vektorAtla(32);   // admins, executors, msglibs
  c.u8(); c.u16();                           // paused, default multiplier
  return c.anahtar();
}
function dvnFiyat(d) {
  const c = imlec(d);
  c.u32(); c.u8();                           // vid, bump
  c.vektorAtla(64); c.u8();                  // multisig: signers (secp256k1, 64 bytes), quorum
  c.vektorAtla(32); c.vektorAtla(32);        // acl
  c.u8();                                    // paused
  c.vektorAtla(32); c.vektorAtla(32);        // msglibs, admins
  return c.anahtar();
}

/// The endpoint CPI accounts for `tur` ("quote" | "send"), in the order the endpoint takes them,
/// the endpoint program first (as LayerZero's CPI helpers expect). No account is marked signer:
/// the OApp signs inside by its seeds, and the caller marks the payer.
export async function lzHesaplari({ conn, PublicKey, endpoint, gonderen, hedefEid, alici32, odeyen, tur }) {
  const EP = new PublicKey(endpoint);
  const S = new PublicKey(gonderen);
  const pda = (tohum, prog) => PublicKey.findProgramAddressSync(tohum, prog)[0];
  const e = eidBE(hedefEid);
  const kutuphaneAyari = pda([enc("SendLibraryConfig"), S.toBytes(), e], EP);
  const varsayilanKutuphane = pda([enc("SendLibraryConfig"), e], EP);
  const [ka, va] = await conn.getMultipleAccountsInfo([kutuphaneAyari, varsayilanKutuphane]);
  if (!va) throw new Error("LayerZero has no send library for eid " + hedefEid + " on Solana.");
  /* SendLibraryConfig { message_lib, bump }: the OApp's own, unless unset */
  let kutuphane = ka && !sifirMi(ka.data.slice(8, 40)) ? ka.data.slice(8, 40) : va.data.slice(8, 40);
  kutuphane = new PublicKey(kutuphane);
  const kutuphaneHesap = await conn.getAccountInfo(kutuphane);
  const ULN = kutuphaneHesap.owner;
  if (!pda([enc("MessageLib")], ULN).equals(kutuphane)) throw new Error("The send library is not a ULN-style library.");
  const kutuphaneBilgi = pda([enc("MessageLib"), kutuphane.toBytes()], EP);
  const uc = pda([enc("Endpoint")], EP);
  const nonce = pda([enc("Nonce"), S.toBytes(), e, alici32], EP);

  /* ULN settings: eid, endpoint, endpoint program, bump, admin, treasury (Option) */
  const ul = imlec(kutuphaneHesap.data);
  ul.u32(); ul.anahtar(); ul.anahtar(); ul.u8(); ul.anahtar();
  if (ul.u8() !== 0) throw new Error("The ULN has a treasury set; this client does not route it yet.");
  const ayar = pda([enc("SendConfig"), e, S.toBytes()], ULN);
  const varsayilanAyar = pda([enc("SendConfig"), e], ULN);
  const [aH, vH] = await conn.getMultipleAccountsInfo([ayar, varsayilanAyar]);
  const oz = gonderimAyari(aH && aH.data), vz = gonderimAyari(vH.data);
  /* the OApp's entry where it has one (count 0 = default, 255 = none) */
  const sec = (sayi, liste, vListe) => (oz && sayi === 255 ? [] : oz && sayi !== 0 ? liste : vListe);
  const yurutucu = oz && !sifirMi(oz.yurutucu) ? oz.yurutucu : vz.yurutucu;
  const dvnler = [...sec(oz && oz.zorunluSayi, oz && oz.zorunlu, vz.zorunlu), ...sec(oz && oz.secmeliSayi, oz && oz.secmeli, vz.secmeli)];

  const isciler = [{ ayar: new PublicKey(yurutucu), fiyat: yurutucuFiyat }, ...dvnler.map((d) => ({ ayar: new PublicKey(d), fiyat: dvnFiyat }))];
  const ayarHesaplari = await conn.getMultipleAccountsInfo(isciler.map((i) => i.ayar));
  const fiyatlar = ayarHesaplari.map((h, i) => new PublicKey(isciler[i].fiyat(h.data)));
  const fiyatHesaplari = await conn.getMultipleAccountsInfo(fiyatlar);
  const yaz = tur === "send";
  const iscHesap = isciler.flatMap((i, k) => [
    { pubkey: ayarHesaplari[k].owner, isWritable: false }, { pubkey: i.ayar, isWritable: yaz },
    { pubkey: fiyatHesaplari[k].owner, isWritable: false }, { pubkey: fiyatlar[k], isWritable: false }]);

  const m = (pubkey, isWritable = false) => ({ pubkey, isSigner: false, isWritable });
  if (tur === "quote") {
    return [m(EP), m(ULN), m(kutuphaneAyari), m(varsayilanKutuphane), m(kutuphaneBilgi), m(uc), m(nonce),
      m(kutuphane), m(ayar), m(varsayilanAyar), ...iscHesap.map((x) => m(x.pubkey, false))];
  }
  const SISTEM = new PublicKey("11111111111111111111111111111111");
  return [m(EP), m(S), m(ULN), m(kutuphaneAyari), m(varsayilanKutuphane), m(kutuphaneBilgi), m(uc), m(nonce, true),
    m(pda([enc("__event_authority")], EP)), m(EP),
    m(kutuphane), m(ayar), m(varsayilanAyar), m(new PublicKey(odeyen), true), m(ULN) /* no treasury: the program id stands for None */,
    m(SISTEM), m(pda([enc("__event_authority")], ULN)), m(ULN), ...iscHesap.map((x) => m(x.pubkey, x.isWritable))];
}
