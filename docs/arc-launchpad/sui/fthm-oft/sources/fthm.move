/// FTHM on Sui: the LayerZero twin of Fathom (FTHM) on Arc.
///
/// Supply here is only what arrives over LayerZero: the TreasuryCap goes into
/// the OFT at init (oft_impl::init_oft), which mints on receive and burns on
/// send. Nothing else can mint. 9 decimals locally, 6 shared, as on Solana.
#[allow(deprecated_usage)] // init_oft takes &CoinMetadata, which only create_currency yields
module oft::fthm;

use sui::coin;

public struct FTHM has drop {}

fun init(otw: FTHM, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        otw, 9, b"FTHM", b"Fathom", b"Fathom (FTHM), bridged from Arc by LayerZero", option::none(), ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}
