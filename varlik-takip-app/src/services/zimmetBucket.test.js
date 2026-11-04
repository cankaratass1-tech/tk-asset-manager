import test from "node:test";
import assert from "node:assert/strict";
import { zimmetBucket, computeOverallZimmetStats, isZimmetUnverified } from "./zimmetService.js";

const rows = [
  { statusTag: "Zimmet Doğru", matched: true, assignmentType: "User" },
  { statusTag: "Zimmet Hatalı", matched: false, assignmentType: "User" },
  { statusTag: "Zimmet Doğru + Monitör Uyuşmazlığı", matched: false, assignmentType: "User", monitorIssue: true },
  { statusTag: "Birden Fazla Zimmet Mevcut", matched: false, assignmentType: "User" },
  { statusTag: "Zimmetsiz Kullanım (Depo)", matched: false, assignmentType: "Warehouse" },
  { statusTag: "TH Kaydı YOK", matched: false, assignmentType: "" },
  { statusTag: "Kullanım Kaydı Yok", matched: false, assignmentType: "User" },
  { statusTag: "Müdürlük Zimmeti (OBS)", matched: true, assignmentType: "OBS" },
  { statusTag: "SCCM'de Bulunamadı", matched: false, assignmentType: "OBS" },
  { statusTag: "Monitör Raporu'nda Bulunamadı", matched: false, assignmentType: "OBS" },
];

test("Her zimmet satırı tam bir kovaya girer; OBS hiçbir zaman hatalı / doğru / doğrulanamayan sayılmaz", () => {
  const b = rows.map(zimmetBucket);
  assert.deepEqual(b, ["ok", "bad", "bad", "bad", "bad", "unverified", "unverified", "obs", "obs", "obs"]);
  assert.ok(rows.filter((r) => r.assignmentType === "OBS").every((r) => zimmetBucket(r) === "obs"));
});

test("Dashboard istatistiği: toplam = doğru + hatalı + doğrulanamayan + OBS", () => {
  const s = computeOverallZimmetStats(rows);
  assert.deepEqual({ ok: s.ok, bad: s.bad, noRecord: s.noRecord, obs: s.obs }, { ok: 1, bad: 3, noRecord: 2, obs: 3 });
  assert.equal(s.ok + s.bad + s.noRecord + s.obs, s.total);
  assert.equal(s.total, rows.length - 1, "depodaki (Warehouse) satır sayıma girmez");
  assert.equal(s.monitorIssueCount, 1);
});

test("Liste segmentleriyle aynı tanım: hatalı = eşleşmeyen ve doğrulanamayan değil", () => {
  const listBad = rows.filter((r) => r.assignmentType !== "OBS" && r.assignmentType !== "Warehouse" && !r.matched && !isZimmetUnverified(r.statusTag)).length;
  assert.equal(listBad, computeOverallZimmetStats(rows).bad);
});
