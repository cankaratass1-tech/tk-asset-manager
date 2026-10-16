// Demo veri düzenlemesi: SCCM demo dosyasına "Operating System" + "OS Version" sütunları ekler (Windows sürümü özelliği için).
// Dağılım cihaz yaşına (BIOS Date) göre gerçekçidir: eski cihazlar ağırlıkla Windows 10 22H2, yeniler Windows 11 (23H2/24H2).
// ~%3 satır bilerek boş bırakılır ("Veri Yok" davranışını görmek için). Çalıştırma: node scripts/add-os-version.js <klasör>
// (varsayılan: demo-data/current). Tekrar çalıştırmak güvenlidir (sütunlar varsa üzerine yazmaz).
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const DIR = process.argv[2] || path.join(__dirname, "..", "demo-data", "current");
const file = fs.readdirSync(DIR).find((n) => n.startsWith("SCCM Inventory Report") && n.endsWith(".xlsx"));
if (!file) throw new Error(`SCCM dosyası bulunamadı: ${DIR}`);
const full = path.join(DIR, file);

const wb = XLSX.readFile(full);
const ws = wb.Sheets[wb.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
const HR = aoa.findIndex((r) => r.includes("Hostname"));
const head = aoa[HR];
if (head.includes("Operating System")) { console.log("Zaten var, atlandı:", full); process.exit(0); }

const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };
const hi = head.indexOf("Hostname"), bi = head.indexOf("BIOS Date");
const BUILD = { "11-24H2": "10.0.26100", "11-23H2": "10.0.22631", "11-22H2": "10.0.22621", "10-22H2": "10.0.19045", "10-21H2": "10.0.19044" };
const pick = (h, table) => { let acc = 0; const v = h % 100; for (const [k, w] of table) { acc += w; if (v < acc) return k; } return table[table.length - 1][0]; };

head.push("Operating System", "OS Version");
const stats = {};
aoa.slice(HR + 1).forEach((r, idx) => {
  const row = aoa[HR + 1 + idx];
  if (!row.some((c) => String(c).trim())) return;
  const h = hash(row[hi]);
  const year = Number(String(row[bi]).slice(0, 4)) || 2022;
  if (h % 100 >= 97) { row.push("", ""); return; } // bilerek boş
  const kind = year <= 2020 ? pick(h >> 3, [["10-22H2", 85], ["10-21H2", 5], ["11-22H2", 10]]) : pick(h >> 3, [["11-23H2", 40], ["11-24H2", 30], ["11-22H2", 10], ["10-22H2", 20]]);
  const edition = (h >> 7) % 10 === 0 ? "Pro" : "Enterprise";
  row.push(`Microsoft Windows ${kind.startsWith("11") ? "11" : "10"} ${edition}`, BUILD[kind]);
  stats[kind] = (stats[kind] || 0) + 1;
});
wb.Sheets[wb.SheetNames[0]] = XLSX.utils.aoa_to_sheet(aoa);
XLSX.writeFile(wb, full);
console.log(`${file}: Windows sürümü eklendi`, stats, `(${DIR})`);
