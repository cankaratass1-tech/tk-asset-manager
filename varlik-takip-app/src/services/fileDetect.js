// Toplu dosya yükleme: bırakılan her dosyanın hangi rapor türüne ait olduğunu otomatik tanır.
// Önce dosya adındaki önek (mevcut sistemin kullandığı "<önek>_<tarih>.xlsx" kuralı), ad tanınmazsa
// dosyanın başlık sütunları kullanılır. Tür kimlikleri backend/src/importStore.js KINDS ile aynıdır
// (battery ve bant ayrı yükleme yoluyla gelir).
import * as XLSX from "xlsx";

export const KIND_LABELS = {
  inaktif: "İnaktif Cihazlar",
  disk: "Disk Alanı",
  sccm: "SCCM Envanteri",
  th: "TuruncuHat Envanteri",
  monitor: "Monitör Raporu",
  lokasyon: "Lokasyon E-posta Listesi",
  bsod: "Weekly BSOD",
  battery: "Battery Health",
  bant: "Ofis Bant Genişliği",
};

const loose = (s) =>
  String(s ?? "")
    .replace(/[İIı]/g, "i")
    .toLowerCase()
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]/g, "");

const baseName = (name) => String(name ?? "").replace(/^.*[\\/]/, "").replace(/\.(xlsx|xls|csv)$/i, "");

// Dosya adından tür (tanınmazsa null)
export function detectFromName(fileName) {
  const raw = baseName(fileName);
  const n = loose(raw);
  if (n.startsWith("inaktifcihaz")) return "inaktif";
  if (n.startsWith("diskalani")) return "disk";
  if (n.startsWith("sccm")) return "sccm";
  if (n.startsWith("attachedmonitors") || n.startsWith("monitorraporu")) return "monitor";
  if (n.startsWith("lokasyonmail")) return "lokasyon";
  if (n.startsWith("weeklybsod") || n.startsWith("bsod")) return "bsod";
  if (n.startsWith("battery")) return "battery";
  if (n.startsWith("bantgenisligi") || n.startsWith("ofisbant")) return "bant";
  if (/^(th|turuncu\s*hat)(?![a-zçğıöşü])/i.test(raw)) return "th";
  return null;
}

const MACHINE = ["machinename", "computername", "devicename", "hostname"];
const SIGNATURES = [
  ["monitor", [["idmonitorserialnumber"]]],
  ["sccm", [["hostname"], ["serialnumber"], ["lastlogonusername"]]],
  ["lokasyon", [["lokasyonkodu"], ["mailadresi"]]],
  ["bant", [["bantgenisligi"], ["uyaridurumu"]]],
  ["bsod", [MACHINE, ["applicationname", "bugcheck", "stopcode"]]],
  ["battery", [[...MACHINE, "system", "host", "cihaz", "cihazadi"], ["batteryhealth", "health", "designcapacity", "fullchargecapacity"]]],
  ["disk", [["name", "deviceid"], ["freespace"], ["size"]]],
];

// Sayfanın ilk satırlarından, tüm grupları (her grup için en az bir alternatif) içeren bir başlık satırı var mı?
function sheetMatches(sheet, groups) {
  if (!sheet) return false;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true }).slice(0, 12);
  return rows.some((r) => {
    const cells = new Set(r.map(loose).filter(Boolean));
    return groups.every((alts) => alts.some((a) => cells.has(a)));
  });
}

// Çalışma kitabının başlık sütunlarından tür (tanınmazsa null)
export function detectFromWorkbook(wb) {
  const sheets = (wb?.SheetNames || []).map((n) => wb.Sheets[n]);
  for (const [kind, groups] of SIGNATURES) {
    if (sheets.some((s) => sheetMatches(s, groups))) return kind;
  }
  // İnaktif Cihazlar 2. sayfada, TuruncuHat 1. sayfada; ikisinin sütunları benzer
  if (sheets[1] && sheetMatches(sheets[1], [["serino"], ["sahibi"], ["cihazsahibininlbsi"]])) return "inaktif";
  if (sheets[0] && sheetMatches(sheets[0], [["serino"], ["sahibi"], ["ownerusername"]])) return "th";
  return null;
}

// Tarayıcıdaki File için: önce ad, olmazsa başlıklar. { kind, via: "ad" | "sütunlar" } ya da { kind: null }
export async function detectFile(file) {
  const byName = detectFromName(file.name);
  if (byName) return { kind: byName, via: "ad" };
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", sheetRows: 12 });
    const byHeaders = detectFromWorkbook(wb);
    if (byHeaders) return { kind: byHeaders, via: "sütunlar" };
  } catch {
    /* okunamayan dosya: tanınmadı sayılır */
  }
  return { kind: null };
}

// Aynı türden birden çok dosya varsa yalnız en yenisi (son değişiklik tarihi) kullanılır; diğerleri atlanır.
export function pickNewestPerKind(entries) {
  const newest = new Map();
  for (const e of entries) {
    if (!e.kind) continue;
    const cur = newest.get(e.kind);
    if (!cur || (e.lastModified || 0) > (cur.lastModified || 0)) newest.set(e.kind, e);
  }
  return entries.map((e) => {
    if (!e.kind) return { ...e, action: "unknown" };
    return newest.get(e.kind) === e ? { ...e, action: "use" } : { ...e, action: "skip", newerName: newest.get(e.kind).name };
  });
}
