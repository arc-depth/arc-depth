/* ===========================================================================
 * ikon.js — the icon set, as inline SVG paths
 *
 * Inline and local, for the same reason the libraries are vendored: an icon
 * font or a CDN sprite is a network dependency for something that must
 * render instantly and must keep rendering offline. These are 16×16 on a
 * 24-unit grid, 1.8 stroke, round caps — one geometry, so sixteen modules
 * get sixteen icons that look like a set rather than a collection.
 * =========================================================================== */

const P = {
  pusula: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2.2 5-4.8 2.2 2.2-5z"/>',
  arti: '<path d="M12 5v14M5 12h14"/>',
  mum: '<path d="M7 4v3M7 17v3M17 3v4M17 15v6"/><rect x="4.5" y="7" width="5" height="10" rx="1"/><rect x="14.5" y="7" width="5" height="8" rx="1"/>',
  kalkan: '<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z"/>',
  "kalkan-artis": '<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  grafik: '<path d="M4 19V5M4 19h16"/><path d="M8 15v-3M12 15V8M16 15v-5"/>',
  cuzdan: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.3"/>',
  terazi: '<path d="M12 4v16M6 8h12"/><path d="M6 8l-3 6h6zM18 8l-3 6h6z"/>',
  hediye: '<rect x="3" y="9" width="18" height="11" rx="2"/><path d="M3 13h18M12 9v11"/><path d="M8.5 9a2.5 2.5 0 110-5c2 0 3.5 2.5 3.5 5M15.5 9a2.5 2.5 0 100-5c-2 0-3.5 2.5-3.5 5"/>',
  meclis: '<path d="M4 20h16M6 20v-7M10 20v-7M14 20v-7M18 20v-7"/><path d="M3 10l9-5 9 5z"/>',
  oy: '<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M8 10l2.5 2.5L16 7"/><path d="M3 20h18"/>',
  insanlar: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 5.2a3 3 0 010 5.6M18 20c0-2.4-.9-4-2.5-4.6"/>',
  sohbet: '<path d="M20 12c0 3.9-3.6 7-8 7-1 0-2-.2-2.9-.5L4 20l1.4-3.6C4.5 15.2 4 13.7 4 12c0-3.9 3.6-7 8-7s8 3.1 8 7z"/>',
  kupa: '<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H5.5A2.5 2.5 0 008 8.5M16 6h2.5A2.5 2.5 0 0116 8.5"/><path d="M12 13v3M9 20h6M10 16h4l.5 4h-5z"/>',
  zincir: '<path d="M10.5 13.5a4 4 0 010-5.7l2-2a4 4 0 015.7 5.7l-1 1"/><path d="M13.5 10.5a4 4 0 010 5.7l-2 2a4 4 0 01-5.7-5.7l1-1"/>',
  kasa: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M14 5v14"/><circle cx="9" cy="12" r="2.5"/><path d="M9 9.5V8M9 16v-1.5"/>',
  kilit: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  kitap: '<path d="M4 5.5A2.5 2.5 0 016.5 3H19v15H6.5A2.5 2.5 0 004 20.5z"/><path d="M4 5.5v15"/>',
  daha: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  ara: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  uyari: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  bilgi: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8h.01"/>',
  dis: '<path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4"/>'
};

/**
 * One icon, as an SVG string.
 * @param {string} ad   key in the set
 * @param {string} sinif  class for sizing; the stroke follows currentColor
 */
export function ikon(ad, sinif = "") {
  const d = P[ad] || P.bilgi;
  return (
    '<svg class="' + sinif + '" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' + d + "</svg>"
  );
}

export function ikonVarMi(ad) {
  return Object.prototype.hasOwnProperty.call(P, ad);
}
