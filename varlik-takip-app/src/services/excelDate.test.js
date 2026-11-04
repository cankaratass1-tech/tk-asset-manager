import test from "node:test";
import assert from "node:assert/strict";
import { excelSerialToText, normalizeDateColumns } from "./excelDate.js";
import { daysSince } from "./comparisonService.js";

test("Excel seri numarası okunur tarihe çevrilir (gün ve saat), tam gün ise yalnız tarih", () => {
  assert.equal(excelSerialToText(46286.3356018519), "2026-09-21 08:03:16");
  assert.equal(excelSerialToText("46286.3356018519"), "2026-09-21 08:03:16");
  assert.equal(excelSerialToText(45765), "2025-04-18");
  assert.equal(excelSerialToText(25569), "1970-01-01");
});

test("Tarih olmayan değerler olduğu gibi kalır: küçük/büyük sayılar, metin, boş", () => {
  for (const v of [0, 1, 152094, 485726, 16489528, "TKAO", "", "2026-09-29 10:00:00", "172.19.47.148", "123", null, undefined]) assert.equal(excelSerialToText(v), v, String(v));
});

test("normalizeDateColumns: yalnız başlığında date/time/tarih geçen sütunlar çevrilir; değişmediyse aynı nesne döner", () => {
  const raw = { Hostname: "H1", LastLogonTime: 46286.3356018519, "BIOS Date": 45511, "Garanti Başlangıç Tarihi": 45765.5, RAM: 16489528, "C Size MB": 152094 };
  const out = normalizeDateColumns(raw);
  assert.equal(out.LastLogonTime, "2026-09-21 08:03:16");
  assert.equal(out["BIOS Date"], "2024-08-07");
  assert.equal(out.RAM, 16489528);
  assert.equal(out["C Size MB"], 152094);
  const clean = { Hostname: "H", LastLogonTime: "2026-09-29 10:00:00" };
  assert.equal(normalizeDateColumns(clean), clean);
});

test("Çevrilen tarih gün hesabında kullanılabilir (daysSince)", () => {
  const d = daysSince(excelSerialToText(46286.3356018519));
  assert.ok(Number.isFinite(d), "çevrilmeden geçersiz tarih olurdu");
  assert.equal(daysSince("46286.3356018519"), null, "ham sayı tarih olarak okunamaz (hata buydu)");
});
