// LAKESIDE kaynak kullanımı (CPU / RAM) dosyası — Bottleneck raporunun performans verisi.
// Gerçek Lakeside export'unun sütun adları doğrulanmadı: birkaç yaygın varyant denenir; sütun yoksa alan boş
// kalır (Bottleneck o sinyali "Veri Yok" sayar, uygulama hata vermez). Backend şeması (fileSchemas.js "resource") ile aynı alternatifler.
import { backendClient } from "./backendClient";
import { shortHost } from "./bsodKnowledgeService";

function col(row, ...names) {
  for (const name of names) {
    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase() === name.toLowerCase() && row[key] !== "") return row[key];
    }
  }
  return "";
}
function pct(v) {
  if (v === "" || v == null) return null;
  const n = parseFloat(String(v).replace("%", "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round((n > 0 && n <= 1 ? n * 100 : n) * 10) / 10;
}
function num(v) {
  const n = parseFloat(String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function mapResourceRow(raw) {
  const machine = String(col(raw, "Machine Name", "MachineName", "Hostname", "Computer Name", "System", "Cihaz")).trim();
  return {
    hostname: machine,
    hostShort: shortHost(machine),
    avgCpu: pct(col(raw, "Avg CPU %", "CPU Avg %", "Average CPU %", "CPU Usage %", "CPU %", "CPU")),
    peakCpu: pct(col(raw, "Peak CPU %", "CPU Peak %", "Max CPU %")),
    avgRam: pct(col(raw, "Avg RAM %", "RAM Avg %", "Average RAM %", "Memory Usage %", "RAM %", "Memory %", "RAM")),
    peakRam: pct(col(raw, "Peak RAM %", "RAM Peak %", "Max RAM %")),
    totalRamGb: num(col(raw, "Total RAM (GB)", "RAM GB", "Installed RAM (GB)")),
    date: String(col(raw, "Date", "Tarih", "Week") || ""),
  };
}

export function mapResourceRows(rawRows) {
  return (rawRows || []).map(mapResourceRow).filter((r) => r.hostname && (r.avgCpu != null || r.avgRam != null));
}

export async function fetchResourceRowsFromFile() {
  const result = await backendClient.getResourceReport();
  if (!result.ok) throw new Error(result.message || "Dosya okunamadı");
  return { fileName: result.fileName, modifiedAt: result.modifiedAt, rows: mapResourceRows(result.rows || []) };
}
