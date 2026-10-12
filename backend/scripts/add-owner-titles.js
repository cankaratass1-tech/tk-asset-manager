// Tek seferlik demo veri düzenlemesi: gerçek dosyalardaki gibi "Sahibi" alanına "Ad Soyad (Takım/Unvan)"
// biçiminde unvan ekler (örn. "Ali Yılmaz (Son Kullanici (Yurtici) Takimi)"). Arayüz bu unvanı isim altında
// gösterir (src/services/ownerName.js). Unvan, ada göre sabit seçilir — aynı kişi TH/SCCM/İnaktif'te aynı
// unvanı taşır. Yalnızca TH'de "User" zimmetli kişi sahipleri değişir; OBS/müdürlük adlarına dokunulmaz.
// Çalıştırma: node scripts/add-owner-titles.js <klasör> (varsayılan: demo-data/current)
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const DIR = process.argv[2] || path.join(__dirname, "..", "demo-data", "current");
const TEAMS = [
  "Son Kullanici (Yurtici) Takimi",
  "Son Kullanici (Yurtdisi) Takimi",
  "Bilgi Teknolojileri Takimi",
  "Ucus Operasyon Takimi",
  "Yer Hizmetleri Takimi",
  "Finans ve Muhasebe Takimi",
  "Insan Kaynaklari Takimi",
  "Teknik Bakim Takimi",
];
const teamFor = (name) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return TEAMS[h % TEAMS.length];
};
const withTitle = (name) => (name && !name.includes(" (") ? `${name} (${teamFor(name)})` : name);

const find = (prefix) => {
  const f = fs.readdirSync(DIR).find((n) => n.startsWith(prefix) && n.endsWith(".xlsx"));
  if (!f) throw new Error(`${prefix} dosyası bulunamadı: ${DIR}`);
  return path.join(DIR, f);
};

// 1) TH: kişi (User) sahipleri
const thPath = find("TH_");
const thWb = XLSX.readFile(thPath);
const thWs = thWb.Sheets[thWb.SheetNames[0]];
const thRows = XLSX.utils.sheet_to_json(thWs, { defval: "" });
const personNames = new Set();
thRows.forEach((r) => {
  const n = String(r["Sahibi"] || "");
  if (n && String(r["Konum Kategorisi"]).toLowerCase() === "user" && !n.includes(" (")) personNames.add(n);
});
const hdr = XLSX.utils.sheet_to_json(thWs, { header: 1 })[0];
thRows.forEach((r) => {
  if (personNames.has(String(r["Sahibi"]))) r["Sahibi"] = withTitle(r["Sahibi"]);
});
thWb.Sheets[thWb.SheetNames[0]] = XLSX.utils.json_to_sheet(thRows, { header: hdr });
XLSX.writeFile(thWb, thPath);

// 2) SCCM: "Envanter User" (başlık satırı 4. satır)
const scPath = find("SCCM Inventory Report");
const scWb = XLSX.readFile(scPath);
const scWs = scWb.Sheets[scWb.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(scWs, { header: 1, defval: "" });
const hi = aoa.findIndex((r) => r.includes("Envanter User"));
const ci = aoa[hi].indexOf("Envanter User");
let scCount = 0;
aoa.slice(hi + 1).forEach((r) => {
  if (personNames.has(String(r[ci]))) { r[ci] = withTitle(r[ci]); scCount++; }
});
scWb.Sheets[scWb.SheetNames[0]] = XLSX.utils.aoa_to_sheet(aoa);
XLSX.writeFile(scWb, scPath);

// 3) İnaktif: "Data" sayfası "Sahibi"
const inPath = find("InaktifCihazlar");
const inWb = XLSX.readFile(inPath);
const sn = inWb.SheetNames.includes("Data") ? "Data" : inWb.SheetNames[0];
const inRows = XLSX.utils.sheet_to_json(inWb.Sheets[sn], { defval: "" });
const inHdr = XLSX.utils.sheet_to_json(inWb.Sheets[sn], { header: 1 })[0];
let inCount = 0;
inRows.forEach((r) => {
  if (personNames.has(String(r["Sahibi"]))) { r["Sahibi"] = withTitle(r["Sahibi"]); inCount++; }
});
inWb.Sheets[sn] = XLSX.utils.json_to_sheet(inRows, { header: inHdr });
XLSX.writeFile(inWb, inPath);

console.log(`TH: ${thRows.filter((r) => String(r["Sahibi"]).includes(" (")).length} satır, SCCM: ${scCount}, İnaktif: ${inCount} satıra unvan eklendi (${DIR})`);
