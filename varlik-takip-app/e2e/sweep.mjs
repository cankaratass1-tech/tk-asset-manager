// Tüm sistem taraması: her dashboard görünümü + her rapor + Network + Gönderim Geçmişi + Ayarlar açılıyor mu, hata yok mu, içerik (veri) geliyor mu.
// Konsol hatası, yakalanmamış sayfa hatası ve HTTP ≥ 400 yanıtı herhangi bir ekranda görülürse o ekran BAŞARISIZ sayılır.
//   node e2e/sweep.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";
import { REPORT_CATEGORIES, NETWORK_ITEMS } from "../src/data/constants.js";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const be = await startBackend({ port: 5078 });
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  let issues = [];
  page.on("pageerror", (e) => issues.push("sayfa hatası: " + e.message.slice(0, 100)));
  page.on("console", (m) => m.type() === "error" && issues.push("konsol: " + m.text().slice(0, 100)));
  page.on("response", (r) => r.url().includes("/api/") && r.status() >= 400 && issues.push(`HTTP ${r.status()} ${r.url().replace(be.base, "").slice(0, 60)}`));
  const txt = async () => (await page.innerText("body")).replace(/\n\s*\n/g, "\n");
  const rows = () => page.locator("tbody tr").count();
  const flags = (demo, exec) => page.evaluate(([d, e]) => { localStorage.setItem("varlikTakip.dashboardDemo", d); localStorage.setItem("varlikTakip.execView", e); }, [demo, exec]);
  const report = async (label, fn) => {
    issues = [];
    let ok = true, detail = "";
    try { detail = (await fn()) || ""; } catch (e) { ok = false; detail = String(e.message).split("\n")[0].slice(0, 140); }
    if (issues.length) { ok = false; detail = [...new Set(issues)].slice(0, 2).join(" | "); }
    check(label, ok, detail);
  };
  const waitFor = async (cond, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await cond()) return true; await page.waitForTimeout(500); } return false; };
  // satır sayısı >0 ve iki ardışık ölçümde aynı olana kadar bekler (veri akarken ilk satırda durmasın)
  const settledRows = async () => { let prev = -1; for (let i = 0; i < 30; i++) { const n = await rows(); if (n > 0 && n === prev) return n; prev = n; await page.waitForTimeout(1000); } return 0; };
  const home = async () => { await page.goto(be.base); await page.waitForTimeout(3000); await page.locator('text="Ana Sayfa"').first().click(); await page.waitForTimeout(1500); };

  await page.goto(be.base);
  console.log("Dashboard görünümleri");
  await flags("0", "0");
  await report("Klasik dashboard (IT Operations + Cihaz Ara düğmesi + Genel Durum)", async () => {
    await home();
    const ok = await waitFor(async () => { const t = await txt(); return /IT Operations Dashboard/.test(t) && /Cihaz Ara/.test(t) && !/Cihaz Genel Görünüm/.test(t) && /inaktif cihaz/.test(t) && /Genel Durum/.test(t); });
    if (!ok) throw new Error("beklenen bölümler görünmedi");
  });
  await flags("1", "0");
  await report("Yeni tasarım dashboard (Operasyon Panosu, Lokasyonlar)", async () => {
    await home();
    if (!(await waitFor(async () => /Lokasyonlar/.test(await txt()) && /Hatalı zimmet/.test(await txt())))) throw new Error("bölümler görünmedi");
  });
  await flags("1", "1");
  await report("Yönetici Özeti (tek sayfa)", async () => {
    await home();
    if (!(await waitFor(async () => /Açık bulgu dağılımı/.test(await txt())))) throw new Error("özet görünmedi");
    if ((await page.locator("svg").count()) < 3) throw new Error("grafikler çizilmedi");
  });
  await flags("0", "0");

  console.log("\nSol menü seçili durumu");
  await report("Ana Sayfa'dayken son açılan rapor (Disk Alanı) seçili görünmüyor, yalnız Ana Sayfa seçili", async () => {
    await home();
    await page.locator('text="Disk Alanı"').first().click();
    await page.waitForTimeout(1500);
    await page.locator('text="Ana Sayfa"').first().click();
    await page.waitForTimeout(1500);
    const bg = (label) => page.evaluate((l) => { const el = [...document.querySelectorAll("aside div")].find((d) => d.children.length <= 1 && d.textContent.trim() === l && getComputedStyle(d).cursor === "pointer"); return el ? getComputedStyle(el).backgroundColor : "yok"; }, label);
    const [ana, disk, inaktif] = [await bg("Ana Sayfa"), await bg("Disk Alanı"), await bg("İnaktif Cihazlar")];
    if (disk !== inaktif) throw new Error(`Disk Alanı seçili görünüyor (${disk} ≠ pasif ${inaktif})`);
    if (ana === inaktif) throw new Error("Ana Sayfa seçili görünmüyor");
    // Network açıkken de rapor seçili görünmemeli
    await page.locator('text="Disk Alanı"').first().click(); await page.waitForTimeout(1200);
    await page.locator('text="Ofis Bant Genişliği"').first().click(); await page.waitForTimeout(1500);
    const diskNet = await bg("Disk Alanı");
    if (diskNet !== inaktif) throw new Error("Network açıkken Disk Alanı seçili görünüyor");
  });

  console.log("\nRaporlar");
  const NEED_ROWS = new Set(["inaktif", "disk", "zimmet", "kullanilmayan", "atil-monitor", "sccm-ajan", "battery-health", "bsod", "darbogaz", "lokasyon-ip"]);
  for (const cat of REPORT_CATEGORIES) {
    for (const r of cat.reports) {
      await report(`${cat.name} › ${r.name}`, async () => {
        await home();
        await page.locator(`text="${r.name}"`).first().click();
        if (NEED_ROWS.has(r.id)) {
          if ((await settledRows()) === 0) throw new Error("tabloda satır yok");
          return `${await rows()} satır`;
        }
        await page.waitForTimeout(2500);
        const t = await txt();
        if (t.trim().length < 400) throw new Error("ekran boş");
      });
    }
  }

  console.log("\nNetwork / Geçmiş / Ayarlar");
  for (const n of NETWORK_ITEMS) {
    await report(`Network › ${n.name}`, async () => {
      await home();
      await page.locator(`text="${n.name}"`).first().click();
      if ((await settledRows()) === 0) throw new Error("tabloda satır yok");
      return `${await rows()} satır`;
    });
  }
  await report("Gönderim Geçmişi açılıyor", async () => {
    await home();
    await page.locator('text="Gönderim Geçmişi"').first().click();
    await page.waitForTimeout(2000);
    if ((await txt()).trim().length < 300) throw new Error("ekran boş");
  });
  await report("Ayarlar açılıyor (giriş ya da sekmeler)", async () => {
    await home();
    await page.getByRole("button", { name: /Ayarlar/ }).click();
    await page.waitForTimeout(2000);
    const t = await txt();
    if (!/Lokasyon E-postaları|SMTP|Veri Girişi|Giriş|Parola|Şifre|Kullanıcı/i.test(t)) throw new Error("ayarlar ekranı görünmedi");
  });
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} ekran sorunsuz${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((x) => console.log(`  ✗ ${x.name}`));
process.exit(failed.length ? 1 : 0);
