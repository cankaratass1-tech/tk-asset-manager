// Kaydırma testi: tekerlek sol menünün üstündeyken sayfa hemen kaymalı (menü kendi içinde kaymamalı); menünün tüm öğelerine erişilebilmeli.
//   node e2e/scrollcheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const be = await startBackend({ port: 5072 });
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 800 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  await page.goto(be.base);
  await page.waitForTimeout(4000);
  await page.locator('text="Zimmet Uyuşmazlığı"').first().click();
  await page.waitForTimeout(2500);
  const aside = () => page.evaluate(() => { const a = document.querySelector(".vt-shell > aside"); const r = a.getBoundingClientRect(); return { scrollTop: Math.round(a.scrollTop), scrollH: a.scrollHeight, clientH: a.clientHeight, overflowY: getComputedStyle(a).overflowY, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight }; });
  const a0 = await aside();
  check("Menü ekrandan uzun (test geçerli) ama kendi içinde kaymıyor (overflow görünür)", a0.scrollH > a0.vh - 32 && a0.overflowY === "visible", JSON.stringify(a0));

  for (const [label, x] of [["ana içerik", 900], ["sol menü", 120]]) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(x, 400);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(300);
    const y = await page.evaluate(() => Math.round(scrollY));
    const st = (await aside()).scrollTop;
    check(`Tekerlek ${label} üstündeyken sayfa ilk kaydırmada hareket ediyor`, y > 0 && st === 0, `scrollY=${y}, menü scrollTop=${st}`);
  }

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  const end = await aside();
  check("Sayfa sonunda menünün alt ucu görünür (son öğelere erişilebilir)", end.bottom <= end.vh && end.bottom >= end.vh - 40, `alt=${end.bottom}/${end.vh}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const top = await aside();
  check("Sayfa başında menünün üstü görünür (üstte 16px)", top.top === 16, `üst=${top.top}`);

  // Sağ detay paneli (satıra tıklayınca) ekrandan uzunsa donmamalı: sayfayla kayar, alt ucu görününce sabitlenir
  await page.setViewportSize({ width: 1500, height: 520 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('span[title="Detayını sağda göster"]').first().click();
  await page.waitForTimeout(1500);
  const det = () => page.evaluate(() => { const els = [...document.querySelectorAll("aside")].filter((e) => !e.matches(".vt-shell > aside")); const r = els[0].getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), vh: innerHeight }; });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const d0 = await det();
  check("Detay paneli ekrandan uzun (test geçerli)", d0.h > d0.vh - 40, JSON.stringify(d0));
  await page.evaluate(() => window.scrollTo(0, 150));
  await page.waitForTimeout(300);
  const d1 = await det();
  check("Sayfa kaydırılınca detay paneli yerinde donmuyor (birlikte kayıyor)", d1.top < d0.top, `üst ${d0.top} → ${d1.top}`);
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(300);
  const d2 = await det();
  check("Aşağıda panelin alt ucu görünür ve sabitlenir (içeriğin sonuna erişilir)", d2.bottom <= d2.vh && d2.bottom >= d2.vh - 40, JSON.stringify(d2));

  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => getComputedStyle(document.querySelector(".vt-shell > aside")).position);
  check("Dar ekranda menü sabit değil (static)", m === "static", m);
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} kaydırma kontrolü geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
process.exit(failed.length ? 1 : 0);
