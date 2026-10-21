// SharePoint/OneDrive senkron klasöründeki "DiskAlani_yyyyMMddHHmmss.xlsx" dosyasını backend
// üzerinden okuyup rapor satırı biçimine çevirir. Gerçek dosya SCCM'in "Computers with low free
// disk space" raporu — sadece cihaz adı ve disk kullanımı var, sahip/lokasyon/şirket bilgisi YOK
// (İnaktif Cihazlar'daki gibi bir "Sahibi Firma" sütunu bulunmuyor). Bu yüzden Disk Alanı raporu
// şirkete göre gruplanmadan, düz bir liste olarak gösteriliyor.
import { backendClient } from "./backendClient";
import { classifyDisk } from "./dashboardService";

// SCCM export'unda bazı sütunlar (ör. sayısal Device ID) Excel'de sayı olarak tutulduğu için
// SheetJS bunları number olarak döndürür — .localeCompare gibi string metodları number'da
// patlar, o yüzden burada hep string'e çeviriyoruz.
function col(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return String(row[name]);
  }
  return "";
}

// Kaynak "Volume Name" alanı ("Windows", "Q Part", "UserData"...) sürücü harfini doğrudan
// içermiyor — adında "Q" geçen birim Q, geri kalan her şey C kabul ediliyor
function volumeLetter(volumeName) {
  return /q/i.test(volumeName) ? "Q" : "C";
}

// SCCM raporundaki Size/Free Space değerleri MB cinsinden — GB'a çevirip 1 ondalıkla gösteriyoruz
function mbToGb(mbStr) {
  const n = Number(mbStr);
  if (!Number.isFinite(n)) return "";
  return `${(n / 1024).toFixed(1)} GB`;
}

// Dashboard'daki eşiklerle (classifyDisk, bkz. dashboardService.js) birebir aynı sınıflandırma —
// "Tümü/Eşleşen/Eşleşmeyen" yerine Disk Alanı'nda da aynı seviyelere göre
// filtre.
const DISK_LEVEL_LABELS = { critical: "Kritik", warning: "Uyarı", normal: "Normal", unknown: "Bilinmiyor" };

export function mapDiskRow(raw) {
  const volumeName = col(raw, "Volume Name");
  const freeSpaceMb = Number(col(raw, "Free Space"));
  const sizeMb = Number(col(raw, "Size"));
  const freeSpaceGb = Number.isFinite(freeSpaceMb) ? freeSpaceMb / 1024 : null;
  const diskLevel = classifyDisk(freeSpaceGb);
  return {
    // Hostname / Volume Name (C ya da Q) / Size (GB) / Free Space (GB). Aynı
    // cihazın C ve Q gibi birden fazla birimi varsa kaynak dosyada ayrı satır olarak gelir.
    owner: col(raw, "Name", "Device ID"),
    ownerFull: "",
    sub: "",
    serial: volumeName ? volumeLetter(volumeName) : "",
    model: mbToGb(col(raw, "Free Space")),
    location: mbToGb(col(raw, "Size")),
    lbsParent: "",
    company: "",
    // Dashboard'daki eşik sınıflandırması ve GB bazlı hesaplar için sayısal değerler — mevcut
    // görüntüleme alanlarına (model/location, GB metni) dokunmadan ek olarak taşınıyor
    freeSpaceGb,
    sizeGb: Number.isFinite(sizeMb) ? sizeMb / 1024 : null,
    // Ham Excel'de "Site Code" sütunu var (İnaktif Cihazlar'daki "Sahibi Firma" gibi bir alan
    // olmasa da) — dashboard'da lokasyon bazlı kırılım için kullanılıyor
    siteCode: col(raw, "Site Code"),
    matched: true, // bu raporda sahip/lokasyon eşleşmesi kavramı yok, hepsi tek liste
    diskLevel, // "critical" | "warning" | "normal" | "unknown" — segment filtresi bunu kullanır
    statusTag: DISK_LEVEL_LABELS[diskLevel],
    _raw: raw,
  };
}

export async function fetchDiskRowsFromFile() {
  const result = await backendClient.getDiskAlaniReport();
  if (!result.ok) throw new Error(result.message || "Dosya okunamadı");
  return {
    fileName: result.fileName,
    modifiedAt: result.modifiedAt,
    rows: (result.rows || []).map(mapDiskRow),
  };
}
