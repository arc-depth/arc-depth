// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LaunchToken} from "../LaunchToken.sol";
import {CollateralVault, IERC20, IBurnable} from "../CollateralVault.sol";

/// Minimal collateral stand-in. Only what the vault touches.
contract MockERC20 {
    string public name = "Mock Collateral";
    string public symbol = "mCOL";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint256 supply, address to) {
        totalSupply = supply;
        balanceOf[to] = supply;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        balanceOf[f] -= v;
        balanceOf[t] += v;
        return true;
    }
}

/// @notice Builds a whole launch and redeems against it, inside one call.
///
/// eth_call throws away state, so a test that writes in one call and reads in
/// the next always sees zero. Everything therefore happens here: the token,
/// the collateral, the vault, the funding and every redemption, then the
/// measurements — one transaction, no deployment, no gas spent.
///
/// The question being answered is the one the whole product rests on: does a
/// holder leaving change the floor for the holders who stayed? It must not.
contract TestRedemption {
    struct Sonuc {
        uint256 floorBaslangic;
        uint256 floor10;        // %10 yakildiktan sonra
        uint256 floor50;        // kumulatif %50
        uint256 floorSon;       // kumulatif %90
        uint256 odeme10;
        uint256 odeme40;
        uint256 odeme40ikinci;
        uint256 kalanTeminat;
        uint256 kalanArz;
        uint256 floorFonSonrasi; // ucretten teminat eklenince
    }

    function run(uint256 arz, uint256 teminat) external returns (Sonuc memory s) {
        MockERC20 col = new MockERC20(teminat * 2, address(this));
        LaunchToken tok = new LaunchToken("Test", "TST", arz, address(this));
        CollateralVault vault = new CollateralVault(IERC20(address(col)), IBurnable(address(tok)));

        col.approve(address(vault), type(uint256).max);
        vault.fund(teminat);
        tok.approve(address(vault), type(uint256).max);

        s.floorBaslangic = vault.floorPrice();

        s.odeme10 = vault.redeem(arz / 10);
        s.floor10 = vault.floorPrice();

        s.odeme40 = vault.redeem((arz * 40) / 100);
        s.floor50 = vault.floorPrice();

        s.odeme40ikinci = vault.redeem((arz * 40) / 100);
        s.floorSon = vault.floorPrice();

        s.kalanTeminat = vault.backing();
        s.kalanArz = tok.totalSupply();

        // Fees flowing back in must RAISE the floor, never lower it.
        vault.fund(teminat / 10);
        s.floorFonSonrasi = vault.floorPrice();
    }

    /// Redeeming everything must empty the vault, leaving nothing stranded.
    function runTamCikis(uint256 arz, uint256 teminat) external returns (uint256 odeme, uint256 kalan) {
        MockERC20 col = new MockERC20(teminat, address(this));
        LaunchToken tok = new LaunchToken("Test", "TST", arz, address(this));
        CollateralVault vault = new CollateralVault(IERC20(address(col)), IBurnable(address(tok)));
        col.approve(address(vault), type(uint256).max);
        vault.fund(teminat);
        tok.approve(address(vault), type(uint256).max);
        odeme = vault.redeem(arz);
        kalan = vault.backing();
    }
}
