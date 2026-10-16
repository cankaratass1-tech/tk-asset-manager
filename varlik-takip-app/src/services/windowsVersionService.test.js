import test from "node:test";
import assert from "node:assert/strict";
import { parseWindowsVersion, windowsSupport, describeWindows, matchesWindowsQuery } from "./windowsVersionService.js";

test("metin + build birleştirilir: Windows 11 Enterprise + 10.0.22631 → Windows 11 23H2", () => {
  const i = parseWindowsVersion("Microsoft Windows 11 Enterprise", "10.0.22631");
  assert.equal(i.label, "Windows 11 23H2");
  assert.equal(i.build, 22631);
  assert.equal(i.edition, "enterprise");
});

test("yalnızca build numarasından sürüm bulunur (19045 → Windows 10 22H2)", () => {
  assert.equal(parseWindowsVersion("10.0.19045").label, "Windows 10 22H2");
  assert.equal(parseWindowsVersion("19045").label, "Windows 10 22H2");
});

test("metindeki sürüm kodu kullanılır; parantezli build desteklenir", () => {
  const i = parseWindowsVersion("Windows 10 Pro 21H2 (19044)");
  assert.equal(i.label, "Windows 10 21H2");
  assert.equal(i.edition, "pro");
});

test("sürüm anlaşılamazsa null (uydurma yok)", () => {
  assert.equal(parseWindowsVersion(""), null);
  assert.equal(parseWindowsVersion(null, undefined), null);
  assert.equal(parseWindowsVersion("Ubuntu 22.04"), null);
});

test("destek durumu: Windows 10 22H2 2025-10-14'te sona erdi", () => {
  const i = parseWindowsVersion("Windows 10 Enterprise", "10.0.19045");
  assert.equal(windowsSupport(i, new Date("2026-10-16")).status, "ended");
  assert.equal(windowsSupport(i, new Date("2025-09-01")).status, "ending");
  assert.equal(windowsSupport(i, new Date("2024-01-01")).status, "supported");
});

test("Enterprise ile Home/Pro tarihleri farklıdır (Windows 11 23H2)", () => {
  const ent = parseWindowsVersion("Windows 11 Enterprise", "10.0.22631");
  const pro = parseWindowsVersion("Windows 11 Pro", "10.0.22631");
  const now = new Date("2026-01-15");
  assert.equal(windowsSupport(ent, now).status, "supported"); // Ent: 2026-11-10
  assert.equal(windowsSupport(pro, now).status, "ended"); // Pro: 2025-11-11
});

test("tabloda olmayan sürüm 'unknown' döner ve nedenini söyler; tahmini tarih işaretlenir", () => {
  const unknown = { family: "Windows 11", release: "30H2", label: "Windows 11 30H2", edition: "", build: null, raw: "" };
  const s = windowsSupport(unknown);
  assert.equal(s.status, "unknown");
  assert.match(s.detail, /WINDOWS_LIFECYCLE/);
  const est = windowsSupport(parseWindowsVersion("Windows 11 Enterprise", "10.0.26200"), new Date("2026-10-16"));
  assert.equal(est.verified, false);
  assert.match(est.detail, /tahmini/);
});

test("arama: 'windows 10', 'win11', '22h2', build ve destek durumu eşleşir", () => {
  const d = describeWindows("Microsoft Windows 10 Enterprise", "10.0.19045");
  for (const q of ["windows 10", "Win10", "22h2", "19045", "destek sona erdi", "Windows 10 22H2"]) assert.equal(matchesWindowsQuery(d, q), true, q);
  for (const q of ["windows 11", "23h2", "linux"]) assert.equal(matchesWindowsQuery(d, q), false, q);
  assert.equal(matchesWindowsQuery(null, "windows"), false);
  assert.equal(matchesWindowsQuery(d, ""), false);
});
