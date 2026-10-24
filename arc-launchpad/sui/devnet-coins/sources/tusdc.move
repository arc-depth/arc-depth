/// DEVNET ONLY test dollar: 6 decimals, anyone may mint through the shared faucet.
module devnet_coins::tusdc {
    use sui::coin::{Self, Coin, TreasuryCap};

    public struct TUSDC has drop {}

    public struct Faucet has key { id: UID, cap: TreasuryCap<TUSDC> }

    #[allow(deprecated_usage)]
    fun init(w: TUSDC, ctx: &mut TxContext) {
        let (cap, meta) = coin::create_currency(w, 6, b"tUSDC", b"Test USD (devnet)", b"", option::none(), ctx);
        transfer::public_freeze_object(meta);
        transfer::share_object(Faucet { id: object::new(ctx), cap });
    }

    public fun mint(f: &mut Faucet, amount: u64, ctx: &mut TxContext): Coin<TUSDC> { coin::mint(&mut f.cap, amount, ctx) }
}
