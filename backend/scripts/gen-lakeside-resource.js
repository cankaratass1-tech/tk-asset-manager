// DEMO: Lakeside kaynak kullanımı (CPU/RAM) dosyası üretir -> demo-data/current/Lakeside_Resource_*.xlsx
// Gerçek Lakeside export'u gelince bu dosya yerine o yüklenir (Bottleneck ekranından ya da klasör senkronundan).
//   node scripts/gen-lakeside-resource.js [hedefKlasor]
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { findLatestFile } = require("../src/excelSource");

const dir = process.argv[2] || path.join(__dirname, "..", "demo-data", "current");
const sccmFile = findLatestFile(dir, "SCCM Inventory Report");
const wb = XLSX.readFile(path.join(dir, sccmFile));
const a = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
const hr = a.findIndex((r) => r.includes("Hostname"));
const hi = a[hr].indexOf("Hostname");
const hosts = a.slice(hr + 1).map((r) => String(r[hi]).trim()).filter(Boolean);

let seed = 20260901;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const r1 = (v) => Math.round(v * 10) / 10;

const rows = [["Machine Name", "Avg CPU %", "Peak CPU %", "Avg RAM %", "Peak RAM %", "Total RAM (GB)", "Date"]];
hosts.forEach((h) => {
  if (rnd() > 0.55) return; // her cihaz Lakeside'ta olmayabilir
  const totalRam = pick([8, 8, 16, 16, 16, 32]);
  const heavy = rnd() < 0.07;
  const avgCpu = heavy ? 70 + rnd() * 25 : 8 + rnd() * 45;
  const ramBase = totalRam === 8 ? 45 + rnd() * 35 : totalRam === 16 ? 30 + rnd() * 35 : 20 + rnd() * 30;
  const avgRam = heavy && totalRam <= 16 ? Math.min(98, ramBase + 20) : ramBase;
  rows.push([h.toLowerCase() + ".mhynet.mhy.com.tr", r1(avgCpu), r1(Math.min(100, avgCpu + 15 + rnd() * 20)), r1(avgRam), r1(Math.min(100, avgRam + 5 + rnd() * 10)), totalRam, "2026-08-31"]);
});
const out = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(rows), "Resource");
const stampM = sccmFile.match(/_(\d{14})/);
fs.readdirSync(dir).filter((n) => /^Lakeside_Resource_\d{14}\.xlsx$/.test(n)).forEach((n) => fs.unlinkSync(path.join(dir, n))); // eski tarihli kopyalar kalmasın
const name = `Lakeside_Resource_${stampM ? stampM[1] : "20260901000000"}.xlsx`;
XLSX.writeFile(out, path.join(dir, name));
console.log(`${name}: ${rows.length - 1} cihaz -> ${dir}`);
