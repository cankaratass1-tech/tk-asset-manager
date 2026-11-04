// PERFORMANS ölçümü (gerçek dosyalarla; yoksa atlanır): ekran geçişleri ve etkileşimlerde ana iş parçacığının donma süresini (Long Task) ölçer.
//   node e2e/performans.mjs [--skip-build]     (ENV: ESIK=ms — bu süreden uzun donmalar "yavaş" sayılır, varsayılan 500)
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";
import { existsSync } from "node:fs";

const R = "C:/Users/Lenovo/Documents/Real/", D = "C:/Users/Lenovo/Downloads/";
const FILES = [
  R + "SCCM Inventory Report-W Collection.xlsx", R + "SahibiBilgisiBoşOlan--VarlıkSorumlusuİnaktifOlanCihazlar.xlsx", R + "Attached Monitors Report (1).xlsx",
  R + "Weekly_BSOD.xlsx", R + "BatteryHealth.xlsx", R + "C Size Less Than 10 GB.xlsx", D + "Test_LokasyonMailListesi.xlsx", R + "Turuncuhat v2.xlsx",
];
if (!FILES.every(existsSync)) { console.log("Gerçek dosyalar yok — atlandı"); process.exit(0); }
if (!process.argv.includes("--skip-build")) buildFrontend();
const ESIK = Number(process.env.ESIK || 500);

const be = await startBackend({ port: 5116 });
const browser = await launchBrowser();
const rows = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript((t) => {
    localStorage.setItem("varlikTakip.sessionToken", t);
    window.__long = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ["longtask"] }); } catch { /* */ }
  }, be.token);
  const page = await ctx.newPage();
  await page.goto(be.base); await page.waitForTimeout(3500);
  await page.getByRole("button", { name: /Ayarlar/ }).click(); await page.waitForTimeout(1000);
  await page.locator('input[type="text"]').first().fill("smoke-admin");
  await page.locator('input[type="password"]').first().fill(be.adminHeaders["x-admin-password"]);
  await page.getByRole("button", { name: "Giriş Yap" }).click(); await page.waitForTimeout(1200);
  await page.locator("text=Veri Girişi").last().click(); await page.waitForTimeout(1000);
  await page.locator("[data-bulk-input]").setInputFiles(FILES);
  await page.waitForFunction((n) => document.querySelectorAll("[data-bulk-row]").length === n && ![...document.querySelectorAll("[data-bulk-row]")].some((r) => r.getAttribute("data-bulk-row") === "wait"), FILES.length, { timeout: 300000 });
  const auth = { Authorization: `Bearer ${be.token}` };
  for (let i = 0; i < 90; i++) { const th = await (await fetch(`${be.base}/api/reports/th-envanteri`, { headers: auth })).json(); if (th.rows && th.rows.length > 50000) break; await new Promise((r) => setTimeout(r, 3000)); }
  await page.reload(); await page.waitForTimeout(Number(process.env.BEKLE || 30000));

  // ölçüm: eylemden sonra sayfa 700 ms boyunca sessiz kalana kadar bekler; donma = Long Task toplamı / en uzunu + eylem→sessizlik süresi
  const cdp = await ctx.newCDPSession(page);
  const topFns = (prof) => {
    const self = new Map(); const byId = new Map(prof.nodes.map((n) => [n.id, n]));
    const dt = prof.timeDeltas; prof.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || "(anonim)"} ${(n.callFrame.url || "").split("/").pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000); });
    return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  };
  const measure = async (name, fn) => {
    await page.evaluate(() => { window.__long = []; });
    const doProf = process.env.PROFIL && name.includes(process.env.PROFIL);
    if (doProf) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start"); }
    const t0 = Date.now();
    await fn();
    await page.waitForTimeout(1200);
    if (doProf) { const { profile } = await cdp.send("Profiler.stop"); console.log("   CPU profili (kendi süre, ms):"); topFns(profile).forEach(([k, v]) => console.log("     " + String(Math.round(v)).padStart(6) + "  " + k)); }
    const long = await page.evaluate(() => window.__long.slice());
    const total = long.reduce((a, b) => a + b, 0), max = long.reduce((a, b) => Math.max(a, b), 0);
    rows.push({ name, ms: Date.now() - t0 - 1200, total, max, count: long.length });
    console.log(`  ${max >= ESIK ? "⚠" : "✓"} ${name.padEnd(46)} en uzun donma ${String(max).padStart(5)} ms · toplam ${String(total).padStart(5)} ms (${long.length} kez)`);
  };
  const open = (n) => measure(`Ekran aç: ${n}`, async () => { await page.getByText(n, { exact: true }).first().click(); await page.waitForTimeout(500); });

  console.log("\nEkran geçişleri:");
  for (const n of ["İnaktif Cihazlar", "Disk Alanı", "Zimmet Uyuşmazlığı", "Lokasyon Hostname ve IP Uyuşmazlığı", "Kullanılmayan Cihazlar", "Atıl Monitörler", "SCCM Ajan Raporu", "Battery Health", "BSOD", "Ana Sayfa"]) await open(n);

  console.log("\nEtkileşimler (Zimmet):");
  await page.getByText("Zimmet Uyuşmazlığı", { exact: true }).first().click(); await page.waitForTimeout(3000);
  await measure("Zimmet: arama kutusuna yazma (hostname)", async () => { await page.locator('input[placeholder*="ara" i]').first().fill("ADA"); await page.waitForTimeout(800); });
  await measure("Zimmet: aramayı temizle", async () => { await page.locator('input[placeholder*="ara" i]').first().fill(""); });
  await measure("Zimmet: bir satırı seç (onay kutusu)", async () => { await page.locator("tbody tr input[type=checkbox]").first().check(); });
  await measure("Zimmet: sonraki sayfa", async () => { await page.getByText("Sonraki", { exact: false }).first().click().catch(() => {}); });
  await measure("Zimmet: segment 'Zimmet Hatalı'", async () => { await page.locator("div", { hasText: /^Zimmet Hatalı$/ }).first().click(); });
  await measure("Zimmet: segment 'Doğrulanamayan'", async () => { await page.locator("div", { hasText: /^Doğrulanamayan/ }).first().click(); });
  await measure("Zimmet: bir satırın detayını aç", async () => { await page.locator("tbody tr").nth(1).click(); });
  await page.keyboard.press("Escape");
  console.log("\nEtkileşimler (Atıl Monitörler):");
  await page.getByText("Atıl Monitörler", { exact: true }).first().click(); await page.waitForTimeout(3500);
  await measure("Atıl: aşama değiştir (Bilgi dışı)", async () => { await page.locator("[data-atil-stage=outside]").click(); });
  await measure("Atıl: aşama değiştir (Aktif)", async () => { await page.locator("[data-atil-stage=active]").click(); });
  console.log("\nŞirket seçimi:");
  await measure("Sol panel: bir şirket seç", async () => { await page.getByText("TKAO-THY A.O.", { exact: false }).first().click(); });
  await measure("Sol panel: Tüm Şirketler", async () => { await page.getByText("Tüm Şirketler", { exact: false }).first().click(); });
  await ctx.close();
} finally {
  await browser.close(); await be.stop();
}
const slow = rows.filter((r) => r.max >= ESIK);
console.log(`\nEşik ${ESIK} ms: ${slow.length} yavaş eylem / ${rows.length}`);
slow.sort((a, b) => b.max - a.max).forEach((r) => console.log(`  - ${r.name}: ${r.max} ms`));
process.exit(0);
