// "Tüm verileri temizle" testi: Ayarlar > Veri Girişi'ndeki buton iki adımlı onayla yüklenmiş tüm raporları siler; kullanıcı ve SMTP ayarı korunur;
// sayfa yenilenince tüm ekranlar boş görünür. DEMO_DATA=0 ile örnek veriye geri dönüş de kapalıdır.
//   node e2e/verileritemizle.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";
import { readdirSync } from "node:fs";

process.env.DEMO_DATA = "0";
if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const be = await startBackend({ port: 5120 });
const browser = await launchBrowser();
const auth = { Authorization: `Bearer ${be.token}`, "Content-Type": "application/json" };
try {
  await fetch(`${be.base}/api/settings/smtp`, { method: "PUT", headers: { "Content-Type": "application/json", ...be.adminHeaders }, body: JSON.stringify({ host: "127.0.0.1", port: "2525", username: "", password: "", fromAddress: "smoke@test.local", useTls: false }) });
  const th0 = await (await fetch(`${be.base}/api/reports/th-envanteri`, { headers: auth })).json();
  check("Başlangıçta yüklü veri var (TuruncuHat okunuyor)", th0.ok !== false && (th0.rows || []).length > 0, `${(th0.rows || []).length} satır`);

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 140)));
  await page.goto(be.base); await page.waitForTimeout(3500);
  await page.getByRole("button", { name: /Ayarlar/ }).click(); await page.waitForTimeout(1000);
  await page.locator('input[type="text"]').first().fill("smoke-admin");
  await page.locator('input[type="password"]').first().fill(be.adminHeaders["x-admin-password"]);
  await page.getByRole("button", { name: "Giriş Yap" }).click(); await page.waitForTimeout(1200);
  await page.locator("text=Veri Girişi").last().click(); await page.waitForTimeout(800);

  check("Veri Girişi'nde 'Tüm verileri temizle' düğmesi var", (await page.locator("[data-clear-data]").count()) === 1);
  await page.locator("[data-clear-data]").click();
  check("Tek tıkla silinmiyor: onay sorusu çıkıyor", (await page.locator("[data-clear-data-confirm]").count()) === 1 && /Emin misiniz/.test(await page.locator("[data-clear-data-panel]").innerText()));
  await page.locator("[data-clear-data-cancel]").click();
  const still = await (await fetch(`${be.base}/api/reports/th-envanteri`, { headers: auth })).json();
  check("Vazgeç: veri silinmedi", (still.rows || []).length > 0);

  await page.locator("[data-clear-data]").click();
  await Promise.all([page.waitForEvent("load", { timeout: 15000 }), page.locator("[data-clear-data-confirm]").click()]);
  await page.waitForTimeout(3500);

  const th1 = await (await fetch(`${be.base}/api/reports/th-envanteri`, { headers: auth })).json();
  const sccm1 = await (await fetch(`${be.base}/api/reports/sccm`, { headers: auth })).json();
  check("Temizlik sonrası TuruncuHat ve SCCM verisi yok", !(th1.rows || []).length && !(sccm1.rows || []).length);
  const files = readdirSync(`${be.dataDir || ""}/imports`).length;
  check("imports klasörü boşaldı", files === 0, `${files} dosya`);
  const me = await fetch(`${be.base}/api/auth/me`, { headers: auth });
  check("Kullanıcı oturumu / hesabı korundu", me.ok);
  const smtp = await (await fetch(`${be.base}/api/settings/smtp`, { headers: be.adminHeaders })).json();
  check("SMTP ayarı korundu", (smtp.host || "") === "127.0.0.1", smtp.host);
  const body = await page.innerText("body");
  check("Sayfa yenilendi ve ekranlar boş ('Henüz veri yüklenmedi')", /Henüz veri yüklenmedi|Henüz karşılaştırılacak veri yok/.test(body));
  check("Sayfa hatası yok", problems.length === 0, problems.join(" | "));
  await ctx.close();
} finally {
  await browser.close(); await be.stop();
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
