import { MOCK_DATA } from "../data/mockData";

// Örnek (sahte) veri yalnızca geliştirmede VITE_USE_MOCK_DATA=true ile açılır; üretim/exe derlemesinde kapalıdır,
// bu yüzden veri yüklenmeden önce hiçbir sahte kayıt görünmez.
export const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === "true";
const SOURCE = USE_MOCK_DATA ? MOCK_DATA : {};
import { DEPARTMENTS } from "../data/constants";

// API entegrasyon noktası: gövde fetch() çağrısına dönüşecek, dönüş şekli (satır dizisi) sabit kalmalı
export function getReportRows(deptId, reportType) {
  return SOURCE[deptId]?.[reportType] || [];
}

export function getDeptAssetCount(deptId) {
  return (SOURCE[deptId]?.inaktif?.length || 0) + (SOURCE[deptId]?.disk?.length || 0);
}

export function computeDeptReportStats(deptId, reportType) {
  const rows = getReportRows(deptId, reportType);
  const matched = rows.filter((r) => r.matched).length;
  return { total: rows.length, matched, unmatched: rows.length - matched };
}

export function computeReportStatsByDept(reportType) {
  return DEPARTMENTS.map((d) => ({ dept: d, ...computeDeptReportStats(d.id, reportType) }));
}
