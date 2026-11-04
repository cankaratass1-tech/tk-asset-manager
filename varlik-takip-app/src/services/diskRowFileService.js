// Disk Alanı satır eşlemesi (Node'da test edilebilsin diye diskFileService.js'ten ayrıldı; backendClient'a bağımlı değildir).
import { classifyDisk } from "./dashboardService.js";

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
  if (String(mbStr ?? "").trim() === "") return ""; // sütun yoksa "0.0 GB" gösterilmesin
  const n = Number(mbStr);
  if (!Number.isFinite(n)) return "";
  return `${(n / 1024).toFixed(1)} GB`;
}

// Dashboard'daki eşiklerle (classifyDisk, bkz. dashboardService.js) birebir aynı sınıflandırma —
// "Tümü/Eşleşen/Eşleşmeyen" yerine Disk Alanı'nda da aynı seviyelere göre
// filtre.
const DISK_LEVEL_LABELS = { critical: "Kritik", warning: "Uyarı", normal: "Normal", unknown: "Bilinmiyor" };

// Sütun adlarındaki uç/yinelenen boşluk ve satır sonları ("C Free Space MB " gibi) eşleşmeyi bozmasın
function trimKeys(raw) {
  const o = {};
  for (const k of Object.keys(raw)) {
    const nk = k.replace(/\s+/g, " ").trim();
    if (!(nk in o)) o[nk] = raw[k];
  }
  return o;
}

export function mapDiskRow(rawIn) {
  const raw = trimKeys(rawIn);
  // İki biçim: SCCM "Computers with low free disk space" (Name/Volume Name/Free Space/Size, MB) ve
  // SCCM envanter alt kümesi "C Size Less Than" (Hostname/C Free Space MB/C Size MB, yalnız C sürücüsü; Type = Desktop/Laptop)
  const freeRaw = col(raw, "Free Space", "C Free Space MB");
  const sizeRaw = col(raw, "Size", "C Size MB");
  const volumeName = col(raw, "Volume Name") || (col(raw, "C Free Space MB") ? "C" : "");
  const freeSpaceMb = freeRaw === "" ? NaN : Number(freeRaw);
  const sizeMb = sizeRaw === "" ? NaN : Number(sizeRaw);
  const freeSpaceGb = Number.isFinite(freeSpaceMb) ? freeSpaceMb / 1024 : null;
  const diskLevel = classifyDisk(freeSpaceGb);
  return {
    // Hostname / Volume Name (C ya da Q) / Size (GB) / Free Space (GB). Aynı
    // cihazın C ve Q gibi birden fazla birimi varsa kaynak dosyada ayrı satır olarak gelir.
    owner: col(raw, "Name", "Device ID", "Hostname"),
    ownerFull: "",
    sub: "",
    serial: volumeName ? volumeLetter(volumeName) : "",
    model: mbToGb(freeRaw),
    location: mbToGb(sizeRaw),
    lbsParent: "",
    company: "",
    // Dashboard'daki eşik sınıflandırması ve GB bazlı hesaplar için sayısal değerler — mevcut
    // görüntüleme alanlarına (model/location, GB metni) dokunmadan ek olarak taşınıyor
    freeSpaceGb,
    sizeGb: Number.isFinite(sizeMb) ? sizeMb / 1024 : null,
    // Ham Excel'de "Site Code" sütunu var (İnaktif Cihazlar'daki "Sahibi Firma" gibi bir alan
    // olmasa da) — dashboard'da lokasyon bazlı kırılım için kullanılıyor
    siteCode: col(raw, "Site Code") || col(raw, "LastLogonLokasyon", "EnvanterLokasyon"),
    matched: true, // bu raporda sahip/lokasyon eşleşmesi kavramı yok, hepsi tek liste
    diskLevel, // "critical" | "warning" | "normal" | "unknown" — segment filtresi bunu kullanır
    statusTag: DISK_LEVEL_LABELS[diskLevel],
    _raw: rawIn,
  };
}
