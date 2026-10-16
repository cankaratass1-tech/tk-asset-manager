import test from "node:test";
import assert from "node:assert/strict";
import { deriveHistoryEvents, sourceUpdateEvent, categoryOf } from "./deviceHistoryService.js";

const snap = (capturedAt, present, owner = "") => ({ capturedAt, present, owner, location: "" });

test("rapora girdi / çıktı yalnız geçişlerde üretilir; ilk kayıt ayrıca etiketlenir", () => {
  const ev = deriveHistoryEvents({ zimmet: [snap("2026-06-01T00:00:00Z", true), snap("2026-07-01T00:00:00Z", true), snap("2026-08-01T00:00:00Z", false), snap("2026-09-01T00:00:00Z", true)] });
  assert.deepEqual(ev.map((e) => e.type), ["İlk Kayıtlı Tespit", "Rapordan Çıktı", "Rapora Girdi"]);
});

test("zimmet devri: sahip değişti → kimden → kime; TH tarihi iki snapshot arasındaysa o tarih kullanılır", () => {
  const tl = { zimmet: [snap("2026-06-01T00:00:00Z", true, "Ali"), snap("2026-08-01T00:00:00Z", true, "Veli")] };
  const exact = deriveHistoryEvents(tl, { ownerUpdatedAt: "2026-07-10" }).find((e) => e.type === "Zimmet Devri");
  assert.match(exact.description, /Ali → Veli.*TuruncuHat son güncelleme/);
  assert.equal(exact.ts.slice(0, 10), "2026-07-10");
  const noisy = deriveHistoryEvents(tl, { ownerUpdatedAt: "2026-09-20" }).find((e) => e.type === "Zimmet Devri");
  assert.match(noisy.description, /fark edildiği tarih/);
  assert.equal(noisy.ts, "2026-08-01T00:00:00Z");
});

test("aynı devir iki raporda görünse tek olay; sahip aynıysa devir yok; sahip bilinmiyorsa devir yok", () => {
  const tl = {
    zimmet: [snap("2026-06-01T00:00:00Z", true, "Ali"), snap("2026-08-01T00:00:00Z", true, "Veli")],
    inaktif: [snap("2026-06-01T00:00:00Z", true, "Ali"), snap("2026-08-01T00:00:00Z", true, "Veli")],
  };
  assert.equal(deriveHistoryEvents(tl).filter((e) => e.type === "Zimmet Devri").length, 1);
  assert.equal(deriveHistoryEvents({ zimmet: [snap("2026-06-01T00:00:00Z", true, "Ali"), snap("2026-08-01T00:00:00Z", true, "Ali")] }).filter((e) => e.type === "Zimmet Devri").length, 0);
  assert.equal(deriveHistoryEvents({ zimmet: [snap("2026-06-01T00:00:00Z", true, ""), snap("2026-08-01T00:00:00Z", true, "Veli")] }).filter((e) => e.type === "Zimmet Devri").length, 0);
});

test("kaynak güncelleme olayı yalnız geçerli tarihle; kategori eşleme", () => {
  assert.equal(sourceUpdateEvent({ ownerUpdatedAt: "", owner: "x" }), null);
  assert.equal(sourceUpdateEvent({ ownerUpdatedAt: "geçersiz", owner: "x" }), null);
  assert.match(sourceUpdateEvent({ ownerUpdatedAt: "2026-05-02", owner: "Ali" }).description, /güncel zimmetli: Ali/);
  assert.equal(categoryOf("Mail"), "mail");
  assert.equal(categoryOf("Zimmet Devri"), "zimmet");
  assert.equal(categoryOf("Rapordan Çıktı"), "rapor");
  assert.equal(categoryOf("Durum Değişikliği"), "not");
});
