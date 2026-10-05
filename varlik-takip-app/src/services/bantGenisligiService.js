// Ofis Bant Genişliği raporu — monitoring aracının CSV export'u (bkz. konuşma). Dosya UTF-16 +
// TAB ayraçlı; SheetJS bunu otomatik algılıyor, tek özel nokta "Uyarı Durumu" sütununun "-%15"
// gibi metinleri sayı gibi yorumlamaması için sheet_to_json'a { raw: false } geçilmesi (App.jsx'te
// dosya okuma tarafında yapılıyor). Dosya artık backend'de kalıcı saklanıyor (bkz. konuşma: "bir
// kez yükleyeyim bir daha yüklemekle uğraşmayayım") — backend AYNI SheetJS mantığıyla ayrıştırıp
// zaten { raw:false } eşdeğeri düz metin değerleri döndürüyor, mapBantRow ikisinde de aynı şekilde çalışır.
import { backendClient } from "./backendClient";
function col(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return String(row[name]).trim();
  }
  return "";
}

// "83.3 Mb/s" -> 83.3 (Mb/s birimini varsayıyoruz — export'ta gerçek veride hep bu birim).
function parseMbps(v) {
  const m = String(v || "").match(/([\d.,]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function mapBantRow(raw) {
  const durum = col(raw, "Uyarı Durumu");
  // "Ortalama Dahilinde" = normal; "-%15" gibi bir sapma yüzdesi = uyarı (ortalamanın altında).
  const isWarning = durum !== "" && durum !== "Ortalama Dahilinde";
  return {
    rowKey: `bant|${col(raw, "Lokasyon")}|${col(raw, "Hat")}`,
    location: col(raw, "Lokasyon"),
    hat: col(raw, "Hat"),
    bandwidth: col(raw, "Bant Genişliği"),
    bandwidthMbps: parseMbps(col(raw, "Bant Genişliği")),
    avgBandwidth: col(raw, "Averaj Bant Genişliği"),
    avgBandwidthMbps: parseMbps(col(raw, "Averaj Bant Genişliği")),
    seviye: col(raw, "Seviye"),
    seviyeMbps: parseMbps(col(raw, "Seviye")),
    tarih: col(raw, "Tarih"),
    durum,
    isWarning,
    statusTag: isWarning ? `Uyarı (${durum})` : "Ortalama Dahilinde",
    _raw: raw,
  };
}

export function mapBantRows(rawRows) {
  return (rawRows || []).map(mapBantRow);
}

export async function fetchBantRowsFromFile() {
  const result = await backendClient.getBantGenisligiReport();
  if (!result.ok) throw new Error(result.message || "Dosya okunamadı");
  return { fileName: result.fileName, modifiedAt: result.modifiedAt, rows: mapBantRows(result.rows || []) };
}

// Tarayıcıdan seçilen dosyayı base64'e çevirip backend'e yükler (kalıcı saklanır).
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function uploadBantFile(file) {
  const buffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const result = await backendClient.uploadBantGenisligi(file.name, base64);
  if (!result.ok) throw new Error(result.message || "Dosya yüklenemedi");
  return { fileName: result.fileName, modifiedAt: result.modifiedAt, rows: mapBantRows(result.rows || []) };
}
