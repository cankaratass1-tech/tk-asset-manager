// Low Battery / LakeSide Battery Health demo verisi — bkz. konuşma: "gerçekçi olsun". Rapor
// tamamen client-side manuel Excel seçimiyle çalışıyor (App.jsx handleManualBatteryFile, backend
// persistence yok), bu yüzden burada üretilen .xlsx doğrudan kullanıcıya teslim edilip "Battery
// Health Excel Seç…" ile yüklenmesi bekleniyor. Gerçekçilik için gerçek SCCM laptop envanterindeki
// hostname/model/kullanıcı verisiyle eşleşen kayıtlar üretiliyor (rastgele host isimleri değil) —
// böylece Cihaz Genel Görünüm ve SCCM eşleştirmesi de gerçek veriyle çalışıyor.
const XLSX = require("xlsx");

const SCCM_FILE = "C:/Users/Lenovo/varlik-test-data-3month/current/SCCM Inventory Report-W Collection_20260901000000.xlsx";
const OUT_FILE = "C:/Users/Lenovo/varlik-test-data-3month/BatteryHealth-DEMO.xlsx";
const REPORT_DATE = new Date("2026-09-20");

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rnd = seededRandom(20260922777);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const randChars = (n, alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ") =>
  Array.from({ length: n }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("");

const CELL_MAKERS = ["SMP", "Samsung SDI", "LGC", "Sunwoda", "Simplo", "Panasonic"];
const STATUS_VALUES = ["OK", "Charging", "Discharging"];

function batteryModelFor(deviceModel) {
  if (/Dell/i.test(deviceModel)) return "DELL-" + randChars(5);
  if (/Lenovo/i.test(deviceModel)) return "01AV" + Math.floor(400 + rnd() * 99);
  if (/HP/i.test(deviceModel)) return pick(["SN03XL", "RR03XL", "PW04XL", "TE03XL"]);
  return "BAT-" + randChars(6);
}

const wb = XLSX.readFile(SCCM_FILE);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", range: 3 });
const laptops = rows.filter((r) => r["Type"] === "Laptop" && r["Hostname"]);

// Gerçek bir LakeSide taramasının o an görebildiği alt küme gibi — tüm filo değil, ~%35'i
// (ajan yüklü olmayan/o gün çevrimdışı cihazlar dahil değil senaryosu).
const sample = [...laptops].sort(() => rnd() - 0.5).slice(0, Math.round(laptops.length * 0.35));

const out = sample.map((r) => {
  const biosDate = new Date(r["BIOS Date"] || "2022-01-01");
  const ageYears = Math.max(0, (REPORT_DATE - biosDate) / (365.25 * 86400000));
  const noise = (rnd() - 0.5) * 14;
  let health = Math.round(100 - ageYears * 7.5 + noise);
  health = Math.max(28, Math.min(100, health));
  const cycles = Math.max(5, Math.round(ageYears * (150 + rnd() * 220) + rnd() * 60));

  // Kullanıcı isteği (bkz. konuşma): gerçek LakeSide export'unda "System" FQDN, "Username" ise
  // e-posta formatında gelir — uygulama tarafında noktadan/@'den sonrası kesilir. Burada da o
  // gerçek formatı taklit ediyoruz ki kesme mantığı gerçek veriyle test edilsin.
  const username = r["LastLogon UserName"] ? `${r["LastLogon UserName"]}@mhy.com.tr` : "";
  return {
    System: `${r["Hostname"]}.mhynet.mhy.com.tr`,
    Username: username,
    "Battery Health (%)": health,
    "Cycle Count": cycles,
    "Battery Status": pick(STATUS_VALUES),
    Manufacturer: pick(CELL_MAKERS),
    "Battery Serial": randChars(9),
    Model: batteryModelFor(r["Model"]),
  };
});

const ws = XLSX.utils.json_to_sheet(out);
const outWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(outWb, ws, "Battery Health");
XLSX.writeFile(outWb, OUT_FILE);

const crit = out.filter((r) => r["Battery Health (%)"] < 60).length;
const warn = out.filter((r) => r["Battery Health (%)"] >= 60 && r["Battery Health (%)"] < 80).length;
console.log(`${out.length} kayıt yazıldı -> ${OUT_FILE}`);
console.log(`%60 altı (Değişmeli): ${crit} · %60-80 (İzlenmeli): ${warn} · %80+ (İyi): ${out.length - crit - warn}`);
