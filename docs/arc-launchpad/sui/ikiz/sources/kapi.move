/// The launch tokens' twins on Sui (arastirma/sepet-v2-tasarim.md, "2. nesil ikizler").
///
/// On Arc every launch token is locked in one place, the IkizHub, while its
/// twins exist here; LayerZero does not connect Arc to Sui, so the hub's
/// messages come through the AktarmaLZ hop on Base, this OApp's only peer.
/// From the hub (passed on by the hop as they are):
///   YARAT  abi.encode(uint8 1, address token, string ad, string sembol)
///   TASI   abi.encode(uint8 2, address token, bytes32 alici, uint256 miktar)
///
/// On Sui a coin is a type, and a type is a published package. So YARAT only
/// records the name and symbol; then ANYONE publishes the coin template
/// (sui/coin-sablon, made with the coin registry) under that name and
/// symbol and hands its TreasuryCap to `kaydet`, which accepts it only if
/// nobody can tell it apart from any other such coin: 6 decimals, the
/// recorded name and symbol, no coins in existence, not regulated (no one
/// can freeze it), metadata fixed for good. From then on only this gate
/// mints or burns it.
///
/// A TASI for a twin with a coin type is delivered by LayerZero's executor
/// straight to the recipient (`lz_receive_ptb` picks the type from the
/// message); one that arrives before the type is registered waits here and
/// anyone delivers it with `bas` afterwards.
///
/// Back to Arc (anyone, paying LayerZero in SUI): `gonder` burns the
/// holder's twins and the hub releases as many, to an Arc address or, with
/// an order (`istek`), to the one-pool gate that sells or redeems them:
///   abi.encode(uint8 2, address token, bytes32 alici, uint256 miktar, bytes istek)
/// Amounts are in the hub's 6 shared decimals, one to one with the twin.
module ikiz::kapi;

use call::{call::{Call, Void}, call_cap::CallCap};
use endpoint_v2::{endpoint_send::SendParam, endpoint_quote::QuoteParam, lz_receive::LzReceiveParam,
    messaging_fee::MessagingFee, messaging_receipt::MessagingReceipt};
use oapp::{oapp::{OApp, AdminCap}, endpoint_calls, oapp_info_v1, ptb_builder_helper};
use ptb_move_call::{argument, move_call::{Self, MoveCall}};
use std::{string::{Self, String}, type_name::{Self, TypeName}};
use sui::{address, bcs, coin::{Self, Coin, TreasuryCap}, coin_registry::Currency, dynamic_field as df, event,
    sui::SUI, table::{Self, Table}};
use endpoint_v2::endpoint_v2::EndpointV2;
use utils::{buffer_writer, package};

const YARAT: u8 = 1;
const TASI: u8 = 2;
const ONDALIK: u8 = 6;
const GONDER_TIPI: u16 = 1;
const LZ_RECEIVE_INFO_VERSION_1: u16 = 1;

const ESadeceKurucu: u64 = 1;
const EKurulu: u64 = 2;
const EYanlisOApp: u64 = 3;
const EKotuMesaj: u64 = 4;
const EBeklenmiyor: u64 = 5;
const EAdTutmuyor: u64 = 6;
const EOndalik: u64 = 7;
const EArzVar: u64 = 8;
const EDenetimli: u64 = 9;
const EUstVeriAcik: u64 = 10;
const EKasaTutmuyor: u64 = 11;
const ETipYanlis: u64 = 12;
const EIkizYok: u64 = 13;
const EAz: u64 = 14;
const EKotuAlici: u64 = 15;
const ECok: u64 = 16;

public struct KAPI has drop {}

public struct Kapi has key {
    id: UID,
    cap: CallCap,
    oapp: address,
    aktarma_eid: u32,                  // Base, where the hop is (the peer)
    kurucu: Option<address>,
    adlar: Table<address, Ad>,         // YARAT waiting for its coin type
    tipler: Table<address, TypeName>,  // token -> its twin's coin type (the TreasuryCap is a field under the token)
    bekleyen: Table<u64, Basim>,       // transfers that came before their coin type
    sayac: u64,
}

public struct Ad has store, drop, copy { ad: String, sembol: String }
public struct Basim has store, drop { token: address, alici: address, miktar: u64 }

public struct Beklenen has copy, drop { token: address, ad: String, sembol: String }
public struct Kaydedildi has copy, drop { token: address, tip: TypeName }
public struct Geldi has copy, drop { token: address, alici: address, miktar: u64 }
public struct Bekliyor has copy, drop { sira: u64, token: address, alici: address, miktar: u64 }
public struct Gitti has copy, drop { token: address, gonderen: address, alici: address, miktar: u64, istekli: bool }

fun init(otw: KAPI, ctx: &mut TxContext) {
    let (cap, admin, oapp_adr) = oapp::oapp::new(&otw, ctx);
    transfer::share_object(yeni(cap, oapp_adr, ctx));
    transfer::public_transfer(admin, ctx.sender());
}

fun yeni(cap: CallCap, oapp: address, ctx: &mut TxContext): Kapi {
    Kapi {
        id: object::new(ctx), cap, oapp, aktarma_eid: 0, kurucu: option::some(ctx.sender()),
        adlar: table::new(ctx), tipler: table::new(ctx), bekleyen: table::new(ctx), sayac: 0,
    }
}

/// Once, by the publisher: the eid of the hop's chain (Base, 30184).
public fun kur(self: &mut Kapi, aktarma_eid: u32, ctx: &TxContext) {
    assert!(self.kurucu == option::some(ctx.sender()), ESadeceKurucu);
    assert!(self.aktarma_eid == 0, EKurulu);
    self.aktarma_eid = aktarma_eid;
    self.kurucu = option::none();
}

public fun beklenen(self: &Kapi, token: address): Option<Ad> {
    if (self.adlar.contains(token)) option::some(*self.adlar.borrow(token)) else option::none()
}
public fun ad(a: &Ad): String { a.ad }
public fun sembol(a: &Ad): String { a.sembol }
public fun tip(self: &Kapi, token: address): Option<TypeName> {
    if (self.tipler.contains(token)) option::some(*self.tipler.borrow(token)) else option::none()
}
public fun bekleyen_sayisi(self: &Kapi): u64 { self.bekleyen.length() }

/* ---- the EVM ABI, a word at a time ------------------------------------- */

fun kelime(b: &vector<u8>, o: u64): u256 {
    let mut v = 0u256;
    let mut j = 0;
    while (j < 32) { v = (v << 8) | (b[o + j] as u256); j = j + 1; };
    v
}
fun adres(b: &vector<u8>, o: u64): address {
    let mut s = vector[];
    let mut j = 0;
    while (j < 32) { s.push_back(b[o + j]); j = j + 1; };
    address::from_bytes(s)
}
fun w(v: u256): vector<u8> {
    let mut b = vector[];
    let mut i = 32u64;
    while (i > 0) { i = i - 1; b.push_back((((v >> ((i * 8) as u8)) & 0xff) as u8)); };
    b
}
fun alan(m: &vector<u8>, a: u64): vector<u8> {
    let ofs = (kelime(m, a) as u64);
    let n = (kelime(m, ofs) as u64);
    let mut s = vector[];
    let mut j = 0;
    while (j < n) { s.push_back(m[ofs + 32 + j]); j = j + 1; };
    s
}

/// The name as the coin will carry it: cut to 32 bytes on a character
/// boundary; one that is not UTF-8 becomes empty.
fun ad_duzelt(mut b: vector<u8>): String {
    if (b.length() > 32) {
        let mut n = 32;
        while (n > 0 && (b[n] & 0xc0) == 0x80) n = n - 1;
        while (b.length() > n) { b.pop_back(); };
    };
    let s = string::try_utf8(b);
    if (s.is_some()) s.destroy_some() else string::utf8(b"")
}
/// The symbol as the coin registry allows it: printable ASCII only, at most 10.
fun sembol_duzelt(b: vector<u8>): String {
    let mut s = vector[];
    let mut i = 0;
    while (i < b.length() && s.length() < 10) {
        let c = b[i];
        if (c >= 0x20 && c <= 0x7e) s.push_back(c);
        i = i + 1;
    };
    string::utf8(s)
}

/* ---- in: from the hub, through the hop ---------------------------------- */

/// The executor's call for YARAT, and for a TASI whose coin type is not
/// registered yet (it waits). The peer (the hop on Base) is checked by OApp.
#[allow(lint(self_transfer))]
public fun lz_receive(self: &mut Kapi, oapp: &OApp, call: Call<LzReceiveParam, Void>, ctx: &mut TxContext) {
    let m = self.al(oapp, call, ctx);
    self.isle(&m);
}

/// The executor's call for a TASI whose twin has coin type T: minted to the recipient at once.
public fun lz_receive_tip<T>(self: &mut Kapi, oapp: &OApp, call: Call<LzReceiveParam, Void>, ctx: &mut TxContext) {
    let m = self.al(oapp, call, ctx);
    self.isle_tip<T>(&m, ctx);
}

#[allow(lint(self_transfer))]
fun al(self: &Kapi, oapp: &OApp, call: Call<LzReceiveParam, Void>, ctx: &TxContext): vector<u8> {
    assert!(object::id_address(oapp) == self.oapp, EYanlisOApp);
    let param = oapp.lz_receive(&self.cap, call);
    let (_, _, _, _, message, _, _, deger) = param.destroy();
    /* a native value is not expected; whatever came goes to whoever delivered */
    if (deger.is_some()) transfer::public_transfer(deger.destroy_some(), ctx.sender()) else deger.destroy_none();
    message
}

public(package) fun isle(self: &mut Kapi, m: &vector<u8>) {
    assert!(m.length() >= 128, EKotuMesaj);
    let tur = kelime(m, 0);
    let token = adres(m, 32);
    if (tur == (YARAT as u256)) {
        /* once; a repeat changes nothing */
        if (self.adlar.contains(token) || self.tipler.contains(token)) return;
        let a = Ad { ad: ad_duzelt(alan(m, 64)), sembol: sembol_duzelt(alan(m, 96)) };
        event::emit(Beklenen { token, ad: a.ad, sembol: a.sembol });
        self.adlar.add(token, a);
    } else if (tur == (TASI as u256)) {
        let (alici, miktar) = tasi_oku(m);
        let sira = self.sayac;
        self.sayac = sira + 1;
        self.bekleyen.add(sira, Basim { token, alici, miktar });
        event::emit(Bekliyor { sira, token, alici, miktar });
    } else abort EKotuMesaj
}

public(package) fun isle_tip<T>(self: &mut Kapi, m: &vector<u8>, ctx: &mut TxContext) {
    assert!(m.length() >= 128 && kelime(m, 0) == (TASI as u256), EKotuMesaj);
    let token = adres(m, 32);
    let (alici, miktar) = tasi_oku(m);
    self.basip_ver<T>(token, alici, miktar, ctx);
}

fun tasi_oku(m: &vector<u8>): (address, u64) {
    let v = kelime(m, 96);
    assert!(v <= 18446744073709551615, ECok);
    (adres(m, 64), (v as u64))
}

fun basip_ver<T>(self: &mut Kapi, token: address, alici: address, miktar: u64, ctx: &mut TxContext) {
    assert!(self.tipler.contains(token), EIkizYok);
    assert!(*self.tipler.borrow(token) == type_name::with_defining_ids<T>(), ETipYanlis);
    let cap: &mut TreasuryCap<T> = df::borrow_mut(&mut self.id, token);
    transfer::public_transfer(coin::mint(cap, miktar, ctx), alici);
    event::emit(Geldi { token, alici, miktar });
}

/// Anyone: deliver a transfer that came before its twin's coin type.
public fun bas<T>(self: &mut Kapi, sira: u64, ctx: &mut TxContext) {
    let Basim { token, alici, miktar } = self.bekleyen.remove(sira);
    self.basip_ver<T>(token, alici, miktar, ctx);
}

/// The coin type the executor's call needs for this message, if any.
public fun tip_sec(self: &Kapi, m: &vector<u8>): Option<TypeName> {
    if (m.length() < 128 || kelime(m, 0) != (TASI as u256)) return option::none();
    self.tip(adres(m, 32))
}

/* ---- the coin type, registered by anyone -------------------------------- */

/// Anyone: give the gate the TreasuryCap of a coin made for `token` (the
/// coin template with the recorded name and symbol). The currency must
/// already be registered and shared (coin_registry::finalize_registration).
public fun kaydet<T>(self: &mut Kapi, token: address, para: &Currency<T>, cap: TreasuryCap<T>) {
    assert!(self.adlar.contains(token), EBeklenmiyor);
    let a = self.adlar.remove(token);
    assert!(para.name() == a.ad && para.symbol() == a.sembol, EAdTutmuyor);
    assert!(para.decimals() == ONDALIK, EOndalik);
    assert!(coin::total_supply(&cap) == 0, EArzVar);
    assert!(!para.is_regulated() && para.deny_cap_id().is_none(), EDenetimli);
    assert!(para.is_metadata_cap_deleted(), EUstVeriAcik);
    assert!(para.treasury_cap_id() == option::some(object::id(&cap)), EKasaTutmuyor);
    let t = type_name::with_defining_ids<T>();
    df::add(&mut self.id, token, cap);
    self.tipler.add(token, t);
    event::emit(Kaydedildi { token, tip: t });
}

/* ---- out: back to Arc ----------------------------------------------------- */

fun giden(token: address, alici: vector<u8>, miktar: u64, istek: vector<u8>): vector<u8> {
    let mut m = w((TASI as u256));
    m.append(bcs::to_bytes(&token));
    m.append(alici);
    m.append(w((miktar as u256)));
    m.append(w(160));
    m.append(w((istek.length() as u256)));
    m.append(istek);
    while (m.length() % 32 != 0) m.push_back(0);
    m
}

/// What LayerZero asks for `gonder` (the Call is run through the endpoint like any quote).
public fun teklif(self: &Kapi, oapp: &OApp, token: address, alici: vector<u8>, miktar: u64, istek: vector<u8>, ctx: &mut TxContext): Call<QuoteParam, MessagingFee> {
    assert!(object::id_address(oapp) == self.oapp, EYanlisOApp);
    let e = self.aktarma_eid;
    oapp.quote(&self.cap, e, giden(token, alici, miktar, istek), oapp.combine_options(e, GONDER_TIPI, vector[]), false, ctx)
}

/// Anyone: burn these twins of `token` and have the hub on Arc release as
/// many to `alici` (32 bytes, an Arc address), or carry out the order
/// `istek` with them. `ucret` pays LayerZero; what is not used goes back to
/// the caller. The returned Call goes to the endpoint in the same transaction.
public fun gonder<T>(
    self: &mut Kapi, oapp: &OApp, token: address, para: Coin<T>, alici: vector<u8>, istek: vector<u8>,
    ucret: Coin<SUI>, ctx: &mut TxContext,
): Call<SendParam, MessagingReceipt> {
    assert!(object::id_address(oapp) == self.oapp, EYanlisOApp);
    assert!(self.tipler.contains(token), EIkizYok);
    assert!(*self.tipler.borrow(token) == type_name::with_defining_ids<T>(), ETipYanlis);
    assert!(alici.length() == 32 && alici != w(0), EKotuAlici);
    let miktar = para.value();
    assert!(miktar > 0, EAz);
    let cap: &mut TreasuryCap<T> = df::borrow_mut(&mut self.id, token);
    coin::burn(cap, para);
    let istekli = !istek.is_empty();
    event::emit(Gitti { token, gonderen: ctx.sender(), alici: address::from_bytes(alici), miktar, istekli });
    let e = self.aktarma_eid;
    oapp.lz_send_and_refund(&self.cap, e, giden(token, alici, miktar, istek),
        oapp.combine_options(e, GONDER_TIPI, vector[]), ucret, option::none(), ctx.sender(), ctx)
}

/* ---- LayerZero registration ----------------------------------------------- */

/// The executor's builder: from the message, which call (and which coin type) delivers it.
public fun lz_receive_ptb(self: &Kapi, oapp: &OApp, call: &Call<LzReceiveParam, Void>): vector<MoveCall> {
    let t = self.tip_sec(call.param().message());
    let (ad, tipler) = if (t.is_some()) (b"lz_receive_tip", vector[t.destroy_some()]) else (b"lz_receive", vector[]);
    vector[
        move_call::create(
            package::package_of_type<Kapi>(),
            b"kapi".to_ascii_string(),
            ad.to_ascii_string(),
            vector[
                argument::create_object(object::id_address(self)),
                argument::create_object(object::id_address(oapp)),
                argument::create_id(ptb_builder_helper::lz_receive_call_id()),
            ],
            tipler,
            false,
            vector[],
        ),
    ]
}

/// Registered with the endpoint: the builder above, with this object and the OApp.
public fun lz_receive_info(self: &Kapi, oapp: &OApp): vector<u8> {
    let cagri = vector[
        move_call::create(
            package::package_of_type<Kapi>(),
            b"kapi".to_ascii_string(),
            b"lz_receive_ptb".to_ascii_string(),
            vector[
                argument::create_object(object::id_address(self)),
                argument::create_object(object::id_address(oapp)),
                argument::create_id(ptb_builder_helper::lz_receive_call_id()),
            ],
            vector[],
            true,
            vector[],
        ),
    ];
    let mut wr = buffer_writer::new();
    wr.write_u16(LZ_RECEIVE_INFO_VERSION_1).write_bytes(bcs::to_bytes(&cagri));
    wr.to_bytes()
}

/// Once, by the AdminCap holder: register with the endpoint.
public fun kaydol(self: &Kapi, oapp: &OApp, admin: &AdminCap, endpoint: &mut EndpointV2, ctx: &mut TxContext) {
    let bilgi = oapp_info_v1::create(object::id_address(oapp), vector[], self.lz_receive_info(oapp), vector[]);
    endpoint_calls::register_oapp(oapp, admin, endpoint, bilgi.encode(), ctx);
}

#[test_only]
public fun yeni_test(ctx: &mut TxContext): Kapi {
    let otw = KAPI {};
    let (cap, admin, oapp_adr) = oapp::oapp::new(&otw, ctx);
    transfer::public_transfer(admin, ctx.sender());
    yeni(cap, oapp_adr, ctx)
}
#[test_only]
public fun giden_test(token: address, alici: vector<u8>, miktar: u64, istek: vector<u8>): vector<u8> { giden(token, alici, miktar, istek) }
#[test_only]
public fun yak_test<T>(self: &mut Kapi, token: address, para: Coin<T>) {
    let cap: &mut TreasuryCap<T> = df::borrow_mut(&mut self.id, token);
    coin::burn(cap, para);
}
#[test_only]
public fun yok_et(self: Kapi) { std::unit_test::destroy(self) }
