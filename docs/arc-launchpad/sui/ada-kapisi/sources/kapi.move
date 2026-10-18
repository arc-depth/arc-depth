/// AdaKapisi on Sui: the far end of an island's gate (BNB, Robinhood).
///
/// An island's vault paying a holder on Sui cannot use CCTP (Circle mints no
/// USDC on the island). Its gate locks the dollars on the island and sends
/// the order over LayerZero; here the order waits until someone pays the
/// holder in Sui USDC (`doldur`), and the receipt (`bildir`) goes back so the
/// locked dollars on the island are released to that payer, one for one.
/// No one holds anyone's dollars: the payer pays first, the island's gate
/// releases only on this gate's receipt, and this gate sends one only for an
/// order that arrived from the island and was paid.
///
/// Messages are the EVM AdaKapisi's, ABI-encoded (as aptos/ada-kapisi):
///   TASI   abi.encode(uint8 1, bytes[] ms), each m =
///          abi.encode(uint8 1, uint64 id, bytes32 kaynak, bytes32 hedef, bytes veri, uint256 miktar)
///   ODENDI abi.encode(uint8 2, uint64[] ids, bytes32[] alacaklilar)
/// Only payouts reach Sui (veri empty): the holder `hedef` is paid directly.
module ada_kapisi::kapi;

use call::{call::{Call, Void}, call_cap::CallCap};
use endpoint_v2::{endpoint_v2::EndpointV2, endpoint_send::SendParam, lz_receive::LzReceiveParam, messaging_receipt::MessagingReceipt};
use oapp::{endpoint_calls, oapp::{Self, AdminCap, OApp}, oapp_info_v1, ptb_builder_helper};
use ptb_move_call::{argument, move_call};
use sui::{address, bcs, coin::Coin, event, hash::keccak256, sui::SUI, table::{Self, Table}};
use utils::{buffer_writer, package};

const TASI: u8 = 1;
const ODENDI: u8 = 2;
const LZ_RECEIVE_INFO_VERSION_1: u16 = 1;


const EYanlisMesaj: u64 = 1;
const EYanlisTutar: u64 = 2;
const EYanlisKasa: u64 = 3;

public struct KAPI has drop {}

/// Shared. `C` is fixed by the first `doldur`-able dollar: Circle's USDC on mainnet.
public struct Kapi has key {
    id: UID,
    cap: CallCap,
    oapp: address,
    /// (source eid << 64 | id) -> keccak256 of the order, while it waits for a payer
    bekleyen: Table<u128, vector<u8>>,
    /// paid orders whose receipt is not sent yet -> the payer on the source chain (32 bytes)
    odeyen: Table<u128, vector<u8>>,
}

public struct Bekliyor has copy, drop { kaynak_eid: u32, id: u64, hedef: address, miktar: u64, mesaj: vector<u8> }
public struct Dolduruldu has copy, drop { kaynak_eid: u32, id: u64, hedef: address, miktar: u64 }
public struct Bildirildi has copy, drop { kaynak_eid: u32, sayi: u64 }

fun init(otw: KAPI, ctx: &mut TxContext) {
    let (cap, admin, oapp_adr) = oapp::new(&otw, ctx);
    transfer::share_object(Kapi { id: object::new(ctx), cap, oapp: oapp_adr, bekleyen: table::new(ctx), odeyen: table::new(ctx) });
    transfer::public_transfer(admin, ctx.sender());
}

fun anahtar(eid: u32, id: u64): u128 { ((eid as u128) << 64) | (id as u128) }

/* ---- the EVM ABI, a word at a time --------------------------------- */

fun kelime(b: &vector<u8>, o: u64): u256 {
    let mut v = 0u256;
    let mut j = 0;
    while (j < 32) { v = (v << 8) | (b[o + j] as u256); j = j + 1; };
    v
}
fun dilim(b: &vector<u8>, o: u64, n: u64): vector<u8> {
    let mut s = vector[];
    let mut j = 0;
    while (j < n) { s.push_back(b[o + j]); j = j + 1; };
    s
}
fun yaz(s: &mut vector<u8>, v: u256) {
    let mut j = 0u64;
    while (j < 32) {
        let kaydir = ((8 * (31 - j)) as u8);
        s.push_back((((v >> kaydir) & 0xff) as u8));
        j = j + 1;
    };
}

/// The fields of one order: (id, hedef, veri length, miktar).
public(package) fun coz(m: &vector<u8>): (u64, address, u64, u64) {
    assert!(m.length() >= 224 && (kelime(m, 0) as u8) == TASI, EYanlisMesaj);
    let id = (kelime(m, 32) as u64);
    let hedef = address::from_bytes(dilim(m, 96, 32));
    let ofs = (kelime(m, 128) as u64);
    let veri = (kelime(m, ofs) as u64);
    let miktar = kelime(m, 160);
    assert!(miktar <= 18446744073709551615, EYanlisMesaj);
    (id, hedef, veri, (miktar as u64))
}

/// The orders of a TASI message, recorded to wait for a payer.
public(package) fun isle(self: &mut Kapi, src_eid: u32, message: &vector<u8>) {
    assert!((kelime(message, 0) as u8) == TASI, EYanlisMesaj);
    let dizi = (kelime(message, 32) as u64);
    let n = (kelime(message, dizi) as u64);
    let mut i = 0;
    while (i < n) {
        let bas = dizi + 32 + (kelime(message, dizi + 32 + 32 * i) as u64);
        let m = dilim(message, bas + 32, (kelime(message, bas) as u64));
        let (id, hedef, _, miktar) = coz(&m);
        let a = anahtar(src_eid, id);
        if (self.bekleyen.contains(a)) { *self.bekleyen.borrow_mut(a) = keccak256(&m) } else { self.bekleyen.add(a, keccak256(&m)) };
        event::emit(Bekliyor { kaynak_eid: src_eid, id, hedef, miktar, mesaj: m });
        i = i + 1;
    };
}

/* ---- LayerZero ------------------------------------------------------ */

/// The executor's call (or anyone's, with the endpoint's Call). The peer check is OApp's.
#[allow(lint(self_transfer))]
public fun lz_receive(self: &mut Kapi, oapp: &OApp, call: Call<LzReceiveParam, Void>, ctx: &mut TxContext) {
    assert!(object::id_address(oapp) == self.oapp, EYanlisKasa);
    let param = oapp.lz_receive(&self.cap, call);
    let (src_eid, _, _, _, message, _, _, deger) = param.destroy();
    /* a native value is not expected; whatever came goes to whoever delivered */
    if (deger.is_some()) transfer::public_transfer(deger.destroy_some(), ctx.sender()) else deger.destroy_none();
    self.isle(src_eid, &message);
}

/// What the executor must call, registered with the endpoint.
public fun lz_receive_info(self: &Kapi, oapp: &OApp): vector<u8> {
    let cagri = vector[
        move_call::create(
            package::package_of_type<Kapi>(),
            b"kapi".to_ascii_string(),
            b"lz_receive".to_ascii_string(),
            vector[
                argument::create_object(object::id_address(self)),
                argument::create_object(object::id_address(oapp)),
                argument::create_id(ptb_builder_helper::lz_receive_call_id()),
            ],
            vector[],
            false,
            vector[],
        ),
    ];
    let mut w = buffer_writer::new();
    w.write_u16(LZ_RECEIVE_INFO_VERSION_1).write_bytes(bcs::to_bytes(&cagri));
    w.to_bytes()
}

/// Once, by the AdminCap holder: register with the endpoint.
public fun kaydet(self: &Kapi, oapp: &OApp, admin: &AdminCap, endpoint: &mut EndpointV2, ctx: &mut TxContext) {
    let bilgi = oapp_info_v1::create(object::id_address(oapp), vector[], self.lz_receive_info(oapp), vector[]);
    endpoint_calls::register_oapp(oapp, admin, endpoint, bilgi.encode(), ctx);
}

/* ---- paying and the receipt ----------------------------------------- */

/// Anyone: pay order `m` from `kaynak_eid` to its holder with exactly its
/// amount of `C` (Sui USDC); `alacakli` (32 bytes) is repaid on the source chain.
public fun doldur<C>(self: &mut Kapi, kaynak_eid: u32, m: vector<u8>, alacakli: vector<u8>, odeme: Coin<C>) {
    assert!(alacakli.length() == 32 && address::from_bytes(alacakli) != @0x0, EYanlisMesaj);
    let (id, hedef, veri, miktar) = coz(&m);
    assert!(veri == 0, EYanlisMesaj);   // only payouts reach Sui
    let a = anahtar(kaynak_eid, id);
    assert!(self.bekleyen.contains(a) && *self.bekleyen.borrow(a) == keccak256(&m), EYanlisMesaj);
    assert!(odeme.value() == miktar, EYanlisTutar);
    self.bekleyen.remove(a);
    transfer::public_transfer(odeme, hedef);
    if (miktar > 0) self.odeyen.add(a, alacakli);
    event::emit(Dolduruldu { kaynak_eid, id, hedef, miktar });
}

/// Anyone (the payer, usually): the receipts for paid orders `ids` of
/// `kaynak_eid` in one LayerZero message. Returns the endpoint's Call for the
/// PTB to execute (the message library and the fee are LayerZero's); the
/// unused fee goes back to `iade`.
public fun bildir(
    self: &mut Kapi, oapp: &OApp, kaynak_eid: u32, ids: vector<u64>, secenekler: vector<u8>,
    ucret: Coin<SUI>, iade: address, ctx: &mut TxContext,
): Call<SendParam, MessagingReceipt> {
    let n = ids.length();
    assert!(n > 0, EYanlisMesaj);
    let mut alacakli = vector[];
    let mut i = 0;
    while (i < n) {
        let a = anahtar(kaynak_eid, ids[i]);
        assert!(self.odeyen.contains(a), EYanlisMesaj);
        alacakli.push_back(self.odeyen.remove(a));
        i = i + 1;
    };
    event::emit(Bildirildi { kaynak_eid, sayi: n });
    oapp.lz_send_and_refund(&self.cap, kaynak_eid, odendi_mesaji(&ids, &alacakli), secenekler, ucret, option::none(), iade, ctx)
}

/// abi.encode(uint8 2, uint64[] ids, bytes32[] alacaklilar)
public fun odendi_mesaji(ids: &vector<u64>, alacakli: &vector<vector<u8>>): vector<u8> {
    let n = ids.length();
    let mut s = vector[];
    yaz(&mut s, (ODENDI as u256));
    yaz(&mut s, 96);
    yaz(&mut s, ((96 + 32 + 32 * n) as u256));
    yaz(&mut s, (n as u256));
    let mut i = 0;
    while (i < n) { yaz(&mut s, (ids[i] as u256)); i = i + 1; };
    yaz(&mut s, (n as u256));
    i = 0;
    while (i < n) { s.append(alacakli[i]); i = i + 1; };
    s
}

public fun bekliyor_mu(self: &Kapi, kaynak_eid: u32, id: u64): bool { self.bekleyen.contains(anahtar(kaynak_eid, id)) }
public fun oapp_adresi(self: &Kapi): address { self.oapp }

#[test_only]
public fun yeni_test(ctx: &mut TxContext): Kapi {
    let otw = KAPI {};
    let (cap, admin, oapp_adr) = oapp::new(&otw, ctx);
    transfer::public_transfer(admin, ctx.sender());
    Kapi { id: object::new(ctx), cap, oapp: oapp_adr, bekleyen: table::new(ctx), odeyen: table::new(ctx) }
}
#[test_only]
public fun paylas_test(k: Kapi) { transfer::share_object(k) }
