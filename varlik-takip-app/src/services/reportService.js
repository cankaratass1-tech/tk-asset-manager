import { MOCK_DATA } from "../data/mockData";
import { DEPARTMENTS } from "../data/constants";

// API entegrasyon noktası: gövde fetch() çağrısına dönüşecek, dönüş şekli (satır dizisi) sabit kalmalı
export function getReportRows(deptId, reportType) {
  return MOCK_DATA[deptId]?.[reportType] || [];
}

export function getDeptAssetCount(deptId) {
  return (MOCK_DATA[deptId]?.inaktif?.length || 0) + (MOCK_DATA[deptId]?.disk?.length || 0);
}

export function computeDeptReportStats(deptId, reportType) {
  const rows = getReportRows(deptId, reportType);
  const matched = rows.filter((r) => r.matched).length;
  return { total: rows.length, matched, unmatched: rows.length - matched };
}

export function computeReportStatsByDept(reportType) {
  return DEPARTMENTS.map((d) => ({ dept: d, ...computeDeptReportStats(d.id, reportType) }));
}
