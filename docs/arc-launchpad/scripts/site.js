"use strict";
/* ===========================================================================
 * site.js — serve docs/ locally
 *
 *   npm run site        then open http://127.0.0.1:8080/app.html
 *
 * A browser refuses ES module imports over file://, so the page cannot
 * simply be double-clicked. This is the smallest thing that makes it
 * openable: static files, localhost only, no dependencies.
 *
 * Bound to 127.0.0.1 deliberately. The page talks to a wallet and to
 * mainnet; there is no reason for it to be reachable from the network while
 * it is being tried out.
 * =========================================================================== */

const http = require("http");
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..", "docs");
const PORT = Number(process.env.PORT || 8080);
/* Localhost by default. HOST=0.0.0.0 opens it to the local network so a
 * phone on the same Wi-Fi can reach it — useful, and the reason it is not
 * the default: this page talks to a wallet and to mainnet, so it should be
 * reachable only when somebody has decided it should be. */
const HOST = process.env.HOST || "127.0.0.1";

const TIP = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/app.html";

  /* The path must resolve inside docs/. Checking the resolved path rather
   * than the request string is what makes "../" harmless. */
  const dosya = path.join(KOK, rel);
  if (!dosya.startsWith(KOK)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  fs.readFile(dosya, (err, buf) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("bulunamadi: " + rel + "\n\nmevcut sayfalar:\n  /app.html   (uygulama)\n  /index.html (tanitim)");
      return;
    }
    res.writeHead(200, {
      "content-type": TIP[path.extname(dosya)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(buf);
  });
}).listen(PORT, HOST, () => {
  console.log("arc-launchpad arayuzu");
  const ag = HOST === "0.0.0.0";
  if (ag) {
    const os = require("os");
    const ips = Object.values(os.networkInterfaces()).flat()
      .filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
    for (const ip of ips) console.log("  http://" + ip + ":" + PORT + "/app.html");
    console.log("  (ayni Wi-Fi agindaki telefondan bu adres)");
  }
  console.log("  http://127.0.0.1:" + PORT + "/app.html     uygulama");
  console.log("  http://127.0.0.1:" + PORT + "/index.html   tanitim sayfasi");
  console.log("");
  console.log("  durdurmak icin Ctrl+C");
});
