/// The basket's order intake on Sui, over LayerZero (arastirma/sepet-v2-tasarim.md).
///
/// Orders come from the Arc HaberciLZ (the LayerZero peer, checked by
/// OApp), ABI-encoded as
///   abi.encode(bytes32 kaynak, bytes32 hedef, bytes veri, uint256 miktar, uint256 beklenen)
/// where `kaynak` must be the Defter and `hedef` this package's vault.
/// LayerZero's executor delivers them by itself (`lz_receive`, registered
/// with the endpoint through `lz_receive_info`).
///
/// Sui needs the coin type of a basket asset to carry out its order, and
/// the order names it only by hash; so, as in v1, an order is recorded in
/// the vault and anyone carries it out (`kasa::uygula_al<C, T>`) once the
/// vault's pool holds its dollars. The dollars come separately, as a plain
/// CCTP burn minted to the Kasa object (no fee on that route, so what
/// arrives is what was sent), completed by anyone with Circle's own flow and
/// taken in with `kasa::kabul`.
module sepet::emir;

use call::{call::{Call, Void}, call_cap::CallCap};
use endpoint_v2::{endpoint_v2::EndpointV2, lz_receive::LzReceiveParam};
use oapp::{endpoint_calls, oapp::{Self, AdminCap, OApp}, oapp_info_v1, ptb_builder_helper};
use ptb_move_call::{argument, move_call};
use std::type_name;
use sui::{address, bcs, event};
use utils::{buffer_writer, package};
use sepet::kasa::{Self, Kasa};

const AL: u8 = 2;
const SAT: u8 = 3;
const LZ_RECEIVE_INFO_VERSION_1: u16 = 1;

const ESadeceKurucu: u64 = 1;
const EKurulu: u64 = 2;
const EYanlisOApp: u64 = 3;
const EYanlisKasa: u64 = 4;
const ESadeceDefter: u64 = 5;
const EKotuMesaj: u64 = 6;

public struct EMIR has drop {}

public struct Emir has key {
    id: UID,
    cap: CallCap,
    oapp: address,
    kasa: address,
    defter: address,
    kurucu: Option<address>,
}

public struct Kaydedildi has copy, drop { tur: u8, launch: u64, dolar: u64 }

fun init(otw: EMIR, ctx: &mut TxContext) {
    let (cap, admin, oapp_adr) = oapp::new(&otw, ctx);
    transfer::share_object(Emir { id: object::new(ctx), cap, oapp: oapp_adr, kasa: @0x0, defter: @0x0, kurucu: option::some(ctx.sender()) });
    transfer::public_transfer(admin, ctx.sender());
}

/// Once, by the publisher: the vault (shared) for dollar type C, and the Defter on Arc.
public fun kur<C>(self: &mut Emir, domain: u32, defter: address, ctx: &mut TxContext) {
    assert!(self.kurucu == option::some(ctx.sender()), ESadeceKurucu);
    assert!(self.kasa == @0x0, EKurulu);
    let k = kasa::yeni<C>(domain, ctx);
    self.kasa = kasa::kimlik(&k);
    self.defter = defter;
    kasa::paylas(k);
}

public fun kasa_adresi(self: &Emir): address { self.kasa }
public fun oapp_adresi(self: &Emir): address { self.oapp }

/* ---- the EVM ABI, a word at a time --------------------------------- */

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
fun dilim(b: &vector<u8>, o: u64, n: u64): vector<u8> {
    let mut s = vector[];
    let mut j = 0;
    while (j < n) { s.push_back(b[o + j]); j = j + 1; };
    s
}
fun u64e(v: u256): u64 { if (v > 18446744073709551615) 18446744073709551615 else (v as u64) }

/// Record an order from the Arc HaberciLZ in the vault.
public(package) fun isle<C>(self: &Emir, k: &mut Kasa<C>, m: &vector<u8>) {
    assert!(m.length() >= 192, EKotuMesaj);
    assert!(kasa::kimlik(k) == self.kasa, EYanlisKasa);
    assert!(adres(m, 0) == self.defter, ESadeceDefter);
    assert!(adres(m, 32) == self.kasa, EYanlisKasa);
    let ofs = (kelime(m, 64) as u64);
    let veri = dilim(m, ofs + 32, (kelime(m, ofs) as u64));
    /* the route to Sui (a plain CCTP burn) takes no fee: the least that arrives is what was sent */
    let dolar = u64e(kelime(m, 128));
    let tur = (kelime(&veri, 0) as u8);
    let id = (kelime(&veri, 32) as u64);
    if (tur == AL) {
        kasa::emir_kaydet(k, AL, id, adres(&veri, 64), dolar, u64e(kelime(&veri, 96)), 0, 0, false, 0, @0x0);
    } else if (tur == SAT) {
        let vofs = (kelime(&veri, 64) as u64);
        let mut miktar = kelime(&veri, 96);
        let mut arz = kelime(&veri, 128);
        let hz = (kelime(&veri, 160) as u32);
        let alici = adres(&veri, 192);
        /* the share is a ratio; scaled to fit u64 together */
        while (arz > 18446744073709551615) { arz = arz >> 1; miktar = miktar >> 1; };
        let n = (kelime(&veri, vofs) as u64);
        let mut i = 0;
        while (i < n) {
            kasa::emir_kaydet(k, SAT, id, adres(&veri, vofs + 32 + 32 * i), 0, 0, (miktar as u64), (arz as u64), i == 0, hz, alici);
            i = i + 1;
        };
    } else abort EKotuMesaj;
    event::emit(Kaydedildi { tur, launch: id, dolar });
}

/* ---- LayerZero ------------------------------------------------------ */

/// The executor's call. The peer check (the Arc HaberciLZ) is OApp's.
#[allow(lint(self_transfer))]
public fun lz_receive<C>(self: &Emir, oapp: &OApp, k: &mut Kasa<C>, call: Call<LzReceiveParam, Void>, ctx: &mut TxContext) {
    assert!(object::id_address(oapp) == self.oapp, EYanlisOApp);
    let param = oapp.lz_receive(&self.cap, call);
    let (_, _, _, _, message, _, _, deger) = param.destroy();
    /* a native value is not expected; whatever came goes to whoever delivered */
    if (deger.is_some()) transfer::public_transfer(deger.destroy_some(), ctx.sender()) else deger.destroy_none();
    self.isle(k, &message);
}

/// What the executor must call, registered with the endpoint: this object,
/// the OApp, the vault (shared) and the dollar type.
public fun lz_receive_info<C>(self: &Emir, oapp: &OApp): vector<u8> {
    let cagri = vector[
        move_call::create(
            package::package_of_type<Emir>(),
            b"emir".to_ascii_string(),
            b"lz_receive".to_ascii_string(),
            vector[
                argument::create_object(object::id_address(self)),
                argument::create_object(object::id_address(oapp)),
                argument::create_object(self.kasa),
                argument::create_id(ptb_builder_helper::lz_receive_call_id()),
            ],
            vector[type_name::with_defining_ids<C>()],
            false,
            vector[],
        ),
    ];
    let mut w = buffer_writer::new();
    w.write_u16(LZ_RECEIVE_INFO_VERSION_1).write_bytes(bcs::to_bytes(&cagri));
    w.to_bytes()
}

/// Once, by the AdminCap holder: register with the endpoint.
public fun kaydet<C>(self: &Emir, oapp: &OApp, admin: &AdminCap, endpoint: &mut EndpointV2, ctx: &mut TxContext) {
    let bilgi = oapp_info_v1::create(object::id_address(oapp), vector[], self.lz_receive_info<C>(oapp), vector[]);
    endpoint_calls::register_oapp(oapp, admin, endpoint, bilgi.encode(), ctx);
}

#[test_only]
public fun yeni_test(ctx: &mut TxContext): Emir {
    let otw = EMIR {};
    let (cap, admin, oapp_adr) = oapp::new(&otw, ctx);
    transfer::public_transfer(admin, ctx.sender());
    Emir { id: object::new(ctx), cap, oapp: oapp_adr, kasa: @0x0, defter: @0x0, kurucu: option::some(ctx.sender()) }
}
#[test_only]
public fun paylas_test(e: Emir) { transfer::share_object(e) }
