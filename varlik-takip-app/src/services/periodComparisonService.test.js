import test from "node:test";
import assert from "node:assert/strict";
import { latestPeriodSummary, groupSnapshotsByPeriod } from "./periodComparisonService.js";

const snap = (date, keys) => ({ capturedAt: `${date}T10:00:00Z`, devices: keys.map((k) => ({ key: k, serial: k })) });

// 1 Eylül: a,b,c — 20 Eylül: a,b,d — 28 Eylül: b,d,e
const history = [snap("2026-09-01", ["a", "b", "c"]), snap("2026-09-20", ["a", "b", "d"]), snap("2026-09-28", ["b", "d", "e"])];

test("haftalık: en az 7 gün önceki en yeni kayıtla (20 Eylül) karşılaştırır", () => {
  const s = latestPeriodSummary(history, "week");
  assert.deepEqual([s.cozulen, s.yeniTespit, s.devamEden], [1, 1, 2]); // a çözüldü, e yeni, b+d bekliyor
  assert.equal(s.cozumOrani, 33);
});

test("aylık: 30 gün önceki kayıt yoksa en eski kayıtla (1 Eylül) karşılaştırır — sonuç haftalıktan farklı", () => {
  const s = latestPeriodSummary(history, "month");
  assert.deepEqual([s.cozulen, s.yeniTespit, s.devamEden], [2, 2, 1]); // a,c çözüldü; d,e yeni; b bekliyor
  assert.equal(s.cozumOrani, 67);
});

test("cihaz listeleri döner", () => {
  const s = latestPeriodSummary(history, "week");
  assert.deepEqual(s.lists.cozulen.map((d) => d.key), ["a"]);
  assert.deepEqual(s.lists.yeniTespit.map((d) => d.key), ["e"]);
});

test("tek kayıt veya aynı gün kayıtları: null", () => {
  assert.equal(latestPeriodSummary([snap("2026-09-01", ["a"])], "week"), null);
  assert.equal(latestPeriodSummary([snap("2026-09-01", ["a"]), { ...snap("2026-09-01", ["b"]), capturedAt: "2026-09-01T18:00:00Z" }], "week"), null);
});

test("günlük mod: aynı günün son anlık kaydı o günü temsil eder; farklı günler ayrı dönem", () => {
  const snap = (capturedAt, n) => ({ capturedAt, devices: Array.from({ length: n }, (_, i) => ({ key: `k${i}` })) });
  const periods = groupSnapshotsByPeriod([snap("2026-09-05T08:00:00", 3), snap("2026-09-05T20:00:00", 5), snap("2026-09-06T09:00:00", 4)], "day");
  assert.deepEqual(periods.map((p) => p.label), ["2026-09-05", "2026-09-06"]);
  assert.equal(periods[0].snapshot.devices.length, 5);
});
