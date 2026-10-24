// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20S2 {
    function transfer(address to, uint256 v) external returns (bool);
    function approve(address who, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface IUzakKasa {
    function usdc() external view returns (address);
    function takasEt(uint256 miktar, uint256 asgariAlinan, address alici, bytes calldata veri)
        external returns (uint256);
    function geriTakasEt(uint256 miktar, uint256 asgariQuote, address alici, bytes calldata veri)
        external returns (uint256);
}

/// @title RemoteSwapExecutor — the borrower that knows what a DEX is, so
///        the vault does not have to
///
/// THE PATTERN, AND WHY IT IS WORTH A SEPARATE CONTRACT
///   The vault lends, this routes, the vault checks the outcome. The vault
///   therefore holds no router address, no pool id and no venue-specific
///   code, and adding a venue never touches the contract that holds the
///   money. The same shape is used by the Arc-side buyback robot, for the
///   same reason.
///
/// IT HOLDS NOTHING AND NOBODY OWNS IT
///   No owner, no pause, no sweep. Funds arrive from the vault and leave
///   to the vault inside one transaction, and the balance is zero before
///   and after. Tokens sent here by mistake are unrecoverable — the honest
///   cost of having no privileged function.
///
/// THE ROUTE IS THE CALLER'S AND THE BOUND IS THE VAULT'S
///   `veri` is forwarded verbatim to whatever target the caller names, so
///   any venue reachable by a call can be used. What the caller cannot do
///   is decide whether the result was acceptable: the vault derives its own
///   floor from the destination chain's price feed and reverts below it. A
///   caller who routes badly loses their gas; the reserve does not move.
///
///   This header said the same thing while it was false. The vault's
///   acceptance bound used to be a parameter the caller supplied, and
///   measured against the real pools a hostile executor borrowed $2,000.00,
///   passed a bound of 1, spent $1.00 and kept $1,999.00. The floor is the
///   vault's now, which is what makes this paragraph true.
///
/// THE FEE GOES TO WHOEVER CALLED, NOT TO THIS CONTRACT
///   The vault pays its executor fee to `msg.sender`, which is this
///   contract. It is forwarded on, because this contract owns nothing and
///   somebody else paid the gas. The forward happens after the vault's call
///   returns, and the vault pays only after its floor holds — during the
///   callback the fee does not exist yet, which is what keeps the sweep
///   below from sending it straight back.
contract RemoteSwapExecutor {
    error KasaDegil();
    error RotaBasarisiz(bytes sebep);
    error TransferOlmadi();
    error KotuHedef();

    event Yonlendirildi(address indexed kasa, address verilen, uint256 miktar, address alinan, uint256 alinanMiktar);

    /// Set for one call and cleared before it returns, so no later call can
    /// inherit a stale route.
    struct Yol {
        address kasa;
        address hedef;        // the venue to call
        bytes veri;           // its calldata
    }
    Yol private yol;

    /// Buy: ask the vault to lend quote, route it, hand back the asset.
    function al(
        IUzakKasa kasa,
        uint256 miktar,
        uint256 asgariAlinan,
        address venue,
        bytes calldata venueVerisi
    ) external returns (uint256 alinan) {
        if (venue == address(0)) revert KotuHedef();
        yol = Yol({kasa: address(kasa), hedef: venue, veri: venueVerisi});
        alinan = kasa.takasEt(miktar, asgariAlinan, address(this), "");
        delete yol;
        _ucretiIlet(kasa);
    }

    /// Sell: the mirror.
    function sat(
        IUzakKasa kasa,
        uint256 miktar,
        uint256 asgariQuote,
        address venue,
        bytes calldata venueVerisi
    ) external returns (uint256 quoteAlinan) {
        if (venue == address(0)) revert KotuHedef();
        yol = Yol({kasa: address(kasa), hedef: venue, veri: venueVerisi});
        quoteAlinan = kasa.geriTakasEt(miktar, asgariQuote, address(this), "");
        delete yol;
        _ucretiIlet(kasa);
    }

    /// Hand the vault's executor fee to whoever paid the gas.
    ///
    /// Everything this contract holds at this point IS the fee: the
    /// callback already returned the bought asset and every unconsumed
    /// unit of the loan to the vault, and the vault pays the fee only
    /// afterwards. So a balance here is the fee and nothing else.
    ///
    /// Read from the vault rather than hardcoded, because this contract
    /// knows no addresses and should keep knowing none.
    function _ucretiIlet(IUzakKasa kasa) private {
        address quote = kasa.usdc();
        uint256 ucret = IERC20S2(quote).balanceOf(address(this));
        if (ucret > 0 && !IERC20S2(quote).transfer(msg.sender, ucret)) revert TransferOlmadi();
    }

    /// The loan callback. The lent asset is already here; the bought asset
    /// has to be in the vault before this returns.
    function takasCagrisi(
        address verilen,
        uint256 miktar,
        address alinan,
        uint256,
        bytes calldata
    ) external {
        Yol memory y = yol;
        if (msg.sender != y.kasa || y.kasa == address(0)) revert KasaDegil();

        /* Approve the venue for exactly this trade. An unlimited approval
           on a contract that holds nothing is harmless in principle and
           still the kind of thing that turns one bad venue into a standing
           liability. */
        if (!IERC20S2(verilen).approve(y.hedef, miktar)) revert TransferOlmadi();

        (bool ok, bytes memory sebep) = y.hedef.call(y.veri);
        if (!ok) revert RotaBasarisiz(sebep);

        /* Whatever the route produced goes to the vault, all of it. Keeping
           any would be keeping tokens the reserve paid for — and the vault
           would notice, because it measures its own balance. */
        uint256 cikti = IERC20S2(alinan).balanceOf(address(this));
        if (cikti > 0 && !IERC20S2(alinan).transfer(y.kasa, cikti)) revert TransferOlmadi();

        /* And anything of the lent asset the route did not consume goes
           back too, rather than sitting here forever. */
        uint256 artik = IERC20S2(verilen).balanceOf(address(this));
        if (artik > 0 && !IERC20S2(verilen).transfer(y.kasa, artik)) revert TransferOlmadi();

        emit Yonlendirildi(y.kasa, verilen, miktar, alinan, cikti);
    }
}
