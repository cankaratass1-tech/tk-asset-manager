import test from "node:test";
import assert from "node:assert/strict";
import { computeExecutive, windowSummary, buildSeries, bucketSeries, buildNarrative, buildRisks, buildDetailRows, companiesIn, companyComparison, rowsToCsv, pctDelta, metricsFrom } from "./executiveMetrics.js";

const dev = (key, company = "AJET") => ({ key, company });
const range = (prefix, from, to, company = "AJET") => Array.from({ length: to - from }, (_, i) => dev(`${prefix}${from + i}`, company));
const snap = (day, devices) => ({ capturedAt: `2026-09-${String(day).padStart(2, "0")}T10:00:00Z`, devices });

// 214 açık → 187 açık (27 çözüldü, yeni yok): görev tanımındaki örnek
const example = { inaktif: [snap(1, range("a", 0, 214)), snap(8, range("a", 27, 214))] };

test("örnek: 214 → 187 ise azalma 27 cihaz ve yaklaşık %12,6", () => {
  const e = computeExecutive(example, { range: "week", reports: ["inaktif"] });
  assert.equal(e.status, "ok");
  assert.equal(e.current.openStart, 214);
  assert.equal(e.current.openEnd, 187);
  assert.equal(e.current.delta, -27);
  assert.equal(e.current.decreasePct, 12.6);
  assert.equal(e.current.cozulen, 27);
  assert.equal(e.current.yeni, 0);
  assert.equal(e.current.net, -27);
  assert.equal(e.current.resolveRate, 12.6);
});

test("açık değişimi her zaman net iş akışına eşit (yeni − çözülen)", () => {
  const snaps = { inaktif: [snap(1, range("a", 0, 100)), snap(8, [...range("a", 10, 100), ...range("n", 0, 25)])] };
  const e = computeExecutive(snaps, { range: "week", reports: ["inaktif"] });
  assert.equal(e.current.cozulen, 10);
  assert.equal(e.current.yeni, 25);
  assert.equal(e.current.net, 15);
  assert.equal(e.current.delta, 15);
  assert.equal(e.current.delta, e.current.net);
  assert.equal(e.current.decreasePct, -15); // artış = negatif azalma
});

test("başlangıç 0 ise yüzde ve çözüm oranı hesaplanmaz (null), bölme hatası yok", () => {
  const snaps = { inaktif: [snap(1, []), snap(8, range("n", 0, 5))] };
  const e = computeExecutive(snaps, { range: "week", reports: ["inaktif"] });
  assert.equal(e.current.openStart, 0);
  assert.equal(e.current.decreasePct, null);
  assert.equal(e.current.resolveRate, null);
  assert.equal(e.current.net, 5);
  assert.equal(pctDelta(5, 0), null);
  assert.equal(pctDelta(null, 3), null);
});

test("veri yok / tek kayıt / geçersiz aralık durumları", () => {
  assert.equal(computeExecutive({}, { range: "week" }).status, "empty");
  assert.equal(computeExecutive({ inaktif: [snap(1, [dev("a")])] }, { range: "week", reports: ["inaktif"] }).status, "insufficient");
  assert.equal(computeExecutive(example, { range: "custom", from: "2026-09-10", to: "2026-09-05", reports: ["inaktif"] }).status, "invalid-range");
  assert.equal(computeExecutive({ inaktif: [{ capturedAt: "bozuk", devices: [] }] }, { range: "week", reports: ["inaktif"] }).status, "empty");
  assert.equal(windowSummary([], {}), null);
  assert.equal(metricsFrom([]), null);
});

test("kısa geçmiş 'partial' işaretlenir ve önceki dönem uydurulmaz", () => {
  const e = computeExecutive(example, { range: "month", reports: ["inaktif"] }); // 30 gün isteniyor, 7 gün var
  assert.equal(e.status, "ok");
  assert.equal(e.partial, true);
  assert.equal(e.spanDays, 7);
  assert.equal(e.previous, null);
  assert.equal(e.changes, null);
  assert.ok(buildNarrative(e).notes.some((n) => /kısa/.test(n)));
});

test("yeterli geçmişte önceki eşdeğer dönem hesaplanır ve değişim doğru", () => {
  const snaps = { inaktif: [snap(1, range("a", 0, 100)), snap(8, range("a", 10, 100)), snap(15, range("a", 40, 100))] };
  const e = computeExecutive(snaps, { range: "week", reports: ["inaktif"] });
  assert.equal(e.partial, false);
  assert.deepEqual([e.current.openStart, e.current.openEnd], [90, 60]);
  assert.deepEqual([e.previous.openStart, e.previous.openEnd], [100, 90]);
  assert.equal(e.changes.cozulen.abs, 30 - 10);
  assert.equal(e.changes.openEnd.abs, 60 - 90);
  assert.equal(e.changes.openEnd.pct, -33.3);
});

test("rapor toplamı: kategoriler toplanır, eksik rapor işaretlenir", () => {
  const snaps = { inaktif: [snap(1, range("a", 0, 10)), snap(8, range("a", 4, 10))], zimmet: [snap(1, range("z", 0, 5)), snap(8, range("z", 0, 8))] };
  const e = computeExecutive(snaps, { range: "week", reports: ["inaktif", "zimmet", "disk"] });
  assert.deepEqual(e.missing, ["disk"]);
  assert.equal(e.current.openStart, 10 + 5);
  assert.equal(e.current.openEnd, 6 + 8);
  assert.equal(e.categories.find((k) => k.id === "inaktif").state, "improved");
  assert.equal(e.categories.find((k) => k.id === "zimmet").state, "worse");
  assert.equal(e.categories.find((k) => k.id === "disk").state, "nodata");
  assert.ok(buildNarrative(e).notes.some((n) => /dahil edilmedi/.test(n)));
});

test("şirket filtresi: şirket bazlı sayılar toplamla tutarlı", () => {
  const mk = (day, a, t) => snap(day, [...range("a", 0, a, "AJET"), ...range("t", 0, t, "TKAO")]);
  const snaps = { inaktif: [mk(1, 85, 102), mk(8, 70, 90)] };
  assert.deepEqual(companiesIn(snaps), ["AJET", "TKAO"]);
  const all = computeExecutive(snaps, { range: "week", reports: ["inaktif"] });
  const cmp = companyComparison(snaps, { range: "week", reports: ["inaktif"] });
  const sum = (k) => cmp.reduce((a, c) => a + c.result.current[k], 0);
  assert.equal(all.current.openEnd, 160);
  assert.equal(sum("openEnd"), all.current.openEnd);
  assert.equal(sum("cozulen"), all.current.cozulen);
  assert.equal(sum("yeni"), all.current.yeni);
  assert.equal(cmp[0].result.current.openEnd, 70);
  assert.equal(cmp[1].result.current.resolveRate, round(12 / 102 * 100));
});
const round = (x) => Math.round(x * 10) / 10;

test("grafik serisi: uç noktalar KPI ile aynı, her adımda açık farkı = yeni − çözülen", () => {
  const snaps = {
    inaktif: [snap(1, range("a", 0, 50)), snap(3, range("a", 5, 50)), snap(5, [...range("a", 5, 45), ...range("n", 0, 4)]), snap(8, [...range("a", 12, 45), ...range("n", 0, 4)])],
    zimmet: [snap(1, range("z", 0, 20)), snap(8, range("z", 3, 20))],
  };
  const e = computeExecutive(snaps, { range: "week", reports: ["inaktif", "zimmet"] });
  const pts = buildSeries(snaps, e, { reports: ["inaktif", "zimmet"] });
  assert.equal(pts[0].open, e.current.openStart);
  assert.equal(pts[pts.length - 1].open, e.current.openEnd);
  assert.equal(pts[0].cozulen, null);
  for (let i = 1; i < pts.length; i++) assert.equal(pts[i].open - pts[i - 1].open, pts[i].yeni - pts[i].cozulen, `nokta ${i}`);
  const b = bucketSeries(pts, e.spanDays);
  for (let i = 1; i < b.length; i++) assert.equal(b[i].open - b[i - 1].open, b[i].yeni - b[i].cozulen, `grup ${i}`);
  assert.equal(b[b.length - 1].open, e.current.openEnd);
  // kaydı olmayan raporun ara noktasında nokta uydurulmaz: zimmet yalnız uçlarda var → ara noktalar önceki kayıtla taşınır, uçlar birebir
  assert.equal(pts.length, 4);
});

test("özel tarih aralığı: seçilen uzunlukta pencere ve önceki dönem", () => {
  const snaps = { inaktif: [{ capturedAt: "2026-08-30T10:00:00Z", devices: range("a", 0, 100) }, snap(1, range("a", 0, 100)), snap(5, range("a", 10, 100)), snap(9, range("a", 30, 100)), snap(13, range("a", 50, 100))] };
  const e = computeExecutive(snaps, { range: "custom", from: "2026-09-09", to: "2026-09-13", reports: ["inaktif"] });
  assert.equal(e.days, 5); // 9-13 Eylül, iki uç gün dahil
  // taban: aralığın başlangıcından (9 Eylül 00:00) önceki son kayıt = 5 Eylül; 9 Eylül kaydı aralığın içindedir
  assert.deepEqual([e.current.openStart, e.current.openEnd], [90, 50]);
  assert.deepEqual([e.previous.openStart, e.previous.openEnd], [100, 90]);
  const earlier = computeExecutive(snaps, { range: "custom", from: "2026-09-01", to: "2026-09-09", reports: ["inaktif"] });
  assert.equal(earlier.current.openEnd, 70); // 9 Eylül sonrası kayıtlar dışarıda
});

test("yönetici özeti: rakamlar veriden gelir; kategori artışı ve çözüm oranı farkı uyarıya girer", () => {
  const mk = (day, a, t) => snap(day, [...range("a", 0, a, "AJET"), ...range("t", 0, t, "TKAO")]);
  const snaps = { inaktif: [mk(1, 100, 100), mk(8, 60, 95)], zimmet: [snap(1, range("z", 0, 10)), snap(8, range("z", 0, 14))] };
  const e = computeExecutive(snaps, { range: "week", reports: ["inaktif", "zimmet"] });
  const cmp = companyComparison(snaps, { range: "week", reports: ["inaktif", "zimmet"] });
  const n = buildNarrative(e, cmp);
  assert.match(n.positive, /110 → 109|azald/);
  assert.match(n.attention, /Hatalı zimmet/);
  assert.match(n.attention, /AJET/);
  assert.match(n.action, /nedensellik/);
  const risks = buildRisks(e);
  assert.ok(risks.some((r) => /Hatalı zimmet/.test(r.text)));
  assert.equal(buildNarrative({ status: "insufficient" }).positive, "Yeterli veri yok.");
  assert.deepEqual(buildRisks({ status: "empty" }), []);
});

test("detay tablosu: satırlar şirket × konu × dönem, CSV güvenli", () => {
  const mk = (day, a, t) => snap(day, [...range("a", 0, a, "AJET"), ...range("t", 0, t, "TKAO")]);
  const snaps = { inaktif: [mk(1, 10, 10), mk(8, 8, 9)] };
  const rows = buildDetailRows(snaps, { range: "week" }, { reports: ["inaktif"] });
  assert.equal(rows.length, 3); // Tümü, AJET, TKAO
  const all = rows.find((r) => r.sirket === "Tümü");
  assert.deepEqual([all.acik, all.cozulen, all.yeni, all.net], [17, 3, 0, -3]);
  assert.equal(all.degisimPct, -15);
  const csv = rowsToCsv([{ a: 'x;"y"', b: 2 }], [{ key: "a", label: "A" }, { key: "b", label: "B" }]);
  assert.ok(csv.startsWith("﻿A;B\r\n"));
  assert.ok(csv.includes('"x;""y"""'));
});
