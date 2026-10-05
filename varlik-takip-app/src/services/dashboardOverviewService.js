// Ana Sayfa "Genel Durum" paneli — finans dashboard'u referansına göre (bkz. konuşma) IT
// operasyon metriklerine uyarlanmış birleşik özet. Dönemsel seri snapshot geçmişinden
// (reportSnapshots) türetilir; anlık sayılar App.jsx'ten geçirilir.
import { groupSnapshotsByPeriod, comparePeriods } from "./periodComparisonService";

// "Açık bulgu" = bu raporların o dönemdeki problemli cihazlarının toplamı.
export const OVERVIEW_REPORTS = ["inaktif", "zimmet", "disk", "kullanilmayan"];

// reportSnapshots: { [reportId]: [snapshot,...] } → dönem dönem birleşik özet.
export function combinedPeriodSummary(reportSnapshots = {}, mode = "month") {
  const perReport = {};
  const labelSet = new Set();
  OVERVIEW_REPORTS.forEach((rep) => {
    const periods = groupSnapshotsByPeriod(reportSnapshots[rep] || [], mode);
    perReport[rep] = new Map(periods.map((p) => [p.label, p.snapshot]));
    periods.forEach((p) => labelSet.add(p.label));
  });
  const labels = [...labelSet].sort();

  const series = labels.map((label, i) => {
    let acikBulgu = 0;
    let cozulen = 0;
    let yeni = 0;
    let devam = 0;
    const perReportOpen = {};
    OVERVIEW_REPORTS.forEach((rep) => {
      const snap = perReport[rep].get(label);
      const open = snap ? (snap.devices || []).length : 0;
      perReportOpen[rep] = open;
      acikBulgu += open;
      if (i > 0) {
        const prevSnap = perReport[rep].get(labels[i - 1]);
        if (prevSnap && snap) {
          const c = comparePeriods(prevSnap, snap).counts;
          cozulen += c.cozulen;
          yeni += c.yeniTespit;
          devam += c.devamEden;
        }
      }
    });
    const taban = devam + cozulen;
    return {
      label,
      acikBulgu,
      cozulen,
      yeni,
      devam,
      perReportOpen,
      cozumOrani: taban > 0 ? Math.round((cozulen / taban) * 100) : null,
      netDegisim: yeni - cozulen, // + ise bulgu arttı
    };
  });

  return {
    labels,
    series,
    latest: series[series.length - 1] || null,
    prev: series[series.length - 2] || null,
    enough: series.length >= 2,
  };
}

// Yüzde değişim (önceki → şimdiki). prev 0 ise null.
export function pctChange(curr, prev) {
  if (prev == null || prev === 0 || curr == null) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

// "Cihaz Sağlığı Durumu" kartının segmentleri — finans waterfall'ın (Toplam Gelir → maliyetler →
// Net Kâr) IT karşılığı: Toplam Cihaz → problem kategorileri → Temiz Cihaz.
// NOT: kategoriler çakışabilir (bir cihaz hem inaktif hem kritik disk olabilir); bu yüzden
// "Temiz" ayrıca verilen distinctProblem sayısından hesaplanır, ara çubuklar kategori büyüklüğüdür.
export function waterfallSegments({ toplamCihaz = 0, inaktif = 0, zimmetHatali = 0, kritikDisk = 0, kullanilmayan = 0, temiz = null }) {
  const temizVal = temiz != null ? temiz : Math.max(0, toplamCihaz - (inaktif + zimmetHatali + kritikDisk + kullanilmayan));
  return [
    { key: "Toplam Cihaz", value: toplamCihaz, kind: "total" },
    { key: "İnaktif", value: inaktif, kind: "down" },
    { key: "Zimmet Hatalı", value: zimmetHatali, kind: "down" },
    { key: "Kritik Disk", value: kritikDisk, kind: "down" },
    { key: "Kullanılmayan", value: kullanilmayan, kind: "down" },
    { key: "Temiz Cihaz", value: temizVal, kind: "result" },
  ];
}
