// Çok büyük .xlsx dosyaları için akışlı (parça parça) okuyucu.
//
// Sorun: SheetJS (XLSX.readFile) sayfanın açılmış XML'ini tek bir metin olarak belleğe alır. Node/V8'in tek metin sınırı ~512 MB
// olduğundan, açılmış sayfa XML'i bu sınırı aşan dosyalarda (ör. ~52 MB'lık TuruncuHat: sheet1.xml = 514 MB) sayfa HİÇ üretilmez:
// SheetNames dolu ama Sheets boş döner, rapor "0 satır" görünür. Burada ZIP içindeki sayfa XML'i parça parça açılıp satır satır
// işlenir; filtre dışı satırlar bellekte tutulmaz. Dış bağımlılık yoktur (yalnızca fs + zlib).
const fs = require("fs");
const zlib = require("zlib");
const { StringDecoder } = require("string_decoder");

// Açılmış sayfa XML'i bu boyutu aşarsa akışlı okuyucu kullanılır (SheetJS'in sınırından epey önce)
const STREAM_THRESHOLD_BYTES = 200 * 1024 * 1024;

// ---------- ZIP merkez dizini ----------
function readCentralDirectory(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 66 * 1024);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("ZIP sonu bulunamadı");
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new Error("ZIP64 desteklenmiyor");
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOffset);
    const entries = new Map();
    let p = 0;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      const method = cd.readUInt16LE(p + 10);
      const compSize = cd.readUInt32LE(p + 20);
      const uncompSize = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const localOffset = cd.readUInt32LE(p + 42);
      const name = cd.toString("utf8", p + 46, p + 46 + nameLen);
      entries.set(name, { name, method, compSize, uncompSize, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally {
    fs.closeSync(fd);
  }
}

function entryStream(filePath, e) {
  const fd = fs.openSync(filePath, "r");
  let dataStart;
  try {
    const lh = Buffer.alloc(30);
    fs.readSync(fd, lh, 0, 30, e.localOffset);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error("ZIP yerel başlığı bozuk");
    dataStart = e.localOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  } finally {
    fs.closeSync(fd);
  }
  const raw = fs.createReadStream(filePath, { start: dataStart, end: dataStart + e.compSize - 1, highWaterMark: 1 << 20 });
  if (e.method === 0) return raw;
  if (e.method === 8) {
    const inflate = zlib.createInflateRaw();
    inflate.once("close", () => raw.destroy()); // erken bırakılırsa dosya tanıtıcısı açık kalmasın
    return raw.pipe(inflate);
  }
  throw new Error(`Desteklenmeyen sıkıştırma yöntemi: ${e.method}`);
}

async function readEntryText(filePath, e) {
  const chunks = [];
  for await (const c of entryStream(filePath, e)) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

// ---------- XML yardımcıları ----------
function unescapeXml(s) {
  if (s.indexOf("&") === -1) return s;
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function parseSharedStrings(xml) {
  const out = [];
  const siRe = /<si>([\s\S]*?)<\/si>|<si\/>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const body = (m[1] || "").replace(/<rPh[\s\S]*?<\/rPh>/g, "");
    let text = "";
    const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tRe.exec(body))) text += t[1];
    out.push(unescapeXml(text));
  }
  return out;
}

// Çalışma sayfalarının (sırayla) ZIP içi yolları
async function sheetPaths(filePath, entries) {
  const wbXml = await readEntryText(filePath, entries.get("xl/workbook.xml"));
  const relsXml = await readEntryText(filePath, entries.get("xl/_rels/workbook.xml.rels"));
  const rels = new Map();
  const relRe = /<Relationship\b([^>]*)\/?>/g;
  let m;
  while ((m = relRe.exec(relsXml))) {
    const id = /\bId="([^"]*)"/.exec(m[1]);
    const target = /\bTarget="([^"]*)"/.exec(m[1]);
    if (id && target) rels.set(id[1], target[1]);
  }
  const paths = [];
  const shRe = /<sheet\b([^>]*)\/?>/g;
  while ((m = shRe.exec(wbXml))) {
    const rid = /\br:id="([^"]*)"/.exec(m[1]) || /\bid="([^"]*)"/.exec(m[1]);
    const t = rid && rels.get(rid[1]);
    if (t) paths.push(t.startsWith("/") ? t.slice(1) : `xl/${t}`);
  }
  return paths;
}

// Sayfanın açılmış XML boyutu (bayt); büyükse akışlı okuma gerekir. Hızlı: yalnızca ZIP merkez dizinini okur. Hata olursa null.
function sheetUncompressedSize(filePath, sheetIndex = 0) {
  try {
    const entries = readCentralDirectory(filePath);
    // sayfa yolu için workbook.xml'i okumak asenkron; boyut için en büyük worksheet girdisine bakmak yeterli ve güvenlidir
    let max = 0;
    for (const e of entries.values()) if (/^xl\/worksheets\/[^/]+\.xml$/.test(e.name) && e.uncompSize > max) max = e.uncompSize;
    return max;
  } catch {
    return null;
  }
}

const needsStreaming = (filePath, sheetIndex = 0) => {
  const size = sheetUncompressedSize(filePath, sheetIndex);
  return size != null && size > STREAM_THRESHOLD_BYTES;
};

// ---------- hücre / satır ayrıştırma ----------
function colIndex(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

const CELL_RE = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
function parseRow(inner, shared) {
  const cells = [];
  CELL_RE.lastIndex = 0;
  let m;
  let next = 0;
  while ((m = CELL_RE.exec(inner))) {
    const attrs = m[1];
    const body = m[2];
    const rm = /\br="([A-Z]+)\d+"/.exec(attrs);
    const ci = rm ? colIndex(rm[1]) : next;
    next = ci + 1;
    if (body === undefined) continue;
    const tm = /\bt="([^"]*)"/.exec(attrs);
    const type = tm ? tm[1] : "n";
    let val = "";
    if (type === "inlineStr") {
      const tt = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
      let t, s = "";
      while ((t = tt.exec(body))) s += t[1];
      val = unescapeXml(s);
    } else {
      const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
      if (!vm) continue;
      const raw = vm[1];
      if (type === "s") val = shared[Number(raw)] ?? "";
      else if (type === "str") val = unescapeXml(raw);
      else if (type === "b") val = raw === "1";
      else if (type === "e") val = "";
      else {
        const num = Number(raw);
        val = Number.isNaN(num) ? unescapeXml(raw) : num;
      }
    }
    cells[ci] = val;
  }
  return cells;
}

const norm = (v) => String(v ?? "").trim().toLowerCase();

function pickHeaderRow(grid, requiredColumns, fallback) {
  if (!requiredColumns) return fallback;
  const score = (r) => {
    const cells = new Set((grid[r] || []).map(norm));
    return requiredColumns.filter((g) => (Array.isArray(g) ? g : [g]).some((a) => cells.has(norm(a)))).length;
  };
  let best = fallback;
  let bestScore = score(fallback);
  for (let r = 0; r < 20; r++) {
    const sc = score(r);
    if (sc > bestScore) { best = r; bestScore = sc; }
  }
  return bestScore > 0 ? best : fallback;
}

// SheetJS sheet_to_json ile aynı anlam: başlık metni anahtardır, yinelenenlere _1, _2 eklenir, boş hücre "", tamamen boş satır atlanır.
function headerKeys(cells) {
  const seen = new Map();
  const keys = [];
  cells.forEach((v, i) => {
    const t = String(v ?? "");
    if (t === "") return;
    const c = seen.get(t) || 0;
    seen.set(t, c + 1);
    keys[i] = c === 0 ? t : `${t}_${c}`;
  });
  return keys;
}

// Sayfayı akışla okur. Dönen: { rows, excluded, totalRows } — rows yalnızca rowFilter'dan geçenler.
async function streamSheetObjects(filePath, { sheetIndex = 0, headerRow = 0, requiredColumns = null, rowFilter = null, excludedKey = null, headerOnly = false, rowMap = null, excludeIf = null } = {}) {
  const entries = readCentralDirectory(filePath);
  const paths = await sheetPaths(filePath, entries);
  if (paths.length === 0) throw new Error("Dosyada sayfa bulunamadı");
  const sheetEntry = entries.get(paths[Math.min(sheetIndex, paths.length - 1)]);
  if (!sheetEntry) throw new Error("Sayfa dosyası bulunamadı");
  const ssEntry = entries.get("xl/sharedStrings.xml");
  const shared = ssEntry ? parseSharedStrings(await readEntryText(filePath, ssEntry)) : [];

  const rows = [];
  const excluded = [];
  let totalRows = 0;
  let keys = null;
  let hdr = headerRow;
  const head = []; // ilk 20 satır (başlık satırı belirlenene kadar)
  const headIdx = [];

  const emit = (cells) => {
    const obj = {};
    let any = false;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k === undefined) continue;
      const v = cells[i];
      if (v === undefined || v === "") obj[k] = "";
      else { obj[k] = v; any = true; }
    }
    if (!any) return;
    totalRows++;
    if (rowMap) rowMap(obj);
    if (!rowFilter || rowFilter(obj)) rows.push(obj);
    else if (excludedKey && (!excludeIf || excludeIf(obj))) {
      const v = String(obj[excludedKey] ?? "").trim();
      if (v) excluded.push(v);
    }
  };

  const decideHeader = () => {
    const grid = [];
    head.forEach((c, i) => { grid[headIdx[i]] = c; });
    hdr = pickHeaderRow(grid, requiredColumns, headerRow);
    keys = headerKeys(grid[hdr] || []);
    head.forEach((c, i) => { if (headIdx[i] > hdr) emit(c); });
    head.length = 0;
    headIdx.length = 0;
  };

  const dec = new StringDecoder("utf8");
  let buf = "";
  let seq = 0;
  let stop = false;
  const handleRow = (attrs, inner) => {
    const rm = /\br="(\d+)"/.exec(attrs);
    const idx = rm ? Number(rm[1]) - 1 : seq;
    seq = idx + 1;
    const cells = parseRow(inner, shared);
    if (!keys) {
      if (idx < 20) { head.push(cells); headIdx.push(idx); return; }
      decideHeader();
      if (headerOnly) { stop = true; return; }
    }
    if (idx > hdr) emit(cells);
  };

  for await (const chunk of entryStream(filePath, sheetEntry)) {
    buf += dec.write(chunk);
    let pos = 0;
    for (;;) {
      const s = buf.indexOf("<row", pos);
      if (s === -1) break;
      const after = buf.charCodeAt(s + 4);
      if (after !== 32 && after !== 62 && after !== 47) { pos = s + 4; continue; } // <rowBreaks vb.
      const gt = buf.indexOf(">", s);
      if (gt === -1) break;
      if (buf.charCodeAt(gt - 1) === 47) { pos = gt + 1; continue; } // <row .../> boş satır
      const e = buf.indexOf("</row>", gt);
      if (e === -1) break;
      handleRow(buf.slice(s + 4, gt), buf.slice(gt + 1, e));
      pos = e + 6;
      if (stop) break;
    }
    if (stop) break;
    buf = buf.slice(pos);
  }
  if (!keys) decideHeader();
  if (headerOnly) return { headers: (keys || []).filter((k) => k !== undefined), headerRowIndex: hdr };
  return { rows, excluded, totalRows };
}

// Yalnızca başlık satırını bulur (yükleme sırasındaki sütun kontrolü için); dosyanın tamamı okunmaz
async function peekHeaders(filePath, opts = {}) {
  return streamSheetObjects(filePath, { ...opts, headerOnly: true });
}

module.exports = { peekHeaders, needsStreaming, sheetUncompressedSize, streamSheetObjects, STREAM_THRESHOLD_BYTES, parseSharedStrings, unescapeXml };
