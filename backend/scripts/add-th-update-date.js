// Demo veri düzenlemesi: TH demo dosyasına "Son Güncelleme Tarihi" sütunu ekler (Cihaz Aksiyon Geçmişi > zimmet devri tarihi).
// Tarih, seri no'dan türetilir (deterministik) ve dosyanın kendi tarihini (TH_yyyyMMdd…) aşmaz: aynı cihaz aylar arasında
// aynı güncelleme tarihini taşır; dosya tarihinden sonraki bir tarih çıkarsa o ayın dosyasında dosya tarihinden önceye çekilir.
// Tekrar çalıştırmak güvenlidir (sütun varsa dokunmaz).   node scripts/add-th-update-date.js [klasor]
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { findLatestFile } = require("../src/excelSource");

const force = process.argv.includes("--force"); // var olan sütunu yeniden üretir
const dir = process.argv.slice(2).find((x) => !x.startsWith("--")) || path.join(__dirname, "..", "demo-data", "current");
const file = findLatestFile(dir, "TH");
const full = path.join(dir, file);
const wb = XLSX.read(fs.readFileSync(full));
const sn = wb.SheetNames[0];
const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
const had = a[0].indexOf("Son Güncelleme Tarihi");
if (had >= 0 && !force) { console.log(`${file}: sütun zaten var — atlandı`); process.exit(0); }
if (had >= 0) a.forEach((r) => r.splice(had, 1));

const m = file.match(/_(\d{4})(\d{2})(\d{2})/);
const fileDate = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Date.UTC(2026, 8, 1);
const ANCHOR = Date.UTC(2026, 8, 1); // güncelleme tarihleri bu referanstan geriye ~14 ay dağılır
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const serialIx = a[0].indexOf("Seri No");

a[0].push("Son Güncelleme Tarihi");
for (let i = 1; i < a.length; i++) {
  if (!a[i].some((c) => String(c).trim())) continue;
  const h = hash(a[i][serialIx]);
  let t = ANCHOR - (h % 425) * 86400000;
  if (t > fileDate) t = fileDate - (1 + (h >>> 8) % 60) * 86400000;
  a[i].push(new Date(t).toISOString().slice(0, 10));
}
wb.Sheets[sn] = XLSX.utils.aoa_to_sheet(a);
fs.writeFileSync(full, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log(`${file}: ${a.length - 1} satıra 'Son Güncelleme Tarihi' eklendi`);
