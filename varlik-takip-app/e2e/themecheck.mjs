// ITSM teması testi: seçim, kalıcılık, renk/stil uygulanması, diğer temaların bozulmaması, dar ekran. Ekran görüntüleri: SHOT_DIR env.
//   node e2e/themecheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const shotDir = process.env.SHOT_DIR || "";

const be = await startBackend({ port: 5069 });
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 120)));
  await page.goto(be.base);
  await page.waitForTimeout(4000);
  const shot = async (n) => { if (shotDir) await page.screenshot({ path: `${shotDir}/${n}.png` }); };
  const css = (sel, prop) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);

  console.log("Tema seçimi");
  check("Tema düğmesi (ITSM) görünüyor", (await page.locator('[data-theme-btn="itsm"]').count()) === 1);
  await page.locator('[data-theme-btn="itsm"]').click();
  await page.waitForTimeout(600);
  check("html[data-theme] = itsm", (await page.evaluate(() => document.documentElement.dataset.theme)) === "itsm");
  check("Zemin soğuk gri (#F3F5F9)", (await css(".vt-body", "backgroundColor")) === "rgb(243, 245, 249)", await css(".vt-body", "backgroundColor"));
  const primary = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => getComputedStyle(x).backgroundColor === "rgb(65, 98, 244)"); return !!b; });
  check("Birincil düğme Lakeside mavisi (#4162F4)", primary);
  check("Sol menü kartı ince köşeli (10px)", (await css(".vt-shell > aside", "borderRadius")) === "10px", await css(".vt-shell > aside", "borderRadius"));
  await shot("itsm-home");

  console.log("\nKalıcılık");
  await page.reload();
  await page.waitForTimeout(3500);
  check("Yenileyince tema korunuyor", (await page.evaluate(() => document.documentElement.dataset.theme)) === "itsm");

  console.log("\nRapor tablosu");
  await page.locator('text="Zimmet Uyuşmazlığı"').first().click();
  await page.waitForTimeout(2500);
  const th = await page.evaluate(() => { const t = document.querySelector("th"); const c = getComputedStyle(t); return { size: c.fontSize, bg: c.backgroundColor }; });
  check("Tablo başlığı açık gri zeminli, kompakt (≤13px)", parseInt(th.size) <= 13 && th.bg === "rgb(248, 249, 252)", JSON.stringify(th));
  await page.locator("tbody tr").first().hover();
  const hov = await page.evaluate(() => getComputedStyle(document.querySelector("tbody tr:hover td")).backgroundColor);
  check("Satır üzerine gelince vurgu (#F5F7FF)", hov === "rgb(245, 247, 255)", hov);
  await shot("itsm-zimmet");

  console.log("\nDiğer temalar bozulmadı");
  for (const [id, label] of [["light", "☀︎"], ["dark", "☾"], ["aero", "✈"]]) {
    await page.locator(`text="${label}"`).first().click();
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => getComputedStyle(document.querySelector(".vt-shell > aside")).borderRadius);
    check(`${id} teması: sol menü köşesi 16px (ITSM geçersiz kılması sızmıyor)`, r === "16px", r);
  }

  console.log("\nDar ekran (telefon)");
  await page.locator('[data-theme-btn="itsm"]').click();
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => ({ cols: getComputedStyle(document.querySelector(".vt-shell")).gridTemplateColumns.split(" ").length, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  check("Menü üste, içerik tek sütun", m.cols === 1, JSON.stringify(m));
  check("Sayfa yatay taşmıyor", m.overflow <= 2, `${m.overflow}px`);
  await shot("itsm-mobile");
  check("Konsol hatası yok", problems.length === 0, problems.join(" | "));
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} tema kontrolü geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((x) => console.log(`  ✗ ${x.name}`));
process.exit(failed.length ? 1 : 0);
