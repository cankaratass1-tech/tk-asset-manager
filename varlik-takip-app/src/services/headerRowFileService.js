// Rapor dosyalarında başlık satırı sabit değildir (üstteki rapor başlığı/boş satır sayısı değişebilir). Normalde beklenen satıra
// (fallback) bakılır; orada gerekli sütunlar yoksa ilk 20 satırda gerekli sütunları EN ÇOK içeren satır başlık sayılır.
// Backend'deki aynı mantık: backend/src/excelSource.js detectHeaderRow. Gerekli sütunlar: backend/src/fileSchemas.js SCHEMAS.*.required
import * as XLSX from "xlsx";

export const REQUIRED_COLUMNS = {
  th: ["Seri No", ["Sahibi", "Cihaz Sahibi"], "Model", ["Konum Kategorisi", "Location identifier"], ["Owner Username", "Cihaz Sahibinin Sicili", "Cihaz Sahibinin Sicil No"]],
  sccm: ["Hostname", "Serial Number", "Type", "Model", "LastLogon UserName", "LastLogonTime", "IPAddresses"],
  monitor: ["ID Monitor Serial Number", "Hostname", "Username"],
  inaktif: ["Seri No", "Sahibi", ["Asset", "Model"], "Cihaz Sahibinin LBS'i"],
  disk: [["Name", "Device ID", "Hostname"], ["Free Space", "C Free Space MB"], ["Size", "C Size MB"]],
  lokasyon: [["Açık Lokasyon Adı", "Lokasyon"], ["Lokasyon Kodu", "Caption"], ["Mail Adresi", "Node_CP_ContactMail"], "IP_Address"],
  bsod: [["Machine Name", "MachineName", "Hostname", "Computer Name", "Cihaz"], ["Application Name", "ApplicationName", "BSOD", "Stop Code", "Bugcheck"]],
};

const norm = (v) => String(v ?? "").trim().toLowerCase();

// sheet: XLSX çalışma sayfası. Dönen: başlık satırının 0-tabanlı indeksi (bulunamazsa fallback).
export function findHeaderRow(sheet, requiredColumns, fallback) {
  if (!sheet) return fallback;
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", range: { s: { r: 0, c: 0 }, e: { r: 19, c: 60 } } });
  const score = (r) => {
    const cells = new Set((grid[r] || []).map(norm));
    return requiredColumns.filter((g) => (Array.isArray(g) ? g : [g]).some((a) => cells.has(norm(a)))).length;
  };
  let best = fallback, bestScore = score(fallback);
  for (let r = 0; r < grid.length; r++) {
    const sc = score(r);
    if (sc > bestScore) { best = r; bestScore = sc; }
  }
  return bestScore > 0 ? best : fallback;
}
