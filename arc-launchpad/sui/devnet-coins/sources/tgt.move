/// TEST NETWORKS ONLY: a stand-in for a pasted token (CA) in launch_backed
/// runs; anyone may mint through the shared faucet. Never on mainnet.
module devnet_coins::tgt {
    use sui::coin::{Self, Coin, TreasuryCap};

    public struct TGT has drop {}

    public struct Faucet has key { id: UID, cap: TreasuryCap<TGT> }

    #[allow(deprecated_usage)]
    fun init(w: TGT, ctx: &mut TxContext) {
        let (cap, meta) = coin::create_currency(w, 6, b"TGT", b"Target (test)", b"", option::none(), ctx);
        transfer::public_freeze_object(meta);
        transfer::share_object(Faucet { id: object::new(ctx), cap });
    }

    public fun mint(f: &mut Faucet, amount: u64, ctx: &mut TxContext): Coin<TGT> { coin::mint(&mut f.cap, amount, ctx) }
}
