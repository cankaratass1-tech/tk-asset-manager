// Gerçek İnaktif dosyası (240 satır; NOTEBOOK/DESKTOP/MONITOR/TABLET/IP PHONE/MOBILE PHONE…) arayüzde yalnız Desktop/Notebook göstermeli. Dosya yoksa atlanır.
//   node e2e/gercekinaktif.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { existsSync, readFileSync } from "node:fs";

const F = "C:/Users/Lenovo/Documents/Real/SahibiBilgisiBoşOlan--VarlıkSorumlusuİnaktifOlanCihazlar.xlsx";
if (!existsSync(F)) { console.log("Gerçek dosya bu makinede yok — test atlandı."); process.exit(0); }
if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const wb = XLSX.read(readFileSync(F), { type: "buffer", dense: true });
const src = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { defval: "" });
const byType = {}; src.forEach((r) => { byType[r.Model] = (byType[r.Model] || 0) + 1; });
const isMac = (r) => /^apple$/i.test(String(r.Marka).trim()) || /mac\s?book|imac|mac\s?mini|mac\s?pro|mac\s?studio/i.test(String(r.Asset));
const keepSerials = new Set(src.filter((r) => ["NOTEBOOK", "DESKTOP"].includes(String(r.Model)) && !isMac(r)).map((r) => String(r["Seri No"]).trim()));
const macCount = src.filter((r) => ["NOTEBOOK", "DESKTOP"].includes(String(r.Model)) && isMac(r)).length;
console.log(`Dosyadaki Notebook/Desktop Mac sayısı: ${macCount}`);
const dropSerials = new Set(src.filter((r) => !["NOTEBOOK", "DESKTOP"].includes(String(r.Model)) && !/line$/i.test(String(r.Model)) || /line$/i.test(String(r.Model))).map((r) => String(r["Seri No"]).trim()));
console.log(`Dosyada ${src.length} satır; türler: ${JSON.stringify(byType)}; beklenen kalan: ${keepSerials.size}`);

const be = await startBackend({ port: 5113 });
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 140)));
  await page.goto(be.base); await page.waitForTimeout(3500);
  await page.getByRole("button", { name: /Ayarlar/ }).click(); await page.waitForTimeout(1200);
  await page.locator('input[type="text"]').first().fill("smoke-admin");
  await page.locator('input[type="password"]').first().fill(be.adminHeaders["x-admin-password"]);
  await page.getByRole("button", { name: "Giriş Yap" }).click(); await page.waitForTimeout(1500);
  await page.locator("text=Veri Girişi").last().click(); await page.waitForTimeout(1200);
  await page.locator("[data-bulk-input]").setInputFiles([F]);
  await page.waitForFunction(() => document.querySelectorAll("[data-bulk-row]").length === 1 && document.querySelector("[data-bulk-row]").getAttribute("data-bulk-row") !== "wait", null, { timeout: 60000 });
  const st = await page.locator("[data-bulk-row]").first().getAttribute("data-bulk-row");
  check("Gerçek İnaktif dosyası yüklendi", st === "ok", st);

  const auth = { Authorization: `Bearer ${be.token}` };
  const api = await (await fetch(`${be.base}/api/reports/inaktif-cihazlar`, { headers: auth })).json();
  check("Sunucu: yalnız NOTEBOOK/DESKTOP döner, Mac yok", api.ok && api.rows.length === keepSerials.size && api.rows.every((r) => ["NOTEBOOK", "DESKTOP"].includes(String(r.Model)) && !isMac(r)), `${api.rows?.length} / beklenen ${keepSerials.size}`);

  await page.reload(); await page.waitForTimeout(5000);
  await page.getByText("İnaktif Cihazlar", { exact: true }).first().click(); await page.waitForTimeout(3000);
  const all = page.locator("xpath=//div[normalize-space()='100']/following-sibling::div[normalize-space()='Tümü']").first();
  if (await all.count()) { await all.click(); await page.waitForTimeout(1500); }
  const serials = await page.locator("tbody tr").evaluateAll((trs) => trs.filter((t) => t.querySelector("input[type=checkbox]")).map((t) => (t.querySelectorAll("td")[2]?.innerText || "").split("\n")[0].trim()));
  check("Arayüz: listelenen satır sayısı beklenenle aynı", serials.length === keepSerials.size, `${serials.length} / ${keepSerials.size}`);
  check("Arayüz: telefon / tablet / monitör / hat satırı yok", serials.every((s) => keepSerials.has(s)) && !serials.some((s) => dropSerials.has(s) && !keepSerials.has(s)));
  check("Sayfa hatası yok", problems.length === 0, problems.join(" | "));
  check("MacBook GQQQCFKQ6H listede YOK", !serials.includes("GQQQCFKQ6H"));
  check("Hiçbir Mac listede yok", ![...serials].some((s) => src.some((r) => String(r["Seri No"]).trim() === s && isMac(r))));
  await ctx.close();
} finally {
  await browser.close(); await be.stop();
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
