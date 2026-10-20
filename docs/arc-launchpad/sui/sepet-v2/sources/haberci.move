/// The basket vault's payouts on Sui, over Circle CCTP V2 (sepet v2).
///
/// In v1 this module also received orders as CCTP payload messages; in v2
/// orders arrive over LayerZero (sepet::emir) and an order's dollars as a
/// plain burn minted to the Kasa object (anyone completes it with Circle's
/// own flow, then `kasa::kabul`). What stays here is this package's identity
/// to CCTP and the payout: a holder's share queued by the vault, burned to
/// the holder's chain (Circle does not forward from Sui: it is completed
/// there by the holder or anyone).
module sepet::haberci {
    use token_messenger_minter_v2::deposit_for_burn::{Self as dfb, DepositForBurnWithPackageAuthTicket};
    use message_transmitter_v2::auth::auth_caller_identifier;
    use sepet::kasa::{Self, Kasa};

    const KESINLIK: u32 = 2000;

    /// This package's identity to CCTP. Only this module can make one.
    public struct HaberciYetki has drop {}

    public fun yetki_kimligi(): address { auth_caller_identifier<HaberciYetki>() }

    /// Anyone: the vault's queued payout `id`, locked into a CCTP burn ticket
    /// for its chain and holder. The transaction passes it to
    /// deposit_for_burn_with_package_auth.
    public fun gideni_gonder<C: drop>(k: &mut Kasa<C>, id: u64, ctx: &mut TxContext): DepositForBurnWithPackageAuthTicket<C, HaberciYetki> {
        let (zincir, alici, para) = kasa::gideni_al(k, id);
        dfb::create_deposit_for_burn_with_package_auth_ticket(sui::coin::from_balance(para, ctx), zincir, alici, @0x0, 0, KESINLIK, vector[], HaberciYetki {})
    }
}
