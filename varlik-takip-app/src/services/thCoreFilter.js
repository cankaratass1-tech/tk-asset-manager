// Uygulamada yalnızca Desktop, Notebook ve Monitor gösterilir; TH'deki diğer her tür (Tablet, Printer, Data/Voice Line...)
// içe aktarma sırasında elenir. Aynı kural backend'de de uygulanır (backend/src/excelSource.js coreDeviceRow).
const CORE_DEVICE_TYPES = new Set(["desktop", "notebook", "monitor"]);

// raw: TH'nin ham satırı ("Model" sütunu = cihaz türü)
// Envanterden çıkmış cihazlar (v2: Durum = Kal Edildi / Hibe Edildi / Satıldı / Personele Satıldı) içe aktarılmaz — backend: excelSource.js coreDeviceRow
const RETIRED_DURUM = new Set(["kal edildi", "hibe edildi", "satıldı", "personele satıldı"]);
export const isRetiredRaw = (raw) => RETIRED_DURUM.has(String(raw?.Durum ?? "").trim().toLocaleLowerCase("tr"));
// Apple Mac'ler (MacBook, iMac, Mac mini/Pro/Studio): yalnız Notebook/Desktop kayıtları için; Apple monitörler etkilenmez. Backend: excelSource.js isMacDevice
export function isMacRaw(raw) {
  const model = String(raw?.Model ?? "").trim().toUpperCase();
  if (model !== "NOTEBOOK" && model !== "DESKTOP") return false;
  const marka = String(raw?.Marka ?? "").trim();
  const asset = String(raw?.Asset ?? raw?.["Varlık Adı"] ?? "");
  const tip = String(raw?.["Cihaz Tipi"] ?? "");
  return /^apple$/i.test(marka) || /\bmac\b/i.test(tip) || /mac\s?book|\bimac\b|mac\s?mini|mac\s?pro|mac\s?studio/i.test(asset);
}
export const isCoreDeviceRaw = (raw) => CORE_DEVICE_TYPES.has(String(raw?.Model ?? "").trim().toLowerCase()) && !isRetiredRaw(raw) && !isMacRaw(raw);

// SCCM envanteri: yalnızca Desktop ve Laptop/Notebook ("Type" sütunu). Type boşsa elenmez. Backend: excelSource.js coreSccmRow
const CORE_SCCM_TYPES = new Set(["desktop", "laptop", "notebook"]);
export const isCoreSccmRaw = (raw) => {
  const t = String(raw?.Type ?? "").trim().toLowerCase();
  return t === "" || CORE_SCCM_TYPES.has(t);
};

// İnaktif Cihazlar: yalnız bilgisayarlar (Desktop / Notebook). Backend: excelSource.js coreInaktifRow (AYNI kural).
export function isCoreInaktifRaw(raw) {
  if (isMacRaw(raw)) return false;
  const v = String(raw?.Model ?? "").trim();
  if (v === "") return true;
  if (/line$/i.test(v)) return false;
  if (!/^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ ]*$/.test(v)) return true; // model adı: tür bilinmez
  return v === "DESKTOP" || v === "NOTEBOOK";
}

const normSerial = (v) => String(v ?? "").trim().toLowerCase();

// Elenen (Tablet/Printer/...) TH satırlarının seri numaraları. Türü bilinmeyen (Model boş/"-") ve envanterden çıkmış cihazlar dahil değildir.
export const excludedSerialsOf = (rawRows) => (rawRows || []).filter((r) => !isCoreDeviceRaw(r) && !isRetiredRaw(r) && String(r?.Model ?? "").trim() !== "" && String(r?.Model ?? "").trim() !== "-").map((r) => String(r["Seri No"] ?? "").trim()).filter(Boolean);

// SCCM / İnaktif listelerinden, TH'de Desktop/Notebook/Monitor DIŞINDA bir türle görünen cihazları çıkarır.
// TH'de hiç bulunmayan cihazlar (türü bilinmiyor) tutulur — Zimmet raporunun "TH'de kaydı yok" tespiti bunlara dayanır.
// keptThRows: filtrelenmiş (çekirdek) TH satırları — hem çekirdek hem elenen satırı olan bir seri no elenmez.
export function dropOtherTypes(rows, excludedSerials, keptThRows, serialOf = (r) => r.serial) {
  if (!excludedSerials || excludedSerials.length === 0) return rows;
  const drop = new Set(excludedSerials.map(normSerial));
  (keptThRows || []).forEach((t) => drop.delete(normSerial(t.serial)));
  if (drop.size === 0) return rows;
  return rows.filter((r) => !drop.has(normSerial(serialOf(r))));
}
