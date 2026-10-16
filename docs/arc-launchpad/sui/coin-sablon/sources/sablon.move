/// Template coin for ARC PULSE launches on Sui. Never published as is: the
/// site rewrites the identifiers and the constants below per launch.
#[allow(deprecated_usage)]
module sablon::sablon {
    use sui::coin;

    /// one-time witness; renamed to the founder's symbol
    public struct SABLON has drop {}

    const DECIMALS: u8 = 6;
    const SYMBOL: vector<u8> = b"SABLON";
    const NAME: vector<u8> = b"Sablon Token Name Placeholder";
    const DESCRIPTION: vector<u8> = b"ARC PULSE launch: fixed supply, collateral vault, locked pool.";

    /// The cap goes to the publisher, unused: total supply stays 0 until the
    /// launchpad mints the whole supply into its pool and locks the cap away.
    fun init(otw: SABLON, ctx: &mut TxContext) {
        let (cap, meta) = coin::create_currency(otw, DECIMALS, SYMBOL, NAME, DESCRIPTION, option::none(), ctx);
        transfer::public_freeze_object(meta);
        transfer::public_transfer(cap, ctx.sender());
    }
}
