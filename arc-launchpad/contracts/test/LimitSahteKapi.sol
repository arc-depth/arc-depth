// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Test only (scripts/limit-denetim.js): a hostile MerkezKapi stand-in for LimitEmir.
///   - pays whatever `verilecek` / `odenecek` says, ignoring the order's minimum
///     (shows LimitEmir enforces the minimum itself);
///   - `yeniden` set: tries to re-enter LimitEmir (doldur / iptal / emirVer) from
///     inside the trade and records the revert selector of each try;
///   - `geriVer`: returns that many tokens unsold on a sale, keeps `tutulan` USDC on a buy.
interface IUsdcT {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address from, address to, uint256 v) external returns (bool);
}

interface ILimitT {
    function doldur(uint256 id, address bahsisAlici) external returns (uint256);
    function iptal(uint256 id) external;
    function emirVer(address token, bool alim, uint256 girdi, uint256 asgari, uint256 bahsis, uint256 bitis) external returns (uint256);
}

contract LimitSahteToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function bas(address kime, uint256 m) external { balanceOf[kime] += m; }

    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        allowance[f][msg.sender] -= v;
        balanceOf[f] -= v;
        balanceOf[to] += v;
        return true;
    }
}

contract LimitSahteKapi {
    IUsdcT public immutable usdc;
    LimitSahteToken public immutable token;
    ILimitT public limit;
    uint256 public verilecek;
    uint256 public odenecek;
    uint256 public geriVer;
    uint256 public tutulan;
    bool public yeniden;
    bytes4[3] public hatalar;

    constructor(address usdc_) {
        usdc = IUsdcT(usdc_);
        token = new LimitSahteToken();
    }

    function ayarla(address limit_, uint256 verilecek_, uint256 odenecek_, uint256 geriVer_, uint256 tutulan_, bool yeniden_) external {
        limit = ILimitT(limit_);
        verilecek = verilecek_;
        odenecek = odenecek_;
        geriVer = geriVer_;
        tutulan = tutulan_;
        yeniden = yeniden_;
    }

    function vekilOf(address t) external view returns (address) {
        return t == address(token) ? address(this) : address(0);
    }

    function _dene() internal {
        if (!yeniden) return;
        try limit.doldur(0, address(this)) { hatalar[0] = 0xffffffff; } catch (bytes memory r) { hatalar[0] = bytes4(r); }
        try limit.iptal(0) { hatalar[1] = 0xffffffff; } catch (bytes memory r) { hatalar[1] = bytes4(r); }
        try limit.emirVer(address(token), true, 1e6, 1, 0, block.timestamp + 1) { hatalar[2] = 0xffffffff; } catch (bytes memory r) { hatalar[2] = bytes4(r); }
    }

    function al(address, uint256 girdi, uint256, uint32, bytes32 alici, bytes calldata, address iade) external payable returns (uint256) {
        require(usdc.transferFrom(msg.sender, address(this), girdi), "usdc");
        _dene();
        token.bas(address(uint160(uint256(alici))), verilecek);
        if (tutulan < girdi) require(usdc.transfer(iade, girdi - tutulan), "iade");
        return verilecek;
    }

    function satArc(address t, uint256 miktar, uint256, uint32, bytes32 alici, uint256) external returns (uint256) {
        require(LimitSahteToken(t).transferFrom(msg.sender, address(this), miktar), "token");
        _dene();
        if (geriVer > 0) LimitSahteToken(t).transfer(msg.sender, geriVer);
        require(usdc.transfer(address(uint160(uint256(alici))), odenecek), "odeme");
        return odenecek;
    }
}
