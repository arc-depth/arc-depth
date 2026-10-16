/// DEVNET ONLY launch token: its TreasuryCap goes to the publisher, who hands
/// it to pulse::launchpad::launch with nothing minted.
module devnet_coins::pdev {
    use sui::coin;

    public struct PDEV has drop {}

    #[allow(deprecated_usage)]
    fun init(w: PDEV, ctx: &mut TxContext) {
        let (cap, meta) = coin::create_currency(w, 6, b"PDEV", b"Pulse Devnet", b"", option::none(), ctx);
        transfer::public_freeze_object(meta);
        transfer::public_transfer(cap, ctx.sender());
    }
}
