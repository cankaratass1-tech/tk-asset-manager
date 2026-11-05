// GÖNDERMEDEN ÖNCE ÖNİZLEME testi: "E-posta Gönder"e basınca mail sunucuya gitmeden önce önizleme penceresi (konu, alıcı, içerik) açılır;
// İptal edilirse hiçbir mail gitmez ve geçmişe "Gönderilemedi" yazılmaz; Gönder denirse mail gider.
//   node e2e/mailonizleme.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";
import { startSmtpSink } from "./mailkit.mjs";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const sink = await startSmtpSink();
const be = await startBackend({ port: 5090 });
const browser = await launchBrowser();
try {
  await fetch(`${be.base}/api/settings/smtp`, { method: "PUT", headers: { "Content-Type": "application/json", ...be.adminHeaders }, body: JSON.stringify({ host: "127.0.0.1", port: String(sink.port), username: "", password: "", fromAddress: "smoke@test.local", useTls: false }) });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => { localStorage.setItem("varlikTakip.sessionToken", t); localStorage.setItem("varlikTakip.mailGate", "on"); }, be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 140)));
  await page.goto(be.base); await page.waitForTimeout(3500);
  await page.locator('text="Zimmet Uyuşmazlığı"').first().click(); await page.waitForTimeout(1800);
  await page.locator("div", { hasText: /^Zimmet Hatalı$/ }).first().click(); await page.waitForTimeout(900);
  await page.locator("tbody tr input[type=checkbox]").first().check(); await page.waitForTimeout(300);
  const mailButton = () => page.getByRole("button", { name: /^E-posta Gönder$/ }).first();
  const wait = (ms) => page.waitForTimeout(ms);

  // 1) basınca önizleme açılır, mail HENÜZ gitmemiştir
  await mailButton().click();
  await page.waitForSelector("[data-mail-preview]", { timeout: 8000 });
  const txt = await page.locator("[data-mail-preview]").innerText();
  check("Gönder'e basınca önizleme penceresi açılıyor (konu + alıcı + içerik)", /Konu:/.test(txt) && /Alıcı:/.test(txt) && txt.length > 200);
  check("Önizlemede yalnız Gönder / İptal düğmeleri var (Tümünü gönder yok)", (await page.locator("[data-gate-send]").count()) === 1 && (await page.locator("[data-gate-all]").count()) === 0 && (await page.locator("[data-gate-cancel]").count()) === 1);
  await wait(1500);
  check("Onay verilmeden mail sunucuya gitmedi", sink.messages.length === 0, `${sink.messages.length} mail`);

  // 2) İptal → hiçbir mail gitmez, "iptal edildi" bildirimi
  await page.locator("[data-gate-cancel]").click();
  await wait(2500);
  const body1 = await page.innerText("body");
  check("İptal: mail gitmedi", sink.messages.length === 0, `${sink.messages.length} mail`);
  check("İptal: 'Gönderim iptal edildi' bildirimi (hata/başarısız yazısı yok)", /Gönderim iptal edildi/.test(body1) && !/e-posta başarısız|Gönderilemedi — /.test(body1));
  check("İptal sonrası önizleme penceresi kapandı", (await page.locator("[data-mail-preview]").count()) === 0);

  // 3) Tekrar dene → Gönder → mail gider
  await page.waitForTimeout(9000); // iptal penceresi (8 sn) dolsun
  const box = page.locator("tbody tr input[type=checkbox]").first();
  if (!(await box.isChecked())) await box.check();
  await mailButton().click();
  await page.waitForSelector("[data-mail-preview]", { timeout: 8000 });
  await page.locator("[data-gate-send]").click();
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && sink.messages.length === 0) await wait(300);
  check("Gönder: onaydan sonra mail gitti", sink.messages.length >= 1, `${sink.messages.length} mail`);
  await wait(2000);
  check("Sayfa hatası yok", problems.length === 0, problems.join(" | "));
  await ctx.close();
} finally {
  await browser.close(); await be.stop(); await sink.stop();
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
