// Cihaz bazlı kimlik + aksiyon logu yardımcıları (madde 5).
// deviceKeyOf: bir satırı fiziksel cihaza sabitleyen anahtar — seri no öncelikli, yoksa hostname,
// o da yoksa sahip/isim. Aynı cihaz farklı raporlarda AYNI anahtarı üretir → not/durum/geçmiş
// raporlar arası ortak (madde 14: aynı cihaz tekrar tekrar oluşmasın).
import { backendClient } from "./backendClient";

export function deviceKeyOf(row) {
  if (!row) return "";
  // Disk Alanı satırlarında "serial" aslında birim harfi (C/Q) — cihaz kimliği hostname/Name'dir.
  // Bu yüzden 2 karakterden kısa "serial" gerçek seri no sayılmaz.
  const serial = String(row.serial || "").trim();
  if (serial.length > 2) return serial.toLowerCase();
  const host = String(row.hostname || row.owner || "").trim().toLowerCase();
  if (!host) return "";
  // Aynı makinenin C ve Q birimleri ayrı kimlik olsun, ama dönemler arası sabit kalsın.
  return serial ? `${host}:${serial.toLowerCase()}` : host;
}

// Aksiyon event'ini backend'e yazar (fire-and-forget — UI'yı bloklamaz, hata sessizce yutulur).
export function logDeviceAction(row, { type, description = "", user = "", reportId = "", mailSubject = "", status = "" } = {}) {
  const key = deviceKeyOf(row);
  if (!key || !type) return;
  backendClient
    .addDeviceAction(key, { type, description, user, reportId, mailSubject, status, ts: new Date().toISOString() })
    .catch(() => {});
}

export function persistDeviceMeta(deviceKey, meta) {
  if (!deviceKey) return;
  backendClient.saveDeviceMeta(deviceKey, meta || {}).catch(() => {});
}
