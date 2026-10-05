// IT Operations Dashboard için İnaktif Cihazlar ve Disk Alanı gerçek verisinden özet/istatistik
// hesaplar. Hiçbir sayı uydurulmaz; Disk Alanı eşikleri kullanıcıyla netleştirilen sabit
// değerlerdir (bkz. konuşma) — Excel'de bu eşiği belirten bir sütun yoktur, SCCM raporu zaten
// "belirtilen MB'den az boş alanı olan" cihazları listeler.
export const DISK_THRESHOLDS_GB = { criticalMax: 10, warningMax: 20 };

export function classifyDisk(freeSpaceGb) {
  if (freeSpaceGb == null || !Number.isFinite(freeSpaceGb)) return "unknown";
  if (freeSpaceGb <= DISK_THRESHOLDS_GB.criticalMax) return "critical";
  if (freeSpaceGb <= DISK_THRESHOLDS_GB.warningMax) return "warning";
  return "normal";
}

function topByCount(rows, keyFn, n) {
  const counts = new Map();
  rows.forEach((r) => {
    const key = keyFn(r);
    if (!key || key === "—") return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

// rows: realInaktifAll (App.jsx) — company filtresi dashboard'da opsiyonel olarak uygulanır
export function computeInaktifDashboard(rows, { company } = {}) {
  const scoped = company && company !== "all" ? rows.filter((r) => r.company === company) : rows;
  return {
    total: scoped.length,
    topLocations: topByCount(scoped, (r) => r.location, 10),
  };
}

// rows: realDiskAll (App.jsx)
export function computeDiskDashboard(rows) {
  let critical = 0, warning = 0, normal = 0, unknown = 0;
  rows.forEach((r) => {
    const cls = classifyDisk(r.freeSpaceGb);
    if (cls === "critical") critical++;
    else if (cls === "warning") warning++;
    else if (cls === "normal") normal++;
    else unknown++;
  });
  const criticalRows = rows.filter((r) => classifyDisk(r.freeSpaceGb) === "critical");
  return {
    total: rows.length,
    critical,
    warning,
    normal,
    unknown,
    topCriticalSites: topByCount(criticalRows, (r) => r.siteCode, 10),
  };
}

// Zimmet için mismatch satırları (office alanına göre) — bkz. zimmetService.getAllMismatchRows
// company opsiyonel — Ana Sayfa'daki Şirket filtresiyle tutarlı olsun diye (bkz. konuşma:
// "Genel Trend" paneli, computeInaktifDashboard ile aynı desende) eklendi.
export function computeZimmetLocationBreakdown(mismatchRows, n = 10, { company } = {}) {
  const scoped = company && company !== "all" ? mismatchRows.filter((r) => r.company === company) : mismatchRows;
  return topByCount(scoped, (r) => r.office, n);
}

// Ana Sayfa "Genel Trend" paneli için — İnaktif Cihazlar ve Zimmet Uyuşmazlığı'nı AYNI lokasyon
// ekseninde birleştirir (bkz. konuşma: Sage Intelligence tarzı bar+line trend grafiği örneği).
// Lokasyon kümesi: iki listenin de en çok kayıt taşıyan N'i birleştirilip (union), her biri için
// her iki sayı da hesaplanır — sadece birinde üst sırada olan bir lokasyon diğerinde 0 görünsün
// diye (yok sayılmasın).
export function computeCombinedLocationTrend(inaktifRows, zimmetMismatchRows, { company, topN = 8 } = {}) {
  const scopedInaktif = company && company !== "all" ? inaktifRows.filter((r) => r.company === company) : inaktifRows;
  const scopedZimmet = company && company !== "all" ? zimmetMismatchRows.filter((r) => r.company === company) : zimmetMismatchRows;

  const inaktifTop = topByCount(scopedInaktif, (r) => r.location, topN);
  const zimmetTop = topByCount(scopedZimmet, (r) => r.office, topN);

  const inaktifMap = new Map(inaktifTop.map((it) => [it.key, it.count]));
  const zimmetMap = new Map(zimmetTop.map((it) => [it.key, it.count]));

  const locations = Array.from(new Set([...inaktifMap.keys(), ...zimmetMap.keys()]))
    .sort((a, b) => (zimmetMap.get(b) || 0) + (inaktifMap.get(b) || 0) - ((zimmetMap.get(a) || 0) + (inaktifMap.get(a) || 0)))
    .slice(0, topN);

  return locations.map((loc) => {
    const inaktif = inaktifMap.get(loc) || 0;
    const zimmet = zimmetMap.get(loc) || 0;
    const denom = inaktif + zimmet;
    return { location: loc, inaktif, zimmet, oranPct: denom ? Math.round((zimmet / denom) * 100) : 0 };
  });
}
