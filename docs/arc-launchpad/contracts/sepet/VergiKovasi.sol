// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20S} from "./IHaberci.sol";

interface ISepetUcuV {
    function vergi(address token, uint256 dolar) external;
}

interface IHavuzRezerviV {
    function havuzdakiToken(bytes32 havuzId) external view returns (uint256);
}

interface ITokenV {
    function totalSupply() external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
}

/// @title VergiKovasi — where a basket-backed launch's trading tax waits
///
/// The pool's hook pays the collateral tax of every trade here, in dollars,
/// as it pays a local vault in nesil 4. Sending each trade's few cents across
/// chains would cost more than the cents, so the bucket holds them until
/// GONDERIM_ESIGI and then anyone sends the lot to the basket through this
/// chain's SepetUcu (which carries it to the Defter on Arc, which re-buys
/// the basket every $50).
///
/// It also answers the hook's one question, `dolasim`, the same way
/// TeminatKasasi4 does: total supply minus the pool's own reserve (counted
/// by PulseHook4) minus the opener's balance; never the PoolManager's
/// balance, which anyone can move inside an unlock.
///
/// No owner. The dollars can go one place only: the basket of this token.
contract VergiKovasi {
    IERC20S public immutable usdc;
    ISepetUcuV public immutable ucu;
    address public immutable token;
    IHavuzRezerviV public immutable hook;
    bytes32 public immutable havuzId;
    address public immutable acici;

    uint256 public constant GONDERIM_ESIGI = 10e6;   // $10

    event Gonderildi(uint256 dolar);

    error EsikAltinda();

    constructor(IERC20S _usdc, ISepetUcuV _ucu, address _token, IHavuzRezerviV _hook, bytes32 _havuzId, address _acici) {
        usdc = _usdc;
        ucu = _ucu;
        token = _token;
        hook = _hook;
        havuzId = _havuzId;
        acici = _acici;
    }

    /// Anyone, once GONDERIM_ESIGI has gathered: everything here goes to the
    /// basket.
    function gonder() external {
        uint256 b = usdc.balanceOf(address(this));
        if (b < GONDERIM_ESIGI) revert EsikAltinda();
        usdc.approve(address(ucu), b);
        ucu.vergi(token, b);
        emit Gonderildi(b);
    }

    function dolasim() external view returns (uint256) {
        uint256 t = ITokenV(token).totalSupply();
        uint256 dis = hook.havuzdakiToken(havuzId) + ITokenV(token).balanceOf(acici);
        return t > dis ? t - dis : 0;
    }
}
