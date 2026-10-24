/// ARC PULSE basket receiver on Sui, over Circle CCTP V2.
///
/// HOW SUI DIFFERS
///   CCTP V2 on Sui mints USDC to the burn's mint recipient as an owned coin,
///   so dollars and an order cannot be taken in the same call, and a burn
///   message can be completed by anyone. An order inside a burn's hook could
///   therefore be skipped. So, for Sui, the EVM Haberci sends TWO messages:
///     a plain burn, minted to the Kasa object (anyone completes it; `kabul`
///       then moves the coin into the vault's pool), and
///     a payload message to this package's auth identifier, which only this
///       module can stamp: it is carried out here or not at all.
///   The payload is abi.encode(bytes32 kaynak, bytes32 hedef, bytes veri,
///   uint256 dolar). The order is recorded; `kasa::uygula_*` carries it out
///   once the coin type is named and, for a buy, the pool holds its dollars.
///
/// TRANSACTIONS (PTB)
///   t = haberci::bilet(message, attestation)
///   r = message_transmitter_v2::receive_message_with_package_auth(t, &mut mt_state)
///   s = haberci::isle(&haberci, &mut kasa, r)
///   z = message_transmitter_v2::stamp_receipt(s, &mt_state)
///   message_transmitter_v2::complete_receive_message(z, &mt_state)
/// Only the non-version-gated ticket functions are called from here, as
/// Circle recommends, so a CCTP upgrade does not strand this package.
module sepet::haberci {
    use sui::table::{Self, Table};
    use sui::address;
    use message_transmitter_v2::auth::auth_caller_identifier;
    use message_transmitter_v2::receive_message::{Self as rm, Receipt, ReceiveMessageTicket, StampReceiptTicket};
    use token_messenger_minter_v2::deposit_for_burn::{Self as dfb, DepositForBurnWithPackageAuthTicket};
    use sepet::kasa::{Self, Kasa};
    use sui::clock::Clock;
    use cetus_clmm::pool::{Self as cpool, Pool};

    const AL: u8 = 2;
    const SAT: u8 = 3;
    const KESINLIK: u32 = 2000;

    const ESadeceKurucu: u64 = 1;
    const EIkizYok: u64 = 2;
    const EKotuMesaj: u64 = 3;
    const ESadeceDefter: u64 = 4;
    const EKesinlik: u64 = 5;
    const EYanlisKasa: u64 = 6;
    const EZatenBagli: u64 = 7;

    /// This package's identity to CCTP. Only this module can make one.
    public struct HaberciYetki has drop {}

    public struct Haberci has key {
        id: UID,
        kasa: address,
        defter_zincir: u32,
        defter: address,
        ikiz: Table<u32, address>,
        kurucu: Option<address>,
    }

    /// A vault and its receiver, both shared. The creator names the twins
    /// and then locks it for good.
    public fun kur<C>(domain: u32, defter_zincir: u32, defter: address, ctx: &mut TxContext) {
        let k = kasa::yeni<C>(domain, ctx);
        let h = Haberci { id: object::new(ctx), kasa: kasa::kimlik(&k), defter_zincir, defter, ikiz: table::new(ctx), kurucu: option::some(ctx.sender()) };
        kasa::paylas(k);
        transfer::share_object(h);
    }

    public fun ikiz_ekle(h: &mut Haberci, domain: u32, karsi: address, ctx: &TxContext) {
        assert!(h.kurucu == option::some(ctx.sender()), ESadeceKurucu);
        /* once per chain, never changed */
        assert!(!h.ikiz.contains(domain), EZatenBagli);
        h.ikiz.add(domain, karsi);
    }

    /// v4: the founder, before the lock: coin T is bought and sold through
    /// Cetus pool `pool` (the dollar its coin A), at most `tavan` dollars per
    /// call; the pool's price now is the vault's first reference.
    public fun liste_ekle_a<C, T>(h: &Haberci, k: &mut Kasa<C>, pool: &Pool<C, T>, tavan: u64, clock: &Clock, ctx: &TxContext) {
        assert!(h.kurucu == option::some(ctx.sender()), ESadeceKurucu);
        assert!(kasa::kimlik(k) == h.kasa, EYanlisKasa);
        kasa::liste_yaz<C, T>(k, object::id(pool), true, cpool::current_sqrt_price(pool), tavan, clock);
    }

    /// The same for pool<T, C> (the dollar its coin B).
    public fun liste_ekle_b<C, T>(h: &Haberci, k: &mut Kasa<C>, pool: &Pool<T, C>, tavan: u64, clock: &Clock, ctx: &TxContext) {
        assert!(h.kurucu == option::some(ctx.sender()), ESadeceKurucu);
        assert!(kasa::kimlik(k) == h.kasa, EYanlisKasa);
        kasa::liste_yaz<C, T>(k, object::id(pool), false, cpool::current_sqrt_price(pool), tavan, clock);
    }

    public fun kilitle(h: &mut Haberci, ctx: &TxContext) {
        assert!(h.kurucu == option::some(ctx.sender()), ESadeceKurucu);
        h.kurucu = option::none();
    }

    /// The destination caller (and recipient) the Defter's messages carry.
    public fun yetki_kimligi(): address { auth_caller_identifier<HaberciYetki>() }

    public fun bilet(mesaj: vector<u8>, imza: vector<u8>): ReceiveMessageTicket<HaberciYetki> {
        rm::create_receive_message_ticket(HaberciYetki {}, mesaj, imza)
    }

    /* ---- the EVM ABI, a word at a time ---- */

    fun kelime_u256(b: &vector<u8>, o: u64): u256 { let mut v = 0u256; let mut j = 0; while (j < 32) { v = (v << 8) | (b[o + j] as u256); j = j + 1; }; v }
    fun kelime_adres(b: &vector<u8>, o: u64): address {
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

    /// Carry out a message received for this package and hand back the ticket
    /// that lets the transaction stamp and complete it.
    public fun isle<C>(h: &Haberci, k: &mut Kasa<C>, receipt: Receipt): StampReceiptTicket<HaberciYetki> {
        assert!(rm::recipient(&receipt) == yetki_kimligi(), EKotuMesaj);
        assert!(rm::finality_threshold_executed(&receipt) >= KESINLIK, EKesinlik);
        let kaynak = rm::source_domain(&receipt);
        assert!(h.ikiz.contains(kaynak), EIkizYok);
        assert!(rm::sender(&receipt) == *h.ikiz.borrow(kaynak), EKotuMesaj);
        assert!(kasa::kimlik(k) == h.kasa, EYanlisKasa);
        let yuk = *rm::message_body(&receipt);
        /* only the Defter, on its chain, orders; only this vault */
        assert!(kaynak == h.defter_zincir && kelime_adres(&yuk, 0) == h.defter, ESadeceDefter);
        assert!(kelime_adres(&yuk, 32) == h.kasa, EYanlisKasa);
        let dolar = u64e(kelime_u256(&yuk, 96));
        let veri = dilim(&yuk, 160, (kelime_u256(&yuk, 128) as u64));
        let tur = (kelime_u256(&veri, 0) as u8);
        let id = (kelime_u256(&veri, 32) as u64);
        if (tur == AL) {
            kasa::emir_kaydet(k, AL, id, kelime_adres(&veri, 64), dolar, u64e(kelime_u256(&veri, 96)), 0, 0, false, 0, @0x0);
        } else if (tur == SAT) {
            let ofs = (kelime_u256(&veri, 64) as u64);
            let mut miktar = kelime_u256(&veri, 96);
            let mut arz = kelime_u256(&veri, 128);
            let hz = (kelime_u256(&veri, 160) as u32);
            let alici = kelime_adres(&veri, 192);
            while (arz > 18446744073709551615) { arz = arz >> 1; miktar = miktar >> 1; };
            let n = (kelime_u256(&veri, ofs) as u64);
            let mut i = 0;
            while (i < n) {
                kasa::emir_kaydet(k, SAT, id, kelime_adres(&veri, ofs + 32 + 32 * i), 0, 0, (miktar as u64), (arz as u64), i == 0, hz, alici);
                i = i + 1;
            };
        } else abort EKotuMesaj;
        rm::create_stamp_receipt_ticket(HaberciYetki {}, receipt)
    }

    /// Anyone: the vault's queued payout `id`, locked into a CCTP burn ticket
    /// for its chain and holder (no hook, any relayer may deliver). The
    /// transaction passes it to deposit_for_burn_with_package_auth.
    public fun gideni_gonder<C: drop>(k: &mut Kasa<C>, id: u64, ctx: &mut TxContext): DepositForBurnWithPackageAuthTicket<C, HaberciYetki> {
        let (zincir, alici, para) = kasa::gideni_al(k, id);
        dfb::create_deposit_for_burn_with_package_auth_ticket(sui::coin::from_balance(para, ctx), zincir, alici, @0x0, 0, KESINLIK, vector[], HaberciYetki {})
    }
}
