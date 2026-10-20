"use strict";
/* The ABI of the MerkezKapi deployed on Arc (0xA3D9…4080, source f6ddd69).
 * build/MerkezKapi.json follows the source, which has moved on to the next
 * version (satArc, tipler); scripts that call the deployed gate use this. */
const { Interface } = require("ethers");
const KALEM = "(uint32 zincir, bytes32 varlik, uint256 dolar)[]";
module.exports = new Interface([
  "function launch((string ad, string sembol, " + KALEM + " sepet, uint256[] teklif, uint256 vergiPpm, uint256 alim, bytes32 kurucu, uint32 kurucuZincir, uint32 kurucuEid, uint32[] ikizler, bytes ikizSecenek, uint256 ikizUcret, bytes gonderSecenek, address iade) r) payable returns (address token)",
  "function al(address token, uint256 girdi, uint256 asgari, uint32 hedefEid, bytes32 alici, bytes secenek, address iade) payable returns (uint256)",
  "function vekilOf(address) view returns (address)",
  "function tokenOfAdapter(address) view returns (address)",
  "event MerkezLaunch(address indexed token, address vekil, bytes32 kurucu, uint32 kurucuZincir, uint256 kurucuToken)",
]);
