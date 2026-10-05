// Monitor Raporu ("Attached Monitors Report.xlsx") — gerçek dosyadan doğrulandı (bkz. konuşma).
// Başlık satırı 2. satırda (range: 1, 0-tabanlı) — üstte tek bir rapor başlığı satırı var.
// KVKK gereği kullanıcı bilgileri sınırlandırılmış olabilir (Username az doldurulmuş olabilir) —
// eşleştirme için esas kullanılacak alanlar (Hostname, Monitor Serial Number) kişisel veri değil.
// Ayrı bir "Asset/Demirbaş No" sütunu YOK — uydurmuyoruz, sadece Monitor Serial Number var.
import { backendClient } from "./backendClient";

function col(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return String(row[name]).trim();
  }
  return "";
}

export function mapMonitorRow(raw) {
  const monitorSerial = col(raw, "ID Monitor Serial Number");
  const hostname = col(raw, "Hostname");
  return {
    rowKey: `monitor|${monitorSerial || hostname}`,
    hostname,
    username: col(raw, "Username"),
    monitorSerial,
    monitorManufacturer: col(raw, "Monitor Manufacturer"),
    monitorModel: col(raw, "Monitor Model"),
    deviceDomain: col(raw, "Device Domain"),
    userDomain: col(raw, "User Domain"),
    adSite: col(raw, "AD Site"),
    activeStatus: col(raw, "Active Status"),
    clientType: col(raw, "Client Type"),
    virtualMachine: col(raw, "Virtual Machine"),
    _raw: raw,
  };
}

export function mapMonitorRows(rawRows) {
  return (rawRows || []).map(mapMonitorRow);
}

// Diğer üç rapor (İnaktif/Disk/SCCM) ile aynı desen — backend'in senkron klasöründen otomatik
// yükler, sayfa yenilenince kaybolmaz (bkz. konuşma: "diğerleri gibi görünmüyor"). Manuel dosya
// seçimi (handleManualMonitorFile, App.jsx) klasör senkronu kurulmadıysa hâlâ kullanılabilir.
export async function fetchMonitorRowsFromFile() {
  const result = await backendClient.getMonitorReport();
  if (!result.ok) throw new Error(result.message || "Dosya okunamadı");
  return {
    fileName: result.fileName,
    modifiedAt: result.modifiedAt,
    rows: (result.rows || []).map(mapMonitorRow),
  };
}
