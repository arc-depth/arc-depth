//! The Solana gate (solana/pulse-kapi) end to end in LiteSVM.
//!
//! Receive side against the REAL LayerZero endpoint program (dumped once from
//! mainnet, see calistir.sh): the gate registers itself at Initialize with the
//! real `register_oapp`, and every message is cleared with the real `clear`.
//! What the endpoint's receive library and DVNs would have written (the Nonce
//! and PayloadHash accounts) is written here with set_account, in the layout
//! of LayerZero's endpoint interface; the EndpointSettings account is the
//! mainnet one, byte for byte. Delivery goes the way LayerZero's executor
//! does it: simulate `lz_receive_types` with the accounts the
//! ["LzReceiveTypes", store] PDA lists, then call `lz_receive` with what it
//! returned, the executor signing as account 0.
//!
//! Send side against a stand-in endpoint (solana/sahte-lz) at the same id:
//! the real `send` needs a message library, an executor and DVNs.
use litesvm::LiteSVM;
use litesvm_token::{get_spl_account, spl_token::state::{Account as TokenAccount, Mint}, CreateMint, MintTo};
use solana_account::Account;
use solana_address::Address;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;
use sha3::{Digest, Keccak256};
use pulse_kapi::abi;

const SYSTEM: Address = Address::from_str_const("11111111111111111111111111111111");
const TOKEN: Address = Address::from_str_const("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA: Address = Address::from_str_const("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const MPL: Address = Address::from_str_const("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const EP: Address = Address::from_str_const("76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6");
const INCINERATOR: Address = Address::from_str_const("1nc1nerator11111111111111111111111111111111");
/// the mainnet EndpointSettings account (eid 30168), read once
const ENDPOINT_SETTINGS: &str = "3ehJOApCSA7YdQAA/vj5H4o9kzjBvRTftDhkjfsTVBgYJJd8nDJaJok9fAYoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const ARC_EID: u32 = 30417;
const SOLANA: u32 = 5;
const ARC: u32 = 26;
const DEFTER: [u8; 32] = [0xde; 32];
const IKIZ: [u8; 32] = [0xa7; 32];
const LZ_RECEIVE: [u8; 8] = [8, 179, 120, 109, 33, 118, 189, 80];
const LZ_RECEIVE_TYPES: [u8; 8] = [221, 17, 246, 159, 248, 128, 31, 96];
const SEND: [u8; 8] = [102, 251, 20, 187, 65, 75, 12, 69];
const NONCE_DISC: [u8; 8] = [143, 197, 147, 95, 106, 165, 50, 43];
const PAYLOAD_DISC: [u8; 8] = [96, 28, 106, 145, 103, 32, 186, 70];
/// type 3 options: executor lzReceive 200k gas
const OPTIONS: [u8; 22] = [0, 3, 1, 0, 17, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 13, 64];
const TOKEN20: [u8; 20] = [0x44; 20];

fn evm(b: u8) -> [u8; 32] { let mut a = [0u8; 32]; a[12..].copy_from_slice(&[b; 20]); a }
fn hub() -> [u8; 32] { evm(0x1b) }
fn haberci() -> [u8; 32] { evm(0xab) }
fn w(v: u64) -> [u8; 32] { let mut b = [0u8; 32]; b[24..].copy_from_slice(&v.to_be_bytes()); b }
fn pad(v: &mut Vec<u8>) { while v.len() % 32 != 0 { v.push(0); } }
fn mr(a: Address) -> AccountMeta { AccountMeta::new_readonly(a, false) }
fn mw(a: Address) -> AccountMeta { AccountMeta::new(a, false) }
fn ms(a: Address) -> AccountMeta { AccountMeta::new(a, true) }

fn keypair_file(json: &str) -> Keypair {
    let b: Vec<u8> = json.trim().trim_start_matches('[').trim_end_matches(']').split(',').map(|x| x.trim().parse::<u8>().unwrap()).collect();
    Keypair::try_from(&b[..]).unwrap()
}
fn b64(s: &str) -> Vec<u8> {
    let t = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = vec![];
    let (mut acc, mut bits) = (0u32, 0);
    for c in s.bytes().filter(|c| *c != b'=') {
        acc = (acc << 6) | t.iter().position(|x| *x == c).unwrap() as u32;
        bits += 6;
        if bits >= 8 { bits -= 8; out.push((acc >> bits) as u8); }
    }
    out
}

fn yarat_mesaji(ad: &[u8], sembol: &[u8]) -> Vec<u8> {
    let p = |b: &[u8]| { let mut v = w(b.len() as u64).to_vec(); v.extend_from_slice(b); pad(&mut v); v };
    let a = p(ad);
    let mut m = w(1).to_vec();
    m.extend(evm(0x44)); m.extend(w(128)); m.extend(w(128 + a.len() as u64));
    m.extend(a); m.extend(p(sembol));
    m
}
fn tasi_mesaji(token: [u8; 32], alici: &Address, miktar: u64) -> Vec<u8> {
    let mut m = w(2).to_vec();
    m.extend(token); m.extend(alici.as_ref()); m.extend(w(miktar));
    m
}

struct Env { svm: LiteSVM, pid: Address, sid: Address, admin: Keypair, ex: Keypair, store: Address, usdc: Address, nonce: u64 }

impl Env {
    fn send(&mut self, ixs: Vec<Instruction>, signers: &[&Keypair]) -> Result<litesvm::types::TransactionMetadata, String> {
        self.svm.expire_blockhash();
        let tx = Transaction::new_signed_with_payer(&ixs, Some(&signers[0].pubkey()), signers, self.svm.latest_blockhash());
        self.svm.send_transaction(tx).map_err(|e| format!("{:?} {:?}", e.err, e.meta.logs))
    }
    fn ep(&self, seeds: &[&[u8]]) -> Address { Address::find_program_address(seeds, &EP).0 }
    fn kapi_pda(&self, seeds: &[&[u8]]) -> Address { Address::find_program_address(seeds, &self.pid).0 }
    fn sepet_pda(&self, seeds: &[&[u8]]) -> Address { Address::find_program_address(seeds, &self.sid).0 }
    fn mint(&self) -> Address { self.kapi_pda(&[b"ikiz", &TOKEN20]) }
    fn bal(&self, a: &Address) -> u64 { get_spl_account::<TokenAccount>(&self.svm, a).map(|x| x.amount).unwrap_or(0) }
    fn ata(&self, owner: &Address, mint: &Address) -> Address { Address::find_program_address(&[owner.as_ref(), TOKEN.as_ref(), mint.as_ref()], &ATA).0 }
    fn hesap(&mut self, a: Address, owner: Address, data: Vec<u8>) {
        let lamports = self.svm.minimum_balance_for_rent_exemption(data.len());
        self.svm.set_account(a, Account { lamports, data, owner, executable: false, rent_epoch: 0 }).unwrap();
    }

    /// What the receive library leaves after DVNs verified a message: the
    /// Nonce (inbound) and the PayloadHash, keccak(guid || message).
    fn dogrulanmis(&mut self, src: u32, sender: [u8; 32], nonce: u64, guid: [u8; 32], message: &[u8]) {
        let s = self.store;
        let srcb = src.to_be_bytes();
        let (na, nb) = Address::find_program_address(&[b"Nonce", s.as_ref(), &srcb, &sender], &EP);
        let mut n = NONCE_DISC.to_vec();
        n.push(nb); n.extend(0u64.to_le_bytes()); n.extend(nonce.to_le_bytes());
        self.hesap(na, EP, n);
        let (pa, pb) = Address::find_program_address(&[b"PayloadHash", s.as_ref(), &srcb, &sender, &nonce.to_be_bytes()], &EP);
        let mut h = Keccak256::new();
        h.update(guid); h.update(message);
        let mut p = PAYLOAD_DISC.to_vec();
        p.extend(h.finalize()); p.push(pb);
        self.hesap(pa, EP, p);
    }
    fn payload_var(&self, src: u32, sender: [u8; 32], nonce: u64) -> bool {
        let a = self.ep(&[b"PayloadHash", self.store.as_ref(), &src.to_be_bytes(), &sender, &nonce.to_be_bytes()]);
        self.svm.get_account(&a).map_or(false, |x| x.lamports > 0)
    }

    /// LzReceiveParams, borsh.
    fn params(src: u32, sender: [u8; 32], nonce: u64, guid: [u8; 32], message: &[u8]) -> Vec<u8> {
        let mut d = src.to_le_bytes().to_vec();
        d.extend(sender); d.extend(nonce.to_le_bytes()); d.extend(guid);
        d.extend((message.len() as u32).to_le_bytes()); d.extend(message); d.extend(0u32.to_le_bytes());
        d
    }

    /// As the executor: lz_receive_types (simulated) then lz_receive with its accounts.
    fn yurut(&mut self, src: u32, sender: [u8; 32], nonce: u64, message: &[u8]) -> Result<(), String> {
        self.yurut_meta(src, sender, nonce, message).map(|_| ())
    }

    /// The same, returning (compute units, lamports the executor spent besides the fee).
    fn yurut_meta(&mut self, src: u32, sender: [u8; 32], nonce: u64, message: &[u8]) -> Result<(u64, u64), String> {
        let ix = self.alis_talimati(src, sender, nonce, message)?;
        let ex = self.ex.insecure_clone();
        let b0 = self.svm.get_account(&ex.pubkey()).unwrap().lamports;
        let m = self.send(vec![ix], &[&ex])?;
        let b1 = self.svm.get_account(&ex.pubkey()).unwrap().lamports;
        Ok((m.compute_units_consumed, b0 - b1 - m.fee))
    }

    /// The lz_receive instruction LayerZero's executor builds on the v1 path
    /// (lz-solana-sdk-v2 receive-types-v1.ts): lz_receive_types simulated with
    /// the accounts the ["LzReceiveTypes", store] PDA lists, its result as the
    /// accounts, the zero key with is_signer replaced by the executor.
    fn alis_talimati(&mut self, src: u32, sender: [u8; 32], nonce: u64, message: &[u8]) -> Result<Instruction, String> {
        let guid = [nonce as u8; 32];
        let p = Self::params(src, sender, nonce, guid, message);
        let lrt = self.kapi_pda(&[b"LzReceiveTypes", self.store.as_ref()]);
        let ld = self.svm.get_account(&lrt).unwrap().data;
        let girdi: Vec<AccountMeta> = ld[8..].chunks(32).map(|c| mr(Address::new_from_array(c.try_into().unwrap()))).collect();
        let mut d = LZ_RECEIVE_TYPES.to_vec();
        d.extend(&p);
        let ix = Instruction { program_id: self.pid, accounts: girdi, data: d };
        self.svm.expire_blockhash();
        let ex = self.ex.insecure_clone();
        let tx = Transaction::new_signed_with_payer(&[ix], Some(&ex.pubkey()), &[&ex], self.svm.latest_blockhash());
        let sim = self.svm.simulate_transaction(tx).map_err(|e| format!("types {:?} {:?}", e.err, e.meta.logs))?;
        let r = sim.meta.return_data.data;
        let n = u32::from_le_bytes(r[..4].try_into().unwrap()) as usize;
        let hesaplar: Vec<AccountMeta> = (0..n).map(|i| {
            let c = &r[4 + 34 * i..4 + 34 * (i + 1)];
            let a = Address::new_from_array(c[..32].try_into().unwrap());
            // the payer placeholder is the zero key with is_signer set; the system program is the zero key too
            let a = if a == Address::default() && c[32] == 1 { ex.pubkey() } else { a };
            AccountMeta { pubkey: a, is_signer: c[32] == 1, is_writable: c[33] == 1 }
        }).collect();
        let mut d = LZ_RECEIVE.to_vec();
        d.extend(&p);
        Ok(Instruction { program_id: self.pid, accounts: hesaplar, data: d })
    }

    /// Verified by the "DVNs", then delivered.
    fn gelir(&mut self, sender: [u8; 32], message: &[u8]) -> Result<(), String> {
        self.nonce += 1;
        let n = self.nonce;
        self.dogrulanmis(ARC_EID, sender, n, [n as u8; 32], message);
        self.yurut(ARC_EID, sender, n, message)
    }
}

fn kur(gercek_uc: bool) -> Env {
    let mut svm = LiteSVM::new();
    let pid = Keypair::new().pubkey();
    let sid = Keypair::new().pubkey();
    svm.add_program_from_file(pid, concat!(env!("CARGO_MANIFEST_DIR"), "/../pulse-kapi/target/deploy/pulse_kapi.so")).unwrap();
    svm.add_program_from_file(sid, concat!(env!("CARGO_MANIFEST_DIR"), "/../pulse-sepet/target/deploy/pulse_sepet.so")).unwrap();
    svm.add_program_from_file(MPL, concat!(env!("CARGO_MANIFEST_DIR"), "/programs/mpl_token_metadata.so")).unwrap();
    if gercek_uc {
        svm.add_program_from_file(EP, concat!(env!("CARGO_MANIFEST_DIR"), "/programs/lz_endpoint.so")).unwrap();
    } else {
        svm.add_program_from_file(EP, concat!(env!("CARGO_MANIFEST_DIR"), "/../sahte-lz/target/deploy/sahte_lz.so")).unwrap();
    }
    let admin = keypair_file(include_str!("../../pulse-swap/e2e/test-admin.json"));
    svm.airdrop(&admin.pubkey(), 100_000_000_000).unwrap();
    let ex = Keypair::new();
    svm.airdrop(&ex.pubkey(), 10_000_000_000).unwrap();
    let usdc = CreateMint::new(&mut svm, &admin).decimals(6).send().unwrap();
    let store = Address::find_program_address(&[b"Store"], &pid).0;
    let mut e = Env { svm, pid, sid, admin, ex, store, usdc, nonce: 0 };
    let es = e.ep(&[b"Endpoint"]);
    e.hesap(es, EP, b64(ENDPOINT_SETTINGS));

    /* the basket vault, its emirci the gate's store */
    let admin = e.admin.insecure_clone();
    let config = e.sepet_pda(&[b"config"]);
    let mut d = vec![0u8];
    d.extend(SOLANA.to_le_bytes()); d.extend(store.as_ref()); d.extend(store.as_ref());
    d.extend(ARC.to_le_bytes()); d.extend(DEFTER); d.extend(IKIZ);
    let depo = e.sepet_pda(&[b"depo", usdc.as_ref()]);
    e.send(vec![Instruction { program_id: sid, accounts: vec![ms(admin.pubkey()), mw(config), mr(usdc), mw(depo), mr(SYSTEM), mr(TOKEN)], data: d }], &[&admin]).unwrap();

    /* the gate */
    let lrt = e.kapi_pda(&[b"LzReceiveTypes", store.as_ref()]);
    let mut d = vec![0u8];
    d.extend(ARC_EID.to_le_bytes()); d.extend(hub()); d.extend(haberci()); d.extend(sid.as_ref());
    d.extend((OPTIONS.len() as u16).to_le_bytes()); d.extend(OPTIONS);
    let keys = vec![ms(admin.pubkey()), mw(store), mw(lrt), mr(SYSTEM), mr(EP), mw(e.ep(&[b"OApp", store.as_ref()])), mr(e.ep(&[b"__event_authority"]))];
    e.send(vec![Instruction { program_id: pid, accounts: keys, data: d }], &[&admin]).unwrap();
    e
}

#[test]
fn baslangic_gercek_uc_noktaya_kaydolur_ikinci_kez_olmaz() {
    let mut e = kur(true);
    let reg = e.svm.get_account(&e.ep(&[b"OApp", e.store.as_ref()])).unwrap();
    assert_eq!(reg.owner, EP);
    assert_eq!(&reg.data[8..40], e.admin.pubkey().as_ref(), "temsilci kilitlenene kadar yonetici");
    let admin = e.admin.insecure_clone();
    let (store, lrt) = (e.store, e.kapi_pda(&[b"LzReceiveTypes", e.store.as_ref()]));
    let mut d = vec![0u8];
    d.extend(ARC_EID.to_le_bytes()); d.extend(hub()); d.extend(haberci()); d.extend(e.sid.as_ref());
    d.extend((OPTIONS.len() as u16).to_le_bytes()); d.extend(OPTIONS);
    let keys = vec![ms(admin.pubkey()), mw(store), mw(lrt), mr(SYSTEM), mr(EP), mw(e.ep(&[b"OApp", store.as_ref()])), mr(e.ep(&[b"__event_authority"]))];
    assert!(e.send(vec![Instruction { program_id: e.pid, accounts: keys, data: d }], &[&admin]).is_err());
}

#[test]
fn yarat_ikizi_ve_metaplex_kaydini_bir_kez_kurar() {
    let mut e = kur(true);
    e.gelir(hub(), &yarat_mesaji(b"Pulse Test", b"PTEST1")).unwrap();
    let m = e.mint();
    let mint: Mint = litesvm_token::get_spl_account(&e.svm, &m).unwrap();
    assert_eq!(mint.decimals, 6);
    assert_eq!(mint.supply, 0);
    assert_eq!(mint.mint_authority, Some(e.store).into());
    assert_eq!(mint.freeze_authority, None.into());
    let md = Address::find_program_address(&[b"metadata", MPL.as_ref(), m.as_ref()], &MPL).0;
    let mda = e.svm.get_account(&md).unwrap();
    assert_eq!(mda.owner, MPL);
    let ara = |h: &[u8], n: &[u8]| h.windows(n.len()).any(|x| x == n);
    assert!(ara(&mda.data, b"Pulse Test") && ara(&mda.data, b"PTEST1"));
    /* the message is consumed: delivering it again fails at the endpoint */
    assert!(!e.payload_var(ARC_EID, hub(), 1));
    assert!(e.yurut(ARC_EID, hub(), 1, &yarat_mesaji(b"Pulse Test", b"PTEST1")).is_err(), "ayni mesaj iki kez");
    /* a second YARAT changes nothing */
    e.gelir(hub(), &yarat_mesaji(b"Other", b"OTH")).unwrap();
    let mda2 = e.svm.get_account(&md).unwrap();
    assert_eq!(mda.data, mda2.data);
}

#[test]
fn tasi_alicinin_hesabina_basar_ikizden_once_gelen_bekler() {
    let mut e = kur(true);
    let alici = Keypair::new().pubkey();
    /* before the twin exists: refused, the message stays at the endpoint */
    assert!(e.gelir(hub(), &tasi_mesaji(evm(0x44), &alici, 4_000_000)).is_err());
    assert!(e.payload_var(ARC_EID, hub(), 1), "mesaj yeniden denenmek uzere duruyor");
    e.gelir(hub(), &yarat_mesaji(b"Pulse Test", b"PTEST1")).unwrap();
    /* anyone delivers the waiting one now */
    e.yurut(ARC_EID, hub(), 1, &tasi_mesaji(evm(0x44), &alici, 4_000_000)).unwrap();
    let m = e.mint();
    assert_eq!(e.bal(&e.ata(&alici, &m)), 4_000_000);
    e.gelir(hub(), &tasi_mesaji(evm(0x44), &alici, 6)).unwrap();
    assert_eq!(e.bal(&e.ata(&alici, &m)), 4_000_006);
}

#[test]
fn yabanci_gonderen_ve_yabanci_zincir_reddedilir() {
    let mut e = kur(true);
    assert!(e.gelir(evm(0xbd), &yarat_mesaji(b"Fake", b"FAKE")).is_err(), "yabanci gonderen");
    e.dogrulanmis(30184, hub(), 9, [9; 32], &yarat_mesaji(b"Fake", b"FAKE"));
    assert!(e.yurut(30184, hub(), 9, &yarat_mesaji(b"Fake", b"FAKE")).is_err(), "Arc disindan merkez adi");
    assert!(e.svm.get_account(&e.mint()).map_or(true, |a| a.data.is_empty()));
    /* the haberci cannot create twins: its message goes to the basket only, and is not an order */
    assert!(e.gelir(haberci(), &yarat_mesaji(b"Fake", b"FAKE")).is_err());
    assert!(e.svm.get_account(&e.mint()).map_or(true, |a| a.data.is_empty()));
}

/// abi.encode(bytes32 kaynak, bytes32 hedef, bytes veri, uint256 miktar, uint256 beklenen)
fn emir_mesaji(e: &Env, veri: Vec<u8>, miktar: u64, beklenen: u64) -> Vec<u8> {
    let mut m = DEFTER.to_vec();
    m.extend(e.sepet_pda(&[b"config"]).as_ref());
    m.extend(w(160)); m.extend(w(miktar)); m.extend(w(beklenen)); m.extend(w(veri.len() as u64));
    m.extend(veri);
    pad(&mut m);
    m
}

#[test]
fn habercinin_emri_sepete_kaydolur_dolar_gelince_ihale_acilir() {
    let mut e = kur(true);
    let admin = e.admin.insecure_clone();
    let wsol = CreateMint::new(&mut e.svm, &admin).decimals(9).send().unwrap();
    /* abi.encode(uint8 AL, uint64 launch, bytes32 mint, uint256 ref) */
    let mut veri = w(2).to_vec();
    veri.extend(w(1)); veri.extend(wsol.as_ref()); veri.extend(w(40_000_000));
    let m = emir_mesaji(&e, veri, 4_000_000, 3_900_000);
    e.gelir(haberci(), &m).unwrap();
    let emir = e.sepet_pda(&[b"emir", &0u64.to_le_bytes()]);
    let ed = e.svm.get_account(&emir).unwrap().data;
    assert_eq!((ed[1], u64::from_le_bytes(ed[2..10].try_into().unwrap())), (2, 1), "AL, launch 1");
    assert_eq!(u64::from_le_bytes(ed[10..18].try_into().unwrap()), 3_900_000, "en az gelecek dolar");
    let config = e.sepet_pda(&[b"config"]);
    let depo = e.sepet_pda(&[b"depo", e.usdc.as_ref()]);
    let uygula = |e: &mut Env| {
        let a = e.ex.insecure_clone();
        let ih = e.sepet_pda(&[b"ihale", &0u64.to_le_bytes()]);
        let keys = vec![ms(a.pubkey()), mw(config), mw(emir), mw(e.sepet_pda(&[b"dolar", &1u64.to_le_bytes()])), mr(wsol),
            mr(e.sepet_pda(&[b"fiyat", wsol.as_ref()])), mw(ih), mr(depo), mr(SYSTEM)];
        let mut d = vec![6u8];
        d.extend(0u64.to_le_bytes());
        e.send(vec![Instruction { program_id: e.sid, accounts: keys, data: d }], &[&a])
    };
    assert!(uygula(&mut e).is_err(), "dolar gelmeden ihale acilmaz");
    /* Circle forwarding mints to the depo, its fee taken on the way */
    let usdc = e.usdc;
    MintTo::new(&mut e.svm, &admin, &usdc, &depo, 3_950_000).send().unwrap();
    uygula(&mut e).unwrap();
    assert!(e.svm.get_account(&e.sepet_pda(&[b"ihale", &0u64.to_le_bytes()])).is_some(), "ihale acildi");
    /* nobody but the gate's store orders through LzEmir */
    let x = Keypair::new();
    e.svm.airdrop(&x.pubkey(), 1_000_000_000).unwrap();
    let mut d = vec![9u8];
    d.extend(&m);
    let keys = vec![ms(x.pubkey()), mw(config), mw(e.sepet_pda(&[b"emir", &1u64.to_le_bytes()])), ms(x.pubkey()), mr(SYSTEM)];
    assert!(e.send(vec![Instruction { program_id: e.sid, accounts: keys, data: d }], &[&x]).is_err());
}

#[test]
fn kilitle_temsilciyi_yakar_yonetici_kalmaz() {
    let mut e = kur(true);
    let admin = e.admin.insecure_clone();
    let reg = e.ep(&[b"OApp", e.store.as_ref()]);
    let keys = vec![ms(admin.pubkey()), mw(e.store), mr(EP), mw(reg), mr(e.ep(&[b"__event_authority"]))];
    let x = Keypair::new();
    e.svm.airdrop(&x.pubkey(), 1_000_000_000).unwrap();
    let mut yabanci = keys.clone();
    yabanci[0] = ms(x.pubkey());
    assert!(e.send(vec![Instruction { program_id: e.pid, accounts: yabanci, data: vec![1] }], &[&x]).is_err(), "yabanci kilitleyemez");
    e.send(vec![Instruction { program_id: e.pid, accounts: keys.clone(), data: vec![1] }], &[&admin]).unwrap();
    assert_eq!(&e.svm.get_account(&reg).unwrap().data[8..40], INCINERATOR.as_ref());
    assert!(e.send(vec![Instruction { program_id: e.pid, accounts: keys, data: vec![1] }], &[&admin]).is_err(), "iki kez");
    /* messages still flow after the lock */
    e.gelir(hub(), &yarat_mesaji(b"Pulse Test", b"PTEST1")).unwrap();
}

#[test]
fn gonder_yakar_ve_merkeze_tam_mesaji_yollar() {
    let mut e = kur(false);
    /* the stand-in accepts clear as it is: the twin comes the usual way */
    let u = Keypair::new();
    e.svm.airdrop(&u.pubkey(), 1_000_000_000).unwrap();
    e.yurut(ARC_EID, hub(), 1, &yarat_mesaji(b"Pulse Test", b"PTEST1")).unwrap();
    e.yurut(ARC_EID, hub(), 2, &tasi_mesaji(evm(0x44), &u.pubkey(), 10_000_000)).unwrap();
    let m = e.mint();
    let ut = e.ata(&u.pubkey(), &m);
    assert_eq!(e.bal(&ut), 10_000_000);
    let kayit = Keypair::new().pubkey();
    e.hesap(kayit, EP, vec![0u8; 1024]);
    let alici = evm(0xa7);
    let istek = [1u8, 2, 3, 4, 5];
    let gonder = |e: &mut Env, mint: Address, miktar: u64| {
        let mut d = vec![2u8];
        d.extend(TOKEN20); d.extend(alici); d.extend(miktar.to_le_bytes()); d.extend(250_000u64.to_le_bytes());
        d.extend((istek.len() as u32).to_le_bytes()); d.extend(istek);
        let r: Vec<Address> = (0..5).map(|_| Keypair::new().pubkey()).collect();
        let keys = vec![ms(u.pubkey()), mr(e.store), mw(mint), mw(ut), mr(TOKEN),
            mr(EP), mr(e.store), mr(r[0]), mr(r[1]), mr(r[2]), mr(r[3]), mr(r[4]), mw(kayit), mr(e.ep(&[b"__event_authority"])), mr(EP)];
        e.send(vec![Instruction { program_id: e.pid, accounts: keys, data: d }], &[&u])
    };
    assert!(gonder(&mut e, m, 0).is_err(), "sifir");
    let sahte = CreateMint::new(&mut e.svm, &e.admin.insecure_clone()).decimals(6).send().unwrap();
    assert!(gonder(&mut e, sahte, 1).is_err(), "baska mint");
    gonder(&mut e, m, 3_000_000).unwrap();
    assert_eq!(e.bal(&ut), 7_000_000, "yakildi");
    let mint: Mint = litesvm_token::get_spl_account(&e.svm, &m).unwrap();
    assert_eq!(mint.supply, 7_000_000);
    let k = e.svm.get_account(&kayit).unwrap().data;
    let n = u32::from_le_bytes(k[..4].try_into().unwrap()) as usize;
    let mesaj = abi::giden(&TOKEN20, &alici, 3_000_000, &istek);
    assert_eq!(&k[4..4 + n], &abi::send_verisi(&SEND, ARC_EID, &hub(), &mesaj, &OPTIONS, 250_000)[..], "uc noktaya giden tam veri");
    /* what IkizHub decodes: (uint8 2, address token, bytes32 alici, uint256 miktar, bytes istek) */
    assert_eq!(abi::u64_kelime(&mesaj, 0), Some(2));
    assert_eq!(&mesaj[32..64], &evm(0x44));
    assert_eq!(abi::dinamik(&mesaj, 128), Some(&istek[..]));
}


/// What each message type costs the executor: compute units of lz_receive and
/// the lamports it spends on accounts (rent, any Metaplex fee). These go into
/// the options the Arc senders attach (scripts/dagit-v2-solana.js).
#[test]
fn olcum_mesaj_turlerinin_maliyeti() {
    let mut e = kur(true);
    let ol = |e: &mut Env, sender: [u8; 32], m: &[u8]| {
        e.nonce += 1;
        let n = e.nonce;
        e.dogrulanmis(ARC_EID, sender, n, [n as u8; 32], m);
        e.yurut_meta(ARC_EID, sender, n, m).unwrap()
    };
    /* the longest name and symbol Metaplex takes */
    let y = ol(&mut e, hub(), &yarat_mesaji(&[b'A'; 32], &[b'B'; 10]));
    let alici = Keypair::new().pubkey();
    let t1 = ol(&mut e, hub(), &tasi_mesaji(evm(0x44), &alici, 4_000_000));
    let t2 = ol(&mut e, hub(), &tasi_mesaji(evm(0x44), &alici, 1));
    let admin = e.admin.insecure_clone();
    let wsol = CreateMint::new(&mut e.svm, &admin).decimals(9).send().unwrap();
    let mut veri = w(2).to_vec();
    veri.extend(w(1)); veri.extend(wsol.as_ref()); veri.extend(w(40_000_000));
    let m = emir_mesaji(&e, veri, 4_000_000, 3_900_000);
    let al = ol(&mut e, haberci(), &m);
    /* a redemption for five mints: the largest order body */
    let mut sat = w(3).to_vec();
    sat.extend(w(1)); sat.extend(w(224)); sat.extend(w(10)); sat.extend(w(100)); sat.extend(w(26)); sat.extend([7u8; 32]); sat.extend(w(5));
    for _ in 0..5 { sat.extend(wsol.as_ref()); }
    let sm = emir_mesaji(&e, sat, 0, 0);
    let s = ol(&mut e, haberci(), &sm);
    for (ad, (cu, lam)) in [("YARAT", y), ("TASI yeni ATA", t1), ("TASI ATA var", t2), ("emir AL", al), ("emir SAT 5 varlik", s)] {
        println!("OLCUM {:<18} CU {:>7}  lamport {:>9}", ad, cu, lam);
    }
    assert!(y.0 < 200_000 && t1.0 < 200_000 && al.0 < 200_000 && s.0 < 200_000);
}

#[test]
fn olcum_kira_kontrol() {
    let mut e = kur(true);
    e.gelir(hub(), &yarat_mesaji(&[b'A'; 32], &[b'B'; 10])).unwrap();
    let m = e.mint();
    let md = Address::find_program_address(&[b"metadata", MPL.as_ref(), m.as_ref()], &MPL).0;
    let alici = Keypair::new().pubkey();
    let b0 = e.svm.get_account(&e.ex.pubkey()).unwrap().lamports;
    e.gelir(hub(), &tasi_mesaji(evm(0x44), &alici, 1)).unwrap();
    let b1 = e.svm.get_account(&e.ex.pubkey()).unwrap().lamports;
    for (ad, a) in [("mint", m), ("metadata", md), ("ata", e.ata(&alici, &m))] {
        let x = e.svm.get_account(&a).unwrap();
        println!("KIRA {:<9} {} bayt  {} lamport  kira {}", ad, x.data.len(), x.lamports, e.svm.minimum_balance_for_rent_exemption(x.data.len()));
    }
    println!("KIRA tasi odeyen farki {}", b0 - b1);
}

const EXECUTOR: Address = Address::from_str_const("6doghB248px58JSSwG4qejQ46kFMW4AMj7vzJnWZHNZn");
const COMPUTE_BUDGET: Address = Address::from_str_const("ComputeBudget111111111111111111111111111111");
const IX_SYSVAR: Address = Address::from_str_const("Sysvar1nstructions1111111111111111111111111");

/// The size of the transaction LayerZero's executor sends to deliver each
/// message type to the gate, on the v1 path (no address lookup table; the
/// SDK's v1 branch returns none). Two shapes are measured:
///   SDK    what lz-solana-sdk-v2 3.0.168 Executor.execute builds: the
///          executor's pre_execute, our lz_receive as its own instruction,
///          post_execute; plus SetComputeUnitLimit and SetComputeUnitPrice
///   CPI    the executor program's `execute` (programs/executor execute.rs),
///          which CPIs lz_receive; plus the same two compute budget instructions
/// Legacy transactions, one signature (the executor). Solana's limit: 1232 bytes.
#[test]
fn olcum_yurutucu_islem_boyutu() {
    let mut e = kur(true);
    let ex = e.ex.insecure_clone();
    let cu = |n: u32| { let mut d = vec![2u8]; d.extend(n.to_le_bytes()); Instruction { program_id: COMPUTE_BUDGET, accounts: vec![], data: d } };
    let fiyat = || { let mut d = vec![3u8]; d.extend(50_000u64.to_le_bytes()); Instruction { program_id: COMPUTE_BUDGET, accounts: vec![], data: d } };
    let baglam = Address::find_program_address(&[b"ExecutionContext", ex.pubkey().as_ref(), &[1u8]], &EXECUTOR).0;
    let boyut = |ixs: Vec<Instruction>| -> usize {
        let tx = Transaction::new_with_payer(&ixs, Some(&ex.pubkey()));
        bincode::serialize(&tx).unwrap().len()   // with its one (placeholder) signature, as sent
    };
    let sdk = |ix: &Instruction| -> usize {
        let mut pre = vec![207u8, 125, 18, 148, 72, 192, 198, 83, 1];
        pre.extend(15_000_000u64.to_le_bytes());
        let post = vec![74u8, 168, 167, 167, 76, 220, 95, 56, 1];
        boyut(vec![cu(200_000), fiyat(),
            Instruction { program_id: EXECUTOR, accounts: vec![ms(ex.pubkey()), mw(baglam), mr(SYSTEM), mr(IX_SYSVAR)], data: pre },
            ix.clone(),
            Instruction { program_id: EXECUTOR, accounts: vec![ms(ex.pubkey()), mw(baglam), mr(IX_SYSVAR)], data: post }])
    };
    let cpi = |ix: &Instruction| -> usize {
        let config = Address::find_program_address(&[b"ExecutorConfig"], &EXECUTOR).0;
        let mut d = vec![130u8, 221, 242, 154, 13, 193, 189, 29];
        d.extend(ix.accounts[1].pubkey.as_ref());   // receiver: the store
        d.extend(&ix.data[8..]);
        d.extend(15_000_000u64.to_le_bytes()); d.extend(200_000u64.to_le_bytes());
        let mut hesap = vec![ms(ex.pubkey()), mr(config), mr(EP), mr(Address::find_program_address(&[b"__event_authority"], &EP).0),
            mr(Address::find_program_address(&[b"__event_authority"], &EXECUTOR).0), mr(EXECUTOR), mr(ix.program_id)];
        hesap.extend(ix.accounts.iter().cloned());
        boyut(vec![cu(200_000), fiyat(), Instruction { program_id: EXECUTOR, accounts: hesap, data: d }])
    };

    let admin = e.admin.insecure_clone();
    let wsol = CreateMint::new(&mut e.svm, &admin).decimals(9).send().unwrap();
    let mut durumlar: Vec<(String, [u8; 32], Vec<u8>)> = vec![];
    durumlar.push(("YARAT (ad 32, sembol 10)".into(), hub(), yarat_mesaji(&[b'A'; 32], &[b'B'; 10])));
    let mut al = w(2).to_vec();
    al.extend(w(1)); al.extend(wsol.as_ref()); al.extend(w(40_000_000));
    durumlar.push(("emir AL (1 varlik)".into(), haberci(), emir_mesaji(&e, al, 4_000_000, 3_900_000)));
    for n in 1..=5u64 {
        let mut sat = w(3).to_vec();
        sat.extend(w(1)); sat.extend(w(224)); sat.extend(w(10)); sat.extend(w(100)); sat.extend(w(26)); sat.extend([7u8; 32]); sat.extend(w(n));
        for _ in 0..n { sat.extend(wsol.as_ref()); }
        durumlar.push((format!("emir SAT ({} varlik)", n), haberci(), emir_mesaji(&e, sat, 0, 0)));
    }
    let mut nonce = 0u64;
    let mut asan = vec![];
    for (ad, gonderen, m) in durumlar.iter() {
        nonce += 1;
        e.dogrulanmis(ARC_EID, *gonderen, nonce, [nonce as u8; 32], m);
        let ix = e.alis_talimati(ARC_EID, *gonderen, nonce, m).unwrap();
        let (a, b) = (sdk(&ix), cpi(&ix));
        println!("BOYUT {:<26} mesaj {:>4} B  hesap {:>2}  SDK {:>5} B  CPI {:>5} B{}", ad, m.len(), ix.accounts.len(), a, b,
            if a > 1232 || b > 1232 { "  > 1232" } else { "" });
        if a > 1232 { asan.push(ad.clone()); }
        /* deliver it, so the next message finds the twin and the order counter where they should be */
        e.send(vec![ix], &[&ex]).unwrap();
        if ad.starts_with("YARAT") {
            nonce += 1;
            let al = Keypair::new().pubkey();
            let t = tasi_mesaji(evm(0x44), &al, 4_000_000);
            e.dogrulanmis(ARC_EID, hub(), nonce, [nonce as u8; 32], &t);
            let ix = e.alis_talimati(ARC_EID, hub(), nonce, &t).unwrap();
            let (a, b) = (sdk(&ix), cpi(&ix));
            println!("BOYUT {:<26} mesaj {:>4} B  hesap {:>2}  SDK {:>5} B  CPI {:>5} B{}", "TASI (yeni ATA)", t.len(), ix.accounts.len(), a, b,
                if a > 1232 || b > 1232 { "  > 1232" } else { "" });
            e.send(vec![ix], &[&ex]).unwrap();
        }
    }
    println!("BOYUT 1232 bayti asan (SDK bicimi): {:?}", asan);
}

/* ---- v2: lz_receive_types_info + lz_receive_types_v2, with the lookup table ---- */

const ALT_PROGRAM: Address = Address::from_str_const("AddressLookupTab1e1111111111111111111111111");
const LZ_RECEIVE_TYPES_INFO: [u8; 8] = [43, 148, 213, 93, 101, 127, 37, 170];
const LZ_RECEIVE_TYPES_V2: [u8; 8] = [109, 157, 200, 142, 138, 223, 159, 164];

/// What lz-solana-sdk-v2 3.0.168 makes of the v2 result (buildLzReceiveExecutionPlan,
/// accountMetaRefToAccountMeta): the lz_receive instruction and the tables it names.
struct Plan { ix: Instruction, alts: Vec<Address>, context: u8 }

impl Env {
    /// The fixed accounts in the order pulse-kapi's `sabitler` checks.
    fn sabitler(&self) -> Vec<Address> {
        let s = self.store;
        let arc = ARC_EID.to_be_bytes();
        vec![EP, s, self.ep(&[b"OApp", s.as_ref()]), self.ep(&[b"Endpoint"]), self.ep(&[b"__event_authority"]),
            self.ep(&[b"Nonce", s.as_ref(), &arc, &hub()]), self.ep(&[b"Nonce", s.as_ref(), &arc, &haberci()]),
            TOKEN, ATA, SYSTEM, MPL, self.sid, self.sepet_pda(&[b"config"]), IX_SYSVAR]
    }
    /// An address lookup table as the ALT program leaves it (LookupTableMeta, 56 bytes, then the addresses).
    fn tablo(&mut self, adresler: &[Address], dondurulmus: bool) -> Address {
        let t = Keypair::new().pubkey();
        let mut d = vec![0u8; 56];
        d[0] = 1;
        d[4..12].copy_from_slice(&u64::MAX.to_le_bytes());
        if !dondurulmus { d[21] = 1; d[22..54].copy_from_slice(self.admin.pubkey().as_ref()); }
        for a in adresler { d.extend(a.as_ref()); }
        self.hesap(t, ALT_PROGRAM, d);
        t
    }
    fn alt_kur(&mut self, tablo: Address, imzaci: &Keypair) -> Result<(), String> {
        let keys = vec![ms(imzaci.pubkey()), mr(self.store), mw(self.kapi_pda(&[b"Alt"])), mr(tablo), mr(SYSTEM)];
        let pid = self.pid;
        self.send(vec![Instruction { program_id: pid, accounts: keys, data: vec![3] }], &[imzaci]).map(|_| ())
    }
    fn simule(&mut self, accounts: Vec<AccountMeta>, data: Vec<u8>) -> Result<Vec<u8>, String> {
        let ex = self.ex.insecure_clone();
        self.svm.expire_blockhash();
        let tx = Transaction::new_signed_with_payer(&[Instruction { program_id: self.pid, accounts, data }], Some(&ex.pubkey()), &[&ex], self.svm.latest_blockhash());
        self.svm.simulate_transaction(tx).map(|x| x.meta.return_data.data).map_err(|e| format!("{:?} {:?}", e.err, e.meta.logs))
    }
    /// The executor's v2 path: getLzReceiveTypesInfo, then buildLzReceiveExecutionPlan.
    fn plan(&mut self, src: u32, sender: [u8; 32], nonce: u64, message: &[u8]) -> Result<Plan, String> {
        let p = Self::params(src, sender, nonce, [nonce as u8; 32], message);
        let lrt = self.kapi_pda(&[b"LzReceiveTypes", self.store.as_ref()]);
        let mut d = LZ_RECEIVE_TYPES_INFO.to_vec();
        d.extend(&p);
        let r = self.simule(vec![mr(self.store), mr(lrt)], d)?;
        assert_eq!(r[0], 2, "version 2");
        let n = u32::from_le_bytes(r[1..5].try_into().unwrap()) as usize;
        let girdi: Vec<AccountMeta> = (0..n).map(|i| mr(Address::new_from_array(r[5 + 32 * i..37 + 32 * i].try_into().unwrap()))).collect();
        let mut d = LZ_RECEIVE_TYPES_V2.to_vec();
        d.extend(&p);
        let r = self.simule(girdi, d)?;
        let mut o = 0usize;
        let context = r[o]; o += 1;
        let na = u32::from_le_bytes(r[o..o + 4].try_into().unwrap()) as usize; o += 4;
        let alts: Vec<Address> = (0..na).map(|i| Address::new_from_array(r[o + 32 * i..o + 32 * (i + 1)].try_into().unwrap())).collect();
        o += 32 * na;
        assert_eq!(u32::from_le_bytes(r[o..o + 4].try_into().unwrap()), 1, "one instruction"); o += 4;
        assert_eq!(r[o], 0, "Instruction::LzReceive"); o += 1;
        let nh = u32::from_le_bytes(r[o..o + 4].try_into().unwrap()) as usize; o += 4;
        let mut hesaplar = vec![];
        for _ in 0..nh {
            let (pubkey, imza) = match r[o] {
                0 => { o += 33; (Address::new_from_array(r[o - 32..o].try_into().unwrap()), false) }
                1 => {
                    let (t, i) = (r[o + 1] as usize, r[o + 2] as usize);
                    o += 3;
                    let d = self.svm.get_account(&alts[t]).unwrap().data;
                    (Address::new_from_array(d[56 + 32 * i..88 + 32 * i].try_into().unwrap()), false)
                }
                2 => { o += 1; (self.ex.pubkey(), true) }
                k => panic!("beklenmeyen konumlayici {}", k),
            };
            hesaplar.push(AccountMeta { pubkey, is_signer: imza, is_writable: r[o] == 1 });
            o += 1;
        }
        assert_eq!(o, r.len(), "the whole result read");
        let mut d = LZ_RECEIVE.to_vec();
        d.extend(&p);
        Ok(Plan { ix: Instruction { program_id: self.pid, accounts: hesaplar, data: d }, alts, context })
    }
    fn alt_hesaplari(&self, alts: &[Address]) -> Vec<solana_message::AddressLookupTableAccount> {
        alts.iter().map(|k| {
            let d = self.svm.get_account(k).unwrap().data;
            solana_message::AddressLookupTableAccount { key: *k, addresses: d[56..].chunks(32).map(|c| Address::new_from_array(c.try_into().unwrap())).collect() }
        }).collect()
    }
    /// A v0 transaction from the executor with these instructions and the plan's tables: (bytes, the transaction).
    fn v0(&self, ixs: Vec<Instruction>, alts: &[Address]) -> (usize, solana_transaction::versioned::VersionedTransaction) {
        let m = solana_message::v0::Message::try_compile(&self.ex.pubkey(), &ixs, &self.alt_hesaplari(alts), self.svm.latest_blockhash()).unwrap();
        let tx = solana_transaction::versioned::VersionedTransaction::try_new(solana_message::VersionedMessage::V0(m), &[&self.ex]).unwrap();
        (bincode::serialize(&tx).unwrap().len(), tx)
    }
    /// Verified, then delivered on the v2 path in a v0 transaction; returns the plan.
    fn gelir_v2(&mut self, sender: [u8; 32], message: &[u8]) -> Result<Plan, String> {
        self.nonce += 1;
        let n = self.nonce;
        self.dogrulanmis(ARC_EID, sender, n, [n as u8; 32], message);
        let p = self.plan(ARC_EID, sender, n, message)?;
        self.svm.expire_blockhash();
        let (_, tx) = self.v0(vec![p.ix.clone()], &p.alts);
        self.svm.send_transaction(tx).map_err(|e| format!("{:?} {:?}", e.err, e.meta.logs))?;
        Ok(p)
    }
}

fn kur_tablolu() -> Env {
    let mut e = kur(true);
    let s = e.sabitler();
    let t = e.tablo(&s, true);
    let admin = e.admin.insecure_clone();
    e.alt_kur(t, &admin).unwrap();
    e.svm.warp_to_slot(100);
    e
}

#[test]
fn v2_tablo_kurulmadan_v1_ile_ayni_hesaplar() {
    let mut e = kur(true);
    let m = yarat_mesaji(b"Pulse Test", b"PTEST1");
    e.dogrulanmis(ARC_EID, hub(), 1, [1; 32], &m);
    let p = e.plan(ARC_EID, hub(), 1, &m).unwrap();
    assert!(p.alts.is_empty());
    assert_eq!(p.context, 1);
    let v1 = e.alis_talimati(ARC_EID, hub(), 1, &m).unwrap();
    assert_eq!(p.ix.accounts, v1.accounts, "v2 = v1 without a table");
    assert_eq!(p.ix.data, v1.data);
}

#[test]
fn tablo_bir_kez_yalniz_yoneticiden_dondurulmus_ve_dogru_sirada() {
    let mut e = kur(true);
    let admin = e.admin.insecure_clone();
    let s = e.sabitler();
    let acik = e.tablo(&s, false);
    assert!(e.alt_kur(acik, &admin).is_err(), "donmamis tablo");
    let mut ters = s.clone();
    ters.swap(0, 1);
    let ters = e.tablo(&ters, true);
    assert!(e.alt_kur(ters, &admin).is_err(), "yanlis sira");
    let mut eksik = s.clone();
    eksik.pop();
    let eksik = e.tablo(&eksik, true);
    assert!(e.alt_kur(eksik, &admin).is_err(), "eksik");
    let dogru = e.tablo(&s, true);
    let x = Keypair::new();
    e.svm.airdrop(&x.pubkey(), 1_000_000_000).unwrap();
    assert!(e.alt_kur(dogru, &x).is_err(), "yabanci");
    e.alt_kur(dogru, &admin).unwrap();
    let ikinci = e.tablo(&s, true);
    assert!(e.alt_kur(ikinci, &admin).is_err(), "ikinci kez");
    /* after Kilitle no table can be set */
    let mut k = kur(true);
    let a2 = k.admin.insecure_clone();
    let reg = k.ep(&[b"OApp", k.store.as_ref()]);
    let keys = vec![ms(a2.pubkey()), mw(k.store), mr(EP), mw(reg), mr(k.ep(&[b"__event_authority"]))];
    k.send(vec![Instruction { program_id: k.pid, accounts: keys, data: vec![1] }], &[&a2]).unwrap();
    let s2 = k.sabitler();
    let t2 = k.tablo(&s2, true);
    assert!(k.alt_kur(t2, &a2).is_err(), "kilitten sonra");
}

/// Every message type, on the v2 path the SDK builds, in a v0 transaction with
/// the gate's table: delivered for real here, and its size measured in the
/// executor's shape (SetComputeUnitLimit, SetComputeUnitPrice, pre_execute,
/// lz_receive, post_execute). Solana's limit is 1232 bytes.
#[test]
fn v2_tablo_ile_her_mesaj_1232_altinda_ve_teslim_edilir() {
    let mut e = kur_tablolu();
    let ex = e.ex.insecure_clone();
    let cu = |n: u32| { let mut d = vec![2u8]; d.extend(n.to_le_bytes()); Instruction { program_id: COMPUTE_BUDGET, accounts: vec![], data: d } };
    let fiyat = || { let mut d = vec![3u8]; d.extend(50_000u64.to_le_bytes()); Instruction { program_id: COMPUTE_BUDGET, accounts: vec![], data: d } };
    let baglam = Address::find_program_address(&[b"ExecutionContext", ex.pubkey().as_ref(), &[1u8]], &EXECUTOR).0;
    let mut pre = vec![207u8, 125, 18, 148, 72, 192, 198, 83, 1];
    pre.extend(15_000_000u64.to_le_bytes());
    let post = vec![74u8, 168, 167, 167, 76, 220, 95, 56, 1];
    let admin = e.admin.insecure_clone();
    let wsol = CreateMint::new(&mut e.svm, &admin).decimals(9).send().unwrap();
    let mut durumlar: Vec<(String, [u8; 32], Vec<u8>)> = vec![("YARAT (ad 32, sembol 10)".into(), hub(), yarat_mesaji(&[b'A'; 32], &[b'B'; 10]))];
    let alici = Keypair::new().pubkey();
    durumlar.push(("TASI (yeni ATA)".into(), hub(), tasi_mesaji(evm(0x44), &alici, 4_000_000)));
    let mut al = w(2).to_vec();
    al.extend(w(1)); al.extend(wsol.as_ref()); al.extend(w(40_000_000));
    durumlar.push(("emir AL (1 varlik)".into(), haberci(), emir_mesaji(&e, al, 4_000_000, 3_900_000)));
    for n in 1..=5u64 {
        let mut sat = w(3).to_vec();
        sat.extend(w(1)); sat.extend(w(224)); sat.extend(w(10)); sat.extend(w(100)); sat.extend(w(26)); sat.extend([7u8; 32]); sat.extend(w(n));
        for _ in 0..n { sat.extend(wsol.as_ref()); }
        durumlar.push((format!("emir SAT ({} varlik)", n), haberci(), emir_mesaji(&e, sat, 0, 0)));
    }
    let mut en_buyuk = 0;
    for (ad, gonderen, m) in durumlar.iter() {
        let p = e.gelir_v2(*gonderen, m).unwrap();
        assert_eq!(p.alts.len(), 1);
        let (sdk, _) = e.v0(vec![cu(200_000), fiyat(),
            Instruction { program_id: EXECUTOR, accounts: vec![ms(ex.pubkey()), mw(baglam), mr(SYSTEM), mr(IX_SYSVAR)], data: pre.clone() },
            p.ix.clone(),
            Instruction { program_id: EXECUTOR, accounts: vec![ms(ex.pubkey()), mw(baglam), mr(IX_SYSVAR)], data: post.clone() }], &p.alts);
        let (yalin, _) = e.v0(vec![p.ix.clone()], &p.alts);
        println!("BOYUT2 {:<26} mesaj {:>4} B  hesap {:>2}  v0+tablo SDK bicimi {:>5} B  (yalniz lz_receive {:>5} B)", ad, m.len(), p.ix.accounts.len(), sdk, yalin);
        en_buyuk = en_buyuk.max(sdk);
    }
    /* delivered: the twin, the transfer, the orders */
    assert_eq!(e.bal(&e.ata(&alici, &e.mint())), 4_000_000);
    assert!(e.svm.get_account(&e.sepet_pda(&[b"emir", &5u64.to_le_bytes()])).is_some(), "alti emir");
    println!("BOYUT2 en buyuk {} B, pay {} B", en_buyuk, 1232 - en_buyuk);
    assert!(en_buyuk + 64 <= 1232, "en az 64 bayt pay");
}
