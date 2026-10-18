// Copies the contracts under test from ../contracts into src/arc, so the
// test always runs the files the repository will deploy.
const fs = require("fs"), path = require("path");
const K = path.join(__dirname, "..", "contracts"), H = path.join(__dirname, "src", "arc");
for (const f of ["CrossChainAccounting.sol", "CrossChainAssetRegistry.sol", "KopruKasasi.sol", "CrossChainCollateralManager.sol", "KasaFabrika.sol", "YoneticiFabrika.sol", "RemoteVaultFactory.sol", "RemoteCollateralVault.sol", "PulseFabrika.sol", "PulseAcici.sol", "PulseHook.sol", "PulseLikiditeKasasi.sol", "LaunchToken.sol"]) fs.copyFileSync(path.join(K, f), path.join(H, f));
for (const f of ["CctpMesaj.sol", "KopruKasasi2.sol", "CrossChainCollateralManager2.sol", "KasaFabrika2.sol",
  "RemoteCollateralVault2.sol", "RemoteVaultFactory2.sol", "CrossChainAssetRegistry2.sol", "PulseLaunchpad2.sol", "TakasYurutucu.sol"])
  fs.copyFileSync(path.join(K, "nesil2", f), path.join(H, "nesil2", f));
fs.mkdirSync(path.join(H, "nesil3"), { recursive: true });
for (const f of ["TeminatKasasi.sol", "IOracle.sol"]) fs.copyFileSync(path.join(K, f), path.join(H, f));
for (const f of fs.readdirSync(path.join(K, "nesil3"))) fs.copyFileSync(path.join(K, "nesil3", f), path.join(H, "nesil3", f));
fs.mkdirSync(path.join(H, "nesil4"), { recursive: true });
for (const f of fs.readdirSync(path.join(K, "nesil4"))) fs.copyFileSync(path.join(K, "nesil4", f), path.join(H, "nesil4", f));
fs.mkdirSync(path.join(H, "sepet"), { recursive: true });
for (const f of fs.readdirSync(path.join(K, "sepet")).filter((x) => x.endsWith(".sol"))) fs.copyFileSync(path.join(K, "sepet", f), path.join(H, "sepet", f));
fs.mkdirSync(path.join(H, "taban"), { recursive: true });
for (const f of fs.readdirSync(path.join(K, "taban"))) fs.copyFileSync(path.join(K, "taban", f), path.join(H, "taban", f));
fs.mkdirSync(path.join(H, "isim"), { recursive: true });
for (const f of fs.readdirSync(path.join(K, "isim"))) fs.copyFileSync(path.join(K, "isim", f), path.join(H, "isim", f));
console.log("esitlendi");
