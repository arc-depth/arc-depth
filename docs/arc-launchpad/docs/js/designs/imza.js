/* ===========================================================================
 * designs/imza.js — message signatures from the visitor's wallet
 *
 * Designs needs personal_sign (likes and follows, the unlock key, Irys
 * uploads). cuzdan.js only exposes eth_sendTransaction, and it is shared with
 * every other page, so this module finds the same browser wallet the same way
 * (EIP-6963 announcements, MetaMask first, then window.ethereum) instead of
 * changing cuzdan.js.
 *
 * LIMIT: a WalletConnect session lives inside cuzdan.js and is not reachable
 * from here; with WalletConnect the pages say that signing needs the browser
 * wallet for now. (Future: a `cuzdan.imzala()` in cuzdan.js would lift this.)
 * =========================================================================== */
import { hexlify, toUtf8Bytes, verifyMessage, getBytes } from "../../vendor/ethers.min.js";

const _duyurulan = [];
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e) => {
    if (e && e.detail && e.detail.provider && !_duyurulan.some((x) => x.info.uuid === e.detail.info.uuid)) _duyurulan.push(e.detail);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function saglayici(cuzdan) {
  if (cuzdan && cuzdan.wcMi && cuzdan.wcMi()) return null;
  const mm = _duyurulan.find((x) => /metamask/i.test(x.info.rdns || x.info.name || ""));
  if (mm) return mm.provider;
  if (window.ethereum) return window.ethereum;
  return _duyurulan.length ? _duyurulan[0].provider : null;
}

export function imzaVarMi(cuzdan) { return !!saglayici(cuzdan); }

/** personal_sign of a text (string) or raw bytes (Uint8Array); checks the signer is the connected account. */
export async function imzala(cuzdan, mesaj) {
  const ben = cuzdan.hesap() || (await cuzdan.bagla());
  if (!ben) throw new Error("Connect a wallet first.");
  const p = saglayici(cuzdan);
  if (!p) throw new Error("Signing messages needs a browser wallet (MetaMask, Rabby, Coinbase…) for now; it is not reachable through WalletConnect on this page yet.");
  const veri = typeof mesaj === "string" ? hexlify(toUtf8Bytes(mesaj)) : hexlify(mesaj);
  const sig = await p.request({ method: "personal_sign", params: [veri, ben] });
  const kim = verifyMessage(typeof mesaj === "string" ? mesaj : getBytes(mesaj), sig);
  if (kim.toLowerCase() !== ben.toLowerCase()) throw new Error("The wallet signed with " + kim + ", not the connected account " + ben + ".");
  return sig;
}
