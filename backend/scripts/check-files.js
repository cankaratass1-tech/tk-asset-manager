// Gerçek veri dosyalarını İÇE ALMADAN önce sütun/yapı kontrolü: node scripts/check-files.js <klasör>
// Klasördeki her rapor türünün en güncel dosyasını bulur (TH_..., SCCM Inventory Report_..., vb.) ve
// beklenen sütunlarla karşılaştırır. Sonuç tablosu: ✓ tam · ⚠ eksik/benzer başlık · ✗ zorunlu sütun yok · - dosya yok.
// Çıkış kodu: zorunlu sütun eksikliği varsa 1.
const path = require("path");
const XLSX = require("xlsx");
const { findLatestFile } = require("../src/excelSource");
const { SCHEMAS, checkWorkbook, summarize } = require("../src/fileSchemas");

const folder = process.argv[2];
// Battery Health ve Bant Genişliği dosyaları sabit ad desenine uymaz: --battery=<dosya> --bant=<dosya> ile verilir
const extra = {};
process.argv.slice(3).forEach((a) => {
  const m = a.match(/^--(battery|bant)=(.+)$/);
  if (m) extra[m[1]] = m[2];
});
if (!folder) {
  console.error("Kullanım: node scripts/check-files.js <dosyaların bulunduğu klasör>");
  process.exit(2);
}

let failed = 0;
for (const [kind, schema] of Object.entries(SCHEMAS)) {
  let file, fullPath;
  if (schema.fromUpload) {
    if (!extra[kind]) {
      console.log(`-  ${schema.label}: dosya belirtilmedi (--${kind}=<dosya yolu>)`);
      continue;
    }
    fullPath = path.resolve(extra[kind]);
    file = path.basename(fullPath);
  } else {
    file = findLatestFile(folder, schema.prefix);
    if (!file) {
      console.log(`-  ${schema.label}: "${schema.prefix}_..." dosyası bulunamadı`);
      continue;
    }
    fullPath = path.join(folder, file);
  }
  const wb = XLSX.readFile(fullPath);
  const r = checkWorkbook(kind, wb);
  const mark = !r.ok ? "✗" : r.missingRecommended.length || r.nearMisses.length ? "⚠" : "✓";
  if (!r.ok) failed++;
  console.log(`${mark}  ${summarize(r)}  [${file}${r.dataRows !== undefined ? ` · ${r.dataRows} satır` : ""}]`);
}
process.exit(failed ? 1 : 0);
