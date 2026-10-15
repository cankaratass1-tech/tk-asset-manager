// Geliştirme yardımcısı (duman testini yazarken ekranların yapısını incelemek için): node e2e/probe.mjs <rapor-id>
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";

const report = process.argv[2] || "inaktif";
if (!process.argv.includes("--skip-build")) buildFrontend();
const be = await startBackend();
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  await ctx.addInitScript(([t, r]) => {
    localStorage.setItem("varlikTakip.sessionToken", t);
    localStorage.setItem("varlikTakip.lastView", JSON.stringify({ activeReport: r }));
  }, [be.token, report]);
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && console.log("[console.error]", m.text().slice(0, 200)));
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));
  await page.goto(be.base);
  await page.waitForTimeout(4000);
  const NAMES = { zimmet: "Zimmet Uyuşmazlığı", inaktif: "İnaktif Cihazlar", disk: "Disk Alanı", "lokasyon-ip": "Lokasyon Hostname ve IP Uyuşmazlığı", kullanilmayan: "Kullanılmayan Cihazlar", "atil-monitor": "Atıl Monitörler" };
  await page.locator('text="' + (NAMES[report] || report) + '"').first().click();
  await page.waitForTimeout(2500);
  console.log("TABLO satır:", await page.locator("tbody tr").count(), "| select/filtre etiketleri:", await page.locator("text=/\(Tümü\)/").allInnerTexts());
  console.log((await page.innerText("body")).slice(1800, 4200));
  await page.screenshot({ path: `e2e/probe-${report}.png` });
} finally {
  await browser.close();
  await be.stop();
}
