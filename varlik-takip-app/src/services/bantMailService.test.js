import test from "node:test";
import assert from "node:assert/strict";
import { buildBantMail, diffVsAverage, resolveBantRecipient, groupWarningOffices } from "./bantMailService.js";

const line = (o = {}) => ({ hat: "INT_SOL_PR", bandwidth: "4.59 Mb/s", bandwidthMbps: 4.59, avgBandwidthMbps: 8.83, seviyeMbps: 7.5, seviye: "7.50 Mb/s", tarih: "2026-09-21 03:00:03", isWarning: true, durum: "-%15", ...o });

test("uyarılı ofis: konu, sayı, hat satırı ve averaja göre fark", () => {
  const m = buildBantMail({ officeCode: "ABV1-SD1", officeName: "ABIDJAN SATIS OFISI", lines: [line(), line({ hat: "INT_TT_PR", isWarning: false, durum: "Ortalama Dahilinde", bandwidthMbps: 9, avgBandwidthMbps: 9 })] });
  assert.match(m.subject, /Uyarısı — ABIDJAN SATIS OFISI \(ABV1-SD1\) \(1 hatta düşüş\)/);
  assert.equal(m.warnCount, 1);
  assert.ok(m.html.includes("INT_SOL_PR") && m.html.includes("-48%")); // (4.59-8.83)/8.83
  assert.ok(m.html.includes("Ortalama Dahilinde"));
  assert.ok(m.text.includes("INT_SOL_PR"));
});

test("hepsi normal: bilgilendirme konusu, uyarı cümlesi yok", () => {
  const m = buildBantMail({ officeCode: "ALA1-SD1", lines: [line({ isWarning: false, durum: "Ortalama Dahilinde", bandwidthMbps: 22.1, avgBandwidthMbps: 22.5 })] });
  assert.match(m.subject, /^Ofis Bant Genişliği Bilgilendirmesi — ALA1-SD1$/);
  assert.ok(!m.html.includes("servis sağlayıcınız"));
});

test("eksik veriler '—' olur; undefined / NaN / null basılmaz", () => {
  const m = buildBantMail({ officeCode: "X1", lines: [{ hat: "", bandwidthMbps: null, avgBandwidthMbps: undefined, seviyeMbps: NaN, tarih: "", isWarning: false }] });
  for (const bad of ["undefined", "NaN", "null"]) assert.ok(!m.html.includes(bad) && !m.text.includes(bad), bad);
  assert.ok(m.html.includes("—"));
  assert.ok(m.notes.some((n) => n.includes("eksik")));
});

test("kapasite / kullanım verisi yoksa sütun çıkmaz ve not düşülür; varsa sütun eklenir", () => {
  const without = buildBantMail({ officeCode: "X1", lines: [line()] });
  assert.ok(!/<th[^>]*>Kapasite/.test(without.html) && !/<th[^>]*>Kullanım Oranı/.test(without.html)); // not metni "Kapasite…" içerir, sütun başlığı olmamalı
  assert.ok(without.notes.some((n) => n.includes("Kapasite ve kullanım oranı")));
  const withCap = buildBantMail({ officeCode: "X1", lines: [line({ capacityMbps: 50, usagePct: 72 })] });
  assert.ok(/<th[^>]*>Kapasite/.test(withCap.html) && /<th[^>]*>Kullanım Oranı/.test(withCap.html) && withCap.html.includes("%72") && withCap.html.includes("50 Mb/s"));
  assert.ok(!withCap.notes.some((n) => n.includes("Kapasite ve kullanım oranı")));
});

test("HTML kaçışı: ofis/hat adındaki özel karakterler zararsız", () => {
  const m = buildBantMail({ officeCode: "X<1>", officeName: 'A "B" & C', lines: [line({ hat: "<script>alert(1)</script>" })] });
  assert.ok(!m.html.includes("<script>") && m.html.includes("&lt;script&gt;"));
  assert.ok(m.html.includes("A &quot;B&quot; &amp; C"));
});

test("İngilizce şablon", () => {
  const m = buildBantMail({ officeCode: "X1", lines: [line()], lang: "en" });
  assert.match(m.subject, /Office Bandwidth Alert/);
  assert.ok(m.html.includes("Hello,") && m.html.includes("Line"));
});

test("diffVsAverage", () => {
  assert.equal(diffVsAverage(5, 10), -50);
  assert.equal(diffVsAverage(12, 10), 20);
  assert.equal(diffVsAverage(5, 0), null);
  assert.equal(diffVsAverage(null, 10), null);
});

test("alıcı çözümü: kod eşleşir, ad üzerinden kardeş satırın maili kullanılır, yoksa boş", () => {
  const rows = [
    { kod: "ABJ1-SD1", locationName: "ABIDJAN SATIS OFISI", mail: "" },
    { kod: "ABJ0-SD1", locationName: "ABIDJAN SATIS OFISI", mail: "abj@mhy.com.tr" },
    { kod: "ZZZ1-SD1", locationName: "BOS OFIS", mail: "" },
  ];
  assert.deepEqual(resolveBantRecipient(rows, "ABJ1-SD1"), { mail: "abj@mhy.com.tr", officeName: "ABIDJAN SATIS OFISI" });
  assert.deepEqual(resolveBantRecipient(rows, "ZZZ1-SD1"), { mail: "", officeName: "BOS OFIS" });
  assert.deepEqual(resolveBantRecipient(rows, "YOK"), { mail: "", officeName: "" });
});

test("uyarılı ofisleri gruplar", () => {
  const rows = [line({ location: "A1" }), line({ location: "A1", isWarning: false }), line({ location: "B1", isWarning: false }), line({ location: "C1" })];
  const g = groupWarningOffices(rows);
  assert.deepEqual(g.map((x) => x.officeCode), ["A1", "C1"]);
  assert.equal(g[0].lines.length, 2);
});
