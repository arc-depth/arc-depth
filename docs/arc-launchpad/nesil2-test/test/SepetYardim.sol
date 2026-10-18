// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHaberci, IHaberAlici, IERC20S, Adres} from "../src/arc/sepet/IHaberci.sol";

/* Shared by the basket suites: a test token and a queued stand-in for the
 * bridges, every chain in one EVM. */

/// A token with mint, approve and burnFrom: the dollar, the basket assets and
/// the launch token in these tests.
contract Jeton {
    string public symbol;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    constructor(string memory s) { symbol = s; }
    function bas(address k, uint256 v) external { balanceOf[k] += v; totalSupply += v; }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; return true; }
    function transfer(address to, uint256 v) external returns (bool) { balanceOf[msg.sender] -= v; balanceOf[to] += v; return true; }
    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        if (allowance[f][msg.sender] != type(uint256).max) allowance[f][msg.sender] -= v;
        balanceOf[f] -= v; balanceOf[to] += v; return true;
    }
    function burnFrom(address f, uint256 v) external {
        if (allowance[f][msg.sender] != type(uint256).max) allowance[f][msg.sender] -= v;
        balanceOf[f] -= v; totalSupply -= v;
    }
}

/// Every chain in one EVM. A send escrows the dollars here and queues the
/// message; `teslim` delivers in order, as LayerZero + CCTP would, through
/// the destination chain's own Haberci.
contract SahteAg {
    struct Mesaj { uint32 kaynakZincir; bytes32 kaynak; uint32 hedefZincir; bytes32 hedef; bytes veri; uint256 usdc; }
    Mesaj[] public kuyruk;
    uint256 public sira;
    IERC20S public immutable usdc;
    mapping(uint32 => SahteHaberci) public haberci;
    constructor(IERC20S _usdc) { usdc = _usdc; }
    function ekle(SahteHaberci h) external { haberci[h.zincir()] = h; }
    function kuyrukla(Mesaj memory m) external { kuyruk.push(m); }
    function bekleyen() external view returns (uint256) { return kuyruk.length - sira; }
    function teslim() public {
        while (sira < kuyruk.length) {
            Mesaj memory m = kuyruk[sira++];
            if (m.usdc > 0) usdc.transfer(Adres.evm(m.hedef), m.usdc);
            if (m.veri.length > 0) haberci[m.hedefZincir].ilet(m.kaynakZincir, m.kaynak, m.hedef, m.veri, m.usdc);
        }
    }
}

contract SahteHaberci is IHaberci {
    uint32 public immutable zincir;
    SahteAg public immutable ag;
    constructor(uint32 z, SahteAg a) { zincir = z; ag = a; }
    function gonder(uint32 hedefZincir, bytes32 hedef, bytes calldata veri, uint256 usdc) external {
        if (usdc > 0) ag.usdc().transferFrom(msg.sender, address(ag), usdc);
        ag.kuyrukla(SahteAg.Mesaj(zincir, Adres.b32(msg.sender), hedefZincir, hedef, veri, usdc));
    }
    function ilet(uint32 kz, bytes32 k, bytes32 hedef, bytes calldata veri, uint256 usdc) external {
        require(msg.sender == address(ag), "ag");
        IHaberAlici(Adres.evm(hedef)).haberAl(kz, k, veri, usdc);
    }
}

