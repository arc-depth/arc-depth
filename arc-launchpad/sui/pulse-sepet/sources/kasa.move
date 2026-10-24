/// ARC PULSE basket vault on Sui: the Sui counterpart of
/// contracts/sepet/SepetKasasi.sol.
///
/// One shared Kasa per dollar type. For every launch whose basket names a
/// coin on Sui it keeps that launch's units of the coin, in its own ledger:
/// a launch's money can never pay another launch.
///
/// NO ORACLE, NO POOL
///   The vault never swaps. A buy offers dollars for at least Q(t) units of
///   the coin, a sell offers units for at least P(t) dollars; both start at
///   BASLANGIC_KAT times the last price this vault filled at (or the
///   founder's quote) and halve every YARILANMA, never below 1/TABAN_KAT.
///   A filler delivers the coin and takes the dollars (or the reverse):
///   nothing for anyone to sandwich.
///
/// ORDERS
///   Only the Defter on Arc orders a buy or a sale. Its messages arrive over
///   CCTP V2 through this package's receiving module, which calls the
///   package-only functions below; nothing outside the package can.
///
/// WHAT LEAVES
///   Only a redemption ordered by the Defter: that launch's share of each
///   coin, sold by auction, the dollars paid to the holder (here, or queued
///   for the receiving module to send to their chain). No owner, no pause,
///   no withdrawal, no sweep.
module sepet::kasa {
    use std::type_name::{Self, TypeName};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::dynamic_field as df;
    use sui::table::{Self, Table};
    use sui::event;
    use sui::hash;
    use sui::address;
    use sui::transfer::Receiving;
    use cetus_clmm::config::GlobalConfig;
    use cetus_clmm::pool::{Self as cpool, Pool};

    const BASLANGIC_KAT: u64 = 2;
    const TABAN_KAT: u64 = 16;
    const YARILANMA_MS: u64 = 1_800_000;   // 30 minutes
    const BEKLEME_MS: u64 = 86_400_000;    // 1 day

    const ALIM: u8 = 1;
    const SATIM: u8 = 2;

    const EBitti: u64 = 1;
    const EAz: u64 = 2;
    const EErken: u64 = 3;
    const ESifir: u64 = 4;
    const EYanlisCoin: u64 = 5;
    const EYanlisTur: u64 = 6;
    const EKotuEmir: u64 = 7;
    const EHavuzYetersiz: u64 = 8;
    const EYapildi: u64 = 9;

    public struct Kasa<phantom C> has key {
        id: UID,
        /// the CCTP domain this vault lives on
        domain: u32,
        ihaleler: Table<u64, Ihale>,
        ihale_sayisi: u64,
        /// dollars a payout waits on before the receiving module sends it
        /// to another chain
        giden: Table<u64, Giden<C>>,
        giden_sayisi: u64,
        /// dollars CCTP minted to this vault and `kabul` took in, not yet
        /// given to an order
        havuz: Balance<C>,
        /// orders the receiver recorded, carried out by `uygula_*` once the
        /// coin type is named (and, for a buy, the dollars are in the pool)
        emirler: Table<u64, Emir>,
        emir_sayisi: u64,
    }

    /// An order from the Defter. A Sui coin type is named across chains by
    /// keccak256 of its type string; `uygula_*` checks the T it is given.
    public struct Emir has store, drop {
        tur: u8,
        launch: u64,
        varlik: address,
        dolar: u64,
        ref: u64,
        miktar: u64,
        arz: u64,
        ilk: bool,
        hedef_zincir: u32,
        alici: address,
        yapildi: bool,
    }

    public struct Ihale has store, drop {
        tur: u8,
        launch: u64,
        varlik: TypeName,
        verilen: u64,
        baslangic: u64,
        baslama: u64,
        hedef_zincir: u32,
        alici: address,
        bitti: bool,
    }

    public struct Giden<phantom C> has store {
        zincir: u32,
        alici: address,
        para: Balance<C>,
    }

    /* ledger keys: dynamic fields on the Kasa */
    public struct DolarKey has copy, drop, store { launch: u64 }
    public struct TaahhutKey has copy, drop, store { launch: u64 }
    public struct VarlikKey has copy, drop, store { launch: u64, varlik: TypeName }
    public struct FiyatKey has copy, drop, store { varlik: TypeName }
    public struct Fiyat has store, drop { dolar: u64, varlik: u64 }
    /// the units a sell auction offers, out of the ledger while it runs
    public struct EmanetKey has copy, drop, store { ihale: u64 }

    public struct Ilan has copy, drop { id: u64, tur: u8, launch: u64, varlik: TypeName, verilen: u64, baslangic: u64 }
    public struct Doldu has copy, drop { id: u64, dolduran: address, verilen: u64, alinan: u64 }
    public struct Odendi has copy, drop { zincir: u32, alici: address, miktar: u64, giden: bool }

    /* ---- creation ---------------------------------------------------- */

    public(package) fun yeni<C>(domain: u32, ctx: &mut TxContext): Kasa<C> {
        Kasa { id: object::new(ctx), domain, ihaleler: table::new(ctx), ihale_sayisi: 0, giden: table::new(ctx), giden_sayisi: 0,
            havuz: balance::zero(), emirler: table::new(ctx), emir_sayisi: 0 }
    }

    public(package) fun paylas<C>(k: Kasa<C>) { transfer::share_object(k) }

    /* ---- ledger reads ------------------------------------------------ */

    public fun dolar_bakiye<C>(k: &Kasa<C>, launch: u64): u64 {
        let key = DolarKey { launch };
        if (df::exists(&k.id, key)) df::borrow<DolarKey, Balance<C>>(&k.id, key).value() else 0
    }

    public fun bakiye<C, T>(k: &Kasa<C>, launch: u64): u64 {
        let key = VarlikKey { launch, varlik: type_name::with_defining_ids<T>() };
        if (df::exists(&k.id, key)) df::borrow<VarlikKey, Balance<T>>(&k.id, key).value() else 0
    }

    fun taahhut<C>(k: &Kasa<C>, launch: u64): u64 {
        let key = TaahhutKey { launch };
        if (df::exists(&k.id, key)) *df::borrow<TaahhutKey, u64>(&k.id, key) else 0
    }

    fun taahhut_yaz<C>(k: &mut Kasa<C>, launch: u64, v: u64) {
        let key = TaahhutKey { launch };
        if (df::exists(&k.id, key)) *df::borrow_mut<TaahhutKey, u64>(&mut k.id, key) = v
        else df::add(&mut k.id, key, v);
    }

    fun dolar_mut<C>(k: &mut Kasa<C>, launch: u64): &mut Balance<C> {
        let key = DolarKey { launch };
        if (!df::exists(&k.id, key)) df::add(&mut k.id, key, balance::zero<C>());
        df::borrow_mut(&mut k.id, key)
    }

    fun varlik_mut<C, T>(k: &mut Kasa<C>, launch: u64): &mut Balance<T> {
        let key = VarlikKey { launch, varlik: type_name::with_defining_ids<T>() };
        if (!df::exists(&k.id, key)) df::add(&mut k.id, key, balance::zero<T>());
        df::borrow_mut(&mut k.id, key)
    }

    fun son_fiyat<C>(k: &Kasa<C>, v: TypeName): (u64, u64) {
        let key = FiyatKey { varlik: v };
        if (df::exists(&k.id, key)) { let f = df::borrow<FiyatKey, Fiyat>(&k.id, key); (f.dolar, f.varlik) } else (0, 0)
    }

    fun fiyat_yaz<C>(k: &mut Kasa<C>, v: TypeName, dolar: u64, varlik: u64) {
        let key = FiyatKey { varlik: v };
        if (df::exists(&k.id, key)) { let f = df::borrow_mut<FiyatKey, Fiyat>(&mut k.id, key); f.dolar = dolar; f.varlik = varlik; }
        else df::add(&mut k.id, key, Fiyat { dolar, varlik });
    }

    fun oran(a: u64, b: u64, c: u64): u64 { (((a as u128) * (b as u128)) / (c as u128)) as u64 }

    /* ---- orders (package only: the CCTP receiver) --------------------- */

    /// Buy coin T with `para` for `launch`. `ref` is the founder's quote
    /// (units these dollars buy), used when this vault never filled T.
    public(package) fun al_emri<C, T>(k: &mut Kasa<C>, launch: u64, para: Balance<C>, ref: u64, clock: &Clock) {
        let d = para.value();
        assert!(d > 0, ESifir);
        dolar_mut(k, launch).join(para);
        let t = taahhut(k, launch);
        taahhut_yaz(k, launch, t + d);
        let v = type_name::with_defining_ids<T>();
        let (fd, fv) = son_fiyat(k, v);
        let mut beklenen = if (fd > 0) oran(d, fv, fd) else ref;
        if (beklenen == 0) beklenen = 1;
        ilan(k, ALIM, launch, v, d, beklenen * BASLANGIC_KAT, 0, @0x0, clock);
    }

    /// A holder burned `miktar` of `arz`: their share of this launch's
    /// unspent dollars is paid at once, their share of coin T goes up for
    /// sale. Called once per basket coin on this chain; `ilk` marks the
    /// call that also pays the dollar share.
    public(package) fun sat_emri<C, T>(
        k: &mut Kasa<C>, launch: u64, miktar: u64, arz: u64, ilk: bool,
        hedef_zincir: u32, alici: address, clock: &Clock, ctx: &mut TxContext,
    ) {
        assert!(arz > 0 && miktar > 0 && miktar <= arz, EKotuEmir);
        if (ilk) {
            let d = oran(dolar_bakiye(k, launch), miktar, arz);
            if (d > 0) {
                let p = dolar_mut(k, launch).split(d);
                ode(k, hedef_zincir, alici, p, ctx);
            }
        };
        let pay = oran(bakiye<C, T>(k, launch), miktar, arz);
        if (pay == 0) return;
        let v = type_name::with_defining_ids<T>();
        let (fd, fv) = son_fiyat(k, v);
        let mut beklenen = oran(pay, fd, fv);
        if (beklenen == 0) beklenen = 1;
        /* the units leave the ledger at once: a second redemption before
           this one fills must not count them again */
        let emanet = varlik_mut<C, T>(k, launch).split(pay);
        let id = k.ihale_sayisi;
        df::add(&mut k.id, EmanetKey { ihale: id }, emanet);
        ilan(k, SATIM, launch, v, pay, beklenen * BASLANGIC_KAT, hedef_zincir, alici, clock);
    }

    fun ilan<C>(k: &mut Kasa<C>, tur: u8, launch: u64, varlik: TypeName, verilen: u64, baslangic: u64, hz: u32, alici: address, clock: &Clock) {
        let id = k.ihale_sayisi;
        k.ihaleler.add(id, Ihale { tur, launch, varlik, verilen, baslangic, baslama: clock.timestamp_ms(), hedef_zincir: hz, alici, bitti: false });
        k.ihale_sayisi = id + 1;
        event::emit(Ilan { id, tur, launch, varlik, verilen, baslangic });
    }


    /* ---- orders over CCTP, carried out in two steps --------------------- */

    /// The id a coin type has across chains: keccak256 of its type string.
    public fun tip_kimligi<T>(): address {
        address::from_bytes(hash::keccak256(type_name::with_defining_ids<T>().into_string().as_bytes()))
    }

    /// Anyone: take a coin CCTP minted to this vault into the pool.
    public fun kabul<C>(k: &mut Kasa<C>, r: Receiving<Coin<C>>) {
        let c = transfer::public_receive(&mut k.id, r);
        k.havuz.join(c.into_balance());
    }

    public fun havuz<C>(k: &Kasa<C>): u64 { k.havuz.value() }
    public fun emir_sayisi<C>(k: &Kasa<C>): u64 { k.emir_sayisi }
    public fun kimlik<C>(k: &Kasa<C>): address { object::uid_to_address(&k.id) }

    public(package) fun emir_kaydet<C>(k: &mut Kasa<C>, tur: u8, launch: u64, varlik: address, dolar: u64, ref: u64,
                                       miktar: u64, arz: u64, ilk: bool, hedef_zincir: u32, alici: address) {
        let id = k.emir_sayisi;
        k.emirler.add(id, Emir { tur, launch, varlik, dolar, ref, miktar, arz, ilk, hedef_zincir, alici, yapildi: false });
        k.emir_sayisi = id + 1;
    }

    /// Anyone: open the buy order `id` names, for coin T, from the pool.
    public fun uygula_al<C, T>(k: &mut Kasa<C>, id: u64, clock: &Clock) {
        let (launch, dolar, ref) = {
            let e = k.emirler.borrow(id);
            assert!(!e.yapildi, EYapildi);
            assert!(e.tur == 2 && e.varlik == tip_kimligi<T>(), EYanlisCoin);
            (e.launch, e.dolar, e.ref)
        };
        assert!(k.havuz.value() >= dolar, EHavuzYetersiz);
        k.emirler.borrow_mut(id).yapildi = true;
        let para = k.havuz.split(dolar);
        al_emri<C, T>(k, launch, para, ref, clock);
    }

    /// Anyone: carry out the redemption order `id` names, for coin T.
    public fun uygula_sat<C, T>(k: &mut Kasa<C>, id: u64, clock: &Clock, ctx: &mut TxContext) {
        let (launch, miktar, arz, ilk, hz, alici) = {
            let e = k.emirler.borrow(id);
            assert!(!e.yapildi, EYapildi);
            assert!(e.tur == 3 && e.varlik == tip_kimligi<T>(), EYanlisCoin);
            (e.launch, e.miktar, e.arz, e.ilk, e.hedef_zincir, e.alici)
        };
        k.emirler.borrow_mut(id).yapildi = true;
        sat_emri<C, T>(k, launch, miktar, arz, ilk, hz, alici, clock, ctx);
    }

    /* ---- the auction ---------------------------------------------------- */

    /// What auction `id` asks for now: units for a buy, dollars for a sell.
    public fun istenen<C>(k: &Kasa<C>, id: u64, clock: &Clock): u64 {
        let h = k.ihaleler.borrow(id);
        let gecen = clock.timestamp_ms() - h.baslama;
        let n = gecen / YARILANMA_MS;
        let taban = h.baslangic / TABAN_KAT;
        if (n >= 64) return taban;
        let mut q = h.baslangic >> (n as u8);
        q = q - oran(q, gecen % YARILANMA_MS, 2 * YARILANMA_MS);
        if (q > taban) q else taban
    }

    /// Fill buy auction `id` with coin T; returns the dollars it spent.
    public fun doldur_alim<C, T>(k: &mut Kasa<C>, id: u64, gelen: Coin<T>, clock: &Clock, ctx: &mut TxContext): Coin<C> {
        let ist = istenen(k, id, clock);
        let (launch, verilen) = {
            let h = k.ihaleler.borrow(id);
            assert!(!h.bitti, EBitti);
            assert!(h.tur == ALIM, EYanlisTur);
            assert!(h.varlik == type_name::with_defining_ids<T>(), EYanlisCoin);
            (h.launch, h.verilen)
        };
        /* a redemption may have paid out part of the launch's dollars: this
           auction spends its proportional part of what is left */
        let t = taahhut(k, launch);
        let harca = oran(verilen, dolar_bakiye(k, launch), t);
        taahhut_yaz(k, launch, t - verilen);
        assert!(harca > 0, ESifir);
        let gerek = oran(ist, harca, verilen);
        let n = gelen.value();
        assert!(n > 0 && n >= gerek, EAz);
        k.ihaleler.borrow_mut(id).bitti = true;
        varlik_mut<C, T>(k, launch).join(gelen.into_balance());
        fiyat_yaz(k, type_name::with_defining_ids<T>(), harca, n);
        event::emit(Doldu { id, dolduran: ctx.sender(), verilen: harca, alinan: n });
        coin::from_balance(dolar_mut(k, launch).split(harca), ctx)
    }

    /// Fill sell auction `id` paying dollars; returns the units of T.
    public fun doldur_satim<C, T>(k: &mut Kasa<C>, id: u64, odeme: Coin<C>, clock: &Clock, ctx: &mut TxContext): Coin<T> {
        let ist = istenen(k, id, clock);
        let (verilen, hz, alici) = {
            let h = k.ihaleler.borrow(id);
            assert!(!h.bitti, EBitti);
            assert!(h.tur == SATIM, EYanlisTur);
            assert!(h.varlik == type_name::with_defining_ids<T>(), EYanlisCoin);
            (h.verilen, h.hedef_zincir, h.alici)
        };
        let n = odeme.value();
        assert!(n > 0 && n >= ist, EAz);
        k.ihaleler.borrow_mut(id).bitti = true;
        fiyat_yaz(k, type_name::with_defining_ids<T>(), n, verilen);
        event::emit(Doldu { id, dolduran: ctx.sender(), verilen, alinan: n });
        ode(k, hz, alici, odeme.into_balance(), ctx);
        let emanet: Balance<T> = df::remove(&mut k.id, EmanetKey { ihale: id });
        coin::from_balance(emanet, ctx)
    }

    /// An auction resting on its floor for BEKLEME restarts from there.
    public fun yeniden_baslat<C>(k: &mut Kasa<C>, id: u64, clock: &Clock) {
        let h = k.ihaleler.borrow_mut(id);
        assert!(!h.bitti, EBitti);
        assert!(clock.timestamp_ms() >= h.baslama + 4 * YARILANMA_MS + BEKLEME_MS, EErken);
        h.baslangic = h.baslangic / TABAN_KAT;
        if (h.baslangic == 0) h.baslangic = 1;
        h.baslama = clock.timestamp_ms();
    }

    public fun ihale_sayisi<C>(k: &Kasa<C>): u64 { k.ihale_sayisi }

    /* ---- payouts ------------------------------------------------------- */

    fun ode<C>(k: &mut Kasa<C>, hz: u32, alici: address, para: Balance<C>, ctx: &mut TxContext) {
        let miktar = para.value();
        if (hz == k.domain) {
            transfer::public_transfer(coin::from_balance(para, ctx), alici);
            event::emit(Odendi { zincir: hz, alici, miktar, giden: false });
        } else {
            let id = k.giden_sayisi;
            k.giden.add(id, Giden { zincir: hz, alici, para });
            k.giden_sayisi = id + 1;
            event::emit(Odendi { zincir: hz, alici, miktar, giden: true });
        }
    }

    /// The receiving module takes a queued payout to send it over CCTP.
    public(package) fun gideni_al<C>(k: &mut Kasa<C>, id: u64): (u32, address, Balance<C>) {
        let Giden { zincir, alici, para } = k.giden.remove(id);
        (zincir, alici, para)
    }

    public fun giden_sayisi<C>(k: &Kasa<C>): u64 { k.giden_sayisi }

    /* ---- v4: filling an auction from a Cetus pool ------------------------
       (23 Oct 2026, arastirma/v4-tasarim.md) Anyone may fill an open auction
       through the Cetus CLMM pool the list names for its coin; the vault
       itself swaps. The list (pool, a reference price, a size cap) is written
       by the receiver's founder before the lock, never after.

       Cetus keeps no price history on chain, so the bound is a reference the
       vault keeps per coin: it follows the pool's price by at most
       IZCI_ADIM_BPS (in sqrt) per elapsed minute, IZCI_TAVAN_BPS at once. A
       swap runs only while the pool sits within SAPMA_BPS of the reference,
       its price limit is the reference +- SAPMA_BPS, at most `tavan` dollars
       move per call, and what comes out must be worth the input at the
       reference less TOLERANS_BPS. A price pushed and pulled back inside one
       transaction can get a swap no worse than ~3% off the reference; moving
       the reference itself takes repeating that for minutes. */

    const BAHSIS: u64 = 50_000;           // $0.05 to whoever fills from the pool
    const BAHSIS_ESIGI: u64 = 1_000_000;  // once at least $1 changed hands
    const IZCI_ADIM_BPS: u256 = 50;       // sqrt, per minute (~1% in price)
    const IZCI_TAVAN_BPS: u256 = 500;
    const SAPMA_BPS: u256 = 150;          // sqrt (~3% in price)
    const TOLERANS_BPS: u256 = 400;
    const Q64: u256 = 18446744073709551616;

    const EListede: u64 = 10;
    const EHavuz: u64 = 11;
    const EFiyat: u64 = 12;

    public struct ListeKey has copy, drop, store { varlik: TypeName }
    /// `dolar_a`: the dollar is the pool's coin A. `izci`: the reference
    /// sqrt price (B per A, Q64) and when it last moved. `tavan`: dollars per call.
    public struct Liste has store, drop { havuz: ID, dolar_a: bool, izci: u128, izci_ms: u64, tavan: u64 }

    public struct Takas has copy, drop { ihale: u64, dolduran: address, verilen: u64, alinan: u64, kalan: u64 }

    /// The receiver writes the list (its founder, before the lock).
    public(package) fun liste_yaz<C, T>(k: &mut Kasa<C>, havuz: ID, dolar_a: bool, izci: u128, tavan: u64, clock: &Clock) {
        let key = ListeKey { varlik: type_name::with_defining_ids<T>() };
        if (df::exists(&k.id, key)) { df::remove<ListeKey, Liste>(&mut k.id, key); };
        df::add(&mut k.id, key, Liste { havuz, dolar_a, izci, izci_ms: clock.timestamp_ms(), tavan });
    }

    public fun liste<C, T>(k: &Kasa<C>): (ID, bool, u128, u64, u64) {
        let l = df::borrow<ListeKey, Liste>(&k.id, ListeKey { varlik: type_name::with_defining_ids<T>() });
        (l.havuz, l.dolar_a, l.izci, l.izci_ms, l.tavan)
    }

    /// The reference moves toward `spot`, at most as far as the time since it
    /// last moved allows; returns the reference before the move.
    fun izle<C, T>(k: &mut Kasa<C>, havuz: ID, dolar_a: bool, spot: u128, clock: &Clock): (u128, u64) {
        let key = ListeKey { varlik: type_name::with_defining_ids<T>() };
        assert!(df::exists(&k.id, key), EListede);
        let l = df::borrow_mut<ListeKey, Liste>(&mut k.id, key);
        assert!(l.havuz == havuz && l.dolar_a == dolar_a, EHavuz);
        let eski = l.izci;
        let simdi = clock.timestamp_ms();
        let mut adim = ((simdi - l.izci_ms) as u256) * IZCI_ADIM_BPS / 60_000;
        if (adim > IZCI_TAVAN_BPS) adim = IZCI_TAVAN_BPS;
        let r = eski as u256;
        let alt = r * (10_000 - adim) / 10_000;
        let ust = r * (10_000 + adim) / 10_000;
        let s = spot as u256;
        let yeni = if (s < alt) alt else if (s > ust) ust else s;
        if (adim > 0) { l.izci = yeni as u128; l.izci_ms = simdi; };
        (eski, l.tavan)
    }

    /// Price limit for a swap in direction `a2b` around reference `r`; aborts
    /// when the pool sits too far from it.
    fun sinir(r: u128, spot: u128, a2b: bool): u128 {
        let (r, s) = (r as u256, spot as u256);
        let fark = if (s > r) s - r else r - s;
        assert!(fark * 10_000 <= r * SAPMA_BPS, EFiyat);
        let limit = if (a2b) r * (10_000 - SAPMA_BPS) / 10_000 else r * (10_000 + SAPMA_BPS) / 10_000;
        assert!(if (a2b) limit < s else limit > s, EFiyat);
        limit as u128
    }

    /// What `girdi` of coin A (`a_dan`) or coin B is worth in the other at sqrt `r`.
    fun karsilik(girdi: u64, r: u128, a_dan: bool): u256 {
        let (g, r) = (girdi as u256, r as u256);
        if (a_dan) g * r / Q64 * r / Q64 else g * Q64 / r * Q64 / r
    }

    fun en_az(deger: u256): u256 { deger * (10_000 - TOLERANS_BPS) / 10_000 }

    /// The auction's open buy: (launch, verilen, harca) — the dollars it may spend now.
    fun alim_acik<C, T>(k: &Kasa<C>, id: u64): (u64, u64, u64) {
        let h = k.ihaleler.borrow(id);
        assert!(!h.bitti, EBitti);
        assert!(h.tur == ALIM, EYanlisTur);
        assert!(h.varlik == type_name::with_defining_ids<T>(), EYanlisCoin);
        let harca = oran(h.verilen, dolar_bakiye(k, h.launch), taahhut(k, h.launch));
        (h.launch, h.verilen, harca)
    }

    /// Book a buy that spent `harcanan` (pay + tip) of the auction's `harca` and brought `gelen` units.
    fun alim_yaz<C, T>(k: &mut Kasa<C>, id: u64, launch: u64, verilen: u64, harca: u64, harcanan: u64, odenen: u64,
                       gelen: Balance<T>, ctx: &TxContext) {
        let n = gelen.value();
        let v = if (harca - harcanan < BAHSIS_ESIGI) verilen else { let x = oran(harcanan, verilen, harca); if (x == 0) 1 else if (x > verilen) verilen else x };
        let t = taahhut(k, launch);
        taahhut_yaz(k, launch, t - v);
        {
            let h = k.ihaleler.borrow_mut(id);
            if (v == verilen) h.bitti = true
            else { h.baslangic = { let b = oran(h.baslangic, verilen - v, verilen); if (b == 0) 1 else b }; h.verilen = verilen - v; };
        };
        varlik_mut<C, T>(k, launch).join(gelen);
        fiyat_yaz(k, type_name::with_defining_ids<T>(), odenen, n);
        event::emit(Takas { ihale: id, dolduran: ctx.sender(), verilen: odenen, alinan: n, kalan: verilen - v });
    }

    /// Anyone: fill buy auction `id` (or part of it) through pool<C, T> (the dollar is coin A). Returns the tip.
    public fun takas_al_a<C, T>(k: &mut Kasa<C>, id: u64, cetus: &GlobalConfig, pool: &mut Pool<C, T>, clock: &Clock, ctx: &mut TxContext): Coin<C> {
        let (launch, verilen, harca) = alim_acik<C, T>(k, id);
        assert!(harca > BAHSIS, ESifir);
        let spot = cpool::current_sqrt_price(pool);
        let (r, tavan) = izle<C, T>(k, object::id(pool), true, spot, clock);
        let limit = sinir(r, spot, true);
        let mut girdi = harca - BAHSIS;
        if (girdi > tavan) girdi = tavan;
        let mut para = dolar_mut(k, launch).split(girdi);
        let (sifir, gelen, makbuz) = cpool::flash_swap<C, T>(cetus, pool, true, true, girdi, limit, clock);
        let odenen = cpool::swap_pay_amount(&makbuz);
        cpool::repay_flash_swap<C, T>(cetus, pool, para.split(odenen), balance::zero(), makbuz);
        sifir.destroy_zero();
        dolar_mut(k, launch).join(para);
        assert!(odenen > 0 && (gelen.value() as u256) >= en_az(karsilik(odenen, r, true)), EAz);
        let bahsis = if (odenen >= BAHSIS_ESIGI) BAHSIS else 0;
        let tip = dolar_mut(k, launch).split(bahsis);
        alim_yaz<C, T>(k, id, launch, verilen, harca, odenen + bahsis, odenen, gelen, ctx);
        coin::from_balance(tip, ctx)
    }

    /// The same through pool<T, C> (the dollar is coin B).
    public fun takas_al_b<C, T>(k: &mut Kasa<C>, id: u64, cetus: &GlobalConfig, pool: &mut Pool<T, C>, clock: &Clock, ctx: &mut TxContext): Coin<C> {
        let (launch, verilen, harca) = alim_acik<C, T>(k, id);
        assert!(harca > BAHSIS, ESifir);
        let spot = cpool::current_sqrt_price(pool);
        let (r, tavan) = izle<C, T>(k, object::id(pool), false, spot, clock);
        let limit = sinir(r, spot, false);
        let mut girdi = harca - BAHSIS;
        if (girdi > tavan) girdi = tavan;
        let mut para = dolar_mut(k, launch).split(girdi);
        let (gelen, sifir, makbuz) = cpool::flash_swap<T, C>(cetus, pool, false, true, girdi, limit, clock);
        let odenen = cpool::swap_pay_amount(&makbuz);
        cpool::repay_flash_swap<T, C>(cetus, pool, balance::zero(), para.split(odenen), makbuz);
        sifir.destroy_zero();
        dolar_mut(k, launch).join(para);
        assert!(odenen > 0 && (gelen.value() as u256) >= en_az(karsilik(odenen, r, false)), EAz);
        let bahsis = if (odenen >= BAHSIS_ESIGI) BAHSIS else 0;
        let tip = dolar_mut(k, launch).split(bahsis);
        alim_yaz<C, T>(k, id, launch, verilen, harca, odenen + bahsis, odenen, gelen, ctx);
        coin::from_balance(tip, ctx)
    }

    /// The auction's open sale: (verilen, hedef zincir, alici).
    fun satim_acik<C, T>(k: &Kasa<C>, id: u64): (u64, u32, address) {
        let h = k.ihaleler.borrow(id);
        assert!(!h.bitti, EBitti);
        assert!(h.tur == SATIM, EYanlisTur);
        assert!(h.varlik == type_name::with_defining_ids<T>(), EYanlisCoin);
        (h.verilen, h.hedef_zincir, h.alici)
    }

    /// Book a sale of `satilan` units that brought `gelen` dollars; the holder is paid (less the tip).
    fun satim_yaz<C, T>(k: &mut Kasa<C>, id: u64, verilen: u64, satilan: u64, hz: u32, alici: address, mut gelen: Balance<C>,
                        ctx: &mut TxContext): Coin<C> {
        let n = gelen.value();
        let bahsis = if (n >= BAHSIS_ESIGI + BAHSIS) BAHSIS else 0;
        let tip = gelen.split(bahsis);
        {
            let h = k.ihaleler.borrow_mut(id);
            if (satilan == verilen) h.bitti = true
            else { h.baslangic = { let b = oran(h.baslangic, verilen - satilan, verilen); if (b == 0) 1 else b }; h.verilen = verilen - satilan; };
        };
        if (satilan == verilen) { let e: Balance<T> = df::remove(&mut k.id, EmanetKey { ihale: id }); e.destroy_zero(); };
        fiyat_yaz(k, type_name::with_defining_ids<T>(), n, satilan);
        event::emit(Takas { ihale: id, dolduran: ctx.sender(), verilen: satilan, alinan: n, kalan: verilen - satilan });
        ode(k, hz, alici, gelen, ctx);
        coin::from_balance(tip, ctx)
    }

    /// Units of T worth `tavan` dollars at reference `r`, the coin T being A (`t_a`) or B.
    fun birim_tavani(tavan: u64, r: u128, t_a: bool): u64 {
        /* dollars -> units: the dollar is the other coin */
        let v = karsilik(tavan, r, !t_a);
        if (v > 18446744073709551615) 18446744073709551615 else (v as u64)
    }

    /// Anyone: fill sell auction `id` (or part of it) through pool<C, T> (the dollar is coin A). Returns the tip.
    public fun takas_sat_a<C, T>(k: &mut Kasa<C>, id: u64, cetus: &GlobalConfig, pool: &mut Pool<C, T>, clock: &Clock, ctx: &mut TxContext): Coin<C> {
        let (verilen, hz, alici) = satim_acik<C, T>(k, id);
        let spot = cpool::current_sqrt_price(pool);
        let (r, tavan) = izle<C, T>(k, object::id(pool), true, spot, clock);
        /* T is coin B: selling it moves the price up */
        let limit = sinir(r, spot, false);
        let mut girdi = verilen;
        let ust = birim_tavani(tavan, r, false);
        if (girdi > ust) girdi = ust;
        let mut para = df::borrow_mut<EmanetKey, Balance<T>>(&mut k.id, EmanetKey { ihale: id }).split(girdi);
        let (gelen, sifir, makbuz) = cpool::flash_swap<C, T>(cetus, pool, false, true, girdi, limit, clock);
        let satilan = cpool::swap_pay_amount(&makbuz);
        cpool::repay_flash_swap<C, T>(cetus, pool, balance::zero(), para.split(satilan), makbuz);
        sifir.destroy_zero();
        df::borrow_mut<EmanetKey, Balance<T>>(&mut k.id, EmanetKey { ihale: id }).join(para);
        assert!(satilan > 0 && (gelen.value() as u256) >= en_az(karsilik(satilan, r, false)), EAz);
        satim_yaz<C, T>(k, id, verilen, satilan, hz, alici, gelen, ctx)
    }

    /// The same through pool<T, C> (the dollar is coin B).
    public fun takas_sat_b<C, T>(k: &mut Kasa<C>, id: u64, cetus: &GlobalConfig, pool: &mut Pool<T, C>, clock: &Clock, ctx: &mut TxContext): Coin<C> {
        let (verilen, hz, alici) = satim_acik<C, T>(k, id);
        let spot = cpool::current_sqrt_price(pool);
        let (r, tavan) = izle<C, T>(k, object::id(pool), false, spot, clock);
        /* T is coin A: selling it moves the price down */
        let limit = sinir(r, spot, true);
        let mut girdi = verilen;
        let ust = birim_tavani(tavan, r, true);
        if (girdi > ust) girdi = ust;
        let mut para = df::borrow_mut<EmanetKey, Balance<T>>(&mut k.id, EmanetKey { ihale: id }).split(girdi);
        let (sifir, gelen, makbuz) = cpool::flash_swap<T, C>(cetus, pool, true, true, girdi, limit, clock);
        let satilan = cpool::swap_pay_amount(&makbuz);
        cpool::repay_flash_swap<T, C>(cetus, pool, para.split(satilan), balance::zero(), makbuz);
        sifir.destroy_zero();
        df::borrow_mut<EmanetKey, Balance<T>>(&mut k.id, EmanetKey { ihale: id }).join(para);
        assert!(satilan > 0 && (gelen.value() as u256) >= en_az(karsilik(satilan, r, true)), EAz);
        satim_yaz<C, T>(k, id, verilen, satilan, hz, alici, gelen, ctx)
    }

    /// Anyone: let the reference follow the pool (no swap).
    public fun izle_a<C, T>(k: &mut Kasa<C>, pool: &Pool<C, T>, clock: &Clock) { izle<C, T>(k, object::id(pool), true, cpool::current_sqrt_price(pool), clock); }
    public fun izle_b<C, T>(k: &mut Kasa<C>, pool: &Pool<T, C>, clock: &Clock) { izle<C, T>(k, object::id(pool), false, cpool::current_sqrt_price(pool), clock); }
}
