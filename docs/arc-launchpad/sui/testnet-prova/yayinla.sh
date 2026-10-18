#!/usr/bin/env bash
# Publishes sui/pulse-sepet on Sui TESTNET against Circle's real testnet
# CCTP V2 packages, to prove the linkage (Sui's linker rejects any function
# or type that does not match the on-chain package). Same sources as mainnet;
# only the interface manifests differ:
#   MessageTransmitterV2   0xe9678cd42a81886e18e21361088071f275105636a4d3751e1d7f255211f73bbe
#   TokenMessengerMinterV2 0x267d3c0cb776eace2840f27e4d33da9c6d952f9749403f1fe6579f4962ed3c64
#   ext1/ext2: empty stand-ins at the addresses of Circle's own dependencies
#   (sui_extensions 0x252b…e98a, cctp_extensions 0x3cdb…4d95), which the
#   publish must name in its linkage table.
# Uses the isolated testnet wallet (sui/devnet-e2e/cfg), never mainnet keys.
set -e
cd "$(dirname "$0")"
rm -rf pulse-sepet/sources && cp -r ../pulse-sepet/sources pulse-sepet/
export PATH=/c/Users/omen/araclar/sui:$PATH SUI_CONFIG_DIR=$(pwd)/../devnet-e2e/cfg
[ "$(sui client active-env)" = testnet ] || { echo "testnet degil"; exit 1; }
cd pulse-sepet && sui client publish --gas-budget 300000000 --skip-dependency-verification
