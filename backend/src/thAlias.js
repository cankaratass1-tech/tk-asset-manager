// TuruncuHat'ın iki dışa aktarma biçimi vardır: eski (Sahibi, Konum Kategorisi, Owner Username…) ve "Turuncuhat v2"
// (Cihaz Sahibi, Location identifier, Cihaz Sahibinin Sicil No…). v2 satırlarındaki sütunları eski (kanonik) adlara çevirir; böylece
// uygulamanın geri kalanı iki biçimi ayırt etmek zorunda kalmaz. v2'de boş değerler "-" yazılır; eşlenen sütunlarda boş sayılır.
// Frontend'deki eşleme: varlik-takip-app/src/services/thCoreFilter.js (normalizeThRow) — iki tablo AYNI olmalıdır.
const ALIASES = [
  ["Sahibi", "Cihaz Sahibi"],
  ["Konum Kategorisi", "Location identifier"],
  ["Cihaz Sahibinin Sicili", "Cihaz Sahibinin Sicil No"],
  ["Cihaz Sahibinin Maili", "Cihaz Sahibinin Mail Adresi"],
  ["Asset", "Varlık Adı"],
  ["Varlık Barkodu", "Barkod"],
  ["Sahibi Firma", "Cihaz Sahibi Firma"],
  ["Cihaz Sahibinin LBS'i", "LBS"],
];

// Satırı yerinde dönüştürür (kanonik sütun zaten varsa dokunulmaz) ve döner.
function normalizeThRow(row) {
  for (const [canon, alt] of ALIASES) {
    if (row[canon] !== undefined || row[alt] === undefined) continue;
    const v = row[alt];
    row[canon] = typeof v === "string" && v.trim() === "-" ? "" : v;
  }
  return row;
}

module.exports = { normalizeThRow, ALIASES };
