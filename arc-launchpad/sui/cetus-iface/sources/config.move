module cetus_clmm::config;

public struct GlobalConfig has key, store { id: UID }

/// stand-in only
public fun yeni_test(ctx: &mut TxContext): GlobalConfig { GlobalConfig { id: object::new(ctx) } }
