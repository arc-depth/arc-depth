/// Stand-in for token_messenger_minter_v2::deposit_for_burn (see Move.toml):
/// the ticket that locks a coin to its destination and recipient. In the
/// stand-in, "burning" hands the coin to @0x0 and keeps the details.
module token_messenger_minter_v2::deposit_for_burn {
    use sui::coin::Coin;

    public struct DepositForBurnWithPackageAuthTicket<phantom T: drop, W: drop> {
        coin: Coin<T>,
        destination_domain: u32,
        mint_recipient: address,
        destination_caller: address,
        max_fee: u256,
        min_finality_threshold: u32,
        hook_data: vector<u8>,
        witness: W,
    }

    public fun create_deposit_for_burn_with_package_auth_ticket<T: drop, W: drop>(
        coin: Coin<T>,
        destination_domain: u32,
        mint_recipient: address,
        destination_caller: address,
        max_fee: u256,
        min_finality_threshold: u32,
        hook_data: vector<u8>,
        witness: W,
    ): DepositForBurnWithPackageAuthTicket<T, W> {
        DepositForBurnWithPackageAuthTicket { coin, destination_domain, mint_recipient, destination_caller, max_fee, min_finality_threshold, hook_data, witness }
    }

    public struct Yakildi has copy, drop { domain: u32, alici: address, miktar: u64 }

    /// version-gated in Circle's package (and followed by the handler's burn
    /// and complete_burn); the stand-in burns and reports.
    public fun deposit_for_burn_with_package_auth<T: drop, W: drop>(t: DepositForBurnWithPackageAuthTicket<T, W>): (u32, address, u64) {
        let DepositForBurnWithPackageAuthTicket { coin, destination_domain, mint_recipient, destination_caller: _, max_fee: _, min_finality_threshold: _, hook_data: _, witness: _ } = t;
        let m = coin.value();
        transfer::public_transfer(coin, @0x0);
        sui::event::emit(Yakildi { domain: destination_domain, alici: mint_recipient, miktar: m });
        (destination_domain, mint_recipient, m)
    }
}
