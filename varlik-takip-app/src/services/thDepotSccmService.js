// "TuruncuHat Zimmet Depoda / SCCM Çalışıyor Raporu" — TuruncuHat'ta (TH) depoda görünen ama
// SCCM'de aktif/çalışıyor görünen cihazlar. Ayarlar > Gizli/Gelişmiş Raporlar altında gösterilir.
// Saf fonksiyonlar: backend/React bağımlılığı yok, doğrudan test edilebilir.
//
// Eşleştirme: TH "Seri No" <-> SCCM "Serial Number" (mapSccmRow boşsa Hostname'i serial yapar) —
// comparisonService.js'in TH/SCCM eşleştirmesiyle aynı anahtar.
//
// Filtre sırası (computeThDepotSccmRows içinde AÇIKÇA bu sırayla uygulanır):
//   1. TH'de durumu "Zimmet Depoda" olanları belirle
//   2. SCCM'de eşleşen ve çalışıyor/aktif görünenleri belirle
//   3. IP'si 172.29.4.0/24 bloğunda olanları çıkar
//   4. TH'de durumu "İşlemdeki Malzeme Emri" olanları çıkar
//   5. Kalanı raporla
import { daysSince, DEFAULT_STALE_DAYS } from "./comparisonService.js";

export const DEPOT_STATUS_LABEL = "Zimmet Depoda";
export const MATERIAL_ORDER_STATUS_LABEL = "İşlemdeki Malzeme Emri";
// Kapsam dışı IP bloğu: 172.29.4.0/24
export const EXCLUDED_CIDR = { base: "172.29.4.0", prefix: 24 };

// TH durum bilgisinin bulunabileceği ham sütunlar. Gerçek export'ta "Zimmet Depoda" /
// "İşlemdeki Malzeme Emri" değerinin hangi sütunda geldiği kesin doğrulanamadığı için (demo
// dosyada bu iki değer yok) hepsi taranır; sütun adı değişirse sadece bu liste güncellenir.
export const TH_STATUS_COLUMNS = [
  "Konum Kategorisi",
  "Durum",
  "Statü",
  "Status",
  "Zimmet Durumu",
  "Sahibi",
  "Cihaz Sahibinin LBS'i",
  "LBS Location Parent",
];

// TH'de "Warehouse" (Konum Kategorisi) mevcut kodda zaten "depoda, zimmetsiz" anlamında
// kullanılıyor (comparisonService.js "Zimmetsiz Kullanım (Depo)") — "Zimmet Depoda" ile aynı kabul edilir.
const DEPOT_LOCATION_CATEGORIES = new Set(["warehouse"]);

// Büyük/küçük harf, Türkçe karakter ve fazla boşluk farklarını yok sayar:
// "İşlemdeki  Malzeme Emri" -> "islemdeki malzeme emri"
export function normalizeText(value) {
  return String(value ?? "")
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

const normSerial = (v) => String(v ?? "").trim().toLowerCase();

function statusValues(thRow) {
  const raw = thRow._raw || {};
  return TH_STATUS_COLUMNS.map((c) => raw[c]).filter((v) => v !== undefined && v !== "");
}

export function isZimmetDepoda(thRow) {
  const target = normalizeText(DEPOT_STATUS_LABEL);
  const raw = thRow._raw || {};
  if (DEPOT_LOCATION_CATEGORIES.has(normalizeText(raw["Konum Kategorisi"] ?? thRow.assignmentType))) return true;
  return statusValues(thRow).some((v) => normalizeText(v).includes(target));
}

export function isIslemdekiMalzemeEmri(thRow) {
  const target = normalizeText(MATERIAL_ORDER_STATUS_LABEL);
  return statusValues(thRow).some((v) => normalizeText(v).includes(target));
}

// Dotted-quad IPv4 -> 32 bit sayı; geçersizse null (ör. "172.29.4", "172.29.4.256", "abc")
export function ipv4ToInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip ?? "").trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function isIpInCidr(ip, cidr = EXCLUDED_CIDR) {
  const value = ipv4ToInt(ip);
  const base = ipv4ToInt(cidr.base);
  if (value === null || base === null) return false;
  const mask = cidr.prefix === 0 ? 0 : (0xffffffff << (32 - cidr.prefix)) >>> 0;
  return (value & mask) >>> 0 === (base & mask) >>> 0;
}

// SCCM "IPAddresses" virgül/noktalı virgül/boşlukla ayrılmış birden fazla IP taşıyabilir
export function parseIpList(ipAddresses) {
  return String(ipAddresses ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Cihazın IP'lerinden BİRİ bile 172.29.4.0/24 içindeyse cihaz kapsam dışıdır
export function hasExcludedIp(ipAddresses) {
  return parseIpList(ipAddresses).some((ip) => isIpInCidr(ip));
}

// SCCM'de çalışıyor/aktif: son giriş (LastLogonTime) staleDays içinde — sccmFileService.js /
// Zimmet Uyuşmazlığı'ndaki "güncel kullanım kanıtı" ile aynı eşik.
export function sccmActivity(sccmRow, staleDays = DEFAULT_STALE_DAYS) {
  const daysAgo = daysSince(sccmRow.lastLogonTime);
  return { active: daysAgo != null && daysAgo <= staleDays, daysAgo };
}

function buildRow(th, sccm, daysAgo, reason) {
  const active = daysAgo != null;
  return {
    rowKey: `th-depot-sccm|${th.serial}`,
    hostname: sccm?.hostname || "—",
    serial: th.serial,
    ip: parseIpList(sccm?.ipAddresses).join(", ") || "—",
    thStatus: DEPOT_STATUS_LABEL,
    sccmStatus: !sccm ? "SCCM'de bulunamadı" : active ? `Çalışıyor (son giriş ${daysAgo} gün önce)` : "Çalışmıyor / son giriş yok",
    lastUser: sccm?.userLabel && sccm.userLabel !== "Tespit Edilemedi" ? sccm.userLabel : "—",
    lastSeen: sccm?.lastLogonTime || "—",
    lastSeenDaysAgo: daysAgo,
    deviceType: th.deviceType || "",
    model: sccm?.deviceModel || th.model || "",
    company: th.company || sccm?.company || "",
    location: th.location && th.location !== "—" ? th.location : sccm?.location || "—",
    reason,
  };
}

// Her aşamanın cihaz listesi (stages) ekranda tıklanabilir filtre olarak gösterilir; rows = final.
export const REASON_IP = "172.29.4.0/24 IP bloğunda";
export const REASON_ORDER = "TuruncuHat'ta İşlemdeki Malzeme Emri";
export const REASON_INCLUDED = "Rapora dahil";

export function computeThDepotSccmRows({ thRows = [], sccmRows = [], staleDays = DEFAULT_STALE_DAYS } = {}) {
  const sccmBySerial = new Map();
  sccmRows.forEach((s) => {
    const key = normSerial(s.serial);
    if (key && !sccmBySerial.has(key)) sccmBySerial.set(key, s);
  });

  const stages = { depot: [], sccmMatched: [], sccmActive: [], excludedIp: [], excludedMaterialOrder: [], final: [] };

  // 1) TH'de "Zimmet Depoda"
  const depot = thRows.filter(isZimmetDepoda);
  depot.forEach((th) => {
    const sccm = sccmBySerial.get(normSerial(th.serial));
    const act = sccm ? sccmActivity(sccm, staleDays) : null;
    stages.depot.push(buildRow(th, sccm, act?.active ? act.daysAgo : null, sccm ? (act.active ? "SCCM'de çalışıyor" : "SCCM'de çalışmıyor (kapsam dışı)") : "SCCM'de yok (kapsam dışı)"));
  });

  // 2) SCCM'de eşleşen ve çalışıyor görünen
  const active = [];
  depot.forEach((th) => {
    const sccm = sccmBySerial.get(normSerial(th.serial));
    if (!sccm) return;
    const act = sccmActivity(sccm, staleDays);
    stages.sccmMatched.push(buildRow(th, sccm, act.active ? act.daysAgo : null, act.active ? "SCCM'de çalışıyor" : "SCCM'de çalışmıyor (kapsam dışı)"));
    if (act.active) active.push({ th, sccm, daysAgo: act.daysAgo });
  });
  active.forEach(({ th, sccm, daysAgo }) => stages.sccmActive.push(buildRow(th, sccm, daysAgo, "SCCM'de çalışıyor")));

  // 3) 172.29.4.0/24 IP bloğunu çıkar
  const afterIp = active.filter(({ th, sccm, daysAgo }) => {
    if (hasExcludedIp(sccm.ipAddresses)) {
      stages.excludedIp.push(buildRow(th, sccm, daysAgo, REASON_IP));
      return false;
    }
    return true;
  });

  // 4) TH'de "İşlemdeki Malzeme Emri" olanları çıkar
  const afterOrder = afterIp.filter(({ th, sccm, daysAgo }) => {
    if (isIslemdekiMalzemeEmri(th)) {
      stages.excludedMaterialOrder.push(buildRow(th, sccm, daysAgo, REASON_ORDER));
      return false;
    }
    return true;
  });

  // 5) Kalanı raporla
  afterOrder.forEach(({ th, sccm, daysAgo }) => stages.final.push(buildRow(th, sccm, daysAgo, REASON_INCLUDED)));

  const stats = {
    thTotal: thRows.length,
    depot: stages.depot.length,
    sccmMatched: stages.sccmMatched.length,
    sccmActive: stages.sccmActive.length,
    excludedIp: stages.excludedIp.length,
    excludedMaterialOrder: stages.excludedMaterialOrder.length,
    final: stages.final.length,
  };
  return { rows: stages.final, stages, stats };
}
