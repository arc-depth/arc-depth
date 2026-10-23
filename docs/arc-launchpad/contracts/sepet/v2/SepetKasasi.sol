// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHaberci, IHaberAlici, IERC20S, SepetMesaj, Adres} from "../IHaberci.sol";

/// @title SepetKasasi — the basket assets that live on this chain
///
/// One per chain. It holds, for every launch whose basket names an asset on
/// this chain, that launch's units of it, in its own ledger: a launch's
/// money can never pay another launch, and nothing outside the ledger
/// (an airdrop, a donation, a flash balance) counts toward anyone's share.
///
/// HOW IT BUYS AND SELLS: NO ORACLE, NO POOL
///   A meme, a stock token or a Solana coin rarely has a price a contract
///   can read without someone being able to move it for a block. So the
///   vault never swaps. It runs a reverse Dutch auction and waits for a
///   filler:
///     buy   it offers `usdc` dollars for at least Q(t) units of the asset
///     sell  it offers `miktar` units for at least P(t) dollars
///   Q and P start at BASLANGIC_KAT times the last price this vault filled
///   at (or the founder's quote, for the first buy) and halve every
///   YARILANMA. The first filler takes it at whatever Q or P has fallen to,
///   so competition sets the price; a filler who comes early simply pays
///   more. There is no swap to sandwich: the asset is delivered, not traded
///   in front of anyone.
///   Neither falls below 1 / TABAN_KAT of the start. An auction stuck there
///   (the asset moved more than that) can be restarted from that floor
///   after BEKLEME, so it keeps going without ever jumping.
///
/// WHAT LEAVES, AND HOW
///   Only a redemption ordered by the Defter: that launch's share of each
///   asset, sold by auction, the dollars sent to the holder's chain. No
///   owner, no pause, no withdrawal, no sweep.
contract SepetKasasi is IHaberAlici {
    IHaberci public immutable haberci;
    IERC20S public immutable usdc;
    uint32 public immutable defterZincir;
    bytes32 public immutable defter;

    uint256 public constant BASLANGIC_KAT = 2;
    uint256 public constant TABAN_KAT = 16;
    uint256 public constant YARILANMA = 30 minutes;
    uint256 public constant BEKLEME = 1 days;

    /* ---- the ledger: launch => asset => units ---------------------- */
    mapping(uint64 => mapping(address => uint256)) public bakiye;
    /// Dollars a launch holds here that are not yet spent: they sit in its
    /// buy auctions. A redemption takes its share of them directly.
    mapping(uint64 => uint256) public usdcBakiye;
    /// The dollars a launch's open buy auctions were opened with. Equal to
    /// usdcBakiye until a redemption pays part of it out; from then on each
    /// auction spends its proportional part of what is left, so a
    /// redemption shrinks every open buy alike and the basket keeps its
    /// weights.
    mapping(uint64 => uint256) public taahhut;

    /// The last price this vault filled at, per asset, as a pair: so many
    /// dollars bought so many units.
    struct Fiyat { uint128 usdc; uint128 varlik; }
    mapping(address => Fiyat) public sonFiyat;

    uint8 internal constant ALIM = 1;
    uint8 internal constant SATIM = 2;

    struct Ihale {
        uint8 tur;
        uint64 launchId;
        address varlik;
        uint256 verilen;     // ALIM: dollars offered; SATIM: units offered
        uint256 baslangic;   // ALIM: Q0 units wanted; SATIM: P0 dollars wanted
        uint64 baslama;
        uint32 hedefZincir;  // SATIM: where the holder is paid
        bytes32 alici;       // SATIM: the holder, on their chain
        bool bitti;
    }
    Ihale[] public ihaleler;

    bool private _kilit;

    event Ilan(uint256 indexed id, uint8 tur, uint64 indexed launchId, address indexed varlik, uint256 verilen, uint256 baslangic);
    event Doldu(uint256 indexed id, address indexed dolduran, uint256 verilen, uint256 alinan);
    event Yeniden(uint256 indexed id, uint256 baslangic);

    error SadeceHaberci();
    error SadeceDefter();
    error KotuMesaj();
    error Bitti();
    error Az();
    error Erken();
    error Sifir();
    error TransferOlmadi();
    error Yeniden_();

    modifier kilitli() {
        if (_kilit) revert Yeniden_();
        _kilit = true;
        _;
        _kilit = false;
    }

    constructor(IHaberci _haberci, IERC20S _usdc, uint32 _defterZincir, bytes32 _defter) {
        haberci = _haberci;
        usdc = _usdc;
        defterZincir = _defterZincir;
        defter = _defter;
    }

    /* ---- orders, from the Defter only ------------------------------ */

    function haberAl(uint32 kaynakZincir, bytes32 kaynak, bytes calldata veri, uint256 gelen) external kilitli {
        if (msg.sender != address(haberci)) revert SadeceHaberci();
        if (kaynakZincir != defterZincir || kaynak != defter) revert SadeceDefter();
        uint8 tur = uint8(uint256(bytes32(veri[:32])));
        if (tur == SepetMesaj.AL) {
            (, uint64 l, bytes32 varlik, uint256 refVarlik) = abi.decode(veri, (uint8, uint64, bytes32, uint256));
            if (gelen == 0) revert Sifir();
            usdcBakiye[l] += gelen;
            taahhut[l] += gelen;
            _alimIlani(l, Adres.evm(varlik), gelen, refVarlik);
        } else if (tur == SepetMesaj.SAT) {
            (, uint64 l, bytes32[] memory varliklar, uint256 miktar, uint256 arz, uint32 hz, bytes32 alici) =
                abi.decode(veri, (uint8, uint64, bytes32[], uint256, uint256, uint32, bytes32));
            _satisEmri(l, varliklar, miktar, arz, hz, alici);
        } else {
            revert KotuMesaj();
        }
    }

    function _alimIlani(uint64 l, address varlik, uint256 dolar, uint256 refVarlik) internal {
        /* the expected units for these dollars: the last fill's price,
           or the founder's quote when this vault has never bought it */
        Fiyat memory f = sonFiyat[varlik];
        uint256 beklenen = f.usdc > 0 ? (dolar * f.varlik) / f.usdc : refVarlik;
        if (beklenen == 0) beklenen = 1;
        _ilan(ALIM, l, varlik, dolar, beklenen * BASLANGIC_KAT, 0, bytes32(0));
    }

    /// A holder burned `miktar` of `arz`: their share of every asset this
    /// launch holds here goes up for sale, and their share of its unspent
    /// dollars is paid at once.
    function _satisEmri(uint64 l, bytes32[] memory varliklar, uint256 miktar, uint256 arz, uint32 hz, bytes32 alici) internal {
        if (arz == 0 || miktar == 0 || miktar > arz) revert KotuMesaj();
        uint256 d = (usdcBakiye[l] * miktar) / arz;
        if (d > 0) {
            usdcBakiye[l] -= d;
            _ode(hz, alici, d);
        }
        for (uint256 i = 0; i < varliklar.length; i++) {
            address v = Adres.evm(varliklar[i]);
            uint256 pay = (bakiye[l][v] * miktar) / arz;
            if (pay == 0) continue;
            bakiye[l][v] -= pay;
            Fiyat memory f = sonFiyat[v];
            /* no fill price yet means the asset was never bought here, so
               the launch holds none of it and pay is 0 above */
            uint256 beklenen = (pay * f.usdc) / f.varlik;
            if (beklenen == 0) beklenen = 1;
            _ilan(SATIM, l, v, pay, beklenen * BASLANGIC_KAT, hz, alici);
        }
    }

    function _ilan(uint8 tur, uint64 l, address varlik, uint256 verilen, uint256 baslangic, uint32 hz, bytes32 alici) internal {
        ihaleler.push(Ihale(tur, l, varlik, verilen, baslangic, uint64(block.timestamp), hz, alici, false));
        emit Ilan(ihaleler.length - 1, tur, l, varlik, verilen, baslangic);
    }

    /* ---- the auction ----------------------------------------------- */

    /// What auction `id` asks for right now: units for a buy, dollars for a
    /// sell. Halves every YARILANMA, linear in between, never below the floor.
    function istenen(uint256 id) public view returns (uint256) {
        Ihale memory h = ihaleler[id];
        uint256 gecen = block.timestamp - h.baslama;
        uint256 n = gecen / YARILANMA;
        uint256 taban = h.baslangic / TABAN_KAT;
        if (n >= 64) return taban;
        uint256 q = h.baslangic >> n;
        q -= (q * (gecen % YARILANMA)) / (2 * YARILANMA);
        return q > taban ? q : taban;
    }

    /// Fill auction `id`. A buy: deliver at least `istenen` units of the
    /// asset (approved to this vault), receive the dollars. A sell: pay at
    /// least `istenen` dollars, receive the units; the dollars go to the
    /// holder. `teklif` is what the filler offers, and is what moves.
    function doldur(uint256 id, uint256 teklif) external kilitli {
        Ihale storage h = ihaleler[id];
        if (h.bitti) revert Bitti();
        uint256 ist = istenen(id);
        if (h.tur == ALIM) {
            /* a redemption may have paid out part of these dollars since
               the auction opened: spend this auction's proportional part of
               what is still the launch's, and ask proportionally less */
            uint256 t = taahhut[h.launchId];
            uint256 harca = (h.verilen * usdcBakiye[h.launchId]) / t;
            taahhut[h.launchId] = t - h.verilen;
            if (harca == 0) revert Sifir();
            uint256 gerek = (ist * harca) / h.verilen;
            if (teklif < gerek || teklif == 0) revert Az();
            h.bitti = true;
            uint256 once = IERC20S(h.varlik).balanceOf(address(this));
            if (!IERC20S(h.varlik).transferFrom(msg.sender, address(this), teklif)) revert TransferOlmadi();
            /* credit what arrived, not what was claimed */
            uint256 gelen = IERC20S(h.varlik).balanceOf(address(this)) - once;
            if (gelen < gerek) revert Az();
            usdcBakiye[h.launchId] -= harca;
            bakiye[h.launchId][h.varlik] += gelen;
            sonFiyat[h.varlik] = Fiyat(uint128(harca), uint128(gelen));
            if (!usdc.transfer(msg.sender, harca)) revert TransferOlmadi();
            emit Doldu(id, msg.sender, harca, gelen);
        } else {
            if (teklif < ist || teklif == 0) revert Az();
            h.bitti = true;
            if (!usdc.transferFrom(msg.sender, address(this), teklif)) revert TransferOlmadi();
            sonFiyat[h.varlik] = Fiyat(uint128(teklif), uint128(h.verilen));
            if (!IERC20S(h.varlik).transfer(msg.sender, h.verilen)) revert TransferOlmadi();
            _ode(h.hedefZincir, h.alici, teklif);
            emit Doldu(id, msg.sender, h.verilen, teklif);
        }
    }

    /// An auction resting on its floor for BEKLEME restarts from there, so
    /// an asset that moved more than TABAN_KAT can still be traded.
    function yenidenBaslat(uint256 id) external {
        Ihale storage h = ihaleler[id];
        if (h.bitti) revert Bitti();
        uint256 tabanaVaris = YARILANMA * 4;   // 2^4 = TABAN_KAT
        if (block.timestamp < h.baslama + tabanaVaris + BEKLEME) revert Erken();
        h.baslangic = h.baslangic / TABAN_KAT;
        if (h.baslangic == 0) h.baslangic = 1;
        h.baslama = uint64(block.timestamp);
        emit Yeniden(id, h.baslangic);
    }

    function ihaleSayisi() external view returns (uint256) { return ihaleler.length; }

    /* ---- paying a holder, here or on their chain -------------------- */

    function _ode(uint32 hz, bytes32 alici, uint256 miktar) internal {
        if (hz == haberci.zincir()) {
            if (!usdc.transfer(Adres.evm(alici), miktar)) revert TransferOlmadi();
        } else {
            usdc.approve(address(haberci), miktar);
            haberci.gonder(hz, alici, "", miktar);
        }
    }
}
