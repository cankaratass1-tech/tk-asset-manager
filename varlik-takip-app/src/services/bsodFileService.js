// LAKESIDE "Weekly_BSOD" Excel'i — gerçek dosyadan doğrulanan şema:
//   1. satır boş, 2. satır başlık: "Crash Date" | "Machine Name" | "Application Name" | "BSOD Count"
//   veri: 46272 (Excel tarih serisi) | "AMS2B03.MHYNET.MHY.COM.TR" | "BSOD :  VIDEO_TDR_FAILURE" | 1
// Başlık 2. satırda olduğu için okuma `range: 1` ile yapılır (bkz. handleManualBsodFile).
import { lookupBsod, shortHost } from "./bsodKnowledgeService";
import { backendClient } from "./backendClient";

function col(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return row[name];
  }
  return "";
}

// Excel tarih serisi (1900 tabanı) -> ISO tarih; zaten metin/tarihse olduğu gibi dener.
function excelDate(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400 * 1000); // 25569 = 1970-01-01'in Excel serisi
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16).replace("T", " ");
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 16).replace("T", " ");
}

export function mapBsodRow(raw) {
  const machine = String(col(raw, "Machine Name", "MachineName", "Hostname", "Computer Name", "Cihaz")).trim();
  const appName = String(col(raw, "Application Name", "ApplicationName", "BSOD", "Stop Code", "Bugcheck")).trim();
  const countRaw = col(raw, "BSOD Count", "BSODCount", "Count", "Adet");
  const count = Math.max(1, parseInt(countRaw, 10) || 1);
  const when = excelDate(col(raw, "Crash Date", "CrashDate", "Date", "Tarih"));
  const kb = lookupBsod(appName);
  return {
    rowKey: `bsod|${machine}|${appName}|${when}`,
    hostname: machine,
    hostShort: shortHost(machine), // mail içeriği ilk noktadan sonrasını atar
    bsodCode: appName,
    bsodName: kb.name,
    bsodHex: kb.code || "",
    category: kb.category,
    severity: kb.severity,
    cause: kb.cause,
    resolved: kb.resolved,
    count,
    crashDate: when,
    // Genel liste bileşenleriyle uyum için ortak alanlar
    owner: shortHost(machine),
    serial: kb.name + (kb.code ? ` (${kb.code})` : ""),
    sub: `${when || "—"} · ${kb.category}${count > 1 ? ` · ${count}×` : ""}`,
    model: kb.title,
    location: when || "—",
    lbsParent: "",
    company: "",
    office: when || "—",
    matched: false,
    statusTag: kb.severity === "kritik" ? "Kritik" : kb.severity === "yüksek" ? "Yüksek" : "Orta",
    _raw: raw,
  };
}

export function mapBsodRows(rawRows) {
  return (rawRows || [])
    .map(mapBsodRow)
    .filter((r) => r.hostname || r.bsodCode);
}

// Diğer raporlar (İnaktif/Disk/SCCM/TH/Monitor) gibi backend'in senkron klasöründen otomatik
// yükler — sayfa yenilenince kaybolmaz. Klasör senkronu kurulmadıysa manuel dosya seçimi (handleManualBsodFile,
// App.jsx) hâlâ kullanılabilir.
export async function fetchBsodRowsFromFile() {
  const result = await backendClient.getBsodReport();
  if (!result.ok) throw new Error(result.message || "Dosya okunamadı");
  return {
    fileName: result.fileName,
    modifiedAt: result.modifiedAt,
    rows: mapBsodRows(result.rows || []),
  };
}
