// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title CrossChainAssetRegistry — where a destination comes from
///
/// THE PROBLEM THIS SOLVES
///   A function that sends collateral to an address the caller names is a
///   withdraw, whatever it is called. A function that sends collateral to
///   an address the SYSTEM derives is not. The whole safety of cross-chain
///   collateral rests on which of those two is built, so this contract
///   exists to make the second one possible and the first one unreachable.
///
/// THE DESTINATION IS COMPUTED, NOT STORED
///   There is no `setRemoteVault`, and no mapping of addresses either —
///   because a stored address is an address somebody could have stored
///   wrongly, and then the audit question becomes "who wrote this row".
///
///   Instead every remote vault is a CREATE2 deployment of the same
///   contract, from the same factory, salted by the token it belongs to:
///
///       uzakKasa = CREATE2(uzakFabrika, keccak256(tokenId), initKodHash)
///
///   That address is a pure function of three immutables and one argument,
///   identical on every EVM chain. Arc can therefore know where a token's
///   remote vault is without being told, and nobody — not a caller, not a
///   keeper, not the deployer — can substitute a different one. A wrong
///   destination is not forbidden here; it is not expressible.
///
/// THE CHAIN SET IS FIXED AT CONSTRUCTION
///   No add, no remove, no owner. Supporting a new chain means deploying a
///   new registry and a new manager, and the old ones keep working on the
///   chains they knew.
///
///   That is a real cost and it is the right trade: an `addChain` function
///   is an admin key, and an admin key that can add a chain can add a chain
///   whose "factory" it controls — which is the withdraw this whole design
///   is built to avoid, reintroduced through the back door.
contract CrossChainAssetRegistry {
    struct Zincir {
        /// CCTP's domain id, which is what depositForBurn takes. Not the
        /// EVM chain id: Arc is chain 5042 and CCTP domain 26, and mixing
        /// the two up sends money to whichever chain happens to have that
        /// domain number.
        uint32 cctpDomain;
        /// The EVM chain id, carried only so humans and logs can tell which
        /// chain a domain refers to.
        uint64 zincirId;
        /// The CREATE2 deployer of remote vaults on that chain.
        address uzakFabrika;
        /// keccak256 of RemoteCollateralVault's creation code, including
        /// its constructor arguments' encoding scheme. Two chains may have
        /// different hashes if the vault is compiled differently for them,
        /// so it is per chain rather than global.
        bytes32 initKodHash;
        /// The quote token's address on that chain. CCTP mints the
        /// destination chain's own USDC, and the remote vault needs to know
        /// what it received.
        address uzakQuote;
        string ad;
    }

    Zincir[] private _zincirler;
    /// cctpDomain => index+1, so zero means "not supported".
    mapping(uint32 => uint256) private _indeks;

    error KotuKurulum();
    error ZincirYok(uint32 domain);
    error TekrarZincir(uint32 domain);
    event ZincirTanimli(uint32 indexed cctpDomain, uint64 zincirId, address uzakFabrika, string ad);

    constructor(Zincir[] memory zincirler) {
        if (zincirler.length == 0) revert KotuKurulum();
        for (uint256 i = 0; i < zincirler.length; i++) {
            Zincir memory z = zincirler[i];
            if (z.uzakFabrika == address(0)) revert KotuKurulum();
            if (z.initKodHash == bytes32(0)) revert KotuKurulum();
            if (z.uzakQuote == address(0)) revert KotuKurulum();
            /* Arc's own domain must not be in here. A "cross-chain"
               transfer to the chain you are already on would burn USDC and
               mint it back to a vault address that exists on Arc but was
               never deployed there — money into a hole. */
            if (z.cctpDomain == ARC_DOMAIN) revert KotuKurulum();
            if (_indeks[z.cctpDomain] != 0) revert TekrarZincir(z.cctpDomain);
            _zincirler.push(z);
            _indeks[z.cctpDomain] = _zincirler.length;
            emit ZincirTanimli(z.cctpDomain, z.zincirId, z.uzakFabrika, z.ad);
        }
    }

    /// Arc's CCTP domain, measured on chain: MessageTransmitterV2
    /// .localDomain() answers 26.
    uint32 public constant ARC_DOMAIN = 26;

    /* ---- reads ------------------------------------------------------ */

    /* ---- TEMINAT HANGI VARLIGA DONUSEBILIR: IZIN LISTESI YOK ------
     *
     * BURADA BIR IZIN LISTESI VARDI VE KALDIRILDI
     *   Kullanicinin kurali: *"Arc'da dogrulamasi gerekmiyor, sadece
     *   calisan tum adaylari koy, hatta insanlarin eklemesine de izin
     *   ver."* Yani hangi varligin teminat olabilecegine bir liste karar
     *   vermiyor.
     *
     *   Kaldirilan sey yalnizca liste degil, listenin bakim yuku de: her
     *   yeni token icin yeni bir kayit defteri dagitmak gerekiyordu,
     *   cunku liste kurucuda sabitti. Bugun dogmus bir token dunun
     *   kayit defterine giremezdi.
     *
     * GUVENLIK KAPIDAN ALINDI, SONUCA TASINDI
     *   Kapi "hangi varlik" sorusunu soruyordu; yerine gecen sey
     *   "donusum kac paraya oldu" sorusunu soruyor. Uzak kasa her
     *   donusumde sonucu bir TABANA karsi olcuyor ve taban tutmazsa
     *   islem geri doner. Olculdu: dusmanca bir yurutucu tabansiz
     *   kurulumda $1.999 cekebiliyordu, tabanla $0 cikardi ve durust
     *   yurutucu gecmeye devam etti.
     *
     *   Bu degisim mimariyi degistirmiyor: sinirli-kredi deseni ve
     *   sonucun olculmesi oldugu gibi duruyor. Degisen tek sey tabanin
     *   fiyatini NEREDEN aldigi — kurucuda sabit bir besleyici
     *   tablosundan degil, tokenin kendi havuzunun 30 dakikalik
     *   ortalamasindan.
     *
     * NEDEN BU KADAR AMA DAHA FAZLASI DEGIL — DURUSTCE
     *   Bir Chainlink besleyicisi havuzdan BAGIMSIZDIR; havuzun kendi
     *   ortalamasi degildir. Yani bu, besleyici kadar guclu degil ve
     *   oyle sunulmayacak:
     *
     *     - 30 dakikalik ortalama, fiyati 30 dakika boyunca piyasa
     *       disinda tutmayi gerektirir; Uniswap'in observe() cagrisi
     *       pencereyi kapatamazsa zaten geri doner (OLD), yani ortalama
     *       gercekten 1800 saniyeyi kapsiyor.
     *     - Maliyeti havuzun derinligiyle olcekleniyor ve kazanci
     *       donusum basina %3 kayma tavani ile sinirli.
     *     - Besleyicisi OLAN varliklarda besleyici yine kullaniliyor,
     *       cunku daha siki olan hangisiyse o uygulanmali. Bu kimseyi
     *       engellemiyor: besleyicisi olmayan varlik da gecebiliyor.
     *
     *   Yani kalan risk: derin olmayan bir havuzda, 30 dakika boyunca
     *   fiyati tutabilen biri donusum basina %3'e kadar siyirabilir.
     *   Kapiyi geri koymak bunu kapatirdi ama kullanicinin acikca
     *   istedigi genisligi de kapatirdi.
     */

    function zincirSayisi() external view returns (uint256) {
        return _zincirler.length;
    }

    function zincirAt(uint256 i) external view returns (Zincir memory) {
        return _zincirler[i];
    }

    function destekliMi(uint32 cctpDomain) public view returns (bool) {
        return _indeks[cctpDomain] != 0;
    }

    function zincir(uint32 cctpDomain) public view returns (Zincir memory) {
        uint256 i = _indeks[cctpDomain];
        if (i == 0) revert ZincirYok(cctpDomain);
        return _zincirler[i - 1];
    }

    /* ---- the only thing that matters -------------------------------- */

    /// The address of `tokenId`'s vault on `cctpDomain`.
    ///
    /// Pure. No storage read of an address, no caller input beyond the
    /// token's own id. If this returns X, then X is the only address this
    /// system will ever send that token's collateral to on that chain, and
    /// the only contract that can be deployed there by that factory with
    /// that salt is the one whose init code hashes to `initKodHash`.
    function uzakKasa(uint32 cctpDomain, uint256 tokenId) public view returns (address) {
        Zincir memory z = zincir(cctpDomain);
        return _create2(z.uzakFabrika, keccak256(abi.encode(tokenId)), z.initKodHash);
    }

    /// Same, as the bytes32 CCTP wants for `mintRecipient`.
    ///
    /// CCTP takes a bytes32 so the same field can address a Solana account.
    /// An EVM address is left-padded, and getting that padding wrong sends
    /// the mint to an address nobody holds.
    function uzakKasaBytes32(uint32 cctpDomain, uint256 tokenId)
        external
        view
        returns (bytes32)
    {
        return bytes32(uint256(uint160(uzakKasa(cctpDomain, tokenId))));
    }

    function _create2(address dagitan, bytes32 tuz, bytes32 initKodHash)
        internal
        pure
        returns (address)
    {
        return address(uint160(uint256(keccak256(
            abi.encodePacked(bytes1(0xff), dagitan, tuz, initKodHash)
        ))));
    }

    /// Does `aday` match the address this registry derives for that token?
    ///
    /// Used by the inbound path: a message claiming to come from a token's
    /// remote vault is only believed if the sender IS the derived address.
    /// Comparing against a derivation rather than a stored list is what
    /// makes a forged sender impossible rather than merely unlikely.
    function dogruKasaMi(uint32 cctpDomain, uint256 tokenId, address aday)
        external
        view
        returns (bool)
    {
        if (!destekliMi(cctpDomain)) return false;
        return uzakKasa(cctpDomain, tokenId) == aday;
    }

    /// Same check against CCTP's bytes32 sender, which is how the handler
    /// receives it.
    function dogruKasaMiBytes32(uint32 cctpDomain, uint256 tokenId, bytes32 aday)
        external
        view
        returns (bool)
    {
        if (!destekliMi(cctpDomain)) return false;
        /* A bytes32 with anything in its top 12 bytes is not an EVM
           address, and accepting it would let a 32-byte sender collide with
           a 20-byte one. */
        if (uint256(aday) >> 160 != 0) return false;
        return uzakKasa(cctpDomain, tokenId) == address(uint160(uint256(aday)));
    }
}
