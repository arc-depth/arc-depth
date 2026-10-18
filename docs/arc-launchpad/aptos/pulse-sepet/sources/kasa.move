/// ARC PULSE basket vault on Aptos: the Aptos counterpart of
/// contracts/sepet/SepetKasasi.sol and sui/pulse-sepet.
///
/// One vault object for the whole chain. For every launch whose basket names
/// an asset on Aptos it keeps that launch's units in a ledger; the units
/// themselves sit in one fungible store per asset, owned by the vault object.
///
/// NOBODY CAN SIGN FOR THE VAULT
///   The lesson of the first Aptos launchpad (an object owner can withdraw
///   from the object's stores): the vault object is handed to 0xdead the
///   moment it exists. Only this module, through the vault's ExtendRef, moves
///   anything out of it, and only along the paths below.
///
/// WHAT ARRIVED, NOT WHAT WAS CLAIMED
///   Assets can carry dispatch hooks (fee on transfer) or be seized by their
///   issuer. Every deposit is credited by the store's balance before and
///   after, never by the amount a caller names, and every move goes through
///   dispatchable_fungible_asset so the asset's own rules apply.
///
/// NO ORACLE, NO POOL
///   Reverse Dutch auctions, exactly as on the other chains: a buy offers
///   dollars for at least Q(t) units, a sell offers units for at least P(t)
///   dollars; both start at BASLANGIC_KAT times the last fill price (or the
///   founder's quote), halve every YARILANMA, never fall below 1/TABAN_KAT.
///
/// ORDERS
///   Only the Defter on Arc orders, over CCTP V2, through this package's
///   receiving module (package-only functions below).
module sepet::kasa {
    use std::signer;
    use aptos_std::table::{Self, Table};
    use aptos_framework::event;
    use aptos_framework::object::{Self, Object, ExtendRef};
    use aptos_framework::fungible_asset::{Self, Metadata, FungibleStore, FungibleAsset};
    use aptos_framework::dispatchable_fungible_asset;
    use aptos_framework::primary_fungible_store;
    use aptos_framework::timestamp;

    const BASLANGIC_KAT: u64 = 2;
    const TABAN_KAT: u64 = 16;
    const YARILANMA: u64 = 1800;      // seconds
    const BEKLEME: u64 = 86400;

    const ALIM: u8 = 1;
    const SATIM: u8 = 2;

    const EBitti: u64 = 1;
    const EAz: u64 = 2;
    const EErken: u64 = 3;
    const ESifir: u64 = 4;
    const EYanlisTur: u64 = 5;
    const EKotuEmir: u64 = 6;
    const EYok: u64 = 7;

    const OLU: address = @0xdead;

    struct LedgerKey has copy, drop, store { launch: u64, varlik: address }
    struct Fiyat has copy, drop, store { dolar: u64, varlik: u64 }

    struct Ihale has copy, drop, store {
        tur: u8,
        launch: u64,
        varlik: address,      // the asset's metadata address
        verilen: u64,
        baslangic: u64,
        baslama: u64,
        hedef_zincir: u32,
        alici: address,
        bitti: bool,
    }

    struct Giden has copy, drop, store { zincir: u32, alici: address, miktar: u64 }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct Kasa has key {
        ref: ExtendRef,
        domain: u32,
        dolar: Object<Metadata>,
        /// one store per asset (the dollar included), owned by the vault
        depolar: Table<address, Object<FungibleStore>>,
        /// launch => dollars it holds here (in its buy auctions)
        dolar_bakiye: Table<u64, u64>,
        /// launch => dollars its open buy auctions were opened with
        taahhut: Table<u64, u64>,
        /// (launch, asset) => units
        bakiye: Table<LedgerKey, u64>,
        /// asset => last fill
        son_fiyat: Table<address, Fiyat>,
        ihaleler: Table<u64, Ihale>,
        ihale_sayisi: u64,
        /// payouts waiting for the CCTP sender (the dollars stay in the store)
        giden: Table<u64, Giden>,
        giden_sayisi: u64,
    }

    #[event] struct Ilan has drop, store { id: u64, tur: u8, launch: u64, varlik: address, verilen: u64, baslangic: u64 }
    #[event] struct Doldu has drop, store { id: u64, dolduran: address, verilen: u64, alinan: u64 }
    #[event] struct Odendi has drop, store { zincir: u32, alici: address, miktar: u64, giden: bool }

    /* ---- creation: the vault object is nobody's ------------------------ */

    public(package) fun kur(yayinci: &signer, domain: u32, dolar: Object<Metadata>): address {
        let ctor = object::create_object(signer::address_of(yayinci));
        let ref = object::generate_extend_ref(&ctor);
        let s = object::generate_signer(&ctor);
        object::disable_ungated_transfer(&object::generate_transfer_ref(&ctor));
        let adr = signer::address_of(&s);
        move_to(&s, Kasa {
            ref, domain, dolar,
            depolar: table::new(), dolar_bakiye: table::new(), taahhut: table::new(), bakiye: table::new(),
            son_fiyat: table::new(), ihaleler: table::new(), ihale_sayisi: 0, giden: table::new(), giden_sayisi: 0,
        });
        /* handed to an address nobody holds a key for */
        let lt = object::generate_linear_transfer_ref(&object::generate_transfer_ref(&ctor));
        object::transfer_with_ref(lt, OLU);
        adr
    }

    /* ---- helpers ---------------------------------------------------------- */

    fun oran(a: u64, b: u64, c: u64): u64 { (((a as u128) * (b as u128)) / (c as u128)) as u64 }

    fun depo(k: &mut Kasa, m: Object<Metadata>): Object<FungibleStore> {
        let a = object::object_address(&m);
        if (!table::contains(&k.depolar, a)) {
            let s = object::generate_signer_for_extending(&k.ref);
            let c = object::create_object(signer::address_of(&s));
            let st = fungible_asset::create_store(&c, m);
            table::add(&mut k.depolar, a, st);
        };
        *table::borrow(&k.depolar, a)
    }

    fun ekle(t: &mut Table<u64, u64>, k: u64, v: u64) {
        let cur = if (table::contains(t, k)) *table::borrow(t, k) else 0;
        table::upsert(t, k, cur + v);
    }

    fun oku(t: &Table<u64, u64>, k: u64): u64 { if (table::contains(t, k)) *table::borrow(t, k) else 0 }

    fun bakiye_oku(k: &Kasa, l: u64, v: address): u64 {
        let key = LedgerKey { launch: l, varlik: v };
        if (table::contains(&k.bakiye, key)) *table::borrow(&k.bakiye, key) else 0
    }

    fun bakiye_yaz(k: &mut Kasa, l: u64, v: address, n: u64) {
        table::upsert(&mut k.bakiye, LedgerKey { launch: l, varlik: v }, n);
    }

    /// Put `fa` into its store and return what the store actually gained.
    fun yatir(k: &mut Kasa, fa: FungibleAsset): u64 {
        let st = depo(k, fungible_asset::metadata_from_asset(&fa));
        let once = fungible_asset::balance(st);
        dispatchable_fungible_asset::deposit(st, fa);
        fungible_asset::balance(st) - once
    }

    fun cek(k: &mut Kasa, m: Object<Metadata>, n: u64): FungibleAsset {
        let st = depo(k, m);
        let s = object::generate_signer_for_extending(&k.ref);
        dispatchable_fungible_asset::withdraw(&s, st, n)
    }

    /* ---- reads -------------------------------------------------------------- */

    #[view] public fun dolar_bakiye(kasa: address, l: u64): u64 acquires Kasa { oku(&borrow_global<Kasa>(kasa).dolar_bakiye, l) }
    #[view] public fun bakiye(kasa: address, l: u64, varlik: address): u64 acquires Kasa { bakiye_oku(borrow_global<Kasa>(kasa), l, varlik) }
    #[view] public fun ihale_sayisi(kasa: address): u64 acquires Kasa { borrow_global<Kasa>(kasa).ihale_sayisi }
    #[view] public fun giden_sayisi(kasa: address): u64 acquires Kasa { borrow_global<Kasa>(kasa).giden_sayisi }
    #[view] public fun sahip(kasa: address): address { object::owner(object::address_to_object<Kasa>(kasa)) }

    #[view]
    public fun istenen(kasa: address, id: u64): u64 acquires Kasa {
        let h = table::borrow(&borrow_global<Kasa>(kasa).ihaleler, id);
        let gecen = timestamp::now_seconds() - h.baslama;
        let n = gecen / YARILANMA;
        let taban = h.baslangic / TABAN_KAT;
        if (n >= 64) return taban;
        let q = h.baslangic >> (n as u8);
        q = q - oran(q, gecen % YARILANMA, 2 * YARILANMA);
        if (q > taban) q else taban
    }

    /* ---- orders (package only: the CCTP receiver) ----------------------------- */

    /// Buy asset `varlik` with `para` (dollars) for launch `l`. `ref`: the
    /// founder's quote, used when this vault never filled the asset.
    public(package) fun al_emri(kasa: address, l: u64, para: FungibleAsset, varlik: Object<Metadata>, ref: u64) acquires Kasa {
        let k = borrow_global_mut<Kasa>(kasa);
        assert!(fungible_asset::metadata_from_asset(&para) == k.dolar, EKotuEmir);
        let d = yatir(k, para);
        assert!(d > 0, ESifir);
        ekle(&mut k.dolar_bakiye, l, d);
        ekle(&mut k.taahhut, l, d);
        let va = object::object_address(&varlik);
        let beklenen = if (table::contains(&k.son_fiyat, va)) {
            let f = *table::borrow(&k.son_fiyat, va);
            oran(d, f.varlik, f.dolar)
        } else ref;
        if (beklenen == 0) beklenen = 1;
        ilan(k, ALIM, l, va, d, beklenen * BASLANGIC_KAT, 0, @0x0);
    }

    /// A holder burned `miktar` of `arz`. `ilk`: this call also pays their
    /// share of the launch's unspent dollars.
    public(package) fun sat_emri(kasa: address, l: u64, varlik: Object<Metadata>, miktar: u64, arz: u64, ilk: bool,
                                 hedef_zincir: u32, alici: address) acquires Kasa {
        assert!(arz > 0 && miktar > 0 && miktar <= arz, EKotuEmir);
        let k = borrow_global_mut<Kasa>(kasa);
        if (ilk) {
            let d = oran(oku(&k.dolar_bakiye, l), miktar, arz);
            if (d > 0) {
                let cur = oku(&k.dolar_bakiye, l);
                table::upsert(&mut k.dolar_bakiye, l, cur - d);
                ode(k, hedef_zincir, alici, d);
            }
        };
        let va = object::object_address(&varlik);
        let b = bakiye_oku(k, l, va);
        let pay = oran(b, miktar, arz);
        if (pay == 0) return;
        /* out of the ledger at once: a second redemption must not count it */
        bakiye_yaz(k, l, va, b - pay);
        let f = *table::borrow(&k.son_fiyat, va);
        let beklenen = oran(pay, f.dolar, f.varlik);
        if (beklenen == 0) beklenen = 1;
        ilan(k, SATIM, l, va, pay, beklenen * BASLANGIC_KAT, hedef_zincir, alici);
    }

    fun ilan(k: &mut Kasa, tur: u8, l: u64, varlik: address, verilen: u64, baslangic: u64, hz: u32, alici: address) {
        let id = k.ihale_sayisi;
        table::add(&mut k.ihaleler, id, Ihale { tur, launch: l, varlik, verilen, baslangic, baslama: timestamp::now_seconds(), hedef_zincir: hz, alici, bitti: false });
        k.ihale_sayisi = id + 1;
        event::emit(Ilan { id, tur, launch: l, varlik, verilen, baslangic });
    }

    /* ---- the auction ------------------------------------------------------------ */

    /// Fill buy auction `id`: `teklif` units of its asset leave the filler,
    /// the dollars it spends arrive in the filler's primary store.
    public entry fun doldur_alim(dolduran: &signer, kasa: address, id: u64, teklif: u64) acquires Kasa {
        let ist = istenen(kasa, id);
        let k = borrow_global_mut<Kasa>(kasa);
        let h = *table::borrow(&k.ihaleler, id);
        assert!(!h.bitti && h.tur == ALIM, EYanlisTur);
        let t = oku(&k.taahhut, h.launch);
        let harca = oran(h.verilen, oku(&k.dolar_bakiye, h.launch), t);
        table::upsert(&mut k.taahhut, h.launch, t - h.verilen);
        assert!(harca > 0, ESifir);
        let gerek = oran(ist, harca, h.verilen);
        let m = object::address_to_object<Metadata>(h.varlik);
        let fa = primary_fungible_store::withdraw(dolduran, m, teklif);
        let gelen = yatir(k, fa);
        assert!(gelen > 0 && gelen >= gerek, EAz);
        table::borrow_mut(&mut k.ihaleler, id).bitti = true;
        let cur = oku(&k.dolar_bakiye, h.launch);
        table::upsert(&mut k.dolar_bakiye, h.launch, cur - harca);
        let b = bakiye_oku(k, h.launch, h.varlik);
        bakiye_yaz(k, h.launch, h.varlik, b + gelen);
        table::upsert(&mut k.son_fiyat, h.varlik, Fiyat { dolar: harca, varlik: gelen });
        let dm = k.dolar;
        let out = cek(k, dm, harca);
        primary_fungible_store::deposit(signer::address_of(dolduran), out);
        event::emit(Doldu { id, dolduran: signer::address_of(dolduran), verilen: harca, alinan: gelen });
    }

    /// Fill sell auction `id`: `teklif` dollars leave the filler (and go to
    /// the holder), the auction's units arrive in the filler's primary store.
    public entry fun doldur_satim(dolduran: &signer, kasa: address, id: u64, teklif: u64) acquires Kasa {
        let ist = istenen(kasa, id);
        let k = borrow_global_mut<Kasa>(kasa);
        let h = *table::borrow(&k.ihaleler, id);
        assert!(!h.bitti && h.tur == SATIM, EYanlisTur);
        let fa = primary_fungible_store::withdraw(dolduran, k.dolar, teklif);
        let gelen = yatir(k, fa);
        assert!(gelen > 0 && gelen >= ist, EAz);
        table::borrow_mut(&mut k.ihaleler, id).bitti = true;
        table::upsert(&mut k.son_fiyat, h.varlik, Fiyat { dolar: gelen, varlik: h.verilen });
        ode(k, h.hedef_zincir, h.alici, gelen);
        let m = object::address_to_object<Metadata>(h.varlik);
        let out = cek(k, m, h.verilen);
        primary_fungible_store::deposit(signer::address_of(dolduran), out);
        event::emit(Doldu { id, dolduran: signer::address_of(dolduran), verilen: h.verilen, alinan: gelen });
    }

    public entry fun yeniden_baslat(kasa: address, id: u64) acquires Kasa {
        let k = borrow_global_mut<Kasa>(kasa);
        let h = table::borrow_mut(&mut k.ihaleler, id);
        assert!(!h.bitti, EBitti);
        assert!(timestamp::now_seconds() >= h.baslama + 4 * YARILANMA + BEKLEME, EErken);
        h.baslangic = h.baslangic / TABAN_KAT;
        if (h.baslangic == 0) h.baslangic = 1;
        h.baslama = timestamp::now_seconds();
    }

    /* ---- payouts -------------------------------------------------------------------- */

    fun ode(k: &mut Kasa, hz: u32, alici: address, miktar: u64) {
        if (hz == k.domain) {
            let dm = k.dolar;
            let out = cek(k, dm, miktar);
            primary_fungible_store::deposit(alici, out);
            event::emit(Odendi { zincir: hz, alici, miktar, giden: false });
        } else {
            let id = k.giden_sayisi;
            table::add(&mut k.giden, id, Giden { zincir: hz, alici, miktar });
            k.giden_sayisi = id + 1;
            event::emit(Odendi { zincir: hz, alici, miktar, giden: true });
        }
    }

    /// The receiving module takes a queued payout to send over CCTP.
    public(package) fun gideni_al(kasa: address, id: u64): (u32, address, FungibleAsset) acquires Kasa {
        let k = borrow_global_mut<Kasa>(kasa);
        assert!(table::contains(&k.giden, id), EYok);
        let g = table::remove(&mut k.giden, id);
        let dm = k.dolar;
        (g.zincir, g.alici, cek(k, dm, g.miktar))
    }
}
