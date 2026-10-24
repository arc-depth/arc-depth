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
}
