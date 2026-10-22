// Gönderim günlüğü testi: backend her gönderimi (başarılı/başarısız) kendisi kaydeder, gönderen oturumdan gelir (sahte yazılamaz),
// liste gövdeyi taşımaz, tek kayıt taşır; Gönderim Geçmişi'nde "E-postayı gör" mailin kendisini açar.
//   node e2e/sendlogcheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";
import { startSmtpSink } from "./mailkit.mjs";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const sink = await startSmtpSink();
const be = await startBackend({ port: 5072 });
const browser = await launchBrowser();
const auth = { "Content-Type": "application/json", Authorization: `Bearer ${be.token}` };
const smtp = (port) => fetch(`${be.base}/api/settings/smtp`, { method: "PUT", headers: { "Content-Type": "application/json", ...be.adminHeaders }, body: JSON.stringify({ host: "127.0.0.1", port: String(port), username: "", password: "", fromAddress: "smoke@test.local", useTls: false }) });
try {
  await smtp(sink.port);
  const send = (extra = {}) => fetch(`${be.base}/api/mail/send`, { method: "POST", headers: auth, body: JSON.stringify({ to: "ali@x.com, veli@x.com", subject: "Günlük testi", text: "düz metin", html: "<p>Merhaba <b>Ali</b></p>", ...extra }) }).then((r) => r.json());

  const ok = await send({ username: "baskasi" }); // gövdede sahte gönderen verilse bile yok sayılmalı
  check("Başarılı gönderim logId döndürüyor", ok.ok && !!ok.logId, ok.logId);
  const one = await fetch(`${be.base}/api/mail/send-log/${ok.logId}`, { headers: auth }).then((r) => r.json());
  check("Günlük: gönderen oturumdan geliyor (gövdedeki sahte ad yok sayıldı)", one.username === "smoke", one.username);
  check("Günlük: alıcılar, konu, gövde, sonuç, kaynak kayıtlı", one.to.length === 2 && one.subject === "Günlük testi" && one.html.includes("<b>Ali</b>") && one.ok === true && one.source === "manuel" && !!one.at);
  const list = await fetch(`${be.base}/api/mail/send-log`, { headers: auth }).then((r) => r.json());
  check("Liste gövdeyi taşımıyor ama 'hasBody' diyor", list.length === 1 && list[0].html === undefined && list[0].hasBody === true);

  await smtp(1); // kapalı bir porta → gönderim başarısız
  const bad = await send({ subject: "Başarısız deneme" });
  check("Başarısız gönderim de kaydediliyor (hata nedeniyle)", bad.ok === false && !!bad.logId);
  const badLog = await fetch(`${be.base}/api/mail/send-log/${bad.logId}`, { headers: auth }).then((r) => r.json());
  check("Başarısız kayıtta ok=false ve hata metni var", badLog.ok === false && badLog.error.length > 0, badLog.error.slice(0, 60));
  check("Olmayan kimlik 404", (await fetch(`${be.base}/api/mail/send-log/yok`, { headers: auth })).status === 404);
  await smtp(sink.port);

  // Gönderim Geçmişi: kayıt sendLogIds taşır → detay panelinde "Maili gör" → önizleme
  await fetch(`${be.base}/api/mail/history`, { method: "POST", headers: auth, body: JSON.stringify({ id: 9101, date: "22.10.2026", time: "10:00:00", isoDate: "2026-10-22T10:00:00Z", report: "Zimmet Uyuşmazlığı", reportType: "zimmet", dept: "AJET", company: "all", recipients: 2, status: "Başarılı", senderUsername: "smoke", sendLogIds: [ok.logId], details: [{ location: "Ali Veli", to: "ali@x.com", count: 1, ok: true }] }) });
  await fetch(`${be.base}/api/mail/history`, { method: "POST", headers: auth, body: JSON.stringify({ id: 9102, date: "22.10.2026", time: "11:00:00", isoDate: "2026-10-22T11:00:00Z", report: "Kullanılmayan Cihazlar", reportType: "kullanilmayan", dept: "AJET", company: "all", recipients: 1, status: "Başarılı", senderUsername: "smoke", details: [{ location: "Ankara Ofis", to: "ofis@x.com", count: 2, ok: true, devices: [{ serial: "SN-TEST-777", hostname: "PC-ANK-01" }, { serial: "SN-TEST-888", hostname: "PC-ANK-02" }] }] }) });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 120)));
  await page.goto(be.base);
  await page.waitForTimeout(4000);
  await page.locator('text="Gönderim Geçmişi"').first().click();
  await page.waitForTimeout(1500);
  await page.locator("tbody tr", { hasText: "Zimmet Uyuşmazlığı" }).first().click();
  await page.waitForTimeout(800);
  check("Detay panelinde 'Gönderilen E-postalar (1)' ve 'E-postayı gör' düğmesi", (await page.locator("[data-sent-mails] button").count()) === 1 && /Gönderilen E-postalar \(1\)/.test(await page.locator("[data-sent-mails]").innerText()));
  await page.locator("[data-sent-mails] button").click();
  await page.waitForSelector("[data-mail-preview]", { timeout: 8000 });
  const modal = await page.locator("[data-mail-preview]").innerText();
  check("Önizlemede konu, alıcılar ve mailin gövdesi görünüyor", modal.includes("Günlük testi") && modal.includes("ali@x.com") && modal.includes("veli@x.com") && modal.includes("Merhaba Ali"));
  await page.locator("[data-mail-preview] span", { hasText: "✕" }).click(); // önizleme penceresini kapat
  await page.locator("[data-mail-preview]").waitFor({ state: "detached", timeout: 3000 });
  const realRows = () => page.locator("tbody tr", { hasNotText: "Filtreyle eşleşen kayıt yok" }).count();
  const rowsAll = await realRows();
  await page.locator('input[placeholder*="seri no"]').fill("sn-test-888");
  await page.waitForTimeout(600);
  check("Geçmişte seri no ile arama: yalnız o cihaza e-posta giden gönderim bulunuyor", rowsAll >= 2 && (await realRows()) === 1, `${rowsAll} → ${await realRows()}`);
  await page.locator('input[placeholder*="seri no"]').fill("pc-ank-01");
  await page.waitForTimeout(500);
  check("Hostname ile arama da aynı gönderimi buluyor", (await realRows()) === 1);
  await page.locator('input[placeholder*="seri no"]').fill("yok-boyle-bir-cihaz");
  await page.waitForTimeout(600);
  check("Olmayan seri no aramasında kayıt bulunmuyor", (await realRows()) === 0);
  await page.locator('input[placeholder*="seri no"]').fill("pc-ank-01");
  await page.waitForTimeout(600);
  await page.locator("tbody tr").first().click();
  await page.waitForTimeout(700);
  check("Detay panelinde bildirilen cihazlar (adet ve seri no) görünüyor", /2 cihaz: SN-TEST-777, SN-TEST-888/.test(await page.locator("[data-detail-devices]").first().innerText()));
  check("Sayfa hatası yok", problems.length === 0, problems.join(" | "));
} finally {
  await browser.close();
  await be.stop();
  await sink.stop();
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
