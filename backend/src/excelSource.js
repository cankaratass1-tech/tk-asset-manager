// Yerel senkronize (OneDrive/SharePoint) klasördeki Excel raporlarını okur.
// Dosya adı deseni: "<Prefix>_yyyyMMddHHmmss.xlsx" — klasördeki en güncel (en büyük zaman damgalı)
// dosya seçilir. Aynı klasörde birden fazla rapor türü (İnaktifCihazlar, DiskAlani, ...) bir
// arada bulunabilir; eşleşme her zaman prefix'e göre yapılır, asla farklı bir rapora düşülmez.
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// Standart .toLowerCase()/regex "i" bayrağı Türkçe İ (U+0130) ile ASCII I'yi eşit saymaz
// (Excel/Windows dosya adlarında ikisi de rastgele karşımıza çıkabiliyor) — bu yüzden
// karşılaştırma öncesi tüm I varyantlarını (İ, I, ı, i) tek bir harfe indirgiyoruz.
function normalizeTurkishI(str) {
  return str.replace(/[İIı]/g, "i").toLowerCase();
}

function findLatestFile(folderPath, prefix) {
  const entries = fs.readdirSync(folderPath).filter((f) => f.toLowerCase().endsWith(".xlsx") && !f.startsWith("~$"));
  const normalizedPrefix = normalizeTurkishI(prefix);
  const pattern = new RegExp(`^${normalizedPrefix}_(\\d{14})\\.xlsx$`);

  const withTimestamp = entries
    .map((f) => {
      const m = normalizeTurkishI(f).match(pattern);
      return m ? { file: f, ts: m[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.ts.localeCompare(a.ts));
  if (withTimestamp.length > 0) return withTimestamp[0].file;

  // Desene tam uymayan ama yine de prefix ile başlayan bir dosya varsa (ör. Windows'un
  // eklediği " (1)" son eki), en son değiştirileni kullan. Klasörde birden fazla rapor türü
  // aynı anda bulunabildiği için (İnaktifCihazlar + DiskAlani) prefix hiç eşleşmiyorsa
  // ASLA alakasız bir dosyaya düşülmez — net bir "bulunamadı" hatası döner.
  const prefixed = entries.filter((f) => normalizeTurkishI(f).startsWith(normalizedPrefix));
  if (prefixed.length === 0) return null;

  return prefixed
    .map((f) => ({ file: f, mtime: fs.statSync(path.join(folderPath, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].file;
}

// sheetIndex 0-tabanlı; istenen index yoksa (ör. dosyada tek sheet varsa) son sheet'e düşülür.
// headerRow: bazı SCCM raporlarında gerçek sütun başlıkları ilk satırda değil (üstte rapor
// adı/açıklama satırları oluyor) — headerRow, başlıkların bulunduğu satırın 0-tabanlı indeksidir.
function readRows(filePath, sheetIndex = 0, headerRow = 0) {
  // dense:true — büyük dosyalarda (bkz. konuşma: 43MB TuruncuHat exportu) SheetJS'in varsayılan
  // "sparse" (nesne anahtarlı) hücre depolama modu sessizce boş bir sheet döndürüyordu (Sheets
  // objesi tamamen boş kalıyordu, hata da fırlatmıyordu). "dense" mod (dizi tabanlı depolama)
  // aynı dosyayı sorunsuz okuyor — küçük dosyalarda da fark yaratmaz, güvenle her zaman açık.
  const workbook = XLSX.readFile(filePath, { dense: true });
  const names = workbook.SheetNames;
  const idx = Math.min(sheetIndex, names.length - 1);
  const sheet = workbook.Sheets[names[idx]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", range: headerRow });
}

// Node tek iş parçacıklı olduğu için XLSX.readFile senkron ve CPU-yoğun — büyük dosyalarda
// (ör. 43MB TuruncuHat exportu, ~180.000 satır) ~50 saniye sürüyor ve bu süre boyunca backend
// TÜM istekleri (health check dahil) yanıtlayamıyor (bkz. konuşma: Dashboard her açıldığında
// TH+Monitor+SCCM+İnaktif+Disk hepsi otomatik yükleniyor, her seferinde yeniden parse etmek
// sunucuyu tekrar tekrar kilitliyordu). Dosya değişmediği sürece (mtime aynıysa) bellekteki
// sonucu döner — ikinci ve sonraki isteklerde anında yanıt verir. Dosya güncellenince (mtime
// değişince) otomatik olarak yeniden okunur.
const reportCache = new Map(); // key: filePath -> { mtimeMs, fileName, rows, modifiedAt }

// Kayıtlı klasör yolu bu ortamda (ör. bulut deploy — farklı işletim sistemi/disk düzeni)
// bulunamazsa, repo ile birlikte taşınan demo veri klasörüne düşülür — bkz. konuşma:
// "arkadaşıma canlı gösterme" için tek seferlik bulut deploy. Yerel/gerçek klasör hep
// önceliklidir; bu sadece o klasör YOKSA devreye girer, mevcut davranışı bozmaz.
const BUNDLED_DEMO_DATA_DIR = path.join(__dirname, "..", "demo-data", "current");

// prefix ile eşleşen en güncel dosyayı bulup satırları JSON olarak döner
function loadLatestReport(folderPath, prefix, { sheetIndex = 0, headerRow = 0 } = {}) {
  if (!folderPath || !fs.existsSync(folderPath)) {
    if (fs.existsSync(BUNDLED_DEMO_DATA_DIR)) {
      folderPath = BUNDLED_DEMO_DATA_DIR;
    } else {
      throw new Error(`Klasör bulunamadı: ${folderPath}`);
    }
  }
  const fileName = findLatestFile(folderPath, prefix);
  if (!fileName) {
    throw new Error(`"${prefix}" ile başlayan bir .xlsx dosyası bulunamadı: ${folderPath}`);
  }
  const filePath = path.join(folderPath, fileName);
  const mtimeMs = fs.statSync(filePath).mtimeMs;

  const cacheKey = `${filePath}|${sheetIndex}|${headerRow}`;
  const cached = reportCache.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs) {
    return { fileName: cached.fileName, rows: cached.rows, modifiedAt: cached.modifiedAt };
  }

  const rows = readRows(filePath, sheetIndex, headerRow);
  const modifiedAt = new Date(mtimeMs).toISOString();
  reportCache.set(cacheKey, { mtimeMs, fileName, rows, modifiedAt });
  return { fileName, rows, modifiedAt };
}

module.exports = { loadLatestReport, findLatestFile, readRows };
