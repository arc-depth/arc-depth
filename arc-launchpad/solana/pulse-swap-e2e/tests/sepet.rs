//! The Solana basket vault (solana/pulse-sepet) end to end in LiteSVM: the
//! same scenarios as the EVM, Sui and Aptos vaults.
use litesvm::LiteSVM;
use litesvm_token::{get_spl_account, spl_token::state::Account as TokenAccount, CreateAssociatedTokenAccount, CreateMint, MintTo};
use solana_address::Address;
use solana_clock::Clock;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

const SYSTEM: Address = Address::from_str_const("11111111111111111111111111111111");
const TOKEN: Address = Address::from_str_const("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA: Address = Address::from_str_const("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SOLANA: u32 = 5;
const BASE: u32 = 6;
const ARC: u32 = 26;
const MT: Address = Address::from_str_const("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC");
const TMM: Address = Address::from_str_const("CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe");
const HANDLE: [u8; 8] = [186, 252, 239, 70, 86, 180, 110, 95];
const IKIZ: [u8; 32] = [0xa7; 32];      // the Arc Haberci, as CCTP names it
const DEFTER: [u8; 32] = [0xde; 32];    // the Defter on Arc

fn w(a: Address) -> AccountMeta { AccountMeta::new(a, false) }
fn w_(a: Address) -> AccountMeta { AccountMeta::new(a, false) }
fn r(a: Address) -> AccountMeta { AccountMeta::new_readonly(a, false) }
fn s(a: Address) -> AccountMeta { AccountMeta::new(a, true) }

fn keypair_file(json: &str) -> Keypair {
    let b: Vec<u8> = json.trim().trim_start_matches('[').trim_end_matches(']').split(',').map(|x| x.trim().parse::<u8>().unwrap()).collect();
    Keypair::try_from(&b[..]).unwrap()
}

struct Env { svm: LiteSVM, pid: Address, admin: Keypair, emirci: Keypair, usdc: Address, config: Address, emirci_dolar: Address, arb: Keypair }

impl Env {
    fn pda(&self, seeds: &[&[u8]]) -> Address { Address::find_program_address(seeds, &self.pid).0 }
    fn bal(&self, a: &Address) -> u64 { get_spl_account::<TokenAccount>(&self.svm, a).map(|x| x.amount).unwrap_or(0) }
    fn send(&mut self, keys: Vec<AccountMeta>, data: Vec<u8>, signers: &[&Keypair]) -> Result<(), String> {
        self.svm.expire_blockhash();
        let ix = Instruction { program_id: self.pid, accounts: keys, data };
        let tx = Transaction::new_signed_with_payer(&[ix], Some(&signers[0].pubkey()), signers, self.svm.latest_blockhash());
        self.svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
    }
    fn ata(&mut self, mint: &Address, owner: &Address, amount: u64) -> Address {
        let a = Address::find_program_address(&[owner.as_ref(), TOKEN.as_ref(), mint.as_ref()], &ATA).0;
        if self.svm.get_account(&a).map_or(true, |x| x.data.is_empty()) {
            CreateAssociatedTokenAccount::new(&mut self.svm, &self.admin, mint).owner(owner).send().unwrap();
        }
        if amount > 0 { MintTo::new(&mut self.svm, &self.admin, mint, &a, amount).send().unwrap(); }
        a
    }
    fn later(&mut self, secs: i64) {
        let mut c: Clock = self.svm.get_sysvar();
        c.unix_timestamp += secs;
        self.svm.set_sysvar(&c);
    }
    fn depo(&self, mint: &Address) -> Address { self.pda(&[b"depo", mint.as_ref()]) }
    fn ihale(&self, id: u64) -> Address { self.pda(&[b"ihale", &id.to_le_bytes()]) }
    fn dolar(&self, l: u64) -> Address { self.pda(&[b"dolar", &l.to_le_bytes()]) }
    fn bakiye_pda(&self, l: u64, mint: &Address) -> Address { self.pda(&[b"bakiye", &l.to_le_bytes(), mint.as_ref()]) }
    fn fiyat(&self, mint: &Address) -> Address { self.pda(&[b"fiyat", mint.as_ref()]) }
    fn oku(&self, a: &Address, o: usize) -> u64 {
        self.svm.get_account(a).map(|x| if x.data.len() >= o + 8 { u64::from_le_bytes(x.data[o..o + 8].try_into().unwrap()) } else { 0 }).unwrap_or(0)
    }
    fn sayac(&self) -> u64 { self.oku(&self.config, 101) }
    fn istenen(&self, id: u64) -> u64 {
        let d = self.svm.get_account(&self.ihale(id)).unwrap().data;
        let bas = u64::from_le_bytes(d[51..59].try_into().unwrap());
        let t0 = i64::from_le_bytes(d[59..67].try_into().unwrap());
        let now: Clock = self.svm.get_sysvar();
        pulse_sepet::egri::istenen(bas, (now.unix_timestamp - t0).max(0) as u64)
    }

    fn emir(&self, id: u64) -> Address { self.pda(&[b"emir", &id.to_le_bytes()]) }
    fn giden(&self, id: u64) -> Address { self.pda(&[b"giden", &id.to_le_bytes()]) }
    fn giden_sayac(&self) -> u64 { self.oku(&self.config, 194) }

    /// Burn queued payout `id` to its chain through (the stand-in for) Circle's TMM.
    fn giden_gonder(&mut self, id: u64) -> Result<(), String> {
        let a = self.arb.insecure_clone();
        let olay = self.pda(&[b"olay", &id.to_le_bytes()]);
        let c: Vec<Address> = (0..9).map(|_| Keypair::new().pubkey()).collect();   // Circle's state accounts, unchecked by the stand-in
        let keys = vec![s(a.pubkey()), w(self.config), w(self.giden(id)), w(self.depo(&self.usdc)), w(olay),
            r(c[0]), r(c[1]), w(c[2]), r(c[3]), r(c[4]), r(c[5]), w(c[6]), w(self.usdc), r(MT), r(TMM), r(TOKEN), r(SYSTEM), r(c[7]), r(TMM)];
        let mut d = vec![8u8];
        d.extend(id.to_le_bytes());
        self.send(keys, d, &[&a])
    }
    fn emir_sayac(&self) -> u64 { self.oku(&self.config, 186) }
    fn atanmis(&self) -> u64 { self.oku(&self.config, 178) }

    /// abi.encode(bytes32 kaynak, bytes32 hedef, bytes veri, uint256 dolar)
    fn yuk(&self, kaynak: [u8; 32], veri: Vec<u8>, dolar: u64) -> Vec<u8> {
        let mut y = kaynak.to_vec();
        y.extend(self.config.as_ref());
        y.extend(kelime(128)); y.extend(kelime(dolar as u128)); y.extend(kelime(veri.len() as u128));
        let n = veri.len();
        y.extend(veri);
        y.extend(vec![0u8; (32 - n % 32) % 32]);
        y
    }

    /// Circle's CPI into this program, as the MessageTransmitter makes it.
    fn cctp(&mut self, gonderen: [u8; 32], uzak: u32, govde: Vec<u8>) -> Result<(), String> { self.cctp_cagiranla(gonderen, uzak, govde, [0u8; 32]) }

    /// The same, with the destination caller the message names (zero = anyone);
    /// the relayer signing the receive is the test's payer.
    fn cctp_cagiranla(&mut self, gonderen: [u8; 32], uzak: u32, govde: Vec<u8>, hedef_cagiran: [u8; 32]) -> Result<(), String> {
        let id = self.emir_sayac();
        let yetki = Address::find_program_address(&[b"message_transmitter_authority", self.pid.as_ref()], &MT).0;
        let mut d = hedef_cagiran.to_vec();
        d.extend(HANDLE);
        d.extend(uzak.to_le_bytes()); d.extend(gonderen); d.extend(2000u32.to_le_bytes());
        d.extend((govde.len() as u32).to_le_bytes()); d.extend(govde); d.push(255);
        let a = self.arb.insecure_clone();
        let keys = vec![s(a.pubkey()), w_(yetki), r(self.pid), w_(self.config), w_(self.emir(id)), s(a.pubkey()), r(SYSTEM)];
        self.svm.expire_blockhash();
        let ix = Instruction { program_id: MT, accounts: keys, data: d };
        let tx = Transaction::new_signed_with_payer(&[ix], Some(&a.pubkey()), &[&a], self.svm.latest_blockhash());
        self.svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
    }

    fn uygula_al(&mut self, id: u64, l: u64, mint: Address) -> Result<(), String> {
        let ih = self.sayac();
        let a = self.arb.insecure_clone();
        let keys = vec![s(a.pubkey()), w(self.config), w(self.emir(id)), w(self.dolar(l)), r(mint), r(self.fiyat(&mint)), w(self.ihale(ih)),
            r(self.depo(&self.usdc)), r(SYSTEM)];
        let mut d = vec![6u8];
        d.extend(id.to_le_bytes());
        self.send(keys, d, &[&a])
    }

    fn uygula_sat(&mut self, id: u64, i: u8, l: u64, mint: Address, payee: Address) -> Result<(), String> {
        let ih = self.sayac();
        let a = self.arb.insecure_clone();
        let gd = self.giden(self.giden_sayac());
        let keys = vec![s(a.pubkey()), w(self.config), w(self.emir(id)), w(self.dolar(l)), w(self.bakiye_pda(l, &mint)), r(mint), r(self.fiyat(&mint)),
            w(self.ihale(ih)), w(self.depo(&self.usdc)), w(payee), w(gd), r(SYSTEM), r(TOKEN)];
        let mut d = vec![7u8];
        d.extend(id.to_le_bytes());
        d.push(i);
        self.send(keys, d, &[&a])
    }

    fn al_emri(&mut self, l: u64, mint: Address, dolar: u64, refv: u64) -> Result<(), String> {
        let id = self.sayac();
        let e = self.emirci.insecure_clone();
        let keys = vec![s(e.pubkey()), w(self.config), w(self.dolar(l)), r(mint), r(self.fiyat(&mint)), w(self.ihale(id)),
            w(self.emirci_dolar), w(self.depo(&self.usdc)), r(SYSTEM), r(TOKEN)];
        let mut d = vec![1u8];
        for x in [l, dolar, refv] { d.extend(x.to_le_bytes()); }
        self.send(keys, d, &[&e])
    }

    fn sat_emri(&mut self, l: u64, mint: Address, miktar: u64, arz: u64, ilk: bool, hz: u32, alici: Address) -> Result<(), String> {
        let id = self.sayac();
        let payee = if hz == SOLANA { self.ata(&self.usdc.clone(), &alici, 0) } else { self.depo(&self.usdc) };
        let gd = self.giden(self.giden_sayac());
        let e = self.emirci.insecure_clone();
        let keys = vec![s(e.pubkey()), w(self.config), w(self.dolar(l)), w(self.bakiye_pda(l, &mint)), r(mint), r(self.fiyat(&mint)),
            w(self.ihale(id)), w(self.depo(&self.usdc)), w(payee), w(gd), r(SYSTEM), r(TOKEN)];
        let mut d = vec![2u8];
        for x in [l, miktar, arz] { d.extend(x.to_le_bytes()); }
        d.push(ilk as u8);
        d.extend(hz.to_le_bytes());
        d.extend(alici.as_ref());
        self.send(keys, d, &[&e])
    }

    fn doldur_alim(&mut self, id: u64, l: u64, mint: Address, teklif: u64) -> Result<(), String> {
        let a = self.arb.insecure_clone();
        let fa = self.ata(&mint, &a.pubkey(), 0);
        let fd = self.ata(&self.usdc.clone(), &a.pubkey(), 0);
        let keys = vec![s(a.pubkey()), w(self.config), w(self.dolar(l)), w(self.bakiye_pda(l, &mint)), w(self.fiyat(&mint)),
            w(self.ihale(id)), r(mint), w(self.depo(&mint)), w(fa), w(fd), w(self.depo(&self.usdc)), r(SYSTEM), r(TOKEN)];
        let mut d = vec![3u8];
        d.extend(id.to_le_bytes());
        d.extend(teklif.to_le_bytes());
        self.send(keys, d, &[&a])
    }

    fn doldur_satim(&mut self, id: u64, mint: Address, teklif: u64, payee: Address) -> Result<(), String> {
        let a = self.arb.insecure_clone();
        let fa = self.ata(&mint, &a.pubkey(), 0);
        let fd = self.ata(&self.usdc.clone(), &a.pubkey(), 0);
        let gd = self.giden(self.giden_sayac());
        let keys = vec![s(a.pubkey()), w(self.config), w(self.fiyat(&mint)), w(self.ihale(id)), r(mint), w(self.depo(&mint)),
            w(fa), w(fd), w(payee), w(gd), r(SYSTEM), r(TOKEN)];
        let mut d = vec![4u8];
        d.extend(id.to_le_bytes());
        d.extend(teklif.to_le_bytes());
        self.send(keys, d, &[&a])
    }
}

fn setup() -> (Env, Address, Address) {
    let mut svm = LiteSVM::new();
    let pid = Keypair::new().pubkey();
    svm.add_program_from_file(pid, concat!(env!("CARGO_MANIFEST_DIR"), "/../pulse-sepet/target/deploy/pulse_sepet.so")).unwrap();
    // the stand-in for Circle's MessageTransmitter V2, at its real id
    svm.add_program_from_file(MT, concat!(env!("CARGO_MANIFEST_DIR"), "/../sahte-mt/target/deploy/sahte_mt.so")).unwrap();
    svm.add_program_from_file(TMM, concat!(env!("CARGO_MANIFEST_DIR"), "/../sahte-tmm/target/deploy/sahte_tmm.so")).unwrap();
    let admin = keypair_file(include_str!("../../pulse-swap/e2e/test-admin.json"));
    svm.airdrop(&admin.pubkey(), 100_000_000_000).unwrap();
    let emirci = Keypair::new();
    svm.airdrop(&emirci.pubkey(), 10_000_000_000).unwrap();
    let arb = Keypair::new();
    svm.airdrop(&arb.pubkey(), 10_000_000_000).unwrap();
    let usdc = CreateMint::new(&mut svm, &admin).decimals(6).send().unwrap();
    let wsol = CreateMint::new(&mut svm, &admin).decimals(9).send().unwrap();
    let meme = CreateMint::new(&mut svm, &admin).decimals(6).send().unwrap();
    let mut e = Env { svm, pid, admin, emirci, usdc, config: Address::default(), emirci_dolar: Address::default(), arb };
    e.config = e.pda(&[b"config"]);
    let ep = e.emirci.pubkey();
    e.emirci_dolar = e.ata(&usdc, &ep, 1_000_000_000);
    let ap = e.arb.pubkey();
    e.ata(&wsol, &ap, 1_000_000_000_000_000);
    e.ata(&meme, &ap, 1_000_000_000_000_000);
    e.ata(&usdc, &ap, 1_000_000_000_000);
    let admin = e.admin.insecure_clone();
    let mut d = vec![0u8];
    d.extend(SOLANA.to_le_bytes());
    d.extend(e.emirci.pubkey().as_ref());
    d.extend(e.emirci_dolar.as_ref());
    d.extend(ARC.to_le_bytes());
    d.extend(DEFTER);
    d.extend(IKIZ);
    let depo = e.depo(&usdc);
    e.send(vec![s(admin.pubkey()), w(e.config), r(usdc), w(depo), r(SYSTEM), r(TOKEN)], d, &[&admin]).unwrap();
    (e, wsol, meme)
}

#[test]
fn alim_acik_artirmayla_dolar_ve_egri_duser() {
    let (mut e, wsol, _meme) = setup();
    // $4 for launch 1, quoted at 0.04 SOL (4e7 lamports-worth units)
    e.al_emri(1, wsol, 4_000_000, 40_000_000).unwrap();
    assert_eq!(e.oku(&e.dolar(1), 1), 4_000_000);
    assert_eq!(e.istenen(0), 80_000_000);
    e.later(900);
    assert_eq!(e.istenen(0), 60_000_000);
    e.later(900);
    assert_eq!(e.istenen(0), 40_000_000);
    // less than asked is refused, the right amount fills
    assert!(e.doldur_alim(0, 1, wsol, 39_999_999).is_err(), "eksik teslim");
    let ap = e.arb.pubkey();
    let au = e.ata(&e.usdc.clone(), &ap, 0);
    let u0 = e.bal(&au);
    e.doldur_alim(0, 1, wsol, 40_000_000).unwrap();
    assert_eq!(e.bal(&au) - u0, 4_000_000, "dolduran 4 dolari aldi");
    assert_eq!(e.oku(&e.bakiye_pda(1, &wsol), 1), 40_000_000, "defter");
    assert_eq!(e.bal(&e.depo(&wsol)), 40_000_000, "depo");
    assert!(e.doldur_alim(0, 1, wsol, 40_000_000).is_err(), "iki kez dolmaz");
}

#[test]
fn yalniz_emirci_emir_verir_ve_yanlis_mint_reddedilir() {
    let (mut e, wsol, meme) = setup();
    // a stranger signing as the emirci
    let yabanci = Keypair::new();
    e.svm.airdrop(&yabanci.pubkey(), 1_000_000_000).unwrap();
    let keys = vec![s(yabanci.pubkey()), w(e.config), w(e.dolar(1)), r(wsol), r(e.fiyat(&wsol)), w(e.ihale(0)),
        w(e.emirci_dolar), w(e.depo(&e.usdc)), r(SYSTEM), r(TOKEN)];
    let mut d = vec![1u8];
    for x in [1u64, 4_000_000, 1] { d.extend(x.to_le_bytes()); }
    assert!(e.send(keys, d, &[&yabanci]).is_err(), "yabanci emir veremez");
    e.al_emri(1, wsol, 4_000_000, 40_000_000).unwrap();
    assert!(e.doldur_alim(0, 1, meme, 100_000_000).is_err(), "yanlis mint");
}

#[test]
fn itfa_payi_satilir_burada_ya_da_emirciye_odenir() {
    let (mut e, wsol, _meme) = setup();
    e.al_emri(1, wsol, 4_000_000, 40_000_000).unwrap();
    e.later(1800);
    e.doldur_alim(0, 1, wsol, 40_000_000).unwrap();
    let tutucu = Keypair::new().pubkey();
    // 10% paid on Solana, then 10% of the rest paid on Base (through the emirci)
    e.sat_emri(1, wsol, 10, 100, true, SOLANA, tutucu).unwrap();
    assert_eq!(e.oku(&e.bakiye_pda(1, &wsol), 1), 36_000_000);
    e.sat_emri(1, wsol, 10, 90, true, BASE, tutucu).unwrap();
    assert_eq!(e.oku(&e.bakiye_pda(1, &wsol), 1), 32_000_000, "ikinci itfa kalani sayar");
    e.later(1800);
    let ta = e.ata(&e.usdc.clone(), &tutucu, 0);
    let i1 = e.istenen(1);
    e.doldur_satim(1, wsol, i1, ta).unwrap();
    assert_eq!(e.bal(&ta), 400_000, "tutucuya 0,40 dolar Solana'da");
    let depo = e.depo(&e.usdc);
    let d0 = e.bal(&depo);
    let i2 = e.istenen(2);
    assert!(e.doldur_satim(2, wsol, i2, ta).is_err(), "Base odemesi tutucuya gidemez");
    e.doldur_satim(2, wsol, i2, depo).unwrap();
    assert_eq!(e.bal(&depo) - d0, 400_000, "Base odemesi depoda bekler");
    assert_eq!(e.giden_sayac(), 1, "Giden kaydi");
    assert_eq!(e.oku(&e.giden(0), 37), 400_000);
    assert_eq!(e.atanmis(), 400_000, "borclu odeme havuzdan sayilmaz");
    // anyone burns it to Base through CCTP; the program signs as the depo's owner
    e.giden_gonder(0).unwrap();
    assert_eq!(e.bal(&depo), d0, "yakildi");
    assert_eq!(e.atanmis(), 0);
    assert!(e.giden_gonder(0).is_err(), "iki kez gonderilmez");
}

#[test]
fn itfa_acik_alimlari_esit_kucultur_ve_launchlar_karismaz() {
    let (mut e, wsol, _meme) = setup();
    e.al_emri(1, wsol, 4_000_000, 40_000_000).unwrap();
    e.al_emri(1, wsol, 12_000_000, 120_000_000).unwrap();
    e.al_emri(2, wsol, 4_000_000, 40_000_000).unwrap();
    let tutucu = Keypair::new().pubkey();
    e.sat_emri(1, wsol, 50, 100, true, SOLANA, tutucu).unwrap();
    let ta = e.ata(&e.usdc.clone(), &tutucu, 0);
    assert_eq!(e.bal(&ta), 8_000_000, "16 dolarin yarisi hemen");
    e.later(1800);
    let q1 = e.istenen(1);
    let ap = e.arb.pubkey();
    let au = e.ata(&e.usdc.clone(), &ap, 0);
    let u0 = e.bal(&au);
    e.doldur_alim(1, 1, wsol, q1 / 2).unwrap();
    assert_eq!(e.bal(&au) - u0, 6_000_000, "12 dolarlik alim 6 harcar");
    let q0 = e.istenen(0);
    e.doldur_alim(0, 1, wsol, q0 / 2).unwrap();
    assert_eq!(e.oku(&e.dolar(1), 1), 0);
    assert_eq!(e.oku(&e.dolar(2), 1), 4_000_000, "launch 2 dokunulmadi");
}

/// one 32-byte EVM ABI word
fn kelime(v: u128) -> Vec<u8> { let mut b = vec![0u8; 16]; b.extend(v.to_be_bytes()); b }

fn al_verisi(id: u64, mint: &Address, refv: u64) -> Vec<u8> {
    let mut v = kelime(2); v.extend(kelime(id as u128)); v.extend(mint.as_ref()); v.extend(kelime(refv as u128)); v
}

fn sat_verisi(id: u64, mint: &Address, miktar: u128, arz: u128, hz: u32, alici: &Address) -> Vec<u8> {
    let mut v = kelime(3); v.extend(kelime(id as u128)); v.extend(kelime(224)); v.extend(kelime(miktar)); v.extend(kelime(arz));
    v.extend(kelime(hz as u128)); v.extend(alici.as_ref()); v.extend(kelime(1)); v.extend(mint.as_ref()); v
}

#[test]
fn cctp_emri_dolar_gelince_alim_acar() {
    let (mut e, wsol, _meme) = setup();
    let y = e.yuk(DEFTER, al_verisi(1, &wsol, 40_000_000), 4_000_000);
    e.cctp(IKIZ, ARC, y).unwrap();
    assert_eq!(e.emir_sayac(), 1, "emir kaydedildi");
    assert!(e.uygula_al(0, 1, wsol).is_err(), "dolar gelmeden alim acilmaz");
    // the plain burn: CCTP mints the dollars straight into the depo
    let depo = e.depo(&e.usdc);
    let admin = e.admin.insecure_clone();
    MintTo::new(&mut e.svm, &admin, &e.usdc.clone(), &depo, 4_000_000).send().unwrap();
    e.uygula_al(0, 1, wsol).unwrap();
    assert_eq!(e.oku(&e.dolar(1), 1), 4_000_000, "launch 1'e 4 dolar");
    assert_eq!(e.atanmis(), 4_000_000);
    assert_eq!(e.istenen(0), 80_000_000);
    assert!(e.uygula_al(0, 1, wsol).is_err(), "emir iki kez yurutulmez");
    // the pool is what is beyond the booked dollars: a second order needs new dollars
    let y2 = e.yuk(DEFTER, al_verisi(2, &wsol, 40_000_000), 4_000_000);
    e.cctp(IKIZ, ARC, y2).unwrap();
    assert!(e.uygula_al(1, 2, wsol).is_err(), "baska launch'in dolari kullanilamaz");
}

#[test]
fn yalniz_ikizden_ve_defterden_emir_alinir() {
    let (mut e, wsol, _meme) = setup();
    let y = e.yuk(DEFTER, al_verisi(1, &wsol, 1), 1);
    assert!(e.cctp([0xbb; 32], ARC, y.clone()).is_err(), "ikiz olmayan gonderen");
    assert!(e.cctp(IKIZ, BASE, y).is_err(), "Defter zinciri disi");
    let y2 = e.yuk([0xbb; 32], al_verisi(1, &wsol, 1), 1);
    assert!(e.cctp(IKIZ, ARC, y2).is_err(), "Defter disi kaynak");
    // the handler called directly, without the MessageTransmitter's PDA signing
    let yabanci = Keypair::new();
    e.svm.airdrop(&yabanci.pubkey(), 1_000_000_000).unwrap();
    let mut d = HANDLE.to_vec();
    d.extend(ARC.to_le_bytes()); d.extend(IKIZ); d.extend(2000u32.to_le_bytes());
    let g = e.yuk(DEFTER, al_verisi(1, &wsol, 1), 1);
    d.extend((g.len() as u32).to_le_bytes()); d.extend(g); d.push(255);
    let keys = vec![s(yabanci.pubkey()), w(e.config), w(e.emir(0)), s(yabanci.pubkey()), r(SYSTEM)];
    assert!(e.send(keys, d, &[&yabanci]).is_err(), "yetki PDA'si olmadan");
    assert_eq!(e.emir_sayac(), 0);
}

#[test]
fn cctp_itfa_emri_1e27_arzla_payi_satar() {
    let (mut e, wsol, _meme) = setup();
    let y = e.yuk(DEFTER, al_verisi(1, &wsol, 40_000_000), 4_000_000);
    e.cctp(IKIZ, ARC, y).unwrap();
    let depo = e.depo(&e.usdc);
    let admin = e.admin.insecure_clone();
    MintTo::new(&mut e.svm, &admin, &e.usdc.clone(), &depo, 4_000_000).send().unwrap();
    e.uygula_al(0, 1, wsol).unwrap();
    e.later(1800);
    e.doldur_alim(0, 1, wsol, 40_000_000).unwrap();
    assert_eq!(e.atanmis(), 0, "harcanan dolar ayrildi");
    let tutucu = Keypair::new().pubkey();
    // 10% of an EVM supply of 1e27, paid on Solana
    let sat = sat_verisi(1, &wsol, 100_000_000_000_000_000_000_000_000, 1_000_000_000_000_000_000_000_000_000, SOLANA, &tutucu);
    let y2 = e.yuk(DEFTER, sat, 0);
    e.cctp(IKIZ, ARC, y2).unwrap();
    let ta = e.ata(&e.usdc.clone(), &tutucu, 0);
    e.uygula_sat(1, 0, 1, wsol, ta).unwrap();
    assert_eq!(e.oku(&e.bakiye_pda(1, &wsol), 1), 36_000_000, "yuzde 10 satista");
    assert!(e.uygula_sat(1, 0, 1, wsol, ta).is_err(), "ayni kalem iki kez");
    e.later(1800);
    let i1 = e.istenen(1);
    e.doldur_satim(1, wsol, i1, ta).unwrap();
    assert_eq!(e.bal(&ta), 400_000, "tutucuya 0,40 dolar");
}

/// Why Solana is not reached through the Arc Haberci's CCTP orders (found 18 Oct):
/// the Haberci names its twin as both the recipient and the destination caller.
/// On Solana the recipient must be this program, and the caller must sign —
/// a program address never signs, so such an order can never be received,
/// by anyone. A message naming no caller is received by any relayer.
#[test]
fn arc_haberci_emri_solana_da_teslim_edilemez() {
    let (mut e, wsol, _meme) = setup();
    let pid: [u8; 32] = e.pid.as_ref().try_into().unwrap();
    let y = e.yuk(DEFTER, al_verisi(1, &wsol, 40_000_000), 4_000_000);
    assert!(e.cctp_cagiranla(IKIZ, ARC, y.clone(), pid).is_err(), "hedef cagiran = program: kimse imzalayamaz");
    assert_eq!(e.emir_sayac(), 0, "emir kaydedilmedi");
    assert!(e.cctp_cagiranla(IKIZ, ARC, y, [0u8; 32]).is_ok(), "hedef cagiran bos: herhangi bir aktarici teslim eder");
    assert_eq!(e.emir_sayac(), 1);
}
