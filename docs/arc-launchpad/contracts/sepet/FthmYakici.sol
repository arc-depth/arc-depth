// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20S} from "./IHaberci.sol";

/// @title FthmYakici — turns the trade fee's FTHM slice into burned FTHM
///
/// PulseHook5 sends 0.20% of every trade here, in dollars. Once ESIK has
/// gathered, anyone opens an auction: all the dollars here for at least
/// Q(t) FTHM, Q starting at BASLANGIC_KAT times the last price and halving
/// every YARILANMA (never below 1/TABAN_KAT). The filler delivers FTHM and
/// takes the dollars; the FTHM goes straight to 0xdead in the same call.
///
/// No oracle and no pool: it works on any chain where FTHM exists, whether
/// or not an FTHM pool is open there. No owner; the dollars can only become
/// burned FTHM.
contract FthmYakici {
    IERC20S public immutable usdc;
    IERC20S public immutable fthm;
    address public constant OLU = 0x000000000000000000000000000000000000dEaD;

    uint256 public constant ESIK = 10e6;          // $10
    uint256 public constant BASLANGIC_KAT = 2;
    uint256 public constant TABAN_KAT = 16;
    uint256 public constant YARILANMA = 30 minutes;

    /// last fill: so many dollars bought so many FTHM (start: the quote
    /// fixed at deployment)
    uint256 public sonDolar;
    uint256 public sonFthm;

    /* the open auction, if any */
    uint256 public verilen;
    uint256 public baslangic;
    uint256 public baslama;

    uint256 public toplamYakilan;

    event Ilan(uint256 dolar, uint256 baslangic);
    event Yakildi(address indexed dolduran, uint256 dolar, uint256 fthm);

    error EsikAltinda();
    error AcikVar();
    error AcikYok();
    error Az();
    error TransferOlmadi();

    constructor(IERC20S _usdc, IERC20S _fthm, uint256 refDolar, uint256 refFthm) {
        usdc = _usdc;
        fthm = _fthm;
        sonDolar = refDolar;
        sonFthm = refFthm;
    }

    /// Open an auction for every dollar here.
    function ilan() external {
        if (verilen != 0) revert AcikVar();
        uint256 b = usdc.balanceOf(address(this));
        if (b < ESIK) revert EsikAltinda();
        verilen = b;
        uint256 beklenen = (b * sonFthm) / sonDolar;
        if (beklenen == 0) beklenen = 1;
        baslangic = beklenen * BASLANGIC_KAT;
        baslama = block.timestamp;
        emit Ilan(b, baslangic);
    }

    function istenen() public view returns (uint256) {
        if (verilen == 0) revert AcikYok();
        uint256 gecen = block.timestamp - baslama;
        uint256 n = gecen / YARILANMA;
        uint256 taban = baslangic / TABAN_KAT;
        if (n >= 64) return taban;
        uint256 q = baslangic >> n;
        q -= (q * (gecen % YARILANMA)) / (2 * YARILANMA);
        return q > taban ? q : taban;
    }

    /// Deliver at least `istenen` FTHM (approved here); it is burned, and
    /// the auction's dollars are yours.
    function doldur(uint256 teklif) external {
        uint256 ist = istenen();
        if (teklif < ist || teklif == 0) revert Az();
        uint256 d = verilen;
        verilen = 0;
        uint256 once = fthm.balanceOf(OLU);
        if (!fthm.transferFrom(msg.sender, OLU, teklif)) revert TransferOlmadi();
        uint256 yakilan = fthm.balanceOf(OLU) - once;
        if (yakilan < ist) revert Az();
        sonDolar = d;
        sonFthm = yakilan;
        toplamYakilan += yakilan;
        if (!usdc.transfer(msg.sender, d)) revert TransferOlmadi();
        emit Yakildi(msg.sender, d, yakilan);
    }
}
