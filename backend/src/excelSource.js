// Yerel senkronize (OneDrive/SharePoint) klasördeki Excel raporlarını okur.
// Dosya adı deseni: "<Prefix>_yyyyMMddHHmmss.xlsx" — klasördeki en güncel (en büyük zaman damgalı)
// dosya seçilir. Aynı klasörde birden fazla rapor türü (İnaktifCihazlar, DiskAlani, ...) bir
// arada bulunabilir; eşleşme her zaman prefix'e göre yapılır, asla farklı bir rapora düşülmez.
const { demoDataEnabled } = require("./demoData");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { needsStreaming, streamSheetObjects } = require("./bigXlsx");

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
// requiredColumns (örn. [["Name","Device ID"],"Free Space","Size"]): verilirse başlık satırı sabit indeks yerine
// ilk 20 satırda bu sütunların hepsini içeren satır olarak aranır; bulunamazsa headerRow'a düşülür.
const norm = (v) => String(v ?? "").trim().toLowerCase();
function detectHeaderRow(sheet, requiredColumns, fallback) {
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", range: { s: { r: 0, c: 0 }, e: { r: 19, c: 60 } } });
  const score = (r) => {
    const cells = new Set((grid[r] || []).map(norm));
    return requiredColumns.filter((g) => (Array.isArray(g) ? g : [g]).some((a) => cells.has(norm(a)))).length;
  };
  // beklenen satır (fallback) önceliklidir; başka bir satır ancak DAHA ÇOK gerekli sütun içeriyorsa seçilir
  let best = fallback, bestScore = score(fallback);
  for (let r = 0; r < grid.length; r++) {
    const sc = score(r);
    if (sc > bestScore) { best = r; bestScore = sc; }
  }
  return bestScore > 0 ? best : fallback;
}

function readRows(filePath, sheetIndex = 0, headerRow = 0, requiredColumns = null) {
  // dense:true — büyük dosyalarda SheetJS'in varsayılan
  // "sparse" (nesne anahtarlı) hücre depolama modu sessizce boş bir sheet döndürüyordu (Sheets
  // objesi tamamen boş kalıyordu, hata da fırlatmıyordu). "dense" mod (dizi tabanlı depolama)
  // aynı dosyayı sorunsuz okuyor — küçük dosyalarda da fark yaratmaz, güvenle her zaman açık.
  const workbook = XLSX.readFile(filePath, { dense: true });
  const names = workbook.SheetNames;
  const idx = Math.min(sheetIndex, names.length - 1);
  const sheet = workbook.Sheets[names[idx]];
  const hr = requiredColumns ? detectHeaderRow(sheet, requiredColumns, headerRow) : headerRow;
  return XLSX.utils.sheet_to_json(sheet, { defval: "", range: hr });
}

// Node tek iş parçacıklı olduğu için XLSX.readFile senkron ve CPU-yoğun — büyük dosyalarda
// (ör. 43MB TuruncuHat exportu, ~180.000 satır) ~50 saniye sürüyor ve bu süre boyunca backend
// TÜM istekleri (health check dahil) yanıtlayamıyor. Dosya değişmediği sürece (mtime aynıysa) bellekteki
// sonucu döner — ikinci ve sonraki isteklerde anında yanıt verir. Dosya güncellenince (mtime
// değişince) otomatik olarak yeniden okunur.
const reportCache = new Map(); // key: filePath -> { mtimeMs, fileName, rows, modifiedAt }

// Kayıtlı klasör yolu bu ortamda (ör. bulut deploy — farklı işletim sistemi/disk düzeni)
// bulunamazsa, repo ile birlikte taşınan demo veri klasörüne düşülür (tek servis bulut deploy). Yerel/gerçek klasör hep
// önceliklidir; bu sadece o klasör YOKSA devreye girer, mevcut davranışı bozmaz.
const BUNDLED_DEMO_DATA_DIR = path.join(__dirname, "..", "demo-data", "current");

// En güncel dosyayı çözer (klasör yoksa paketli demo veri klasörüne düşer)
function resolveReportFile(folderPath, prefix) {
  if (!folderPath || !fs.existsSync(folderPath)) {
    if (demoDataEnabled() && fs.existsSync(BUNDLED_DEMO_DATA_DIR)) {
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
  return { fileName, filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
}

// excludedKey: filtreyle elenen satırların bu sütundaki değerleri (örn. seri no) ayrıca döner — diğer raporlar
// (SCCM, İnaktif) başka türdeki cihazları bu listeye göre eleyebilsin diye
function applyFilter(rows, rowFilter, excludedKey, rowMap = null, excludeIf = null) {
  const excluded = [];
  if (rowMap) rows.forEach(rowMap); // sütun adı eşlemesi, filtreden ÖNCE
  if (!rowFilter) return { rows, excluded };
  const kept = [];
  for (const r of rows) {
    if (rowFilter(r)) kept.push(r);
    else if (excludedKey && (!excludeIf || excludeIf(r))) { const v = String(r[excludedKey] ?? "").trim(); if (v) excluded.push(v); }
  }
  return { rows: kept, excluded };
}

const cacheKeyOf = (filePath, sheetIndex, headerRow, rowFilter, rowMap) => `${filePath}|${sheetIndex}|${headerRow}|${rowFilter ? rowFilter.name : ""}|${rowMap ? rowMap.name : ""}`;

// prefix ile eşleşen en güncel dosyayı bulup satırları JSON olarak döner (SENKRON — çok büyük dosyalar için loadLatestReportAsync)
// rowFilter: (ham satır) => boolean — içe aktarma sırasında uygulanır, önbelleğe filtrelenmiş hâli alınır
// (büyük dosyalarda istemciye giden veri de küçülür). Önbellek anahtarında filtre adı kullanılır.
function loadLatestReport(folderPath, prefix, { sheetIndex = 0, headerRow = 0, requiredColumns = null, rowFilter = null, excludedKey = null, rowMap = null, excludeIf = null } = {}) {
  const { fileName, filePath, mtimeMs } = resolveReportFile(folderPath, prefix);
  const cacheKey = cacheKeyOf(filePath, sheetIndex, headerRow, rowFilter, rowMap);
  const cached = reportCache.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs) {
    return { fileName: cached.fileName, rows: cached.rows, modifiedAt: cached.modifiedAt, excluded: cached.excluded };
  }
  const { rows, excluded } = applyFilter(readRows(filePath, sheetIndex, headerRow, requiredColumns), rowFilter, excludedKey, rowMap, excludeIf);
  const modifiedAt = new Date(mtimeMs).toISOString();
  reportCache.set(cacheKey, { mtimeMs, fileName, rows, modifiedAt, excluded });
  return { fileName, rows, modifiedAt, excluded };
}

// Aynı dosya için eşzamanlı istekler tek bir okumayı paylaşsın (büyük dosyada birden fazla tarayıcı isteği gelebilir)
const inflight = new Map();

// loadLatestReport ile aynı sonuç; açılmış sayfa XML'i SheetJS'in sınırını aşan çok büyük dosyaları (bkz. bigXlsx.js) akışla okur.
async function loadLatestReportAsync(folderPath, prefix, opts = {}) {
  const { sheetIndex = 0, headerRow = 0, requiredColumns = null, rowFilter = null, excludedKey = null, rowMap = null, excludeIf = null } = opts;
  const { fileName, filePath, mtimeMs } = resolveReportFile(folderPath, prefix);
  if (!needsStreaming(filePath, sheetIndex)) return loadLatestReport(folderPath, prefix, opts);

  const cacheKey = cacheKeyOf(filePath, sheetIndex, headerRow, rowFilter, rowMap);
  const cached = reportCache.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs) {
    return { fileName: cached.fileName, rows: cached.rows, modifiedAt: cached.modifiedAt, excluded: cached.excluded };
  }
  const flightKey = `${cacheKey}|${mtimeMs}`;
  if (inflight.has(flightKey)) return inflight.get(flightKey);
  const p = (async () => {
    try {
      const { rows, excluded } = await streamSheetObjects(filePath, { sheetIndex, headerRow, requiredColumns, rowFilter, excludedKey, rowMap, excludeIf });
      const modifiedAt = new Date(mtimeMs).toISOString();
      reportCache.set(cacheKey, { mtimeMs, fileName, rows, modifiedAt, excluded });
      return { fileName, rows, modifiedAt, excluded };
    } finally {
      inflight.delete(flightKey);
    }
  })();
  inflight.set(flightKey, p);
  return p;
}

// TuruncuHat'tan yalnızca Desktop / Notebook / Monitor alınır (Tablet, Printer, Data/Voice Line vb. içe aktarılmaz)
const CORE_TYPES = new Set(["desktop", "notebook", "monitor"]);
// Envanterden çıkmış cihazlar ("Turuncuhat v2"de Durum = Kal Edildi / Hibe Edildi / Satıldı / Personele Satıldı) kişi zimmetinde görünse de
// artık kullanımda değildir; içe aktarılmaz. Eski biçimdeki "Hibe Edilecek / Kal Edilecek" (henüz çıkmamış) etkilenmez.
const RETIRED_DURUM = new Set(["kal edildi", "hibe edildi", "satıldı", "personele satıldı"]);
const isRetired = (r) => RETIRED_DURUM.has(String(r.Durum ?? "").trim().toLocaleLowerCase("tr"));
// Apple Mac'ler (MacBook, iMac, Mac mini/Pro/Studio): yalnız Notebook/Desktop kayıtları için; Apple monitörler etkilenmez.
// Mac'lerde SCCM ajanı olmadığından hiçbir rapor onları izleyemez — listelerden çıkarılır. Frontend: thCoreFilter.js isMacRaw (AYNI kural).
function isMacDevice(r) {
  const model = String(r.Model ?? "").trim().toUpperCase();
  if (model !== "NOTEBOOK" && model !== "DESKTOP") return false;
  const marka = String(r.Marka ?? "").trim();
  const asset = String(r.Asset ?? r["Varlık Adı"] ?? "");
  const tip = String(r["Cihaz Tipi"] ?? "");
  return /^apple$/i.test(marka) || /\bmac\b/i.test(tip) || /mac\s?book|\bimac\b|mac\s?mini|mac\s?pro|mac\s?studio/i.test(asset);
}
function coreDeviceRow(r) {
  return CORE_TYPES.has(String(r.Model ?? "").trim().toLowerCase()) && !isRetired(r) && !isMacDevice(r);
}

// SCCM envanterinde yalnızca Desktop ve Laptop/Notebook cihazlar alınır ("Type" sütunu; Server, Virtual vb. alınmaz).
// Type boşsa satır elenmez (tür bilinmiyor).
const CORE_SCCM_TYPES = new Set(["desktop", "laptop", "notebook"]);
function coreSccmRow(r) {
  const t = String(r.Type ?? "").trim().toLowerCase();
  return t === "" || CORE_SCCM_TYPES.has(t);
}

// İnaktif Cihazlar yalnızca bilgisayarlar içindir (Desktop / Notebook). Dosyanın "Model" sütunu cihaz KATEGORİSİ taşıyorsa (büyük harfli:
// NOTEBOOK, MONITOR, TABLET, IP PHONE, MOBILE PHONE, HEADPHONE… ve "Data Line"/"Voice Line") yalnız DESKTOP/NOTEBOOK alınır.
// Model sütunu model adı taşıyorsa (ör. "Dell OptiPlex 5090") ya da yoksa tür bilinmez ve satır elenmez.
function coreInaktifRow(r) {
  if (isMacDevice(r)) return false;
  const v = String(r.Model ?? "").trim();
  if (v === "") return true;
  if (/line$/i.test(v)) return false;
  if (!/^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ ]*$/.test(v)) return true; // model adı
  return v === "DESKTOP" || v === "NOTEBOOK";
}

// Elenen cihazlar arasında yalnız TÜRÜ başka olanlar (Tablet, Yazıcı…) SCCM/İnaktif listelerinden de çıkarılır; envanterden çıkmış (satılmış/hibe) cihazlar çıkarılmaz
// — SCCM'de hâlâ aktif görünüyorlarsa bu gerçek bir tutarsızlıktır, "TH Kaydı YOK" olarak görünmelidir.
// Tür bilinmiyorsa (Model boş ya da "-": TuruncuHat v2'deki yer tutucu satırlar) cihaz SCCM/İnaktif listesinden ÇIKARILMAZ.
const knownOtherTypeRow = (r) => {
  const m = String(r.Model ?? "").trim();
  if (isRetired(r)) return false;
  return (m !== "" && m !== "-") || isMacDevice(r); // Mac'ler de SCCM/İnaktif listelerinden seri no ile çıkarılır
};

const clearReportCache = () => reportCache.clear();
module.exports = { clearReportCache, knownOtherTypeRow, loadLatestReport, loadLatestReportAsync, findLatestFile, readRows, coreDeviceRow, coreSccmRow, coreInaktifRow };
