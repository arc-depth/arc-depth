// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHaberci, IERC20S, SepetMesaj, Adres} from "./IHaberci.sol";
import {SepetDefteri} from "./SepetDefteri.sol";
import {CikisMesaj} from "./Cikis.sol";

interface IYakilabilirS {
    function burnFrom(address from, uint256 value) external;
}

/// @title SepetUcu — a chain's entry into the basket system
///
/// What a launchpad on any of the twelve chains calls, and what holders call
/// to redeem. It is the launchpad address the Defter trusts for this chain,
/// so it says nothing it has not checked:
///   baslat   the dollars for the whole basket are pulled here first, and
///            the token is registered as this chain's launch
///   itfa     the tokens are burned here before the Defter is told
///   vergi    the tax dollars are pulled here before they are sent
/// The founder's choice of assets is theirs; the only checks are the
/// basket's shape (1 to 5 lines, $4 each), made again by the Defter.
contract SepetUcu {
    IHaberci public immutable haberci;
    IERC20S public immutable usdc;
    uint32 public immutable defterZincir;
    bytes32 public immutable defter;
    /// The launchpad on this chain: it creates the token and registers it in
    /// the same transaction, so nobody can register someone else's token
    /// first with a basket of their choosing.
    address public immutable launchpad;

    /// Tokens launched through this entry: only these can be burned for a
    /// redemption here.
    mapping(address => bool) public kayitli;

    event Baslatildi(address indexed token, uint256 arz, uint256 dolar);
    event Itfa(address indexed token, address indexed sahip, uint256 miktar, uint32 hedefZincir, bytes32 alici);
    event ItfaCikisli(address indexed token, address indexed sahip, uint256 miktar, uint32 hedefZincir, bytes32 alici, bytes32[] cikislar);
    event VergiGonderildi(address indexed token, uint256 dolar);

    error ZatenKayitli();
    error SadeceLaunchpad();
    error KotuSepet();
    error KayitsizToken();
    error Sifir();
    error TransferOlmadi();

    constructor(IHaberci _haberci, IERC20S _usdc, uint32 _defterZincir, bytes32 _defter, address _launchpad) {
        launchpad = _launchpad;
        haberci = _haberci;
        usdc = _usdc;
        defterZincir = _defterZincir;
        defter = _defter;
    }

    /// Register `token` (supply `arz`) with its basket. `ref[i]` is the page's
    /// quote: how many units of line i's asset its dollars buy now, the first
    /// auction's reference. The launchpad pays the sum of the lines in dollars
    /// (the founder's payment, already converted); a refund goes to `sahip`.
    function baslat(address token, address sahip, uint256 arz, SepetDefteri.Kalem[] calldata k, uint256[] calldata ref) external {
        if (msg.sender != launchpad) revert SadeceLaunchpad();
        if (kayitli[token]) revert ZatenKayitli();
        /* the shape is checked here too, so a wrong basket fails before
           any dollars leave the founder */
        if (k.length == 0 || k.length > 5 || k.length != ref.length || arz == 0) revert KotuSepet();
        kayitli[token] = true;
        uint256 toplam;
        for (uint256 i = 0; i < k.length; i++) {
            if (k[i].dolar < 4e6 || ref[i] == 0) revert KotuSepet();
            toplam += k[i].dolar;
        }
        if (!usdc.transferFrom(msg.sender, address(this), toplam)) revert TransferOlmadi();
        usdc.approve(address(haberci), toplam);
        haberci.gonder(defterZincir, defter, abi.encode(SepetMesaj.KAYIT, Adres.b32(token), Adres.b32(sahip), arz, k, ref), toplam);
        emit Baslatildi(token, arz, toplam);
    }

    /// Burn `miktar` of your `token` (approved here) and redeem your share of
    /// the whole basket, paid to `alici` on `hedefZincir`.
    function itfa(address token, uint256 miktar, uint32 hedefZincir, bytes32 alici) external {
        if (!kayitli[token]) revert KayitsizToken();
        if (miktar == 0) revert Sifir();
        IYakilabilirS(token).burnFrom(msg.sender, miktar);
        haberci.gonder(defterZincir, defter, abi.encode(SepetMesaj.ITFA, Adres.b32(token), miktar, hedefZincir, alici), 0);
        emit Itfa(token, msg.sender, miktar, hedefZincir, alici);
    }

    /// The same, naming an exit per basket line (in the basket's order, as
    /// `SepetDefteri.sepet` lists it): each EVM line's units are handed
    /// there at once instead of auctioned. An exit is an address on that
    /// line's chain: the holder's own (they get the asset itself) or a
    /// relay.link deposit address their browser made for asset -> dollars
    /// on `hedefZincir` to `alici`. bytes32(0) leaves a line to the auction.
    function itfaCikis(address token, uint256 miktar, uint32 hedefZincir, bytes32 alici, bytes32[] calldata cikislar) external {
        if (!kayitli[token]) revert KayitsizToken();
        if (miktar == 0) revert Sifir();
        if (cikislar.length == 0 || cikislar.length > 5) revert KotuSepet();
        IYakilabilirS(token).burnFrom(msg.sender, miktar);
        haberci.gonder(defterZincir, defter, abi.encode(CikisMesaj.ITFA_CIKIS, Adres.b32(token), miktar, hedefZincir, alici, cikislar), 0);
        emit ItfaCikisli(token, msg.sender, miktar, hedefZincir, alici, cikislar);
    }

    /// Send `dolar` of trading tax for `token` to the Defter. The pool's hook
    /// calls this; anyone may.
    function vergi(address token, uint256 dolar) external {
        if (!kayitli[token]) revert KayitsizToken();
        if (dolar == 0) revert Sifir();
        if (!usdc.transferFrom(msg.sender, address(this), dolar)) revert TransferOlmadi();
        usdc.approve(address(haberci), dolar);
        haberci.gonder(defterZincir, defter, abi.encode(SepetMesaj.VERGI, Adres.b32(token)), dolar);
        emit VergiGonderildi(token, dolar);
    }
}
