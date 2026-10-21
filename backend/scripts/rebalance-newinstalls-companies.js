// Demo verisi: "Kapatma Onayı Bekleyen" / "Yeni Kurulum" kayıtlarının hepsi aynı şirkette (TKAO) toplanmıştı; sol menüden AJET ile TKAO
// seçildiğinde listeler ayrışmıyordu. Bu betik bekleyen (teslim edilmemiş) kayıtlardan bazılarının cihaz/kişisini TuruncuHat'taki
// AJET çalışanlarıyla değiştirir. Kayıt alanları (ATO no, tarihler, durum, e-posta gönderimi) aynı kalır; yalnız serial/model/lokasyon/kişi
// (userInfo) yeni cihazın TuruncuHat satırından gelir. Hem bundled seed dosyasına hem (varsa) yerel store'a uygulanır. Tekrar çalıştırmak güvenlidir.
//   node scripts/rebalance-newinstalls-companies.js
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { readSection, writeSection } = require("../src/store");

const TH = path.join(__dirname, "..", "demo-data", "current", fs.readdirSync(path.join(__dirname, "..", "demo-data", "current")).find((n) => n.startsWith("TH_")));
const SEED = path.join(__dirname, "..", "demo-data", "newinstalls-seed.json");
const COMPANY = "TKAJ-AJET A.Ş.";
// bekleyen kayıtlardan AJET'e taşınacaklar (seri numaralarına göre değil sırasıyla: bekleyen + e-postası gitmiş + üst yönetim olmayan)
const MOVE_COUNT = 2;

const wb = XLSX.readFile(TH);
const th = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
const nameKey = (v) => String(v || "").split(" (")[0].trim().toLocaleLowerCase("tr-TR");
const companyByName = new Map();
th.forEach((r) => { const k = nameKey(r["Sahibi"]); if (k && !companyByName.has(k)) companyByName.set(k, r["Sahibi Firma"]); });
const UST = new Set(["GENEL MUDUR", "GENEL MUDUR YRD.", "BASKAN", "BASKAN YRD.", "MUFETTIS", "BASMUFETTIS", "MUFETTIS YRD.", "KIDEMLI DENETCI", "YONETIM KURULU"]);

function rebalance(records) {
  const usedSerials = new Set(records.map((r) => String(r.serial).toLowerCase()));
  const pool = th.filter((r) => r["Sahibi Firma"] === COMPANY && (r["Model"] === "NOTEBOOK" || r["Model"] === "DESKTOP") && r["Sahibi"] && !UST.has(r["Cihaz Sahibinin Unvan Kademesi"]) && !usedSerials.has(String(r["Seri No"]).toLowerCase()));
  const waiting = records.filter((r) => r.status !== "TESLİM EDİLDİ" && r.mailSentAt);
  const alreadyAjet = waiting.filter((r) => companyByName.get(nameKey(r.userInfo)) === COMPANY).length;
  const pending = waiting.filter((r) => companyByName.get(nameKey(r.userInfo)) !== COMPANY);
  let moved = 0;
  // zaten yeterli sayıda AJET kaydı varsa dokunma (betik tekrar çalıştırılınca kayıt kaymasın)
  for (const rec of alreadyAjet >= MOVE_COUNT + 1 ? [] : pending.slice(-Math.max(0, MOVE_COUNT + 1 - alreadyAjet))) {
    const row = pool[moved * 7 % pool.length]; // sabit (deterministik) seçim
    if (!row) break;
    rec.serial = row["Seri No"];
    rec.model = row["Model"];
    rec.location = row["Cihaz Sahibinin LBS'i"];
    rec.userInfo = String(row["Sahibi"]).split(" (")[0].toLocaleUpperCase("tr-TR");
    usedSerials.add(String(rec.serial).toLowerCase());
    moved++;
  }
  return moved;
}

const seed = JSON.parse(fs.readFileSync(SEED, "utf8"));
const m1 = rebalance(seed.records);
fs.writeFileSync(SEED, JSON.stringify(seed, null, 2));
console.log(`Bundled seed: ${m1} kayıt AJET'e taşındı`);

const state = readSection("yeniKurulumlar");
if (state && Array.isArray(state.records) && state.records.length) {
  const m2 = rebalance(state.records);
  state.managedKeys = state.records.map((r) => `${r.serial}|${r.hostname}`.toLowerCase());
  writeSection("yeniKurulumlar", state);
  console.log(`Yerel store: ${m2} kayıt AJET'e taşındı`);
}
