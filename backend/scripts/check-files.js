// Gerçek veri dosyalarını İÇE ALMADAN önce sütun/yapı kontrolü: node scripts/check-files.js <klasör>
// Klasördeki her rapor türünün en güncel dosyasını bulur (TH_..., SCCM Inventory Report_..., vb.) ve
// beklenen sütunlarla karşılaştırır. Sonuç tablosu: ✓ tam · ⚠ eksik/benzer başlık · ✗ zorunlu sütun yok · - dosya yok.
// Çıkış kodu: zorunlu sütun eksikliği varsa 1.
const path = require("path");
const XLSX = require("xlsx");
const { findLatestFile } = require("../src/excelSource");
const { SCHEMAS, checkWorkbook, summarize } = require("../src/fileSchemas");

const folder = process.argv[2];
if (!folder) {
  console.error("Kullanım: node scripts/check-files.js <dosyaların bulunduğu klasör>");
  process.exit(2);
}

let failed = 0;
for (const [kind, schema] of Object.entries(SCHEMAS)) {
  const file = findLatestFile(folder, schema.prefix);
  if (!file) {
    console.log(`-  ${schema.label}: "${schema.prefix}_..." dosyası bulunamadı`);
    continue;
  }
  const wb = XLSX.readFile(path.join(folder, file));
  const r = checkWorkbook(kind, wb);
  const mark = !r.ok ? "✗" : r.missingRecommended.length || r.nearMisses.length ? "⚠" : "✓";
  if (!r.ok) failed++;
  console.log(`${mark}  ${summarize(r)}  [${file}${r.dataRows !== undefined ? ` · ${r.dataRows} satır` : ""}]`);
}
process.exit(failed ? 1 : 0);
