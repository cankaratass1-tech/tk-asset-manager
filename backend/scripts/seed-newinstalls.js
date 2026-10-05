// "Kapatma Onayı Bekleyen Kayıtlar" ekranı Excel'den DEĞİL, backend'in yerel şifreli JSON
// store'undaki "yeniKurulumlar" section'ından besleniyor (bkz. routes/newinstalls.js) — bu yüzden
// gerçekçi demo verisi için Excel'i düzeltmek yetmiyor, store'un kendisine gerçekçi kayıt
// yazılması gerekiyor (bkz. konuşma: "hala eksiklerin var mesela kapatma onayı"). Ayrıca Render'ın
// diskinin kalıcı olmaması ihtimaline karşı bundled bir seed dosyası da üretiliyor (demo-data/
// newinstalls-seed.json) — diğer raporlardaki bundled-fallback deseniyle aynı mantık.
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { writeSection, readSection } = require("../src/store");

const TH_FILE = "C:/Users/Lenovo/varlik-test-data-3month/current/TH_20260901000000.xlsx";
const UST_YONETIM_TIERS = [
  "GENEL MUDUR", "GENEL MUDUR YRD.", "BASKAN", "BASKAN YRD.", "MUFETTIS", "BASMUFETTIS",
  "MUFETTIS YRD.", "KIDEMLI DENETCI", "YONETIM KURULU",
];

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rnd = seededRandom(20260922002);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

function newId(offset) {
  return (Date.now() + offset).toString(36) + Math.random().toString(36).slice(2, 6);
}

const wb = XLSX.readFile(TH_FILE);
const thRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
const candidates = thRows.filter(
  (r) => (r["Model"] === "NOTEBOOK" || r["Model"] === "DESKTOP") && r["Sahibi"] && r["Sahibi"] !== "Elif Aksoy"
);
const ustYonetimCandidate = thRows.find(
  (r) => UST_YONETIM_TIERS.includes(r["Cihaz Sahibinin Unvan Kademesi"]) && (r["Model"] === "NOTEBOOK" || r["Model"] === "DESKTOP")
);

const used = new Set();
function pickCandidate() {
  let c, tries = 0;
  do { c = pick(candidates); tries++; } while (used.has(c["Seri No"]) && tries < 500);
  used.add(c["Seri No"]);
  return c;
}

const STAFF = ["MASTER", "ASLİ", "KEREM", "DENİZ"];
const REASONS = ["DEĞİŞİM", "YENİ İŞE GİRİŞ"];
const BITLOCKER = ["ENABLE", "SÜREÇ DEVAM EDİYOR"];
const TOTAL = 20;
const startDate = new Date("2026-08-21");
let atoSeq = 300301;

const records = [];
for (let i = 0; i < TOTAL; i++) {
  // Üst yönetim örneği bilerek "kapatma onayı bekleyen" (HAZIRLANDI + mail atılmış) durumda —
  // özelliğin demoda gerçekten görünür olması için (bkz. konuşma: "hiçbir şekilde mail gitmemeli").
  const isUstDemo = i === 3 && ustYonetimCandidate;
  const th = isUstDemo ? ustYonetimCandidate : pickCandidate();
  const hostname = `SVC${1000 + i}x${String(Math.floor(rnd() * 30)).padStart(2, "0")}`;
  const date = new Date(startDate.getTime() + i * 1.1 * 86400000);
  const dateStr = date.toISOString().slice(0, 10);
  const delivered = !isUstDemo && i < 12;
  const deliveryDate = delivered ? new Date(date.getTime() + (2 + Math.floor(rnd() * 3)) * 86400000).toISOString().slice(0, 10) : "";
  const reason = pick(REASONS);
  let returns = "";
  if (reason === "DEĞİŞİM") {
    const old = pickCandidate();
    returns = `SN: ${old["Seri No"]} · ${old["Model"]} · sahibi: ${old["Sahibi"]} · ${old["Cihaz Sahibinin LBS'i"]}`;
  }
  const mailed = isUstDemo || delivered || rnd() < 0.5;
  const mailSentAt = mailed ? new Date(date.getTime() + 3600000).toISOString() : null;

  records.push({
    id: newId(i),
    createdAt: date.toISOString(),
    excelSyncedAt: null,
    serial: th["Seri No"],
    hostname,
    model: th["Model"],
    location: th["Cihaz Sahibinin LBS'i"],
    userInfo: th["Sahibi"].toLocaleUpperCase("tr-TR"),
    atoNo: `ATO-00${atoSeq++}`,
    date: dateStr,
    bitlocker: pick(BITLOCKER),
    processedBy: pick(STAFF),
    status: delivered ? "TESLİM EDİLDİ" : "HAZIRLANDI",
    deliveryDate,
    reason,
    returns,
    mailSentAt,
  });
}

const state = { records, excelPath: readSection("yeniKurulumlar")?.excelPath || undefined, managedKeys: records.map((r) => `${r.serial}|${r.hostname}`.toLowerCase()) };
writeSection("yeniKurulumlar", state);

const seedPath = path.join(__dirname, "..", "demo-data", "newinstalls-seed.json");
fs.writeFileSync(seedPath, JSON.stringify({ records }, null, 2));

console.log(`Yerel store'a ${records.length} gerçekçi kayıt yazıldı (${ustYonetimCandidate ? "1 üst yönetim örneği dahil, index " + records.findIndex((r) => r.serial === ustYonetimCandidate["Seri No"]) : "üst yönetim örneği yok"}).`);
console.log(`Bundled seed dosyası: ${seedPath}`);
