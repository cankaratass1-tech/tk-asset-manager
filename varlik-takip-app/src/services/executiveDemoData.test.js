import test from "node:test";
import assert from "node:assert/strict";
import { buildDemoSnapshots, DEMO_COMPANIES, DEMO_WEEKS } from "./executiveDemoData.js";
import { computeExecutive, companiesIn } from "./executiveMetrics.js";

const NOW = Date.UTC(2026, 9, 22, 12);

test("örnek veri: deterministik, 4 rapor, haftalık kayıtlar, son kayıt 'şimdi'", () => {
  const a = buildDemoSnapshots(NOW), b = buildDemoSnapshots(NOW);
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a).sort(), ["disk", "inaktif", "kullanilmayan", "zimmet"]);
  Object.values(a).forEach((list) => {
    assert.equal(list.length, DEMO_WEEKS);
    assert.equal(list[list.length - 1].capturedAt, new Date(NOW).toISOString());
    assert.equal(new Date(list[1].capturedAt) - new Date(list[0].capturedAt), 7 * 86400000);
  });
  assert.deepEqual(companiesIn(a), [...DEMO_COMPANIES].sort());
});

test("örnek veri: tüm dönemlerde hesap çalışır, önceki dönem de vardır; inaktif iyileşir, zimmet kötüleşir", () => {
  const s = buildDemoSnapshots(NOW);
  ["week", "month", "quarter"].forEach((range) => {
    const e = computeExecutive(s, { range });
    assert.equal(e.status, "ok", range);
    assert.ok(e.previous, `${range}: önceki dönem`);
    assert.equal(e.current.net, e.current.openEnd - e.current.openStart, range);
  });
  const e = computeExecutive(s, { range: "month" });
  assert.equal(e.categories.find((k) => k.id === "inaktif").state, "improved");
  assert.equal(e.categories.find((k) => k.id === "zimmet").state, "worse");
  DEMO_COMPANIES.forEach((c) => assert.equal(computeExecutive(s, { range: "month", company: c }).status, "ok", c));
});
