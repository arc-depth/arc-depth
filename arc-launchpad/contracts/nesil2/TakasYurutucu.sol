// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20Y {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

/// Uniswap's SwapRouter02 (the deadline-less ExactInputParams).
interface ISwapRouter02Y {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }
    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

/// @title TakasYurutucu — the borrower a remote vault lends to for a swap
///
/// RemoteCollateralVault2.takasEt / geriTakasEt lend the position to a
/// borrower, call it back, and then check only the outcome against a floor
/// they derive themselves (Chainlink feed or the pool's 30-minute average,
/// minus 3%). This is that borrower: it routes the loan through Uniswap v3
/// along the path the caller supplies and sends every unit of the proceeds
/// to the vault that called it.
///
/// It holds nothing and has no owner. A path that pays too little makes the
/// vault revert; a path that pays to somebody else cannot exist, because
/// the recipient is msg.sender and not a parameter. Anyone may use it, and
/// anyone may deploy another — the vault does not care which borrower it
/// lends to, only what comes back.
contract TakasYurutucu {
    ISwapRouter02Y public immutable router;

    error KotuYol();

    constructor(ISwapRouter02Y _router) {
        router = _router;
    }

    /// veri = abi.encode(bytes path), path = tokenIn | fee | ... | tokenOut
    function takasCagrisi(address verilen, uint256 miktar, address alinan, uint256 asgari, bytes calldata veri) external {
        bytes memory yol = abi.decode(veri, (bytes));
        if (yol.length < 43 || _ilk(yol) != verilen || _son(yol) != alinan) revert KotuYol();
        IERC20Y(verilen).approve(address(router), miktar);
        router.exactInput(ISwapRouter02Y.ExactInputParams(yol, msg.sender, miktar, asgari));
        /* Nothing is supposed to stay; if the router left dust of the input
           (it does not, for exactInput), it goes back to the lender too. */
        uint256 kalan = IERC20Y(verilen).balanceOf(address(this));
        if (kalan > 0) IERC20Y(verilen).transfer(msg.sender, kalan);
    }

    function _ilk(bytes memory y) private pure returns (address a) {
        assembly { a := shr(96, mload(add(y, 32))) }
    }

    function _son(bytes memory y) private pure returns (address a) {
        uint256 n = y.length;
        assembly { a := shr(96, mload(add(add(y, 32), sub(n, 20)))) }
    }
}
