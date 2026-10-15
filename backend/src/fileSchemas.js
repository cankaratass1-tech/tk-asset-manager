// Rapor dosyalarının beklenen yapısı ve sütun kontrolü. Okuyucular (frontend/src/services/*FileService.js)
// sütunları tam başlık adıyla arar; gerçek dosyada bir başlık farklıysa (yazım, boşluk, büyük/küçük harf,
// sütun hiç yok) sistem sessizce boş/yanlış gösterir. Bu modül dosyayı İÇE ALMADAN ÖNCE (ya da herhangi bir
// zamanda, scripts/check-files.js ile) başlıkları denetler ve eksikleri okunur bir dille raporlar.
//
// required: yoksa rapor anlamlı çalışmaz. Eleman bir dizi ise "bunlardan biri yeterli" (okuyucunun kabul ettiği
//           alternatifler). recommended: yoksa ilgili alan/özellik boş kalır ama rapor çalışır.
// sheetIndex/headerRow: backend/src/routes/reports.js'teki değerlerle birebir aynı olmalı (test doğrular).
const XLSX = require("xlsx");

const SCHEMAS = {
  th: {
    label: "TuruncuHat (TH)",
    prefix: "TH",
    sheetIndex: 0,
    headerRow: 0,
    required: ["Seri No", "Sahibi", "Model", "Konum Kategorisi", "Owner Username"],
    recommended: ["Cihaz Sahibinin LBS'i", "Sahibi Firma", "Asset", "Marka", "Varlık Barkodu", "Cihaz Sahibinin Maili", "Cihaz Sahibinin Sicili", "LBS Location Parent"],
  },
  sccm: {
    label: "SCCM Envanteri",
    prefix: "SCCM Inventory Report",
    sheetIndex: 0,
    headerRow: 3,
    required: ["Hostname", "Serial Number", "Type", "Model", "LastLogon UserName", "LastLogonTime", "IPAddresses"],
    recommended: ["Envanter User", "Envanter User Name", "EnvanterLokasyon", "EnvanterLocationParent", "LastLogonMail", "LastLogonUser", "İştirak", "Bitlocker Enabled", "OUName"],
  },
  monitor: {
    label: "Monitor Raporu (Attached Monitors)",
    prefix: "Attached Monitors Report",
    sheetIndex: 0,
    headerRow: 1,
    required: ["ID Monitor Serial Number", "Hostname", "Username"],
    recommended: ["Active Status", "Virtual Machine", "Monitor Manufacturer", "Monitor Model", "AD Site", "Device Domain", "User Domain", "Client Type"],
  },
  inaktif: {
    label: "İnaktif Cihazlar",
    prefix: "İnaktifCihazlar",
    sheetIndex: 1,
    headerRow: 0,
    required: ["Seri No", "Sahibi", ["Asset", "Model"], "Cihaz Sahibinin LBS'i"],
    recommended: ["Konum Kategorisi", "LBS Location Parent", "Sahibi Firma"],
  },
  disk: {
    label: "Disk Alanı",
    prefix: "DiskAlani",
    sheetIndex: 0,
    headerRow: 5,
    required: [["Name", "Device ID"], "Free Space", "Size"],
    recommended: ["Site Code", "Volume Name"],
  },
  lokasyon: {
    label: "Lokasyon Mail Listesi",
    prefix: "LokasyonMailListesi",
    sheetIndex: 0,
    headerRow: 0,
    required: ["Açık Lokasyon Adı", "Lokasyon Kodu", "Mail Adresi", "IP_Address"],
    recommended: ["Node_CP_ContactMail2"],
  },
  bsod: {
    label: "Weekly BSOD (LakeSide)",
    prefix: "Weekly_BSOD",
    sheetIndex: 0,
    headerRow: 1,
    required: [
      ["Machine Name", "MachineName", "Hostname", "Computer Name", "Cihaz"],
      ["Application Name", "ApplicationName", "BSOD", "Stop Code", "Bugcheck"],
    ],
    recommended: [["BSOD Count", "BSODCount", "Count", "Adet"], ["Crash Date", "CrashDate", "Date", "Tarih"]],
  },
};

// Okuyucular başlığı birebir karşılaştırır; sadece uç boşlukları (SCCM'de "Last LogonSicil " gibi) açıkça tolere eder.
// Benzerlik, "yazım/boşluk/büyük-küçük harf farkı mı?" teşhisi içindir (okuyucunun tanımadığını söyler).
const loose = (s) =>
  String(s ?? "")
    .replace(/[İIı]/g, "i")
    .toLowerCase()
    .replace(/[^a-z0-9çğöşü]/g, "");

function groupName(item) {
  return Array.isArray(item) ? item.join(" / ") : item;
}

function checkGroup(item, headers) {
  const alts = Array.isArray(item) ? item : [item];
  const exact = new Set(headers.map((h) => String(h).trim()));
  if (alts.some((a) => exact.has(a))) return { found: true };
  // tam eşleşme yok: benzer bir başlık var mı?
  const looseMap = new Map(headers.map((h) => [loose(h), String(h).trim()]));
  for (const a of alts) {
    const near = looseMap.get(loose(a));
    if (near) return { found: false, near, expected: a };
  }
  return { found: false };
}

// headers: başlık satırındaki hücre metinleri. Dönen: { ok, missingRequired[], missingRecommended[], nearMisses[] }
function checkHeaders(kind, headers) {
  const schema = SCHEMAS[kind];
  if (!schema) throw new Error(`Bilinmeyen dosya türü: ${kind}`);
  const result = { ok: true, kind, label: schema.label, missingRequired: [], missingRecommended: [], nearMisses: [] };
  const run = (items, bucket) =>
    items.forEach((item) => {
      const r = checkGroup(item, headers);
      if (r.found) return;
      result[bucket].push(groupName(item));
      if (r.near) result.nearMisses.push({ expected: r.expected, found: r.near });
    });
  run(schema.required, "missingRequired");
  run(schema.recommended, "missingRecommended");
  result.ok = result.missingRequired.length === 0;
  return result;
}

// Çalışma kitabından (XLSX.read çıktısı) ilgili sayfa/başlık satırını bulup kontrol eder.
function checkWorkbook(kind, workbook) {
  const schema = SCHEMAS[kind];
  if (!workbook.SheetNames || workbook.SheetNames.length <= schema.sheetIndex) {
    return {
      ok: false, kind, label: schema.label,
      missingRequired: [`${schema.sheetIndex + 1}. sayfa (dosyada ${workbook.SheetNames?.length || 0} sayfa var)`],
      missingRecommended: [], nearMisses: [], sheetProblem: true,
    };
  }
  const sheet = workbook.Sheets[workbook.SheetNames[schema.sheetIndex]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true });
  const headers = (rows[schema.headerRow] || []).filter((h) => String(h).trim() !== "");
  const result = checkHeaders(kind, headers);
  result.headerRow = schema.headerRow + 1;
  result.dataRows = Math.max(0, rows.length - schema.headerRow - 1);
  if (headers.length === 0) {
    result.ok = false;
    result.missingRequired = SCHEMAS[kind].required.map(groupName);
    result.headerProblem = `${schema.headerRow + 1}. satırda başlık bulunamadı`;
  } else if (result.dataRows === 0) {
    result.ok = false;
    result.emptyProblem = "başlıktan sonra hiç veri satırı yok";
  }
  return result;
}

// Kullanıcıya gösterilecek tek satırlık özet (toast/log)
function summarize(result) {
  if (result.ok && result.missingRecommended.length === 0) return `${result.label}: sütunlar tam`;
  const parts = [];
  if (result.sheetProblem) parts.push(`dosyada beklenen sayfa yok (${result.missingRequired[0]})`);
  if (result.headerProblem) parts.push(result.headerProblem);
  if (result.emptyProblem) parts.push(result.emptyProblem);
  if (!result.sheetProblem && !result.headerProblem && result.missingRequired.length) parts.push(`ZORUNLU sütun yok: ${result.missingRequired.join(", ")}`);
  if (result.missingRecommended.length) parts.push(`eksik (rapor çalışır ama bu alanlar boş kalır): ${result.missingRecommended.join(", ")}`);
  if (result.nearMisses.length) parts.push(`benzer başlık var ama okuyucu tanımaz: ${result.nearMisses.map((n) => `"${n.found}" → beklenen "${n.expected}"`).join("; ")}`);
  return `${result.label}: ${parts.join(" | ")}`;
}

module.exports = { SCHEMAS, checkHeaders, checkWorkbook, summarize };
