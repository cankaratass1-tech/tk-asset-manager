// TuruncuHat (TH) envanter export'u — gerçek dosyadan doğrulandı: sütun şeması
// İnaktif Cihazlar dosyasıyla BİREBİR AYNI (aynı sistemin farklı bir görünümü/filtresi). Bu
// yüzden alan eşlemesi inaktifFileService.js'teki mapInaktifRow ile aynı mantığı izliyor.
// Ayrı bir "Monitor" sütunu YOK — monitor bilgisi tamamen ayrı bir dosyadan gelir (monitorFileService.js).
import { backendClient } from "./backendClient";
import { isCoreDeviceRaw } from "./thCoreFilter";
import { excelSerialToText } from "./excelDate";
import { normalizeThRow } from "./thAliasFileService";

function col(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return String(row[name]).trim();
  }
  return "";
}

// Gereksinim #4: "Data Line"/"Voice Line" olarak belirtilen kayıtlar sisteme alınmayacak —
// listelere, raporlara, filtrelere, karşılaştırmalara ve mail gönderimlerine dahil edilmeyecek.
// Aynı şema İnaktif Cihazlar dosyasında da doğrulandı — ham "Model" sütununda tam
// "Data Line"/"Voice Line" değil, "Executive Voice Line", "Operation Data Line" gibi varyantlar
// görülüyor; bu yüzden tam eşleşme değil, alt dize (contains) eşleşmesi kullanılıyor.
function isExcludedLineType(raw) {
  const category = col(raw, "Model").toLowerCase();
  return category.includes("data line") || category.includes("voice line");
}

function shortOwnerName(full) {
  if (!full) return full;
  const idx = full.indexOf(" (");
  return idx > 0 ? full.slice(0, idx).trim() : full;
}

export function mapThRow(raw) {
  const location = col(raw, "Cihaz Sahibinin LBS'i");
  const ownerFull = col(raw, "Sahibi");
  const serial = col(raw, "Seri No");
  return {
    rowKey: `th|${serial}`,
    owner: shortOwnerName(ownerFull),
    ownerFull,
    // Öncelikli eşleştirme alanı: "Owner Username" — SCCM'in "LastLogon UserName" ile AYNI kısa
    // kullanıcı adı formatında (gerçek veriyle doğrulandı: 20.021 örnekte hepsi boşluksuz/kısa
    // format). Sicil (aşağıda) sadece username boşsa yedek olarak kullanılır.
    ownerUsername: col(raw, "Owner Username"),
    // Yedek eşleştirme alanı — SCCM'in "Last LogonSicil" alanıyla format bağımsız karşılaştırma.
    ownerSicil: col(raw, "Cihaz Sahibinin Sicili"),
    // Kapatma Onayı Bekleyen Kayıtlar (ve benzeri) doğrudan kişiye mail atabilsin diye — TH'de
    // gerçek dosyada doğrulandı: "Cihaz Sahibinin Maili".
    ownerMail: col(raw, "Cihaz Sahibinin Maili"),
    serial,
    barkod: col(raw, "Varlık Barkodu"),
    // TuruncuHat'ta cihaz için açık bir ATO / malzeme emri varsa emir numarası ("ATO-00301971"); yoksa boş ya da "-"
    materialOrder: col(raw, "İşlemdeki Malzeme Emri"),
    marka: col(raw, "Marka"),
    model: col(raw, "Asset", "Model"),
    // Ham "Asset" sütunu = "Varlık Kataloğu".
    asset: col(raw, "Asset"),
    // Ham "Model" sütunu ("NOTEBOOK"/"MONITOR" gibi kategori) — comparisonService.js bunun
    // üzerinden bir TH satırının monitor mu PC mi olduğuna karar veriyor. "model" alanı (yukarıda)
    // görüntüleme için Asset'i öncelikli aldığından ("Lenovo ThinkVision T24i-30" gibi) bu
    // ayrım için kullanılamaz — Asset her zaman dolu olduğundan hep onu döndürür.
    deviceType: col(raw, "Model"),
    location: location || "—",
    lbsParent: col(raw, "LBS Location Parent"),
    company: col(raw, "Sahibi Firma"),
    // Madde 8 — cihaz yaşı için yedek tarih: SCCM'de "BIOS Date" boş kalırsa TuruncuHat'taki
    // garanti başlangıç tarihi kullanılır (gerçek export'ta her kayıtta dolu — kullanıcı teyidi).
    warrantyStartDate: excelSerialToText(col(raw, "Garanti Başlangıç Tarihi", "Garanti Baslangic Tarihi", "Garanti Başlangıç", "Warranty Start Date", "WarrantyStartDate")),
    // Ham değer — gerçek dosyada doğrulandı: "User", "Warehouse", "OBS", "Site", "Supplier"
    // (ve boş) olmak üzere 6 farklı değer var. Yalnızca User ve OBS esas alındığından burada "User"a
    // ASLA varsayılan/zorlama yapılmıyor (önceki hal: boş/Warehouse/Site/Supplier bile sessizce
    // "User" sayılıyordu, bu yanlıştı — depoda duran ya da sahada olan bir cihaz kişiye zimmetli
    // değildir). Filtreleme comparisonService.js'te (RELEVANT_ASSIGNMENT_TYPES) yapılıyor; burada
    // sadece ham değer olduğu gibi taşınıyor. "LBS Location Parent" yedek olarak hâlâ deneniyor.
    // Zimmet devri tarihi için kaynak: TH'nin kendi "Son Güncelleme Tarihi" alanı (gerçek export'taki tam ad doğrulanmadı — varyantlar denenir)
    lastUpdated: excelSerialToText(col(raw, "Son Güncelleme Tarihi", "Son Güncelleme", "Güncelleme Tarihi", "Son Guncelleme Tarihi", "Last Update Date", "Last Updated", "LastUpdateDate", "Modified Date")),
    assignmentType: col(raw, "Konum Kategorisi") || col(raw, "LBS Location Parent"),
    _raw: raw,
  };
}

export function mapThRows(rawRows) {
  // Filtre map'ten ÖNCE, ham veri üzerinde uygulanır (gereksinim #4: "sisteme aktarılmadan önce
  // filtrelensin") — bu sayede TH verisini tüketen her yer (comparisonService üçlü karşılaştırma,
  // Zimmet raporu, mail gönderimi) otomatik olarak temiz veri görür. Yalnızca Desktop/Notebook/Monitor kalır (bkz. thCoreFilter.js).
  return (rawRows || []).filter((r) => isCoreDeviceRaw(r) && !isExcludedLineType(r)).map(normalizeThRow).map(mapThRow);
}

// Diğer üç rapor (İnaktif/Disk/SCCM) ile aynı desen — backend'in senkron klasöründen otomatik
// yükler, sayfa yenilenince kaybolmaz. Manuel dosya
// seçimi (handleManualThFile, App.jsx) klasör senkronu kurulmadıysa hâlâ kullanılabilir.
export async function fetchThRowsFromFile() {
  const result = await backendClient.getThReport();
  if (!result.ok) throw new Error(result.message || "Dosya okunamadı");
  return {
    fileName: result.fileName,
    modifiedAt: result.modifiedAt,
    rows: mapThRows(result.rows || []),
    excludedSerials: result.excludedSerials || [],
  };
}
