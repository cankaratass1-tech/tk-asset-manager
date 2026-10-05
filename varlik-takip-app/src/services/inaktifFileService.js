// SharePoint/OneDrive senkron klasöründeki "İnaktifCihazlar_yyyyMMddHHmmss.xlsx" dosyasını
// (Power Automate'in manuel olarak beslediği liste) backend üzerinden okuyup rapor satırı
// biçimine çevirir. Sütun adları gerçek dosyadan doğrulandı (bkz. konuşma):
//   Seri No -> serial, Sahibi -> owner (isim soyisim), Cihaz Sahibinin LBS'i -> location,
//   Asset (boşsa Model) -> model, Sahibi Firma -> company (sol menüdeki bölüm),
//   LBS Location Parent -> lbsParent (lokasyon üst filtresi)
import { backendClient } from "./backendClient";

// Excel'deki sayısal görünen sütunlar SheetJS'te number olarak gelebilir — .localeCompare gibi
// string metodları number'da patlar, o yüzden burada hep string'e çeviriyoruz.
function col(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return String(row[name]);
  }
  return "";
}

// "Ad Soyad (Unvan/Organizasyon bilgisi...)" biçimindeki uzun Sahibi değerinden
// sadece isim kısmını çıkarır — liste görünümünde okunabilirlik için; tam metin
// detay panelinde/tooltip'te (ownerFull) hâlâ mevcut
function shortOwnerName(full) {
  if (!full) return full;
  const idx = full.indexOf(" (");
  return idx > 0 ? full.slice(0, idx).trim() : full;
}

export function mapInaktifRow(raw) {
  const location = col(raw, "Cihaz Sahibinin LBS'i");
  const ownerFull = col(raw, "Sahibi");
  return {
    owner: shortOwnerName(ownerFull),
    ownerFull,
    sub: "",
    serial: col(raw, "Seri No"),
    model: col(raw, "Asset", "Model"),
    location: location || "—",
    lbsParent: col(raw, "LBS Location Parent"),
    company: col(raw, "Sahibi Firma"),
    // Zimmet "User" (kişiye) ya da "OBS" (müdürlüğe) olabilir — gerçek dosyada doğrulandı
    // (bkz. konuşma): 465 kayıttan 440'ı User, 25'i OBS. Müdürlük zimmetli cihazlarda birden
    // fazla kişinin kullanması normal, "zimmet uyuşmazlığı" sayılmamalı.
    assignmentType: col(raw, "Konum Kategorisi") || "User",
    matched: Boolean(location),
    _raw: raw,
  };
}

export async function fetchInaktifRowsFromFile() {
  const result = await backendClient.getInaktifCihazlarReport();
  if (!result.ok) throw new Error(result.message || "Dosya okunamadı");
  return {
    fileName: result.fileName,
    modifiedAt: result.modifiedAt,
    rows: (result.rows || []).map(mapInaktifRow),
  };
}
