/// Template coin for a launch token's twin on Sui. Never published as is:
/// the identifiers and the constants below are rewritten per token.
module ikiz_sablon::ikiz;

use std::string;
use sui::coin_registry;

/// one-time witness; renamed per token
public struct IKIZ has drop {}

const DECIMALS: u8 = 6;
const SYMBOL: vector<u8> = b"IKIZSABLON";
const NAME: vector<u8> = b"Ikiz Token Name Placeholder 0000";

/// Nothing is minted and the name can never change; the cap goes to the
/// publisher only to be handed to the twin gate.
fun init(otw: IKIZ, ctx: &mut TxContext) {
    let (ini, cap) = coin_registry::new_currency_with_otw(otw, DECIMALS, string::utf8(SYMBOL), string::utf8(NAME),
        string::utf8(b"ARC PULSE twin: minted only against tokens locked on Arc."), string::utf8(b""), ctx);
    ini.finalize_and_delete_metadata_cap(ctx);
    transfer::public_transfer(cap, ctx.sender());
}
