// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title FarkUcreti — the gap fee between the Arc and Robinhood FTHM pools
/// @notice Two pools on two chains cannot hold the same price at every
///         moment: a cross-chain message takes seconds. What can be done is
///         to make sure nobody outside profits from the difference. Each
///         pool's hook keeps the other chain's last FTHM price as a
///         reference, and a swap that would capture the gap pays exactly
///         the gap as an extra fee. That fee goes to the vault, so the
///         difference ends up under the floor instead of in an
///         arbitrageur's wallet.
///
///         Which swaps capture the gap:
///           - buying FTHM where it is cheaper than the reference
///           - selling FTHM where it is dearer than the reference
///         Swaps in the other direction pull the two prices together and
///         pay nothing extra.
///
/// @dev Prices are compared through the ratio of sqrt prices, never by
///      squaring a sqrtPriceX96 (that overflows 256 bits). The ratio is
///      carried at 1e12 so the relative error is ~1e-12, far below one
///      ppm.
///
///      A reference older than `azamiYas` charges nothing extra. That is a
///      deliberate choice and a known gap: with no fresh price the fee
///      cannot know which side is cheap, and guessing would tax ordinary
///      trades. Keeping the reference fresh is the relayer's job.
library FarkUcreti {
    uint256 internal constant PPM = 1_000_000;
    uint256 internal constant OLCEK = 1e12;

    /// @param yerelSqrtP  this pool's current sqrtPriceX96
    /// @param refSqrtP    the other chain's last sqrtPriceX96, expressed for
    ///                    the same token order (FTHM as token0 or token1 on
    ///                    both sides — the caller normalises)
    /// @param fthmToken0  true if FTHM is currency0 in this pool
    /// @param fthmAliniyor true if the swap buys FTHM
    /// @param refZaman    when the reference was produced (source chain time)
    /// @param simdi       block.timestamp
    /// @param azamiYas    oldest acceptable reference, seconds
    /// @param tavanPpm    the most this fee can ever be
    /// @return ppm        extra fee in parts per million of the input
    function hesapla(
        uint160 yerelSqrtP,
        uint160 refSqrtP,
        bool fthmToken0,
        bool fthmAliniyor,
        uint64 refZaman,
        uint64 simdi,
        uint64 azamiYas,
        uint24 tavanPpm
    ) internal pure returns (uint24 ppm) {
        if (refSqrtP == 0 || yerelSqrtP == 0) return 0;
        if (refZaman > simdi || simdi - refZaman > azamiYas) return 0;

        /* r = local FTHM price / reference FTHM price, in ppm. With FTHM as
           token0 the pool price (token1 per token0) is the FTHM price; as
           token1 it is the inverse, so the sqrt ratio flips. */
        uint256 rs = fthmToken0
            ? (uint256(yerelSqrtP) * OLCEK) / refSqrtP
            : (uint256(refSqrtP) * OLCEK) / yerelSqrtP;
        uint256 r = (rs * rs) / (OLCEK * OLCEK / PPM);

        uint256 fark;
        if (fthmAliniyor && r < PPM) {
            fark = PPM - r;                    // buying where it is cheap
        } else if (!fthmAliniyor && r > PPM) {
            fark = ((r - PPM) * PPM) / r;      // selling where it is dear
        } else {
            return 0;
        }
        return fark > tavanPpm ? tavanPpm : uint24(fark);
    }
}
