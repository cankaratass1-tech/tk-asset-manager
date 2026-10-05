// build/icon.png üretir (512x512): lacivert daire + beyaz kanat işareti (src/assets/company-logo.svg ile aynı çizim).
// Çalıştırma: node build/make-icon.cjs
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const SIZE = 512;
const SS = 4; // 4x4 süper örnekleme (kenar yumuşatma)
// logo koordinatları (daire merkezi 19.5,19.5 yarıçap 17) -> piksel
const s = 480 / 34;
const map = ([x, y]) => [(x - 2.5) * s + 16, (y - 2.5) * s + 16];
const circle = { cx: 256, cy: 256, r: 240 };
const wing = [[8, 24], [30, 11], [24, 27], [19, 22]].map(map);
const wingShade = [[19, 22], [24, 27], [18, 28]].map(map);

const inPoly = (px, py, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const NAVY = [18, 53, 91], WHITE = [255, 255, 255], SHADE = [158, 195, 232];
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filtre: yok
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
        if ((px - circle.cx) ** 2 + (py - circle.cy) ** 2 > circle.r ** 2) continue;
        const c = inPoly(px, py, wingShade) ? SHADE : inPoly(px, py, wing) ? WHITE : NAVY;
        r += c[0]; g += c[1]; b += c[2]; a += 255;
      }
    }
    const n = SS * SS;
    const o = y * (SIZE * 4 + 1) + 1 + x * 4;
    const cover = a / (255 * n);
    raw[o] = cover ? Math.round(r / (cover * n)) : 0;
    raw[o + 1] = cover ? Math.round(g / (cover * n)) : 0;
    raw[o + 2] = cover ? Math.round(b / (cover * n)) : 0;
    raw[o + 3] = Math.round(cover * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit derinliği
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.writeFileSync(path.join(__dirname, "icon.png"), png);
console.log("icon.png yazıldı", png.length, "bayt");
