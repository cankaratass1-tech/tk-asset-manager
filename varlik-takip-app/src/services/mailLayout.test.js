import test from "node:test";
import assert from "node:assert/strict";
import { buildBantMail } from "./bantMailService.js";
import { buildLocationIpMail } from "./locationIpService.js";
import { mailShell, infoTable } from "./mailLayout.js";

const bant = buildBantMail({ officeCode: "ABV1-SD1", officeName: "ABIDJAN SATIS OFISI", lines: [{ hat: "INT_SOL_PR", bandwidthMbps: 4.59, avgBandwidthMbps: 8.83, seviyeMbps: 7.5, tarih: "2026-09-21", isWarning: true, durum: "-%15" }] });
const loc = buildLocationIpMail({ owner: "ABIDJAN SATIS OFISI", hostname: "ABJ1B99", serial: "PF6Q9X80", deviceModel: "ThinkPad T14", location: "172.28.250" });

test("Bant ve Lokasyon/IP mailleri aynı çerçeveyi (başlık bandı, çerçeveli gövde, alt bilgi) kullanır", () => {
  for (const frag of ["background:#243a5e;color:#fff;padding:14px 18px;border-radius:6px 6px 0 0;", "border:1px solid #d0d7de;border-top:none;padding:16px 18px;border-radius:0 0 6px 6px;", "max-width:760px", "font-size:12px;color:#8a8886;"]) {
    assert.ok(bant.html.includes(frag), `bant: ${frag}`);
    assert.ok(loc.html.includes(frag), `lokasyon/ip: ${frag}`);
  }
});

test("Lokasyon/IP maili: konu/dinamik veriler korunur, bilgi alanı var, undefined/NaN/null basılmaz, metin sürümü tutarlı", () => {
  assert.equal(loc.subject, "Lokasyon/IP Uyuşmazlığı — Cihaz Bilgilerinizin Güncellenmesi Gerekiyor");
  for (const v of ["ABJ1B99", "PF6Q9X80", "ABIDJAN SATIS OFISI", "172.28.250", "LOKASYON / IP UYUŞMAZLIĞI", "Computer name"]) assert.ok(loc.html.includes(v), v);
  for (const bad of ["undefined", "NaN", "null"]) assert.ok(!loc.html.includes(bad) && !loc.text.includes(bad), bad);
  assert.ok(loc.text.includes("ABJ1B99") && loc.text.includes("ABIDJAN SATIS OFISI"));
});

test("Eksik alanlar (seri no, model, IP) için satır hiç basılmaz; HTML kaçırılır", () => {
  const m = buildLocationIpMail({ owner: "<b>X</b>", hostname: "H&1", serial: "", deviceModel: "", location: "" });
  assert.ok(!m.html.includes("Seri no") && !m.html.includes("Cihaz modeli") && !m.html.includes("Cihazın IP bloğu"));
  assert.ok(m.html.includes("&lt;b&gt;X&lt;/b&gt;") && m.html.includes("H&amp;1"));
});

test("mailShell / infoTable: boş değer atlanır, opsiyonel bölümler yoksa çıkmaz", () => {
  const t = infoTable([["A", "1"], ["B", ""], ["C", null]]);
  assert.ok(t.includes(">A<") && !t.includes(">B<") && !t.includes(">C<"));
  const h = mailShell({ eyebrow: "E", title: "T" });
  assert.ok(!h.includes("<p style=\"margin:0 0 10px;\">") && !h.includes("margin:14px 0 0;"));
});
