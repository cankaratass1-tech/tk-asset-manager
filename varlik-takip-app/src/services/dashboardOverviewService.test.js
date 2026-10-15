import test from "node:test";
import assert from "node:assert/strict";
import { combinedPeriodSummary } from "./dashboardOverviewService.js";

const dev = (key, company) => ({ key, company });
const snap = (capturedAt, devices) => ({ capturedAt, devices });

// iki dönem (Ağustos → Eylül); inaktif + zimmet şirket bilgili, disk şirket bilgisiz
const snapshots = {
  inaktif: [snap("2026-08-15T10:00:00Z", [dev("a1", "AJET"), dev("a2", "AJET"), dev("t1", "TKAO")]), snap("2026-09-15T10:00:00Z", [dev("a1", "AJET"), dev("a3", "AJET")])],
  zimmet: [snap("2026-08-15T10:00:00Z", [dev("z1", "TKAO")]), snap("2026-09-15T10:00:00Z", [dev("z1", "TKAO"), dev("z2", "TKAO")])],
  disk: [snap("2026-08-15T10:00:00Z", [dev("d1"), dev("d2")]), snap("2026-09-15T10:00:00Z", [dev("d1")])],
};

test("şirket seçili değilse tüm raporlar (disk dahil) toplanır", () => {
  const s = combinedPeriodSummary(snapshots, "month");
  assert.equal(s.latest.acikBulgu, 2 + 2 + 1); // inaktif 2 + zimmet 2 + disk 1
  assert.equal(s.prev.acikBulgu, 3 + 1 + 2);
});

test("AJET: yalnızca AJET cihazları, disk hariç", () => {
  const s = combinedPeriodSummary(snapshots, "month", { company: "AJET" });
  assert.equal(s.latest.acikBulgu, 2); // a1, a3
  assert.equal(s.prev.acikBulgu, 2); // a1, a2
  assert.equal(s.latest.perReportOpen.disk, 0);
  assert.equal(s.latest.cozulen, 1); // a2 çözüldü
  assert.equal(s.latest.yeni, 1); // a3 yeni
  assert.equal(s.latest.devam, 1); // a1 devam
});

test("TKAO: inaktif 0 (t1 çözüldü) + zimmet 2, disk hariç", () => {
  const s = combinedPeriodSummary(snapshots, "month", { company: "TKAO" });
  assert.equal(s.latest.acikBulgu, 2);
  assert.equal(s.latest.cozulen, 1); // t1
  assert.equal(s.latest.yeni, 1); // z2
  assert.equal(s.latest.devam, 1); // z1
});
