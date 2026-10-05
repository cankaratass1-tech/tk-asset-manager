// Lokasyon Mail Listesi — tüm lokasyon maillerinin TEK kaynağı (bkz. konuşma: "Bütün lokasyon
// mailleri tek bir yerden çekilecek"). Sütunlar gerçek dosyadan doğrulandı: Lokasyon Kodu, Açık
// Lokasyon Adı, Mail Adresi, Node_CP_ContactMail2, IP_Address. Aynı "Açık Lokasyon Adı" birden
// fazla "Lokasyon Kodu" satırı taşıyabilir (aynı ofisin farklı node/subnet'leri, ör. ABJ0-SD1 ve
// ABJ1-SD1 ikisi de "ABIDJAN SATIS OFISI") — İnaktif Cihazlar mail eşleştirmesi lokasyon ADI
// üzerinden yapılır, Lokasyon Hostname/IP Uyuşmazlığı raporu ise kod bazlı çalışır
// (bkz. locationIpService.js).
import { backendClient } from "./backendClient";

function col(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return String(row[name]).trim();
  }
  return "";
}

export function mapLokasyonMailRow(raw) {
  return {
    kod: col(raw, "Lokasyon Kodu"),
    locationName: col(raw, "Açık Lokasyon Adı"),
    mail: col(raw, "Mail Adresi"),
    mail2: col(raw, "Node_CP_ContactMail2"),
    ipAddress: col(raw, "IP_Address"),
    _raw: raw,
  };
}

export function mapLokasyonMailRows(rawRows) {
  return (rawRows || []).map(mapLokasyonMailRow);
}

// Açık Lokasyon Adı -> Mail Adresi. Aynı isme ait birden fazla satır varsa (kardeş kodlar),
// İLK dolu mail adresi kullanılır; hepsi boşsa "" döner (çağıran taraf "mail tanımlı değil" der).
export function resolveMailForLocationName(lokasyonRows, locationName) {
  if (!locationName) return "";
  const norm = (v) => String(v || "").trim().toLowerCase();
  const target = norm(locationName);
  const row = (lokasyonRows || []).find((r) => norm(r.locationName) === target && r.mail);
  return row ? row.mail : "";
}

export async function fetchLokasyonMailRowsFromFile() {
  const result = await backendClient.getLokasyonMailReport();
  if (!result.ok) throw new Error(result.message || "Dosya okunamadı");
  return {
    fileName: result.fileName,
    modifiedAt: result.modifiedAt,
    rows: mapLokasyonMailRows(result.rows || []),
  };
}
