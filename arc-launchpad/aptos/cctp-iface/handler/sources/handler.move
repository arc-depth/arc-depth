/// Stand-in for stablecoin_handler::handler (see Move.toml): mints the
/// receipt's amount to its mint recipient; burns are recorded so a test can
/// see what left.
module stablecoin_handler::handler {
    use std::vector;
    use aptos_framework::fungible_asset::{Self, FungibleAsset, MintRef};
    use aptos_framework::primary_fungible_store;
    use token_messenger_minter_v2::token_messenger_minter::{Self, MintReceipt, BurnReceipt};

    struct Giden has copy, drop, store { domain: u32, alici: address, cagiran: address, miktar: u64, kanca: vector<u8> }
    struct Durum has key { basim: MintRef, giden: vector<Giden> }

    public fun kur(s: &signer, basim: MintRef) { move_to(s, Durum { basim, giden: vector::empty() }); }

    public fun giden_sayisi(): u64 acquires Durum { vector::length(&borrow_global<Durum>(@stablecoin_handler).giden) }
    public fun giden_at(i: u64): (u32, address, address, u64, vector<u8>) acquires Durum {
        let g = *vector::borrow(&borrow_global<Durum>(@stablecoin_handler).giden, i);
        (g.domain, g.alici, g.cagiran, g.miktar, g.kanca)
    }

    /* ---- Circle's API (signatures verbatim) ---- */

    public fun mint(mint_receipt: MintReceipt) acquires Durum {
        let (alici, miktar) = token_messenger_minter::tuket_mint(mint_receipt);
        let d = borrow_global<Durum>(@stablecoin_handler);
        if (miktar > 0) primary_fungible_store::deposit(alici, fungible_asset::mint(&d.basim, miktar));
    }

    public fun burn(burn_receipt: BurnReceipt, asset: FungibleAsset) acquires Durum {
        let (domain, alici, cagiran, miktar, kanca) = token_messenger_minter::tuket_burn(burn_receipt);
        assert!(fungible_asset::amount(&asset) == miktar, 20);
        primary_fungible_store::deposit(@0x0, asset);
        let d = borrow_global_mut<Durum>(@stablecoin_handler);
        vector::push_back(&mut d.giden, Giden { domain, alici, cagiran, miktar, kanca });
    }
}
