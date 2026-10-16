// Demo veri düzenlemesi: TH demo dosyasına "Son Güncelleme Tarihi" sütunu ekler (Cihaz Aksiyon Geçmişi > zimmet devri tarihi).
// Tarihler deterministik rastgele: dosya tarihinden (2026-09-01) geriye ~14 ay. Tekrar çalıştırmak güvenlidir (sütun varsa dokunmaz).
//   node scripts/add-th-update-date.js [klasor]   (varsayılan: demo-data/current)
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { findLatestFile } = require("../src/excelSource");

const dir = process.argv[2] || path.join(__dirname, "..", "demo-data", "current");
const file = findLatestFile(dir, "TH");
const full = path.join(dir, file);
const wb = XLSX.read(fs.readFileSync(full));
const sn = wb.SheetNames[0];
const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
if (a[0].includes("Son Güncelleme Tarihi")) { console.log("sütun zaten var — atlandı"); process.exit(0); }
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const base = Date.UTC(2026, 8, 1);
a[0].push("Son Güncelleme Tarihi");
for (let i = 1; i < a.length; i++) {
  if (!a[i].some((c) => String(c).trim())) continue;
  const days = Math.floor(rnd() * 425);
  a[i].push(new Date(base - days * 86400000).toISOString().slice(0, 10));
}
wb.Sheets[sn] = XLSX.utils.aoa_to_sheet(a);
fs.writeFileSync(full, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log(`${file}: ${a.length - 1} satıra 'Son Güncelleme Tarihi' eklendi`);
