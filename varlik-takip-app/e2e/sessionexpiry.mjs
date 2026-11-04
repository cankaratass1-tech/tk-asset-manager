// Oturum ortada geçersiz olursa (süre doldu / jeton silindi): dosya yüklemesi sessizce "kalıcı kaydedilemedi" deyip bozuk kalmamalı;
// kullanıcı uyarıyla giriş ekranına dönmeli, yeniden girişte yükleme kalıcı kaydedilebilmeli.
//   node e2e/sessionexpiry.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const be = await startBackend({ port: 5092 });
const browser = await launchBrowser();
const work = mkdtempSync(join(tmpdir(), "varlik-sess-"));
try {
  const cur = join(import.meta.dirname, "..", "..", "backend", "demo-data", "current");
  const diskFile = join(work, "DiskAlani_20260901000000.xlsx");
  writeFileSync(diskFile, readFileSync(join(cur, readdirSync(cur).find((f) => f.startsWith("DiskAlani")))));

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("sess-init")) { localStorage.setItem("varlikTakip.sessionToken", t); sessionStorage.setItem("sess-init", "1"); } }, be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 140)));
  await page.goto(be.base); await page.waitForTimeout(3500);
  await page.getByRole("button", { name: /Ayarlar/ }).click(); await page.waitForTimeout(1200);
  // yanlış admin şifresi: hata mesajı çıkar ama uygulamadan ÇIKIŞ yapılmaz (oturum sürer)
  await page.locator('input[type="text"]').first().fill("smoke-admin");
  await page.locator('input[type="password"]').first().fill("yanlis-sifre-123");
  await page.getByRole("button", { name: "Giriş Yap" }).click(); await page.waitForTimeout(1500);
  check("Yanlış admin şifresinde uygulamadan çıkış yapılmıyor (giriş ekranına dönülmüyor)", (await page.locator("[data-session-notice]").count()) === 0 && (await page.locator('input[type="password"]').count()) === 1);
  check("Yanlış admin şifresinde hata mesajı görünüyor", /hatalı/i.test(await page.locator("body").innerText()));
  check("Yanlış admin şifresinden sonra oturum jetonu duruyor", (await page.evaluate(() => localStorage.getItem("varlikTakip.sessionToken"))) !== null);
  await page.locator('input[type="text"]').first().fill("smoke-admin");
  await page.locator('input[type="password"]').first().fill(be.adminHeaders["x-admin-password"]);
  await page.getByRole("button", { name: "Giriş Yap" }).click(); await page.waitForTimeout(1500);
  check("Doğru admin şifresiyle Ayarlar açılıyor", (await page.locator("text=Veri Girişi").count()) >= 1);
  await page.locator("text=Veri Girişi").last().click(); await page.waitForTimeout(1200);

  // oturum jetonunu geçersiz kıl (başka sekme/kopya tarafından bozulmuş gibi)
  await page.evaluate(() => localStorage.setItem("varlikTakip.sessionToken", "gecersiz.jeton"));
  await page.locator("[data-bulk-input]").setInputFiles([diskFile]);
  await page.waitForSelector("[data-session-notice]", { timeout: 20000 }).catch(() => {});
  const notice = await page.locator("[data-session-notice]").count();
  check("Geçersiz oturumda kullanıcı uyarıyla giriş ekranına döndü", notice === 1, notice ? (await page.locator("[data-session-notice]").innerText()) : "giriş ekranı gelmedi");
  check("Giriş formu görünüyor (uygulama bozuk kalmadı)", (await page.getByRole("button", { name: /Giriş yap/i }).count()) >= 1);

  check("Sayfa hatası yok", problems.length === 0, problems.join(" | "));
  await ctx.close();
} finally {
  await browser.close(); await be.stop();
  rmSync(work, { recursive: true, force: true });
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
