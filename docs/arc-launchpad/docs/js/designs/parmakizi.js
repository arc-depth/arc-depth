/* ===========================================================================
 * designs/parmakizi.js — the two fingerprints TasarimNFT keeps per design
 *
 *   dosyaHash  SHA-256 of the file's exact bytes (WebCrypto). One changed
 *              byte gives a different hash, so it only blocks the exact same
 *              file published twice.
 *   algiHash   a perceptual fingerprint, bytes32, first byte says the kind:
 *     0x01 image  64-bit dHash: the image decoded at full size, averaged
 *                 (box filter, computed here, not by the browser's resampler,
 *                 so every browser gets the same bits for the same pixels)
 *                 into a 9x8 grayscale grid; bit = left brighter than right.
 *                 Survives re-saving, resizing and light compression; does NOT
 *                 survive cropping, mirroring, rotation, recolouring or edits.
 *                 Two different but very plain images (flat colour, simple
 *                 gradients) can share a dHash: the contract would refuse the
 *                 second one, and the admin can free a fingerprint
 *                 (parmakIziSerbest).
 *     0x02 3D     STL / OBJ / 3MF: SHA-256 of a canonical shape summary —
 *                 triangle count, bounding-box side ratios (sorted, so an
 *                 axis-aligned rotation does not matter; scale-free), volume
 *                 and surface area relative to the box, rounded. Survives
 *                 re-export to another format or unit, translation, uniform
 *                 scaling and 90-degree rotations; does NOT survive re-meshing
 *                 (triangle count changes), free rotation, or any edit.
 *     0x03 other  derived from the exact hash (no perceptual protection).
 *   Near copies are what the 3-day challenge window is for.
 * =========================================================================== */

export const TUR = { GORSEL: 1, UCBOYUT: 2, DIGER: 3 };

const hex = (u8) => "0x" + [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256(veri) {
  const b = veri instanceof ArrayBuffer ? veri : veri.buffer ? veri.buffer.slice(veri.byteOffset, veri.byteOffset + veri.byteLength) : veri;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", b));
}
export const sha256Hex = async (v) => hex(await sha256(v));

export function turBul(ad, mime) {
  const u = String(ad || "").toLowerCase();
  if (/^image\//.test(mime || "") || /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/.test(u)) return TUR.GORSEL;
  if (/\.(stl|obj|3mf)$/.test(u)) return TUR.UCBOYUT;
  return TUR.DIGER;
}

/* ---- images ---- */
export async function gorselYukle(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 30_000); }
}

/** Grayscale pixels of the image at (at most) 4096 px on the long side. */
function griPiksel(img) {
  let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("The image has no size.");
  const AZ = 4096;
  /* very large images are first drawn down by the browser: the one place a
     browser's resampler enters, so the fingerprint of an image over 4096 px
     may differ by a bit between browsers */
  if (Math.max(w, h) > AZ) { const k = AZ / Math.max(w, h); w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k)); }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);   // transparent pixels count as white
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const g = new Float64Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  return { g, w, h };
}

/** Box-average a grayscale image into gw x gh cells (exact area weights). */
function kutuOrtalama({ g, w, h }, gw, gh) {
  const out = new Float64Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) {
    const y0 = (cy * h) / gh, y1 = ((cy + 1) * h) / gh;
    for (let cx = 0; cx < gw; cx++) {
      const x0 = (cx * w) / gw, x1 = ((cx + 1) * w) / gw;
      let top = 0, alan = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          top += g[y * w + x] * wx * wy; alan += wx * wy;
        }
      }
      out[cy * gw + cx] = alan ? top / alan : 0;
    }
  }
  return out;
}

/** 64-bit dHash as a 16-hex-digit string. */
export function dHash(img) {
  const k = kutuOrtalama(griPiksel(img), 9, 8);
  let bit = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bit = (bit << 1n) | (k[y * 9 + x] > k[y * 9 + x + 1] ? 1n : 0n);
  return bit.toString(16).padStart(16, "0");
}

/** bytes32: kind byte, zeros, then the 8-byte dHash. */
export const dHashBytes32 = (h16) => "0x01" + "0".repeat(46) + h16;

/* ---- 3D ---- */
function stlUcgenler(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  const ikili = u8.length >= 84 && 84 + dv.getUint32(80, true) * 50 === u8.length;
  const tri = [];
  if (ikili) {
    const n = dv.getUint32(80, true);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      const p = [];
      for (let k = 0; k < 9; k++) p.push(dv.getFloat32(o + k * 4, true));
      tri.push(p);
    }
  } else {
    const t = new TextDecoder().decode(u8);
    const v = [...t.matchAll(/vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    for (let i = 0; i + 2 < v.length; i += 3) tri.push([...v[i], ...v[i + 1], ...v[i + 2]]);
  }
  return tri;
}

function objUcgenler(metin) {
  const v = [], tri = [];
  for (const satir of metin.split(/\r?\n/)) {
    const s = satir.trim().split(/\s+/);
    if (s[0] === "v") v.push([+s[1], +s[2], +s[3]]);
    else if (s[0] === "f") {
      const idx = s.slice(1).map((x) => { const i = parseInt(x.split("/")[0], 10); return i < 0 ? v.length + i : i - 1; });
      for (let k = 1; k + 1 < idx.length; k++) {   // fan triangulation of polygons
        const a = v[idx[0]], b = v[idx[k]], c = v[idx[k + 1]];
        if (a && b && c) tri.push([...a, ...b, ...c]);
      }
    }
  }
  return tri;
}

/* 3MF is a zip: read the central directory, inflate 3D/*.model with the
   browser's own DecompressionStream (no library). */
async function zipDosyalari(buf) {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a zip / 3MF file.");
  const n = dv.getUint16(eocd + 10, true);
  let o = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(o, true) !== 0x02014b50) break;
    const yontem = dv.getUint16(o + 10, true), boy = dv.getUint32(o + 20, true);
    const adBoy = dv.getUint16(o + 28, true), ekBoy = dv.getUint16(o + 30, true), notBoy = dv.getUint16(o + 32, true);
    const yerel = dv.getUint32(o + 42, true);
    const ad = new TextDecoder().decode(new Uint8Array(buf, o + 46, adBoy));
    out.push({ ad, yontem, boy, yerel });
    o += 46 + adBoy + ekBoy + notBoy;
  }
  return out;
}
async function zipOku(buf, g) {
  const dv = new DataView(buf);
  const adBoy = dv.getUint16(g.yerel + 26, true), ekBoy = dv.getUint16(g.yerel + 28, true);
  const ham = new Uint8Array(buf, g.yerel + 30 + adBoy + ekBoy, g.boy);
  if (g.yontem === 0) return ham;
  if (g.yontem !== 8) throw new Error("Unsupported zip compression in the 3MF file.");
  const s = new Blob([ham]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function ucmfUcgenler(buf) {
  const dosyalar = (await zipDosyalari(buf)).filter((d) => /\.model$/i.test(d.ad));
  const tri = [];
  for (const d of dosyalar) {
    const xml = new TextDecoder().decode(await zipOku(buf, d));
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    for (const mesh of doc.getElementsByTagName("mesh")) {
      const v = [...mesh.getElementsByTagName("vertex")].map((x) => [+x.getAttribute("x"), +x.getAttribute("y"), +x.getAttribute("z")]);
      for (const t of mesh.getElementsByTagName("triangle")) {
        const a = v[+t.getAttribute("v1")], b = v[+t.getAttribute("v2")], c = v[+t.getAttribute("v3")];
        if (a && b && c) tri.push([...a, ...b, ...c]);
      }
    }
  }
  return tri;
}

/** The canonical shape summary of a triangle list (see the header for its limits). */
export function sekilOzeti(tri) {
  if (!tri.length) throw new Error("No triangles found in the 3D file.");
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const t of tri) for (let k = 0; k < 9; k++) { const a = k % 3; if (t[k] < mn[a]) mn[a] = t[k]; if (t[k] > mx[a]) mx[a] = t[k]; }
  const kenar = [0, 1, 2].map((a) => mx[a] - mn[a]);
  const enBuyuk = Math.max(...kenar) || 1;
  const oran = kenar.map((x) => x / enBuyuk).sort((a, b) => b - a);
  let hacim = 0, alan = 0;
  for (const t of tri) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = t.map((v, k) => v - mn[k % 3]);
    hacim += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    alan += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  const kutuHacim = kenar[0] * kenar[1] * kenar[2] || 1;
  const kutuAlan = 2 * (kenar[0] * kenar[1] + kenar[1] * kenar[2] + kenar[0] * kenar[2]) || 1;
  return {
    ucgen: tri.length,
    oran: oran.map((x) => x.toFixed(3)),
    hacim: (Math.abs(hacim) / kutuHacim).toFixed(3),
    alan: (alan / kutuAlan).toFixed(3)
  };
}

export async function ucBoyutUcgenleri(dosya) {
  const ad = dosya.name.toLowerCase();
  const buf = await dosya.arrayBuffer();
  if (ad.endsWith(".stl")) return stlUcgenler(buf);
  if (ad.endsWith(".obj")) return objUcgenler(new TextDecoder().decode(buf));
  if (ad.endsWith(".3mf")) return ucmfUcgenler(buf);
  throw new Error("3D fingerprint supports STL, OBJ and 3MF.");
}

/**
 * Both fingerprints for a File. Returns {tur, dosyaHash, algiHash, aciklama, img?}.
 */
export async function parmakIzi(dosya) {
  const bayt = await dosya.arrayBuffer();
  const dosyaHash = await sha256Hex(bayt);
  const tur = turBul(dosya.name, dosya.type);
  if (tur === TUR.GORSEL) {
    const img = await gorselYukle(dosya);
    const h = dHash(img);
    return { tur, dosyaHash, algiHash: dHashBytes32(h), aciklama: "image dHash " + h + " (" + img.naturalWidth + "×" + img.naturalHeight + ")", img };
  }
  if (tur === TUR.UCBOYUT) {
    const oz = sekilOzeti(await ucBoyutUcgenleri(dosya));
    const kanon = "3d:v1|t=" + oz.ucgen + "|r=" + oz.oran.join(",") + "|v=" + oz.hacim + "|a=" + oz.alan;
    const s = await sha256Hex(new TextEncoder().encode(kanon));
    return { tur, dosyaHash, algiHash: "0x02" + s.slice(4), aciklama: "3D shape: " + oz.ucgen + " triangles, box ratios " + oz.oran.join(" : ") + ", fill " + oz.hacim + ", surface " + oz.alan };
  }
  const s = await sha256Hex(new TextEncoder().encode("other:v1|" + dosyaHash));
  return { tur, dosyaHash, algiHash: "0x03" + s.slice(4), aciklama: "no perceptual fingerprint for this file type (derived from the exact hash)" };
}

/** A public preview: at most 640 px, JPEG, with a tiled watermark. */
export async function onizlemeYap(img, yazi = "ARC PULSE · preview") {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const k = Math.min(1, 640 / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
  x.drawImage(img, 0, 0, w, h);
  x.save();
  x.globalAlpha = 0.22; x.fillStyle = "#000"; x.strokeStyle = "#fff"; x.lineWidth = 1;
  x.font = "600 " + Math.max(12, Math.round(w / 22)) + "px sans-serif";
  x.translate(w / 2, h / 2); x.rotate(-Math.PI / 6);
  const adim = Math.max(80, Math.round(w / 3));
  for (let yy = -h; yy < h; yy += Math.round(adim / 2)) for (let xx = -w; xx < w; xx += adim) { x.fillText(yazi, xx, yy); x.strokeText(yazi, xx, yy); }
  x.restore();
  return new Promise((ok, red) => c.toBlob((b) => (b ? ok(b) : red(new Error("Could not make the preview."))), "image/jpeg", 0.72));
}
