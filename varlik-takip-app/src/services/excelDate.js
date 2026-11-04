// Excel tarih seri numaraları (örn. 46286.3356018519) → okunur metin. Gerçek SCCM / TuruncuHat dosyalarında tarih sütunları sayısal
// seri numarası olarak gelir; çevrilmezse ekranda ham sayı görünür ve gün hesapları (son giriş kaç gün önce, cihaz yaşı) yapılamaz.
// Excel serisi: 25569 = 1970-01-01. Makul tarih aralığı dışındaki sayılar (RAM, boyut, sayaç vb.) olduğu gibi bırakılır.
const MIN_SERIAL = 20000; // ≈ 1954
const MAX_SERIAL = 80000; // ≈ 2119

const pad = (n) => String(n).padStart(2, "0");

// Sayı (ya da yalnızca rakam/ondalıktan oluşan metin) makul bir Excel tarih serisiyse "YYYY-AA-GG" ya da "YYYY-AA-GG SS:DD:ss"; değilse girdiyi aynen döner.
export function excelSerialToText(v) {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{5}(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < MIN_SERIAL || n > MAX_SERIAL) return v;
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  if (Number.isNaN(d.getTime())) return v;
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const hasTime = Math.abs(n - Math.round(n)) > 1e-6;
  return hasTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` : date;
}

const DATE_HEADER = /(date|time|tarih)/i;

// Ham satırdaki tarih sütunlarını (başlığında date/time/tarih geçenler) çevirir; hiçbir şey değişmediyse AYNI nesneyi döner (kopya maliyeti yok).
export function normalizeDateColumns(raw) {
  let out = null;
  for (const k of Object.keys(raw)) {
    if (!DATE_HEADER.test(k)) continue;
    const t = excelSerialToText(raw[k]);
    if (t !== raw[k]) { if (!out) out = { ...raw }; out[k] = t; }
  }
  return out || raw;
}
