// Ayarlar > Veri Input'tan elle seçilen rapor dosyalarını kalıcı saklar. Dosyalar uygulamanın veri
// klasöründeki "imports" altına, rapor okuyucularının (excelSource.findLatestFile) tanıdığı
// "<önek>_<yyyyMMddHHmmss>.xlsx" adıyla yazılır; böylece mevcut "klasörden oku" mekanizması (ve
// uygulama yeniden açıldığında otomatik yükleme) hiçbir ek kod olmadan bu dosyaları kullanır.
// Dosya Kaynağı klasörü Ayarlar'da tanımlıysa (ve varsa) o klasör önceliklidir.
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { getDataDir } = require("./crypto");
const { readSection } = require("./store");

// kind -> dosya öneki (reports.js'teki loadLatestReport öneklerle birebir aynı olmalı)
const KINDS = {
  inaktif: "İnaktifCihazlar",
  disk: "DiskAlani",
  sccm: "SCCM Inventory Report",
  th: "TH",
  monitor: "Attached Monitors Report",
  lokasyon: "LokasyonMailListesi",
  bsod: "Weekly_BSOD",
};

function importsDir() {
  const dir = path.join(getDataDir(), "imports");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Ayarlar'daki klasör geçerliyse o, değilse elle yüklenenlerin saklandığı klasör
function getFileSourceConfig() {
  const saved = readSection("fileSource") || {};
  const configured = saved.folderPath && fs.existsSync(saved.folderPath) ? saved.folderPath : "";
  return { ...saved, folderPath: configured || importsDir() };
}

const pad = (n) => String(n).padStart(2, "0");
function timestamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// buffer: yüklenen dosyanın ham baytları; originalName: kullanıcının seçtiği ad (.csv ise xlsx'e çevrilir)
function saveImport(kind, buffer, originalName = "") {
  const prefix = KINDS[kind];
  if (!prefix) throw new Error("Bilinmeyen dosya türü");
  if (!buffer || buffer.length === 0) throw new Error("Dosya boş");

  const isCsv = /\.csv$/i.test(originalName);
  // .xlsx dosyaları ZIP imzasıyla ("PK") başlar; metin/bozuk bir dosya yanlışlıkla tablo gibi okunmasın
  if (!isCsv && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) throw new Error("Geçerli bir .xlsx dosyası değil");

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch (err) {
    throw new Error(`Dosya okunamadı: ${err.message}`);
  }
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) throw new Error("Dosyada sayfa bulunamadı");

  // .csv geldiyse okuyucuların beklediği .xlsx biçimine çevir
  const data = isCsv ? XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) : buffer;

  const dir = importsDir();
  const stale = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_\\d{14}\\.xlsx$`);
  fs.readdirSync(dir).forEach((f) => {
    if (stale.test(f)) fs.unlinkSync(path.join(dir, f));
  });

  const fileName = `${prefix}_${timestamp()}.xlsx`;
  fs.writeFileSync(path.join(dir, fileName), data);
  return { fileName, size: data.length };
}

module.exports = { KINDS, importsDir, getFileSourceConfig, saveImport };
