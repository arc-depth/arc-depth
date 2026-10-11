// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PulseAcici} from "./PulseAcici.sol";

interface IERC20PL {
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface IPulseKayitPL {
    struct Kayit {
        address token;
        address acici;
        address kasa;
        address yonetici;
        address hedefVarlik;
        address kurucu;
        uint256 kurucuToken;
        uint256 teklif;
        uint256 vergiPpm;
        uint64 zaman;
    }

    function launchCount() external view returns (uint256);
    function launchAt(uint256 i) external view returns (Kayit memory);
}

/// @title PulseLikiditeKasasi — %0,50 dilimi, kilitli derinliğe çevrilir
///
/// NEDEN YENİ BİR TANE GEREKTİ — VE BU BİR ÖLÇÜMLE BULUNDU
///   Önceki nesle ait `LikiditeKasasi` zincirde duruyor ve yeni nesil onu
///   paylaşılan altyapı sayıp kullanacaktı. Kullanamaz:
///
///     launchpad.launchIdOfToken(token)   ->  yeni launchpad'de YOK
///     launchpad.launchAt(i)              ->  dönüş şekli farklı
///
///   Ölçüldü, yeni nesil bir token adresiyle çağrıldı ve `BilinmeyenToken`
///   ile reddetti. Yani kancanın her işlemde oraya gönderdiği %0,50 içeri
///   girer ve BİR DAHA ÇIKMAZ — işlem başına küçük, ama sonsuza kadar
///   birikir.
///
///   Hiçbir şey revert etmezdi. Takaslar çalışmaya devam ederdi ve para
///   erişilemez bir bakiyede büyürdü; bu projenin yorumlarının tekrar
///   tekrar uyardığı şekil tam bu.
///
/// TOKENE GÖRE DEĞİL ID'YE GÖRE
///   Eskisi tokenden id'ye giden bir eşleme okuyordu. Yenisi doğrudan
///   launch id'si alıyor, çünkü yeni launchpad o eşlemeyi tutmuyor ve
///   tutmadığı bir şeyi okumak bu kasayı yine kırılgan yapardı. Id,
///   `launchCount()` ile sınırlanıyor; uydurulmuş bir id okunamaz.
///
/// NE KADAR GİDECEĞİNE KARAR VERİLMİYOR
///   Tutulan her şey gidiyor. Kısmi bir besleme bir karar olurdu ve bir
///   karar, ona güvenilecek birini gerektirir. Çağıran yalnızca HANGİ
///   piyasanın derinleşeceğini seçiyor — paranın çıkıp çıkmayacağını
///   değil, başka nereye gidebileceğini de değil, çünkü başka bir yer yok.
contract PulseLikiditeKasasi {
    IERC20PL public immutable quote;
    IPulseKayitPL public immutable launchpad;

    event Beslendi(uint256 indexed launchId, address acici, uint256 miktar, uint128 eklenen);

    error KotuKurulum();
    error BilinmeyenLaunch();
    error BosBakiye();
    error TransferOlmadi();

    constructor(IERC20PL _quote, IPulseKayitPL _launchpad) {
        if (address(_quote) == address(0) || address(_launchpad) == address(0)) {
            revert KotuKurulum();
        }
        quote = _quote;
        launchpad = _launchpad;
    }

    function bekleyen() external view returns (uint256) {
        return quote.balanceOf(address(this));
    }

    /// Push everything held here into launch `launchId`'s pool as locked
    /// liquidity.
    ///
    /// Permissionless, and safe to be: there is nothing for a caller to
    /// choose except which of this protocol's own pools gets deeper, and
    /// every destination is a ladder whose liquidity can never be removed.
    function besle(uint256 launchId) external returns (uint128 eklenen) {
        if (launchId >= launchpad.launchCount()) revert BilinmeyenLaunch();
        IPulseKayitPL.Kayit memory k = launchpad.launchAt(launchId);
        if (k.acici == address(0)) revert BilinmeyenLaunch();

        uint256 miktar = quote.balanceOf(address(this));
        if (miktar == 0) revert BosBakiye();

        if (!quote.transfer(k.acici, miktar)) revert TransferOlmadi();
        /* `biriktir` places whichever assets the ladder holds on their own
           side of the price. Quote alone lands below it, which is exactly
           where a bid belongs: this slice buys the book a floor to lean on
           rather than more tokens to sell. */
        eklenen = PulseAcici(k.acici).biriktir();
        emit Beslendi(launchId, k.acici, miktar, eklenen);
    }
}
