// İlk kurulum: SETUP_CODE_REQUIRED=0 ile Kurulum Kodu istenmez (yalnız kullanıcı adı + şifre); varsayılan modda kod hâlâ zorunludur.
//   node e2e/kurulumkodsuz.mjs [--skip-build]
import { buildFrontend, launchBrowser } from "./harness.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };
const backendDir = join(import.meta.dirname, "..", "..", "backend");

async function boot(port, extraEnv) {
  const dataDir = mkdtempSync(join(tmpdir(), "varlik-kurulum-"));
  const env = { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir, ADMIN_USERNAME: "a", ADMIN_PASSWORD: "b-b-b-b-b-b", ...extraEnv };
  delete env.SETUP_CODE_REQUIRED; Object.assign(env, extraEnv);
  const child = spawn(process.execPath, ["server.js"], { cwd: backendDir, env, stdio: ["ignore", "pipe", "pipe"] });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* açılmadı */ } await new Promise((r) => setTimeout(r, 500)); }
  return { base, stop: () => { child.kill(); try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* kilitli olabilir */ } } };
}

const browser = await launchBrowser();
try {
  // ---- 1) kodsuz mod ----
  const a = await boot(5120, { SETUP_CODE_REQUIRED: "0" });
  const st = await (await fetch(`${a.base}/api/auth/setup-status`)).json();
  check("setup-status: needsSetup=true, requiresSetupCode=false", st.needsSetup === true && st.requiresSetupCode === false, JSON.stringify(st));
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
  await page.goto(a.base); await page.waitForTimeout(2500);
  const body = await page.locator("body").innerText();
  check("Kurulum ekranı geldi, 'Kurulum Kodu' alanı YOK", /İlk Kurulum/.test(body) && !/Kurulum Kodu/.test(body));
  await page.locator("[data-setup-username]").fill("testkullanici");
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill("Sifre12345"); await pw.nth(1).fill("Sifre12345");
  await page.getByRole("button", { name: /Oluştur|Kaydet|Kur|Devam/i }).first().click();
  await page.waitForTimeout(3500);
  const after = await page.locator("body").innerText();
  check("Kullanıcı oluşturuldu ve uygulama açıldı (kod girilmeden)", /Ana Sayfa/.test(after) && !/İlk Kurulum/.test(after));
  check("Üstte oluşturulan kullanıcı görünüyor", /testkullanici/i.test(after));
  const st2 = await (await fetch(`${a.base}/api/auth/setup-status`)).json();
  check("Sonrasında kurulum bitti (needsSetup=false)", st2.needsSetup === false);
  const again = await fetch(`${a.base}/api/auth/setup-master`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "baska", password: "Sifre12345" }) });
  check("İkinci Master oluşturulamaz (409)", again.status === 409, String(again.status));
  check("Sayfa hatası yok", errs.length === 0, errs.join(" | "));
  await ctx.close(); a.stop();

  // ---- 2) varsayılan mod: kod zorunlu ----
  const b = await boot(5121, { SETUP_CODE: "kod-kod-kod-kod-1234" });
  const stb = await (await fetch(`${b.base}/api/auth/setup-status`)).json();
  check("Varsayılan: requiresSetupCode=true", stb.requiresSetupCode === true, JSON.stringify(stb));
  const noCode = await fetch(`${b.base}/api/auth/setup-master`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "x", password: "Sifre12345" }) });
  check("Varsayılan: kodsuz kurulum reddedilir (403)", noCode.status === 403, String(noCode.status));
  const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
  await p2.goto(b.base); await p2.waitForTimeout(2500);
  check("Varsayılan: Kurulum Kodu alanı görünür", /Kurulum Kodu/.test(await p2.locator("body").innerText()));
  await ctx2.close(); b.stop();
} finally {
  await browser.close();
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
