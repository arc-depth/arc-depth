"use strict";
/* ===========================================================================
 * zincirler.js — every chain ARC PULSE runs on, in one place
 *
 * One registry for the deploy scripts, the audits and the site, so a chain's
 * addresses are written once. Sources, read 14 Oct 2026:
 *   LayerZero   metadata.layerzero-api.com/v1/metadata (eid, endpoint, ULN302
 *               libraries, executor) and /metadata/dvns
 *   Uniswap v4  developers.uniswap.org v4 deployments (PoolManager etc.)
 *   USDC, CCTP  developers.circle.com (token addresses, CCTP V2 domains)
 * Every address here is re-checked against the chain by
 * scripts/zincir-envanteri.js; nothing is trusted because it is written down.
 *
 * DVNs: LayerZero Labs and Nethermind are the two verifiers present on all
 * twelve chains, so every pathway uses the same two-required-DVN policy
 * already set on Arc <-> Robinhood. The LayerZero default on new pathways
 * can be LZDeadDVN (measured on Arc <-> Robinhood), so the config is always
 * written explicitly.
 * =========================================================================== */

const LZ_V2_A = "0x1a44076050125825900e736c501f859c50fE728c";
const LZ_V2_B = "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B";

const EVM = {
  arc: {
    ad: "Arc", chainId: 5042, eid: 30417, rpc: "https://rpc.mainnet.arc.io", gaz: "USDC", cgId: "usd-coin",
    endpoint: LZ_V2_B, sendLib: "0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", recvLib: "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043",
    executor: "0x4208D6E27538189bB48E603D6123A94b8Abe0A0b",
    dvn: { lzLabs: "0xa2447e5b58d357c49bf74b50b14421e6a100e525", nethermind: "0x9e0e95ede70f680f74480b510ff9f45c70e3da80" },
    poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
    dolar: { adres: "0x3600000000000000000000000000000000000000", sembol: "USDC" }, cctp: 26, gazUsdc: true,
  },
  robinhood: {
    ad: "Robinhood", chainId: 4663, eid: 30416, rpc: "https://rpc.mainnet.chain.robinhood.com", gaz: "ETH", cgId: "ethereum",
    endpoint: LZ_V2_B, sendLib: "0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", recvLib: "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043",
    executor: "0x4208D6E27538189bB48E603D6123A94b8Abe0A0b",
    dvn: { lzLabs: "0xd01ae6905d48315f7be10c7330aecf8360ef5b12", nethermind: "0x0ffe02df012299a370d5dd69298a5826eacafdf8" },
    poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
    dolar: { adres: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", sembol: "USDG" }, cctp: null,
  },
  base: {
    ad: "Base", chainId: 8453, eid: 30184, rpc: "https://mainnet.base.org", gaz: "ETH", cgId: "ethereum",
    endpoint: LZ_V2_A, sendLib: "0xB5320B0B3a13cC860893E2Bd79FCd7e13484Dda2", recvLib: "0xc70AB6f32772f59fBfc23889Caf4Ba3376C84bAf",
    executor: "0x2CCA08ae69E0C44b18a57Ab2A87644234dAebaE4",
    poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
    dolar: { adres: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", sembol: "USDC" }, cctp: 6,
  },
  arbitrum: {
    ad: "Arbitrum", chainId: 42161, eid: 30110, rpc: "https://arb1.arbitrum.io/rpc", gaz: "ETH", cgId: "ethereum",
    endpoint: LZ_V2_A, sendLib: "0x975bcD720be66659e3EB3C0e4F1866a3020E493A", recvLib: "0x7B9E184e07a6EE1aC23eAe0fe8D6Be2f663f05e6",
    executor: "0x31CAe3B7fB82d847621859fb1585353c5720660D",
    poolManager: "0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32",
    dolar: { adres: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", sembol: "USDC" }, cctp: 3,
  },
  ethereum: {
    ad: "Ethereum", chainId: 1, eid: 30101, rpc: "https://ethereum-rpc.publicnode.com", gaz: "ETH", cgId: "ethereum",
    endpoint: LZ_V2_A, sendLib: "0xbB2Ea70C9E858123480642Cf96acbcCE1372dCe1", recvLib: "0xc02Ab410f0734EFa3F14628780e6e695156024C2",
    executor: "0x173272739Bd7Aa6e4e214714048a9fE699453059",
    poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
    dolar: { adres: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", sembol: "USDC" }, cctp: 0,
  },
  bsc: {
    ad: "BNB Chain", chainId: 56, eid: 30102, rpc: "https://bsc-dataseed.bnbchain.org", gaz: "BNB", cgId: "binancecoin",
    endpoint: LZ_V2_A, sendLib: "0x9F8C645f2D0b2159767Bd6E0839DE4BE49e823DE", recvLib: "0xB217266c3A98C8B2709Ee26836C98cf12f6cCEC1",
    executor: "0x3ebD570ed38B1b3b4BC886999fcF507e9D584859",
    poolManager: "0x28e2Ea090877bF75740558f6BFB36A5ffeE9e9dF",
    /* Binance-Peg USDC (18 decimals), not Circle's. Circle's CCTP has a
       domain 17 for BNB, but it carries USYC only: USDC has no CCTP here
       (developers.circle.com, read 16 Oct 2026). So cctp is null, and
       nothing offers a CCTP route to or from BNB. */
    dolar: { adres: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", sembol: "USDC" }, cctp: null,
  },
  avalanche: {
    ad: "Avalanche", chainId: 43114, eid: 30106, rpc: "https://avalanche-c-chain-rpc.publicnode.com", gaz: "AVAX", cgId: "avalanche-2",
    endpoint: LZ_V2_A, sendLib: "0x197D1333DEA5Fe0D6600E9b396c7f1B1cFCc558a", recvLib: "0xbf3521d309642FA9B1c91A08609505BA09752c61",
    executor: "0x90E595783E43eb89fF07f63d27B8430e6B44bD9c",
    poolManager: "0x06380C0e0912312B5150364B9DC4542BA0DbBc85",
    dolar: { adres: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", sembol: "USDC" }, cctp: 1,
  },
  monad: {
    ad: "Monad", chainId: 143, eid: 30390, rpc: "https://rpc.monad.xyz", gaz: "MON", cgId: "monad",
    endpoint: LZ_V2_B, sendLib: "0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", recvLib: "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043",
    executor: "0x4208D6E27538189bB48E603D6123A94b8Abe0A0b",
    poolManager: "0x188d586Ddcf52439676Ca21A244753fA19F9Ea8e",
    dolar: { adres: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", sembol: "USDC" }, cctp: 15,
  },
  hyperevm: {
    ad: "HyperEVM", chainId: 999, eid: 30367, rpc: "https://rpc.hyperliquid.xyz/evm", gaz: "HYPE", cgId: "hyperliquid",
    endpoint: "0x3A73033C0b1407574C76BdBAc67f126f6b4a9AA9", sendLib: "0xfd76d9CB0Bac839725aB79127E7411fe71b1e3CA", recvLib: "0x7cacBe439EaD55fa1c22790330b12835c6884a91",
    executor: "0x41Bdb4aa4A63a5b2Efc531858d3118392B1A1C3d",
    poolManager: "0x12D4Fd9C5DeDd00ab8a0bCe2CF0167bbf94b6B1F",
    dolar: { adres: "0xb88339CB7199b77E23DB6E890353E22632Ba630f", sembol: "USDC" }, cctp: 19,
    /* HyperEVM blocks alternate: small (2M gas) every second, large (30M)
       every minute. A contract larger than a small block deploys only from
       an address switched to large blocks on HyperCore. */
    not: "large-block mode needed for deployments",
  },
};

/* Not EVM: different runtimes, different code. Same LayerZero mesh. */
const DIGER = {
  solana: { ad: "Solana", eid: 30168, calisma: "SVM (Rust)", endpoint: "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6",
    dolar: { adres: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", sembol: "USDC" }, cctp: 5 },
  aptos: { ad: "Aptos", eid: 30108, calisma: "Move (Aptos)", endpoint: "0xe60045e20fc2c99e869c1c34a65b9291c020cd12a0d37a00a53ac1348af4f43c",
    dolar: { adres: "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b", sembol: "USDC" }, cctp: 9 },
  sui: { ad: "Sui", eid: 30378, calisma: "Move (Sui)", endpoint: "0x31beaef889b08b9c3b37d19280fc1f8b75bae5b2de2410fc3120f403e9a36dac",
    dolar: { adres: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC", sembol: "USDC" }, cctp: 8 },
};

/* LayerZero Labs + Nethermind DVN addresses per EVM chain, filled from the
   metadata at load so a typo here cannot point a pathway at a stranger. */
function dvnDoldur(dvnMeta) {
  const anahtar = { arc: "arc", robinhood: "robinhood", base: "base", arbitrum: "arbitrum", ethereum: "ethereum",
    bsc: "bsc", avalanche: "avalanche", monad: "monad", hyperevm: "hyperliquid" };
  for (const [ad, z] of Object.entries(EVM)) {
    const m = dvnMeta[anahtar[ad]];
    if (!m) continue;
    const bul = (id) => Object.entries(m.dvns).find(([, v]) => v.id === id && !v.deprecated);
    const l = bul("layerzero-labs"), n = bul("nethermind");
    z.dvn = { lzLabs: l && l[0], nethermind: n && n[0] };
  }
}

module.exports = { EVM, DIGER, dvnDoldur };

/* lzReceive gas for a message that deploys a twin (IkizYayici -> IkizOFTFabrikaAg).
   Measured 14 Oct 2026 on Base: the first spread was sent with 4.375M and the
   executor's delivery reverted out of gas; executed again by hand it used
   4,312,878, and eth_call needs ~4.58M with headroom. 6M leaves room on every chain. */
module.exports.IKIZ_KURULUM_GAZI = 6_000_000;
/* Options bytes for it: LayerZero type 3, executor lzReceive, 6M gas. */
module.exports.IKIZ_SECENEK = "0x000301001101000000000000000000000000005b8d80";

/* ---- one provider per chain, with backup RPCs ------------------------
   145 of 217 scripts carried their own RPC string, 125 of them Arc's one
   endpoint, which answers 429 as soon as several reads arrive at once.
   Backups below answered eth_chainId with the chain's own id on 16 Oct
   2026. A request fails over to the next endpoint on an HTTP or network
   error or a rate-limit answer only; a real chain answer (a revert, "nonce
   too low") is returned as is and never re-asked elsewhere. */
const YEDEK_RPC = {
  arc: ["https://arc-mainnet.drpc.org", "https://arc-rpc.publicnode.com"],
  robinhood: ["https://robinhood.drpc.org", "https://robinhood-rpc.publicnode.com", "https://robinhood-mainnet.drpc.org"],
  base: ["https://base-rpc.publicnode.com", "https://base.drpc.org", "https://mainnet.base.org"],
  arbitrum: ["https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.drpc.org", "https://arb1.arbitrum.io/rpc"],
  ethereum: ["https://eth.drpc.org"],
  bsc: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"],
  avalanche: ["https://avalanche.drpc.org", "https://api.avax.network/ext/bc/C/rpc"],
  monad: ["https://monad.drpc.org", "https://monad-mainnet.drpc.org"],
  hyperevm: ["https://hyperliquid.drpc.org"],
};
for (const [k, z] of Object.entries(EVM)) z.yedekler = (YEDEK_RPC[k] || []).filter((u) => u !== z.rpc);

const sinirliCevap = (r) => (Array.isArray(r) ? r : [r]).some((x) => x && x.error &&
  (x.error.code === -32005 || x.error.code === 429 || /rate.?limit|too many requests|exceeded/i.test(x.error.message || "")));

let _saglayicilar = null;
function saglayici(anahtar) {
  const { JsonRpcProvider } = require("ethers");
  const z = typeof anahtar === "number" ? Object.values(EVM).find((x) => x.chainId === anahtar) : EVM[anahtar];
  if (!z) throw new Error("bilinmeyen zincir: " + anahtar);
  _saglayicilar = _saglayicilar || new Map();
  if (_saglayicilar.has(z.chainId)) return _saglayicilar.get(z.chainId);

  class YedekliSaglayici extends JsonRpcProvider {
    constructor() {
      super(z.rpc, z.chainId, { staticNetwork: true });
      this._ic = [z.rpc, ...z.yedekler].map((u) => new JsonRpcProvider(u, z.chainId, { staticNetwork: true }));
      this.rpcler = [z.rpc, ...z.yedekler];
    }
    async _send(payload) {
      let son = null;
      for (let tur = 0; tur < 3; tur++) {
        for (const ic of this._ic) {
          try {
            const r = await ic._send(payload);
            if (!sinirliCevap(r)) return r;
            son = new Error(z.ad + " RPC rate limited");
          } catch (e) { son = e; }
        }
        await new Promise((s) => setTimeout(s, 700 * (tur + 1)));
      }
      throw son;
    }
  }
  const p = new YedekliSaglayici();
  _saglayicilar.set(z.chainId, p);
  return p;
}
module.exports.YEDEK_RPC = YEDEK_RPC;
module.exports.saglayici = saglayici;
