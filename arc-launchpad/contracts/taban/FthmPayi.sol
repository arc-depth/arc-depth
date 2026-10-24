// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.26;

/// @title FthmPayi — carries FTHM stakers' share of floor-layer fees to Arc
///
/// One per chain. Every TabanKasasi on this chain sends FTHM's share of its
/// fees here. `supur` moves the whole balance to the FTHM stake contract on
/// Arc: by plain transfer on Arc itself, by a CCTP burn everywhere else,
/// with the stake contract as mint recipient. The stake contract credits
/// whatever USDC arrives to its stakers (Stake.dagit, open to anyone), so
/// nothing on Arc has to be told the money came.
///
/// No owner, no withdrawal, no other destination: the stake address and
/// Arc's domain are immutable. Anyone may sweep; the caller only chooses
/// how much CCTP may keep, capped at 1%.
contract FthmPayi {
    uint32 public constant ARC_DOMAIN = 26;
    uint32 public constant KESINLIK = 2000;

    address public immutable dolar;
    ITokenMesajciS public immutable tokenMesajci;
    uint32 public immutable buDomain;
    address public immutable stake;

    event Supuruldu(uint256 miktar, uint256 maxUcret);

    error Sifir();
    error UcretCok();

    constructor(address dolar_, address tm, uint32 buDomain_, address stake_) {
        if (stake_ == address(0) || dolar_ == address(0)) revert Sifir();
        dolar = dolar_;
        tokenMesajci = ITokenMesajciS(tm);
        buDomain = buDomain_;
        stake = stake_;
    }

    function supur(uint256 maxUcret) external returns (uint256 miktar) {
        miktar = IERC20S(dolar).balanceOf(address(this));
        if (miktar == 0) revert Sifir();
        if (buDomain == ARC_DOMAIN) {
            require(IERC20S(dolar).transfer(stake, miktar), "transfer");
        } else {
            if (maxUcret * 100 > miktar) revert UcretCok();
            require(IERC20S(dolar).approve(address(tokenMesajci), miktar), "approve");
            tokenMesajci.depositForBurn(
                miktar, ARC_DOMAIN, bytes32(uint256(uint160(stake))), dolar, bytes32(0), maxUcret, KESINLIK);
        }
        emit Supuruldu(miktar, maxUcret);
    }
}

interface IERC20S {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

/// TokenMessengerV2.depositForBurn, signature from Circle's ITokenMessengerV2.
interface ITokenMesajciS {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external;
}
