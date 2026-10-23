// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20S} from "./IHaberci.sol";

interface ISepetUcuV {
    function vergi(address token, uint256 dolar) external;
    function defter() external view returns (bytes32);
}

interface IDefterV {
    function gonderimVar(bytes32 token, uint256 ek) external view returns (bool);
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
/// and in the same trade asks the bucket to pass it on (v4, 23 Oct 2026):
/// through this chain's SepetUcu to the Defter, which is on this same chain
/// (Arc), so no bridge and no threshold — v2 held the cents until $10 and
/// needed someone to call `gonder`. The Defter books them on the basket
/// lines and re-buys each line every $50. If passing on fails (out of the
/// gas the hook allows), the dollars wait here and go with the next trade,
/// or with anyone's `gonder`.
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

    event Gonderildi(uint256 dolar);

    constructor(IERC20S _usdc, ISepetUcuV _ucu, address _token, IHavuzRezerviV _hook, bytes32 _havuzId, address _acici) {
        usdc = _usdc;
        ucu = _ucu;
        token = _token;
        hook = _hook;
        havuzId = _havuzId;
        acici = _acici;
    }

    /// The hook after each trade's tax, or anyone: everything here goes to
    /// the basket. With nothing here it returns quietly (the hook calls it
    /// after every taxed trade).
    function gonder() external {
        uint256 b = usdc.balanceOf(address(this));
        if (b == 0) return;
        usdc.approve(address(ucu), b);
        ucu.vergi(token, b);
        emit Gonderildi(b);
    }

    /// For the hook (v5): whether passing on what is here now would send a
    /// basket line to its vault (the Defter is on this chain), so the trade
    /// must carry the gas for it.
    function gonderimVar() external view returns (bool) {
        uint256 b = usdc.balanceOf(address(this));
        if (b == 0) return false;
        return IDefterV(address(uint160(uint256(ucu.defter())))).gonderimVar(bytes32(uint256(uint160(token))), b);
    }

    function dolasim() external view returns (uint256) {
        uint256 t = ITokenV(token).totalSupply();
        uint256 dis = hook.havuzdakiToken(havuzId) + ITokenV(token).balanceOf(acici);
        return t > dis ? t - dis : 0;
    }
}
