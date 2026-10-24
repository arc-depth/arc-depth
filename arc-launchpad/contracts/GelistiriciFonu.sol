// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20G {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title GelistiriciFonu — the 0.30% slice, held for the people who build.
/// @notice Grants are irrevocable and developers withdraw their own. The
///         allocator can hand money out and can never take it back.
///
/// WHY NOT JUST AN ADDRESS
///   A wallet was the obvious answer and it is the one that was rejected:
///   the development of this launchpad is meant to be done by outside
///   developers, and their share has to be first class rather than a
///   promise sitting in somebody else's account. A wallet makes every
///   developer a creditor of whoever holds the key.
///
///   So the money lives here, and the only thing that can happen to it is
///   that it becomes some developer's, irreversibly, in public.
///
/// WHAT FIRST CLASS MEANS HERE, EXACTLY
///   `tahsis` only ever ADDS to a developer's balance. There is no function
///   that reduces one, no function that redirects one, and no function that
///   returns money to the allocator. Once a grant is written, the developer
///   is the only address that can move it, and they move it themselves.
///
///   What this does NOT claim: the allocator still decides who is granted
///   what, and nothing here stops them granting to themselves. That is a
///   real limit and it is written down rather than papered over — every
///   grant is an event, so the choice is auditable even where it is not
///   constrained. Constraining it needs a decision about who votes, which
///   is not a decision this contract should invent.
///
/// NO OWNER TRANSFER, NO UPGRADE, NO PAUSE
///   The allocator is immutable. If it has to change, that is a new fund
///   and a new hook pointing at it, which is a visible event rather than a
///   quiet one.
contract GelistiriciFonu {
    IERC20G public immutable quote;
    /// The only address that may create grants. Cannot be changed, cannot
    /// withdraw, cannot cancel.
    address public immutable tahsisci;

    /// developer => still claimable
    mapping(address => uint256) public bakiye;
    /// developer => granted over all time, which a balance alone forgets
    /// once it has been withdrawn.
    mapping(address => uint256) public toplamTahsis;
    /// Granted but not yet taken, so the unallocated remainder is knowable.
    uint256 public dagitilmamis;

    event Tahsis(address indexed gelistirici, uint256 miktar, uint256 yeniBakiye);
    event Talep(address indexed gelistirici, uint256 miktar);

    error KotuKurulum();
    error SadeceTahsisci();
    error SifirMiktar();
    error YetersizFon();
    error TransferOlmadi();

    constructor(IERC20G _quote, address _tahsisci) {
        if (address(_quote) == address(0) || _tahsisci == address(0)) revert KotuKurulum();
        quote = _quote;
        tahsisci = _tahsisci;
    }

    /// Everything here that has not been promised to somebody yet.
    function serbest() public view returns (uint256) {
        uint256 b = quote.balanceOf(address(this));
        return b > dagitilmamis ? b - dagitilmamis : 0;
    }

    /// Promise `miktar` to `gelistirici`, for good.
    ///
    /// Bounded by what is actually here and unpromised, so a grant can
    /// never be written that the fund cannot pay — a claimable balance that
    /// reverts on withdrawal would be worse than no grant at all.
    function tahsis(address gelistirici, uint256 miktar) external {
        if (msg.sender != tahsisci) revert SadeceTahsisci();
        if (gelistirici == address(0) || miktar == 0) revert SifirMiktar();
        if (miktar > serbest()) revert YetersizFon();

        bakiye[gelistirici] += miktar;
        toplamTahsis[gelistirici] += miktar;
        dagitilmamis += miktar;
        emit Tahsis(gelistirici, miktar, bakiye[gelistirici]);
    }

    /// Take what is yours. Nobody can do this for you and nobody can stop
    /// it; there is no pause and no allowlist on this path.
    function talep() external returns (uint256 miktar) {
        miktar = bakiye[msg.sender];
        if (miktar == 0) revert SifirMiktar();
        bakiye[msg.sender] = 0;
        dagitilmamis -= miktar;
        if (!quote.transfer(msg.sender, miktar)) revert TransferOlmadi();
        emit Talep(msg.sender, miktar);
    }
}
