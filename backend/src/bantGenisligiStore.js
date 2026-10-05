// Ofis Bant Genişliği CSV'sini KALICI olarak diske yazar — kullanıcı isteği: "bir kez yükleyeyim
// bir daha yüklemekle uğraşmayayım" (bkz. konuşma). Dosya kendine özgü/tekil bir isimle geldiği
// (monitoring aracının export adı, klasör senkronuna uygun sabit bir prefix yok) için diğer
// raporlar gibi otomatik klasör senkronu yerine Ayarlar > Veri Input'tan TEK SEFERLİK yükleme +
// backend'de saklama modeli kullanılıyor.
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { getDataDir } = require("./crypto");
const { readSection, writeSection } = require("./store");

const SECTION = "bantGenisligiUpload";

// İnaktif/Disk/SCCM/TH gibi diğer raporlar repo'yla birlikte giden bir "bundled demo veri"
// klasörüne (backend/demo-data/current) düşüyor, bu yüzden Render'da elle bir şey yapmadan
// çalışıyorlar (bkz. konuşma: "diğerleri nasıl geliyor da bu gelmiyor"). Ofis Bant Genişliği için
// de aynı mantık — repo'ya gömülü bir örnek dosya, kullanıcı henüz kendi dosyasını YÜKLEMEMİŞSE
// yedek olarak kullanılır. Kullanıcı Ayarlar'dan kendi dosyasını yüklerse o ÖNCELİKLİDİR, bundled
// olan sadece hiç yükleme yapılmamışsa devreye girer.
const BUNDLED_FILE = path.join(__dirname, "..", "demo-data", "bant-genisligi.csv");

function uploadDir() {
  const dir = path.join(getDataDir(), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function filePath() {
  return path.join(uploadDir(), "bant-genisligi.csv");
}

function save(fileName, buffer) {
  fs.writeFileSync(filePath(), buffer);
  const meta = { fileName: fileName || "bant-genisligi.csv", uploadedAt: new Date().toISOString() };
  writeSection(SECTION, meta);
  return meta;
}

function parseFile(path_) {
  const buf = fs.readFileSync(path_);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

function load() {
  const meta = readSection(SECTION);
  if (meta && fs.existsSync(filePath())) {
    return { fileName: meta.fileName, modifiedAt: meta.uploadedAt, rows: parseFile(filePath()) };
  }
  if (fs.existsSync(BUNDLED_FILE)) {
    const stat = fs.statSync(BUNDLED_FILE);
    return { fileName: "Bant Genişliği Trend - Yurt Disi.csv (örnek)", modifiedAt: stat.mtime.toISOString(), rows: parseFile(BUNDLED_FILE) };
  }
  return null;
}

module.exports = { save, load };
