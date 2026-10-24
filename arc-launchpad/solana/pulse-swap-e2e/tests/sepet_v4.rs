//! v4 of the Solana basket vault: an auction filled from a Raydium CLMM pool,
//! bounded by the pool's own time-weighted average. Runs against Raydium's
//! real program (dumped from mainnet by calistir.sh) and a real pool's
//! accounts read from mainnet at one slot (raydium-dok.js -> fixtures/).
use base64::Engine;
use litesvm::LiteSVM;
use litesvm_token::{get_spl_account, spl_token::state::Account as TokenAccount};
use solana_account::Account;
use solana_address::Address;
use solana_clock::Clock;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

const SYSTEM: Address = Address::from_str_const("11111111111111111111111111111111");
const TOKEN: Address = Address::from_str_const("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA: Address = Address::from_str_const("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const CLMM: Address = Address::from_str_const("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
const SOLANA: u32 = 5;
const BASE: u32 = 6;
const ARC: u32 = 26;
const DEFTER: [u8; 32] = [0xde; 32];
const IKIZ: [u8; 32] = [0xa7; 32];

fn w(a: Address) -> AccountMeta { AccountMeta::new(a, false) }
fn r(a: Address) -> AccountMeta { AccountMeta::new_readonly(a, false) }
fn s(a: Address) -> AccountMeta { AccountMeta::new(a, true) }

fn keypair_file(json: &str) -> Keypair {
    let b: Vec<u8> = json.trim().trim_start_matches('[').trim_end_matches(']').split(',').map(|x| x.trim().parse::<u8>().unwrap()).collect();
    Keypair::try_from(&b[..]).unwrap()
}

/// A pool read from mainnet: name -> (address, account).
struct Dok { zaman: i64, h: std::collections::HashMap<String, (Address, Account)> }

fn dok(ad: &str) -> Dok {
    let yol = format!("{}/fixtures/raydium-{}.json", env!("CARGO_MANIFEST_DIR"), ad);
    let j: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(yol).unwrap()).unwrap();
    let mut h = std::collections::HashMap::new();
    for (k, v) in j["hesaplar"].as_object().unwrap() {
        let adres: Address = v["adres"].as_str().unwrap().parse().unwrap();
        let data = base64::engine::general_purpose::STANDARD.decode(v["veri"].as_str().unwrap()).unwrap();
        let owner: Address = v["sahip"].as_str().unwrap().parse().unwrap();
        h.insert(k.clone(), (adres, Account { lamports: v["lamport"].as_u64().unwrap(), data, owner, executable: false, rent_epoch: 0 }));
    }
    Dok { zaman: j["zaman"].as_i64().unwrap(), h }
}

struct Env { svm: LiteSVM, pid: Address, admin: Keypair, emirci: Keypair, arb: Keypair, d: Dok, usdc: Address, varlik: Address, config: Address }

impl Env {
    fn pda(&self, seeds: &[&[u8]]) -> Address { Address::find_program_address(seeds, &self.pid).0 }
    fn a(&self, ad: &str) -> Address { self.d.h[ad].0 }
    fn bal(&self, a: &Address) -> u64 { get_spl_account::<TokenAccount>(&self.svm, a).map(|x| x.amount).unwrap_or(0) }
    fn oku(&self, a: &Address, o: usize) -> u64 {
        self.svm.get_account(a).map(|x| if x.data.len() >= o + 8 { u64::from_le_bytes(x.data[o..o + 8].try_into().unwrap()) } else { 0 }).unwrap_or(0)
    }
    fn send(&mut self, keys: Vec<AccountMeta>, data: Vec<u8>, signers: &[&Keypair]) -> Result<(), String> {
        self.svm.expire_blockhash();
        let butce = Instruction { program_id: Address::from_str_const("ComputeBudget111111111111111111111111111111"), accounts: vec![],
            data: { let mut d = vec![2u8]; d.extend(1_400_000u32.to_le_bytes()); d } };
        let ix = Instruction { program_id: self.pid, accounts: keys, data };
        let tx = Transaction::new_signed_with_payer(&[butce, ix], Some(&signers[0].pubkey()), signers, self.svm.latest_blockhash());
        self.svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?} {:?}", e.err, e.meta.logs.iter().rev().take(6).collect::<Vec<_>>()))
    }
    /// An SPL token account written directly (the real USDC's mint authority is not ours).
    fn token_hesabi(&mut self, adres: Address, mint: &Address, sahip: &Address, miktar: u64) {
        let mut d = vec![0u8; 165];
        d[0..32].copy_from_slice(mint.as_ref());
        d[32..64].copy_from_slice(sahip.as_ref());
        d[64..72].copy_from_slice(&miktar.to_le_bytes());
        d[108] = 1;
        self.svm.set_account(adres, Account { lamports: 2_039_280, data: d, owner: TOKEN, executable: false, rent_epoch: 0 }).unwrap();
    }
    fn ata(&self, mint: &Address, sahip: &Address) -> Address { Address::find_program_address(&[sahip.as_ref(), TOKEN.as_ref(), mint.as_ref()], &ATA).0 }
    fn depo(&self, mint: &Address) -> Address { self.pda(&[b"depo", mint.as_ref()]) }
    fn ihale(&self, id: u64) -> Address { self.pda(&[b"ihale", &id.to_le_bytes()]) }
    fn dolar(&self, l: u64) -> Address { self.pda(&[b"dolar", &l.to_le_bytes()]) }
    fn bakiye_pda(&self, l: u64) -> Address { self.pda(&[b"bakiye", &l.to_le_bytes(), self.varlik.as_ref()]) }
    fn fiyat(&self) -> Address { self.pda(&[b"fiyat", self.varlik.as_ref()]) }
    fn liste(&self) -> Address { self.pda(&[b"liste", self.varlik.as_ref()]) }
    fn muhur(&self) -> Address { self.pda(&[b"muhur"]) }
    fn sayac(&self) -> u64 { self.oku(&self.config, 101) }
    fn giden(&self, id: u64) -> Address { self.pda(&[b"giden", &id.to_le_bytes()]) }
    fn bitti(&self, id: u64) -> bool { self.svm.get_account(&self.ihale(id)).unwrap().data[2] == 1 }
    fn verilen(&self, id: u64) -> u64 { self.oku(&self.ihale(id), 43) }

    fn liste_ekle(&mut self, havuz: Address) -> Result<(), String> {
        let a = self.admin.insecure_clone();
        let keys = vec![s(a.pubkey()), r(self.config), w(self.liste()), r(self.varlik), r(havuz), r(self.muhur()), r(SYSTEM)];
        self.send(keys, vec![12u8], &[&a])
    }
    fn muhurle(&mut self) -> Result<(), String> {
        let a = self.admin.insecure_clone();
        self.send(vec![s(a.pubkey()), w(self.muhur()), r(SYSTEM)], vec![14u8], &[&a])
    }
    fn defter_degistir(&mut self, defter: [u8; 32], kim: &Keypair) -> Result<(), String> {
        let mut d = vec![13u8];
        d.extend(defter);
        d.extend(IKIZ);
        let k = kim.insecure_clone();
        self.send(vec![s(k.pubkey()), w(self.config), w(self.pda(&[b"defter-degisti"])), r(self.muhur()), r(SYSTEM)], d, &[&k])
    }

    /// The emirci's buy: `dolar` of USDC for launch `l` (an auction opens).
    fn al_emri(&mut self, l: u64, dolar: u64) -> Result<(), String> {
        let id = self.sayac();
        let e = self.emirci.insecure_clone();
        let ed = self.ata(&self.usdc, &e.pubkey());
        let keys = vec![s(e.pubkey()), w(self.config), w(self.dolar(l)), r(self.varlik), r(self.fiyat()), w(self.ihale(id)),
            w(ed), w(self.depo(&self.usdc)), r(SYSTEM), r(TOKEN)];
        let mut d = vec![1u8];
        for x in [l, dolar, 1u64] { d.extend(x.to_le_bytes()); }
        self.send(keys, d, &[&e])
    }
    fn sat_emri(&mut self, l: u64, miktar: u64, arz: u64, hz: u32, alici: Address, payee: Address) -> Result<(), String> {
        let id = self.sayac();
        let gd = self.giden(self.oku(&self.config, 194));
        let e = self.emirci.insecure_clone();
        let keys = vec![s(e.pubkey()), w(self.config), w(self.dolar(l)), w(self.bakiye_pda(l)), r(self.varlik), r(self.fiyat()),
            w(self.ihale(id)), w(self.depo(&self.usdc)), w(payee), w(gd), r(SYSTEM), r(TOKEN)];
        let mut d = vec![2u8];
        for x in [l, miktar, arz] { d.extend(x.to_le_bytes()); }
        d.push(1);
        d.extend(hz.to_le_bytes());
        d.extend(alici.as_ref());
        self.send(keys, d, &[&e])
    }

    /// Raydium's accounts for a swap with the dollar going in (`dolar_girer`) or out.
    fn raydium(&self, dolar_girer: bool, diziler: &[&str]) -> Vec<AccountMeta> {
        let dolar_sifir = self.d.h["mint0"].0 == self.usdc;
        let (vd, vv) = if dolar_sifir { ("vault0", "vault1") } else { ("vault1", "vault0") };
        let (gv, cv) = if dolar_girer { (vd, vv) } else { (vv, vd) };
        let mut v = vec![r(CLMM), r(self.a("amm_config")), w(self.a("havuz")), w(self.a(gv)), w(self.a(cv)), w(self.a("gozlem"))];
        for d in diziler { v.push(w(self.a(d))); }
        v
    }
    fn takas_al(&mut self, id: u64, l: u64, diziler: &[&str]) -> Result<(), String> {
        let a = self.arb.insecure_clone();
        let ad = self.ata(&self.usdc, &a.pubkey());
        let mut keys = vec![s(a.pubkey()), w(self.config), w(self.dolar(l)), w(self.bakiye_pda(l)), w(self.fiyat()), w(self.ihale(id)),
            r(self.varlik), w(self.depo(&self.varlik)), w(self.depo(&self.usdc)), w(ad), r(self.liste()), r(SYSTEM), r(TOKEN)];
        keys.extend(self.raydium(true, diziler));
        let mut d = vec![10u8];
        d.extend(id.to_le_bytes());
        self.send(keys, d, &[&a])
    }
    fn takas_sat(&mut self, id: u64, payee: Address, diziler: &[&str]) -> Result<(), String> {
        let a = self.arb.insecure_clone();
        let ad = self.ata(&self.usdc, &a.pubkey());
        let gd = self.giden(self.oku(&self.config, 194));
        let mut keys = vec![s(a.pubkey()), w(self.config), w(self.fiyat()), w(self.ihale(id)), r(self.varlik), w(self.depo(&self.varlik)),
            w(self.depo(&self.usdc)), w(payee), w(gd), w(ad), r(self.liste()), r(SYSTEM), r(TOKEN)];
        keys.extend(self.raydium(false, diziler));
        let mut d = vec![11u8];
        d.extend(id.to_le_bytes());
        self.send(keys, d, &[&a])
    }

    /// The pool's spot price as dollars per whole asset unit.
    fn spot(&self) -> f64 {
        let h = &self.svm.get_account(&self.a("havuz")).unwrap().data;
        let sq = u128::from_le_bytes(h[253..269].try_into().unwrap()) as f64 / 2f64.powi(64);
        let (d0, d1) = (h[233] as i32, h[234] as i32);
        let p = sq * sq * 10f64.powi(d0 - d1);       // token1 per token0, whole units
        if self.d.h["mint0"].0 == self.usdc { 1.0 / p } else { p }
    }
}

fn setup(ad: &str) -> Env {
    let d = dok(ad);
    let mut svm = LiteSVM::new();
    let pid = Keypair::new().pubkey();
    svm.add_program_from_file(pid, concat!(env!("CARGO_MANIFEST_DIR"), "/../pulse-sepet/target/deploy/pulse_sepet.so")).unwrap();
    svm.add_program_from_file(CLMM, concat!(env!("CARGO_MANIFEST_DIR"), "/programs/raydium_clmm.so")).unwrap();
    for (adres, hesap) in d.h.values() { svm.set_account(*adres, hesap.clone()).unwrap(); }
    let mut c: Clock = svm.get_sysvar();
    c.unix_timestamp = d.zaman;
    svm.set_sysvar(&c);
    let admin = keypair_file(include_str!("../../pulse-swap/e2e/test-admin.json"));
    let (emirci, arb) = (Keypair::new(), Keypair::new());
    for k in [&admin.pubkey(), &emirci.pubkey(), &arb.pubkey()] { svm.airdrop(k, 100_000_000_000).unwrap(); }
    let usdc: Address = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v".parse().unwrap();
    let varlik = if d.h["mint0"].0 == usdc { d.h["mint1"].0 } else { d.h["mint0"].0 };
    let mut e = Env { svm, pid, admin, emirci, arb, d, usdc, varlik, config: Address::default() };
    e.config = e.pda(&[b"config"]);
    let (ep, ap) = (e.emirci.pubkey(), e.arb.pubkey());
    let (ed, ad2) = (e.ata(&usdc, &ep), e.ata(&usdc, &ap));
    e.token_hesabi(ed, &usdc, &ep, 1_000_000_000_000);
    e.token_hesabi(ad2, &usdc, &ap, 0);
    let admin = e.admin.insecure_clone();
    let mut v = vec![0u8];
    v.extend(SOLANA.to_le_bytes());
    v.extend(ep.as_ref());
    v.extend(ed.as_ref());
    v.extend(ARC.to_le_bytes());
    v.extend(DEFTER);
    v.extend(IKIZ);
    let depo = e.depo(&usdc);
    e.send(vec![s(admin.pubkey()), w(e.config), r(usdc), w(depo), r(SYSTEM), r(TOKEN)], v, &[&admin]).unwrap();
    e
}

/// The tick arrays a swap walks: the price rises when token1 goes in.
fn yukari(e: &Env, dolar_girer: bool) -> bool { (e.d.h["mint0"].0 == e.usdc) != dolar_girer }
/// The initialized tick arrays from the current one in the swap's direction, as raydium-dok.js read them
/// from the pool's bitmap (at most seven: what the vault passes on).
fn diziler(e: &Env, yukari: bool) -> Vec<&'static str> {
    let on = if yukari { "yukari" } else { "asagi" };
    (0..7).map(|k| format!("{on}{k}")).filter(|a| e.d.h.contains_key(a)).map(|a| &*Box::leak(a.into_boxed_str())).collect()
}

#[test]
fn havuzdan_alim_ortalama_fiyatla_ve_bahsisle() {
    let mut e = setup("sol-usdc");
    e.liste_ekle(e.a("havuz")).unwrap();
    e.al_emri(1, 50_000_000).unwrap();
    assert_eq!(e.oku(&e.config, 178), 50_000_000, "atanmis");
    let y = diziler(&e, yukari(&e, true));
    let spot = e.spot();
    e.takas_al(0, 1, &y).unwrap();
    assert!(e.bitti(0), "acik artirma kapandi");
    let birim = e.oku(&e.bakiye_pda(1), 1);
    assert_eq!(e.bal(&e.depo(&e.varlik)), birim, "depo = defter");
    /* 49.95 dollars went in; at the spot price less the pool's fee */
    let dec = e.svm.get_account(&e.varlik).unwrap().data[44] as i32;
    let alinan = birim as f64 / 10f64.powi(dec) * spot;
    assert!(alinan > 49.95 * 0.99 && alinan <= 49.95 * 1.001, "alinan ${alinan}");
    let ap = e.arb.pubkey();
    assert_eq!(e.bal(&e.ata(&e.usdc.clone(), &ap)), 50_000, "bahsis $0.05");
    assert_eq!(e.oku(&e.config, 178), 0, "dolar atanmisi bitti");
    assert_eq!(e.oku(&e.dolar(1), 1), 0, "launch dolari harcandi");
    assert!(e.takas_al(0, 1, &y).is_err(), "iki kez olmaz");
    println!("$50 -> {} birim ({alinan:.4} $ spot {spot:.4})", birim);
}

#[test]
fn itfada_pay_havuza_satilir_sahibe_ya_da_baska_zincire() {
    let mut e = setup("sol-usdc");
    e.liste_ekle(e.a("havuz")).unwrap();
    e.al_emri(1, 50_000_000).unwrap();
    let yal = diziler(&e, yukari(&e, true));
    e.takas_al(0, 1, &yal).unwrap();
    let birim = e.oku(&e.bakiye_pda(1), 1);
    /* a holder on Solana redeems half */
    let sahip = Keypair::new().pubkey();
    let payee = e.ata(&e.usdc.clone(), &sahip);
    e.token_hesabi(payee, &e.usdc.clone(), &sahip, 0);
    e.sat_emri(1, 1, 2, SOLANA, sahip, payee).unwrap();
    assert_eq!(e.verilen(1), birim / 2, "yarisi satista");
    let ysat = diziler(&e, yukari(&e, false));
    e.takas_sat(1, payee, &ysat).unwrap();
    assert!(e.bitti(1));
    let odenen = e.bal(&payee);
    assert!(odenen > 24_700_000 && odenen < 25_000_000, "sahibe {odenen}");
    /* the other half for a holder on Base: booked to a Giden PDA, burned there later */
    let alici = Address::new_from_array([7u8; 32]);
    let depo = e.depo(&e.usdc.clone());
    e.sat_emri(1, 1, 1, BASE, alici, depo).unwrap();
    let g = e.oku(&e.config, 194);
    e.takas_sat(2, depo, &ysat).unwrap();
    assert_eq!(e.oku(&e.config, 194), g + 1, "bir giden");
    let gm = e.oku(&e.giden(g), 37);
    assert!(gm > 24_600_000 && gm < 25_000_000, "giden {gm}");
    assert_eq!(e.oku(&e.config, 178), gm, "giden dolari atanmis");
    assert_eq!(e.bal(&e.depo(&e.varlik)), 0, "depo bos");
    println!("Solana sahibine {odenen}, Base gideni {gm}");
}

#[test]
fn listede_olmayan_havuz_ve_muhurden_sonra_liste_reddedilir() {
    let mut e = setup("sol-usdc");
    e.al_emri(1, 50_000_000).unwrap();
    let y = diziler(&e, yukari(&e, true));
    assert!(e.takas_al(0, 1, &y).unwrap_err().contains("Custom(16)"), "listede yok");
    /* a stranger cannot list */
    let yabanci = Keypair::new();
    e.svm.airdrop(&yabanci.pubkey(), 1_000_000_000).unwrap();
    let keys = vec![s(yabanci.pubkey()), r(e.config), w(e.liste()), r(e.varlik), r(e.a("havuz")), r(e.muhur()), r(SYSTEM)];
    assert!(e.send(keys, vec![12u8], &[&yabanci]).is_err(), "yabanci listeleyemez");
    e.liste_ekle(e.a("havuz")).unwrap();
    e.muhurle().unwrap();
    assert!(e.liste_ekle(e.a("havuz")).unwrap_err().contains("Custom(17)"), "muhurden sonra liste yok");
    e.takas_al(0, 1, &y).unwrap();
}

#[test]
fn defter_muhurden_once_degisir_v5_tekrar_da() {
    let mut e = setup("sol-usdc");
    let yabanci = Keypair::new();
    e.svm.airdrop(&yabanci.pubkey(), 1_000_000_000).unwrap();
    assert!(e.defter_degistir([0x44; 32], &yabanci).is_err(), "yabanci degistiremez");
    let a = e.admin.insecure_clone();
    e.defter_degistir([0x44; 32], &a).unwrap();
    let c = e.svm.get_account(&e.config).unwrap().data;
    assert_eq!(&c[114..146], &[0x44; 32], "yeni defter");
    /* v5: a second move before the seal (the Defter moved again) */
    e.defter_degistir([0x55; 32], &a).unwrap();
    assert_eq!(&e.svm.get_account(&e.config).unwrap().data[114..146], &[0x55; 32], "ikinci defter (v5)");
    assert!(e.defter_degistir([0x66; 32], &yabanci).is_err(), "yabanci yine degistiremez");
    e.muhurle().unwrap();
    assert!(e.defter_degistir([0x66; 32], &a).unwrap_err().contains("Custom(17)"), "muhurden sonra yok");
    /* a fresh vault, sealed first: no change at all */
    let mut e2 = setup("sol-usdc");
    e2.muhurle().unwrap();
    let a2 = e2.admin.insecure_clone();
    assert!(e2.defter_degistir([0x44; 32], &a2).unwrap_err().contains("Custom(17)"), "muhurden sonra yok");
}

#[test]
fn ortalamadan_uzak_fiyatta_takas_yok() {
    let mut e = setup("sol-usdc");
    e.liste_ekle(e.a("havuz")).unwrap();
    e.al_emri(1, 50_000_000).unwrap();
    /* the pool shown 400 ticks (~4%) above its own average, as a pushed price would be */
    let mut h = e.svm.get_account(&e.a("havuz")).unwrap();
    let tick = i32::from_le_bytes(h.data[269..273].try_into().unwrap());
    let sq = u128::from_le_bytes(h.data[253..269].try_into().unwrap());
    let yeni = pulse_sepet::fiyat::tick_kaydir(sq, 400).unwrap();
    h.data[253..269].copy_from_slice(&yeni.to_le_bytes());
    h.data[269..273].copy_from_slice(&(tick + 400).to_le_bytes());
    e.svm.set_account(e.a("havuz"), h).unwrap();
    let y = diziler(&e, yukari(&e, true));
    assert!(e.takas_al(0, 1, &y).unwrap_err().contains("Custom(15)"), "fiyat ortalamadan uzak");
    assert!(!e.bitti(0) && e.oku(&e.dolar(1), 1) == 50_000_000, "dolar yerinde bekliyor");
}

#[test]
fn gozlem_gecmisi_kisaysa_takas_yok() {
    let mut e = setup("sol-usdc");
    e.liste_ekle(e.a("havuz")).unwrap();
    e.al_emri(1, 50_000_000).unwrap();
    /* a ring that spans under ten minutes: every observation but the newest two cleared */
    let mut g = e.svm.get_account(&e.a("gozlem")).unwrap();
    let idx = u16::from_le_bytes([g.data[17], g.data[18]]) as usize;
    let (n_ts, _) = (u32::from_le_bytes(g.data[51 + idx * 44..55 + idx * 44].try_into().unwrap()), 0);
    for k in 0..100 {
        if k == idx { continue; }
        let o = 51 + k * 44;
        if k == (idx + 99) % 100 { g.data[o..o + 4].copy_from_slice(&(n_ts - 300).to_le_bytes()); continue; }
        g.data[o..o + 44].fill(0);
    }
    e.svm.set_account(e.a("gozlem"), g).unwrap();
    let y = diziler(&e, yukari(&e, true));
    assert!(e.takas_al(0, 1, &y).unwrap_err().contains("Custom(18)"), "ortalama yok");
}

#[test]
fn dolar_sifirinci_token_iken_alim_ve_satim() {
    /* USDC/TRX: the dollar is the pool's token0, the other orientation */
    let mut e = setup("usdc-trx");
    assert_eq!(e.d.h["mint0"].0, e.usdc);
    e.liste_ekle(e.a("havuz")).unwrap();
    e.al_emri(1, 50_000_000).unwrap();
    let spot = e.spot();
    let y = diziler(&e, yukari(&e, true));
    e.takas_al(0, 1, &y).unwrap();
    assert!(e.bitti(0));
    let birim = e.oku(&e.bakiye_pda(1), 1);
    let alinan = birim as f64 / 1e6 * spot;
    assert!(alinan > 49.95 * 0.99 && alinan <= 49.95 * 1.001, "alinan ${alinan}");
    let sahip = Keypair::new().pubkey();
    let payee = e.ata(&e.usdc.clone(), &sahip);
    e.token_hesabi(payee, &e.usdc.clone(), &sahip, 0);
    e.sat_emri(1, 1, 1, SOLANA, sahip, payee).unwrap();
    let ys = diziler(&e, yukari(&e, false));
    e.takas_sat(1, payee, &ys).unwrap();
    let odenen = e.bal(&payee);
    assert!(odenen > 49_000_000 && odenen < 49_950_000, "sahibe {odenen}");
    println!("USDC/TRX: $50 -> {birim} birim ({alinan:.4} $), geri {odenen}");
}

#[test]
fn buyuk_alim_fiyat_sinirinda_kismen_dolar_kalan_bekler() {
    let mut e = setup("usdc-trx");
    e.liste_ekle(e.a("havuz")).unwrap();
    /* $900,000 into a pool of ~$12M: the 3% limit stops it part way */
    e.al_emri(1, 900_000_000_000).unwrap();
    let y = diziler(&e, yukari(&e, true));
    let b0 = e.oku(&e.dolar(1), 1);
    e.takas_al(0, 1, &y).unwrap();
    let harcanan = b0 - e.oku(&e.dolar(1), 1);
    assert!(harcanan > 1_000_000 && harcanan < 900_000_000_000, "kismi: {harcanan}");
    assert!(!e.bitti(0), "acik artirma suruyor");
    assert_eq!(e.verilen(0), 900_000_000_000 - harcanan.min(900_000_000_000), "verilen kalan kadar kuculdu");
    assert_eq!(e.oku(&e.dolar(1), 9), e.verilen(0), "taahhut = kalan");
    assert_eq!(e.oku(&e.config, 178), 900_000_000_000 - harcanan, "atanmis = kalan");
    /* the pool now sits at the limit: a second call has nothing to buy within it */
    assert!(e.takas_al(0, 1, &y).is_err(), "sinirda ikinci takas yok");
    println!("kismi: {:.2} $ harcandi, {:.2} $ bekliyor", harcanan as f64 / 1e6, e.verilen(0) as f64 / 1e6);
}
