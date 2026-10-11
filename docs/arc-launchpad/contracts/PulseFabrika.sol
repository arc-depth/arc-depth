// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LaunchToken} from "./LaunchToken.sol";
import {PulseAcici, IERC20P} from "./PulseAcici.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

interface IERC20F {
    function transfer(address to, uint256 v) external returns (bool);
}

/// @title PulseFabrika — bir launch'ın tokeni ve havuz açıcısı
///
/// NEDEN AYRI BİR FABRİKA
///   Launchpad'in kendisi bu ikisinin yaratma kodunu taşımak zorunda
///   kalsaydı EIP-170'in %94'üne çıkardı: launchpad 10.327, token 2.853,
///   açıcı 10.008 bayt. Proje bu sınıra bir kez çarptı ve bir birleşik
///   fabrika 23.007 bayt ölçüldü. Bölünme bir tercih değil, ölçülmüş bir
///   zorunluluk.
///
/// EGRIFABRIKA'DAN FARKI: EĞRİ YOK, ÖDÜL YOK
///   `EgriFabrika` üç şey üretiyordu — token, eğri ve HolderRewards. İkisi
///   çıktı:
///
///   EĞRİ ÇIKTI çünkü artık ayrı bir piyasa yok. Eğri kendi fiyatını
///     tutuyordu ve havuz mezuniyette açılıyordu; aynı tokenin iki fiyatı
///     vardı ve mezuniyette havuz fiyatı açılış seviyesine dönüyordu.
///     Yeni kuralda piyasa ilk bloktan Uniswap v4.
///
///   ÖDÜL ÇIKTI çünkü holder ödülü verilmeyecek. Onun payı olan %0,30
///     havuz derinliğine gidiyor: kilitli, kimsenin çekemediği ve her
///     sahibin işine yarayan tek yer. Bir cüzdana gitse para toplayan bir
///     cüzdan olurdu; hiçbir yere gitmese buharlaşırdı.
///
///   Kalan artık: `LaunchToken.lastBalanceChange` artık hiçbir şey
///   tarafından okunmuyor. Tokeni çatallamak yerine bırakıldı — kasanın
///   ihtiyaç duyduğu `burnFrom` onda ve token ölçülmüş durumda; para
///   yolunda test edilmemiş yeni bir token denemek, her transferde iki
///   sıcak SSTORE'dan pahalıya gelir.
///
/// ARZIN TAMAMI LAUNCHPAD'E GİDİYOR
///   Bölünmeyi launchpad yapıyor: kurucunun payı cüzdanına, kalanı
///   merdivene. Burada bölünmüyor çünkü kurucunun payı net ödemeye bağlı
///   ve net ödeme burada bilinmiyor — bilinseydi aynı sayı iki yerde
///   hesaplanmış olurdu, ki ayrışabilen iki sayı demektir.
contract PulseFabrika {
    error TransferOlmadi();

    struct Ayar {
        IERC20P quote;
        IPoolManager poolManager;
        IHooks hook;
        uint256 supply;
        uint24 poolFee;
        int24 tickSpacing;
        /// The launchpad. It receives the whole supply and is the only
        /// address the opener will take an `ac` call from.
        address merkez;
    }

    function kur(string calldata ad, string calldata sembol, Ayar calldata a)
        external
        returns (address token, address acici)
    {
        LaunchToken t = new LaunchToken(ad, sembol, a.supply, address(this));

        PulseAcici p = new PulseAcici(
            a.poolManager,
            IERC20P(address(t)),
            a.quote,
            a.hook,
            a.poolFee,
            a.tickSpacing,
            a.merkez
        );

        /* The whole supply to the launchpad, which splits it in the same
           transaction. It never sits in anybody's wallet: the launchpad
           has no function that moves a token balance except inside
           `launch`. */
        if (!IERC20F(address(t)).transfer(a.merkez, a.supply)) revert TransferOlmadi();

        return (address(t), address(p));
    }
}
