// TuruncuHat'ın iki biçimi: eski (Sahibi, Konum Kategorisi…) ve "Turuncuhat v2" (Cihaz Sahibi, Location identifier, Sicil No…).
// v2 sütunlarını eski (kanonik) adlara çevirir; v2'de boş değer "-" yazılır. Backend'deki tablo: backend/src/thAlias.js (AYNI olmalı).
const TH_ALIASES = [
  ["Sahibi", "Cihaz Sahibi"],
  ["Konum Kategorisi", "Location identifier"],
  ["Cihaz Sahibinin Sicili", "Cihaz Sahibinin Sicil No"],
  ["Cihaz Sahibinin Maili", "Cihaz Sahibinin Mail Adresi"],
  ["Asset", "Varlık Adı"],
  ["Varlık Barkodu", "Barkod"],
  ["Sahibi Firma", "Cihaz Sahibi Firma"],
  ["Cihaz Sahibinin LBS'i", "LBS"],
];
export function normalizeThRow(row) {
  for (const [canon, alt] of TH_ALIASES) {
    if (row[canon] !== undefined || row[alt] === undefined) continue;
    const v = row[alt];
    row[canon] = typeof v === "string" && v.trim() === "-" ? "" : v;
  }
  return row;
}
