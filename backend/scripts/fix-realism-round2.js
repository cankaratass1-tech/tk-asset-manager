// Tek seferlik düzeltme scripti — bkz. konuşma: "demo veriyi gerçekçi yapmanı söylemiştim ama
// hala eksiklerin var". TH'deki "Sentetik" OBS satırlarını, Kapatma Onayı/Yeni Kurulum
// dosyasındaki "KULLANICI 117" tarzı placeholder'ları, SCCM/Lokasyon Mail'deki test
// satırlarını gerçekçi verilerle değiştirir; TH'ye "Cihaz Sahibinin Unvan Kademesi" sütunu ekler
// (üst yönetim mail-hariç-tutma özelliği için, bkz. ustYonetimService.js).
const XLSX = require("xlsx");
const path = require("path");

const DIR = "C:/Users/Lenovo/varlik-test-data-3month/current";
const TH_FILE = path.join(DIR, "TH_20260901000000.xlsx");
const SCCM_FILE = path.join(DIR, "SCCM Inventory Report-W Collection_20260901000000.xlsx");
const LOKASYON_FILE = path.join(DIR, "LokasyonMailListesi_20260921000000.xlsx");
const NEWINSTALL_FILE = "C:/Users/Lenovo/varlik-test-data-3month/YeniKurulumlar-DEMO.xlsx";

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rnd = seededRandom(20260922);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const randChars = (n, alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ") =>
  Array.from({ length: n }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("");

const NORMAL_TIERS = [
  "UZMAN", "MUHENDIS", "MEMUR", "SEF", "SORUMLU", "TEKNISYEN", "MUDUR", "DANISMAN",
  "ISCI", "KOORDINATOR", "KIDEMLI UZMAN", "LIDER UZMAN", "UZMAN YARDIMCISI", "USTA",
  "KONTROLOR", "DENETCI", "BASTEKNISYEN", "PROGRAMCI", "IS ANALISTI",
];
const UST_YONETIM_TIERS = [
  "GENEL MUDUR", "GENEL MUDUR YRD.", "BASKAN", "BASKAN YRD.", "MUFETTIS", "BASMUFETTIS",
  "MUFETTIS YRD.", "KIDEMLI DENETCI", "YONETIM KURULU",
];

// ------------------------------------------------------------------
// 1) TH: Unvan Kademesi sütunu ekle (tüm satırlar) + OBS "Sentetik" satırlarını gerçekçi yap
// ------------------------------------------------------------------
function fixTH() {
  const wb = XLSX.readFile(TH_FILE);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const realNames = [...new Set(rows.map((r) => r["Sahibi"]).filter((n) => n && n !== "Elif Aksoy"))];

  const NOTEBOOK_CATALOG = [
    ["Dell", "Dell Latitude 5420"],
    ["Lenovo", "Lenovo ThinkPad T14"],
    ["Lenovo", "Lenovo ThinkPad X1 Carbon"],
    ["HP", "HP EliteBook 840 G8"],
  ];
  const DESKTOP_CATALOG = [
    ["Dell", "Dell OptiPlex 7090"],
    ["Dell", "Dell OptiPlex 5090"],
    ["HP", "HP EliteDesk 800 G6"],
    ["Lenovo", "Lenovo ThinkCentre M90"],
  ];
  const MONITOR_CATALOG = [
    ["Dell", "Dell P2419H"],
    ["Dell", "Dell U2419H"],
    ["LG", "LG 24MK430H"],
    ["Samsung", "Samsung S24R350"],
  ];

  const usedSerials = new Set(rows.map((r) => r["Seri No"]));
  function newSerial(model) {
    let s;
    if (model === "NOTEBOOK") {
      do { s = "PF" + randChars(6); } while (usedSerials.has(s));
    } else if (model === "MONITOR") {
      do { s = "CN" + randChars(7); } while (usedSerials.has(s));
    } else {
      do { s = "0" + randChars(6); } while (usedSerials.has(s));
    }
    usedSerials.add(s);
    return s;
  }

  let obsFixed = 0;
  let ustYonetimCount = 0;
  const fixedRows = rows.map((r, i) => {
    const isObsPlaceholder = /Sentetik/i.test(r["Asset"]) || /Sentetik/i.test(r["Marka"]) || /^SYNOB/.test(r["Seri No"]);
    let row = { ...r };
    if (isObsPlaceholder) {
      obsFixed++;
      const catalog = row["Model"] === "NOTEBOOK" ? NOTEBOOK_CATALOG : row["Model"] === "MONITOR" ? MONITOR_CATALOG : DESKTOP_CATALOG;
      const [marka, asset] = pick(catalog);
      const serial = /^SYNOB/.test(row["Seri No"]) ? newSerial(row["Model"]) : row["Seri No"];
      row["Seri No"] = serial;
      row["Varlık Barkodu"] = `MHY-${serial}`;
      row["Asset"] = asset;
      row["Marka"] = marka;
      row["Sahibi"] = pick(realNames);
    }
    // Ünvan kademesi — üst yönetim ~%2 (kritik özelliğin demoda görünür olması için).
    const isUst = rnd() < 0.02;
    if (isUst) ustYonetimCount++;
    row["Cihaz Sahibinin Unvan Kademesi"] = isUst ? pick(UST_YONETIM_TIERS) : pick(NORMAL_TIERS);
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(fixedRows);
  wb.Sheets[sheetName] = ws;
  XLSX.writeFile(wb, TH_FILE);
  console.log(`TH: ${obsFixed} OBS "Sentetik" satırı düzeltildi, ${ustYonetimCount}/${rows.length} satıra üst yönetim kademesi atandı.`);
  return fixedRows;
}

// ------------------------------------------------------------------
// 2) SCCM: PFTEST01/02 test satırlarını kozmetik olarak gerçekçi yap (senaryo davranışı aynı kalır)
// ------------------------------------------------------------------
function fixSCCM() {
  const wb = XLSX.readFile(SCCM_FILE);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 3 });

  let fixedCount = 0;
  const fixedRows = rows.map((r) => {
    if (!/PFTEST/.test(r["Serial Number"])) return r;
    fixedCount++;
    const isMatch = r["Serial Number"] === "PFTEST01";
    const username = isMatch ? "mert.demir" : "seda.aydin";
    return {
      ...r,
      "Serial Number": "PF" + randChars(6),
      "LastLogon UserName": username,
      LastLogonUser: `MHYNET\\${username}`,
      LastLogonMail: `${username}@mhy.com.tr`,
    };
  });

  const newSheet = XLSX.utils.aoa_to_sheet(rowsToAoa());
  function rowsToAoa() {
    const wsOrig = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    // rows 0-2 are report header rows (range:3 skipped them); rebuild full sheet with fixed data rows.
    const headerRows = wsOrig.slice(0, 3);
    const dataHeader = wsOrig[3];
    const dataRows = fixedRows.map((r) => dataHeader.map((h) => r[h]));
    return [...headerRows, dataHeader, ...dataRows];
  }
  wb.Sheets[sheetName] = newSheet;
  XLSX.writeFile(wb, SCCM_FILE);
  console.log(`SCCM: ${fixedCount} test satırı gerçekçi hale getirildi.`);
}

// ------------------------------------------------------------------
// 3) Lokasyon Mail Listesi: TESTA0 kaldır, tüm yerel (domestik) lokasyonlar için gerçekçi mail ekle
// ------------------------------------------------------------------
function fixLokasyonMail() {
  const wb = XLSX.readFile(LOKASYON_FILE);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const withoutTest = rows.filter((r) => r["Lokasyon Kodu"] !== "TESTA0");

  const DOMESTIC_LOCATIONS = [
    ["TR-SUBE-A", "SUBE-A", "sube.a@mhy.com.tr"],
    ["TR-SUBE-B", "SUBE-B", "sube.b@mhy.com.tr"],
    ["TR-SUBE-C", "SUBE-C", "sube.c@mhy.com.tr"],
    ["TR-MRKZ", "MERKEZ BINA", "merkezbina@mhy.com.tr"],
    ["TR-GNMD", "GENEL MUDURLUK", "genelmudurluk@mhy.com.tr"],
    ["TR-LOJM", "LOJISTIK MERKEZI", "lojistikmerkezi@mhy.com.tr"],
    ["TR-EGTM", "EGITIM MERKEZI", "egitimmerkezi@mhy.com.tr"],
    ["TR-SAHA1", "SAHA OFISI-1", "sahaofisi1@mhy.com.tr"],
    ["TR-SAHA2", "SAHA OFISI-2", "sahaofisi2@mhy.com.tr"],
    ["TR-DEPO1", "DEPO-1", "depo1@mhy.com.tr"],
  ];
  const newRows = DOMESTIC_LOCATIONS.map(([kod, ad, mail]) => ({
    "Lokasyon Kodu": kod,
    "Açık Lokasyon Adı": ad,
    "Mail Adresi": mail,
    Node_CP_ContactMail2: "",
    IP_Address: "",
  }));

  const allRows = [...withoutTest, ...newRows];
  const ws = XLSX.utils.json_to_sheet(allRows);
  wb.Sheets[sheetName] = ws;
  XLSX.writeFile(wb, LOKASYON_FILE);
  console.log(`Lokasyon Mail Listesi: TESTA0 kaldırıldı, ${newRows.length} yerel lokasyon maili eklendi.`);
}

// ------------------------------------------------------------------
// 4) Kapatma Onayı / Yeni Kurulum: gerçek TH kişileriyle bağlantılı, gerçekçi kayıtlar
// ------------------------------------------------------------------
function fixNewInstalls(thRows) {
  const wb = XLSX.readFile(NEWINSTALL_FILE);
  const sheetName = wb.SheetNames[0];

  const candidates = thRows.filter(
    (r) => (r["Model"] === "NOTEBOOK" || r["Model"] === "DESKTOP") && r["Sahibi"] && r["Sahibi"] !== "Elif Aksoy"
  );
  const used = new Set();
  function pickCandidate() {
    let c;
    let tries = 0;
    do { c = pick(candidates); tries++; } while (used.has(c["Seri No"]) && tries < 500);
    used.add(c["Seri No"]);
    return c;
  }

  const STAFF = ["MASTER", "ASLİ", "KEREM", "DENİZ"];
  const REASONS = ["DEĞİŞİM", "YENİ İŞE GİRİŞ"];
  const BITLOCKER = ["ENABLE", "SÜREÇ DEVAM EDİYOR"];

  // En az bir kaydı bilerek üst yönetimden birine bağla — özelliğin demoda görünür olması için.
  const ustYonetimCandidate = thRows.find((r) => r["Cihaz Sahibinin Unvan Kademesi"] && UST_YONETIM_TIERS.includes(r["Cihaz Sahibinin Unvan Kademesi"]) && (r["Model"] === "NOTEBOOK" || r["Model"] === "DESKTOP"));

  const rows = [];
  const totalRecords = 20;
  let atoSeq = 300301;
  const startDate = new Date("2026-08-21");
  for (let i = 0; i < totalRecords; i++) {
    const useUst = i === 2 && ustYonetimCandidate;
    const th = useUst ? ustYonetimCandidate : pickCandidate();
    const hostname = `SVC${1000 + i}x${String(Math.floor(rnd() * 30)).padStart(2, "0")}`;
    const date = new Date(startDate.getTime() + i * 1.1 * 86400000);
    const dateStr = date.toISOString().slice(0, 10);
    const delivered = i < 12; // ilk 12 kayıt teslim edilmiş, kalanı hazırlanmış (mevcut orandaki gibi)
    const deliveryDate = delivered ? new Date(date.getTime() + (2 + Math.floor(rnd() * 3)) * 86400000).toISOString().slice(0, 10) : "";
    const reason = pick(REASONS);
    let iadeler = "";
    if (reason === "DEĞİŞİM") {
      const old = pickCandidate();
      iadeler = `SN: ${old["Seri No"]} · ${old["Model"]} · sahibi: ${old["Sahibi"]} · ${old["Cihaz Sahibinin LBS'i"]}`;
    }
    rows.push({
      "SERİ NO": th["Seri No"],
      HOSTNAME: hostname,
      MODEL: th["Model"],
      LOKASYON: th["Cihaz Sahibinin LBS'i"],
      "KULLANICI BİLGİSİ": th["Sahibi"].toLocaleUpperCase("tr-TR"),
      "ATO NUMARASI": `ATO-00${atoSeq++}`,
      TARİH: dateStr,
      "Bitlocker Kontrol": pick(BITLOCKER),
      "İŞLEM YAPAN": pick(STAFF),
      DURUM: delivered ? "TESLİM EDİLDİ" : "HAZIRLANDI",
      "TESLİM TARİHİ": deliveryDate,
      NEDENI: reason,
      İADELER: iadeler,
      "Mail Gönderildi": delivered || rnd() < 0.5 ? 1 : 0,
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["SERİ NO", "HOSTNAME", "MODEL", "LOKASYON", "KULLANICI BİLGİSİ", "ATO NUMARASI", "TARİH", "Bitlocker Kontrol", "İŞLEM YAPAN", "DURUM", "TESLİM TARİHİ", "NEDENI", "İADELER", "Mail Gönderildi"],
  });
  wb.Sheets[sheetName] = ws;
  XLSX.writeFile(wb, NEWINSTALL_FILE);
  console.log(`Yeni Kurulum/Kapatma Onayı: ${rows.length} gerçekçi kayıt yazıldı (${ustYonetimCandidate ? "1 üst yönetim örneği dahil" : "üst yönetim örneği bulunamadı"}).`);
}

const thRows = fixTH();
fixSCCM();
fixLokasyonMail();
fixNewInstalls(thRows);
console.log("Tamamlandı.");
