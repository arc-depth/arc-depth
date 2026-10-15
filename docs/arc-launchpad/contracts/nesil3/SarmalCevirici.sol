// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IDolar6S {
    function alttaki() external view returns (address);
    function coz(uint256 birim) external returns (uint256 miktar);
}

interface IERC20SC {
    function transfer(address, uint256) external returns (bool);
}

interface IYerelCeviriciS {
    function cevir(address girdi, address cikti, uint256 miktar, uint8 tur, bytes calldata rota, address alici)
        external
        returns (uint256 cikan);
}

/// @title SarmalCevirici — local collateral on a chain whose launch dollar
///        is the 6-decimal wrapper (BNB Chain: Dolar6 over 18-decimal USDC)
///
/// The launchpad's quote on BNB is Dolar6, and nothing trades against
/// Dolar6 — the markets are against the dollar it wraps. This converter
/// unwraps the collateral (Dolar6.coz, 1:1, no fee) and hands the
/// underlying dollar to the unchanged YerelCevirici, which runs the
/// founder's route into the vault. Same entry point as YerelCevirici, so
/// PulseLaunchpad3 is deployed on BNB unchanged, with this address as its
/// converter.
///
/// Holds nothing between calls, no owner, no setter. Pasting the
/// underlying dollar itself unwraps straight into the vault. The route is
/// checked by YerelCevirici (first token must be the underlying dollar);
/// the launchpad still measures what the vault received against the
/// founder's minimum.
contract SarmalCevirici {
    IDolar6S public immutable sarmal;
    address public immutable alttaki;
    IYerelCeviriciS public immutable ic;

    error KotuGirdi();
    error TransferOlmadi();

    constructor(IDolar6S _sarmal, IYerelCeviriciS _ic) {
        sarmal = _sarmal;
        alttaki = _sarmal.alttaki();
        ic = _ic;
    }

    /// The caller has already transferred `miktar` Dolar6 units here.
    function cevir(address girdi, address cikti, uint256 miktar, uint8 tur, bytes calldata rota, address alici)
        external
        returns (uint256 cikan)
    {
        if (girdi != address(sarmal)) revert KotuGirdi();
        uint256 u = sarmal.coz(miktar);
        if (cikti == alttaki) {
            if (!IERC20SC(alttaki).transfer(alici, u)) revert TransferOlmadi();
            return u;
        }
        if (!IERC20SC(alttaki).transfer(address(ic), u)) revert TransferOlmadi();
        cikan = ic.cevir(alttaki, cikti, u, tur, rota, alici);
    }
}
