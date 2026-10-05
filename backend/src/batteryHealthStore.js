// LakeSide Battery Health Excel'ini KALICI olarak diske yazar — kullanıcı isteği: "gömülü olsun
// her seferinde yüklemeyelim" (bkz. konuşma). Ofis Bant Genişliği ile AYNI desen: dosya kendine
// özgü bir isimle geldiği (LakeSide export'u, klasör senkronuna uygun sabit bir prefix yok) için
// diğer raporlar gibi otomatik klasör senkronu yerine Ayarlar > Veri Input'tan TEK SEFERLİK
// yükleme + backend'de saklama modeli kullanılıyor.
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { getDataDir } = require("./crypto");
const { readSection, writeSection } = require("./store");

const SECTION = "batteryHealthUpload";

// Diğer raporlar gibi (bkz. bantGenisligiStore.js) — repo'ya gömülü bir örnek dosya, kullanıcı
// henüz kendi dosyasını YÜKLEMEMİŞSE yedek olarak kullanılır (Render'da elle bir şey yapmadan
// çalışsın diye). Kullanıcı Ayarlar'dan kendi dosyasını yüklerse o ÖNCELİKLİDİR.
const BUNDLED_FILE = path.join(__dirname, "..", "demo-data", "battery-health.xlsx");

function uploadDir() {
  const dir = path.join(getDataDir(), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function filePath() {
  return path.join(uploadDir(), "battery-health.xlsx");
}

function save(fileName, buffer) {
  fs.writeFileSync(filePath(), buffer);
  const meta = { fileName: fileName || "battery-health.xlsx", uploadedAt: new Date().toISOString() };
  writeSection(SECTION, meta);
  return meta;
}

function parseFile(path_) {
  const buf = fs.readFileSync(path_);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  let raw = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  // batteryFileService.js'teki mantıkla aynı — başlık 1. satırda değilse 2. satırdan dene.
  if (raw.length && Object.keys(raw[0]).every((k) => /^__EMPTY/.test(k) || k === "")) {
    raw = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, range: 1 });
  }
  return raw;
}

function load() {
  const meta = readSection(SECTION);
  if (meta && fs.existsSync(filePath())) {
    return { fileName: meta.fileName, modifiedAt: meta.uploadedAt, rows: parseFile(filePath()) };
  }
  if (fs.existsSync(BUNDLED_FILE)) {
    const stat = fs.statSync(BUNDLED_FILE);
    return { fileName: "Battery Health.xlsx (örnek)", modifiedAt: stat.mtime.toISOString(), rows: parseFile(BUNDLED_FILE) };
  }
  return null;
}

module.exports = { save, load };
