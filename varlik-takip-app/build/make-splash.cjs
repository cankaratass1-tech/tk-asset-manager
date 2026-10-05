// build/splash.bmp üretir (480x300, 24 bit): portable exe dosyalarını açarken gösterilen açılış ekranı.
// Çalıştırma: node build/make-splash.cjs
const fs = require("fs");
const path = require("path");

const W = 480, H = 300, SS = 4;
const BG = [242, 234, 221], NAVY = [18, 53, 91], WHITE = [255, 255, 255], SHADE = [158, 195, 232], BAR_BG = [225, 214, 196], BAR = [217, 99, 31];
const R = 62, CX = W / 2, CY = 118;
// logo koordinatları (daire merkezi 19.5,19.5 yarıçap 17) -> piksel
const s = (R * 2) / 34;
const map = ([x, y]) => [CX + (x - 19.5) * s, CY + (y - 19.5) * s];
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
const pixel = (px, py) => {
  if ((px - CX) ** 2 + (py - CY) ** 2 <= R ** 2) return inPoly(px, py, wingShade) ? SHADE : inPoly(px, py, wing) ? WHITE : NAVY;
  // alt kısımda ince bir "yükleniyor" çubuğu
  if (py >= 232 && py <= 238 && px >= 120 && px <= 360) return px <= 120 + 240 * 0.35 ? BAR : BAR_BG;
  return BG;
};

const rowSize = Math.ceil((W * 3) / 4) * 4;
const data = Buffer.alloc(rowSize * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const c = pixel(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
      r += c[0]; g += c[1]; b += c[2];
    }
    const n = SS * SS;
    const o = (H - 1 - y) * rowSize + x * 3; // BMP satırları alttan üste
    data[o] = Math.round(b / n);
    data[o + 1] = Math.round(g / n);
    data[o + 2] = Math.round(r / n);
  }
}
const header = Buffer.alloc(54);
header.write("BM", 0);
header.writeUInt32LE(54 + data.length, 2);
header.writeUInt32LE(54, 10);
header.writeUInt32LE(40, 14);
header.writeInt32LE(W, 18);
header.writeInt32LE(H, 22);
header.writeUInt16LE(1, 26);
header.writeUInt16LE(24, 28);
header.writeUInt32LE(data.length, 34);
fs.writeFileSync(path.join(__dirname, "splash.bmp"), Buffer.concat([header, data]));
console.log("splash.bmp yazıldı", 54 + data.length, "bayt");
