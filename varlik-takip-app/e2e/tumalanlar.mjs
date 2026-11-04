// TÜM ALANLAR denetimi — gerçek dosyalarla (bu makinede yoksa atlanır). Her rapor ekranı açılır ve şunlara bakılır:
//   dolu mu / "dosyaları gerekir" gibi boş-durum mesajı var mı, kayıt sayısı, sayfa/konsol hatası, ekranda undefined / NaN / [object / Invalid Date.
//   node e2e/tumalanlar.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";
import { existsSync } from "node:fs";

const R = "C:/Users/Lenovo/Documents/Real/", D = "C:/Users/Lenovo/Downloads/";
const FILES = {
  "SCCM": R + "SCCM Inventory Report-W Collection.xlsx",
  "İnaktif": R + "SahibiBilgisiBoşOlan--VarlıkSorumlusuİnaktifOlanCihazlar.xlsx",
  "Monitör": R + "Attached Monitors Report (1).xlsx",
  "BSOD": R + "Weekly_BSOD.xlsx",
  "Battery": R + "BatteryHealth.xlsx",
  "Disk (C Size)": R + "C Size Less Than 10 GB.xlsx",
  "Bant": R + "Bant Genişliği Trend - Yurt Disi-data-2026-09-22 08_04_13 (1).csv",
  "Lokasyon": D + "Test_LokasyonMailListesi.xlsx",
  "TuruncuHat v2": R + "Turuncuhat v2.xlsx",
};
if (!Object.values(FILES).every(existsSync)) { console.log("Gerçek dosyalar bu makinede yok — test atlandı:", Object.entries(FILES).filter(([, f]) => !existsSync(f)).map(([k]) => k).join(", ")); process.exit(0); }
if (!process.argv.includes("--skip-build")) buildFrontend();

const SCREENS = ["Ana Sayfa", "İnaktif Cihazlar", "Disk Alanı", "Zimmet Uyuşmazlığı", "Lokasyon Hostname ve IP Uyuşmazlığı", "Kullanılmayan Cihazlar", "Atıl Monitörler", "Kapatma Onayı Bekleyen Kayıtlar", "Yeni Kurulum Kaydı", "SCCM Ajan Raporu", "Battery Health", "Ajan Yüklü Cihazlar", "BSOD", "Bottleneck", "Ofis Bant Genişliği", "Gönderim Geçmişi"];
const BAD = /\bundefined\b|\bNaN\b|\[object|Invalid Date|\bnull\b|\b[2-6]\d{4}\.\d{4,}\b/; // son alternatif: ham Excel tarih seri numarası (ör. 46286.3356018519)
const EMPTY = /dosyaları gerekir|henüz yüklenmedi|Veri bekleniyor|yüklenmedi|bulunamadı — /i;

const be = await startBackend({ port: 5114 });
const browser = await launchBrowser();
const report = [];
const sidebar = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  let current = "(açılış)";
  const errors = [];
  page.on("pageerror", (e) => errors.push(`[${current}] pageerror: ${e.message.slice(0, 150)}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${current}] console: ${m.text().slice(0, 150)}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !/\/api\/auth\/me|favicon/.test(r.url())) errors.push(`[${current}] HTTP ${r.status()} ${r.url().replace(be.base, "")}`); });

  await page.goto(be.base); await page.waitForTimeout(3500);
  await page.getByRole("button", { name: /Ayarlar/ }).click(); await page.waitForTimeout(1200);
  await page.locator('input[type="text"]').first().fill("smoke-admin");
  await page.locator('input[type="password"]').first().fill(be.adminHeaders["x-admin-password"]);
  await page.getByRole("button", { name: "Giriş Yap" }).click(); await page.waitForTimeout(1500);
  await page.locator("text=Veri Girişi").last().click(); await page.waitForTimeout(1200);
  const files = Object.values(FILES);
  await page.locator("[data-bulk-input]").setInputFiles(files);
  await page.waitForFunction((n) => document.querySelectorAll("[data-bulk-row]").length === n && ![...document.querySelectorAll("[data-bulk-row]")].some((r) => r.getAttribute("data-bulk-row") === "wait"), files.length, { timeout: 300000 });
  const bulk = await page.locator("[data-bulk-row]").evaluateAll((trs) => trs.map((tr) => ({ s: tr.getAttribute("data-bulk-row"), t: tr.innerText.replace(/\s+/g, " ").slice(0, 120) })));
  console.log("\nYükleme sonuçları:");
  Object.keys(FILES).forEach((k, i) => console.log(`  ${bulk[i].s === "ok" ? "✓" : "✗"} ${k.padEnd(14)} → ${bulk[i].t}`));
  const auth = { Authorization: `Bearer ${be.token}` };
  let th = { rows: [] };
  for (let i = 0; i < 90 && !(th.rows && th.rows.length > 50000); i++) { th = await (await fetch(`${be.base}/api/reports/th-envanteri`, { headers: auth })).json(); if (!(th.rows && th.rows.length > 50000)) await new Promise((r) => setTimeout(r, 3000)); }
  console.log(`  TuruncuHat sunucuda: ${th.rows?.length} satır`);

  await page.reload(); await page.waitForTimeout(8000);
  for (const name of SCREENS) {
    current = name;
    await page.getByText(name, { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(5000);
    const body = await page.locator("body").innerText();
    if (process.env.SHOT && name === process.env.SHOT) await page.screenshot({ path: `../ekran-goruntuleri/audit-${name.replace(/[^A-Za-z0-9]/g, "_")}.png` });
    const foot = (body.match(/(\d[\d.]*) kayıttan[^\n]*/) || [""])[0].replace(/\s+/g, " ").slice(0, 90);
    const bad = [...new Set((body.match(new RegExp(BAD.source, "g")) || []))];
    const emptyLine = body.split("\n").find((l) => EMPTY.test(l)) || "";
    const empty = emptyLine.trim().slice(0, 150);
    const heads = await page.locator("thead th").allInnerTexts().catch(() => []);
    const first = await page.locator("tbody tr").evaluateAll((trs) => trs.slice(0, 2).map((t) => [...t.querySelectorAll("td")].map((td) => td.innerText.replace(/s+/g, " ").trim().slice(0, 38)).filter(Boolean).join(" | "))).catch(() => []);
    if (process.env.DETAY) { console.log("   sütunlar:", heads.map((h) => h.trim()).filter(Boolean).join(" · ")); first.forEach((f) => console.log("   >", f.slice(0, 260))); }
    if (process.env.DUMP === name) console.log(`----DUMP ${name}\n${body.slice(0, 2500)}\n----END`);
    const side = (body.match(/Tüm Şirketler\s*\n\s*(\d[\d.]*|—)/) || [])[1] || "";
    sidebar.push(`${name.padEnd(36)} sol panel "Tüm Şirketler": ${side || "?"}  | ekran: ${foot || "-"}`);
    report.push({ name, foot, bad, empty, body: name === "Ana Sayfa" ? body : "" });
    console.log(`  ${(bad.length || empty) ? "⚠" : "✓"} ${name.padEnd(36)} ${foot || "(kayıt sayacı yok)"}${empty ? `  | BOŞ-DURUM: "${empty}"` : ""}${bad.length ? `  | ŞÜPHELİ METİN: ${bad.join(",")}` : ""}`);
  }
  console.log("\nSol panel sayısı ↔ ekran:"); sidebar.forEach((l) => console.log("  " + l));
  // Ana Sayfa sayıları ile liste ekranlarının tutarlılığı (gerçek veri)
  const num = (s) => Number(String(s ?? "").replace(/\./g, ""));
  const home = report.find((r) => r.name === "Ana Sayfa").body;
  const countOf = (n) => num((report.find((r) => r.name === n).foot.match(/^(\d[\d.]*) kayıttan/) || [])[1]);
  const card = (re) => num((home.match(re) || [])[1]);
  const pairs = [
    ["İnaktif", card(/([\d.]+)\s*\n\s*inaktif cihaz/), countOf("İnaktif Cihazlar")],
    ["Kullanılmayan", card(/Kullanılmayan\s+([\d.]+)\s+%/), countOf("Kullanılmayan Cihazlar")],
  ];
  console.log("\nAna Sayfa ↔ liste tutarlılığı:");
  pairs.forEach(([n, a, b]) => console.log(`  ${a === b ? "✓" : "✗"} ${n}: Ana Sayfa ${a} / liste ${b}`));
  const eq = home.match(/Toplam ([\d.]+) = ([\d.]+) doğru \+ ([\d.]+) hatalı \+ ([\d.]+) doğrulanamadı(?: \+ ([\d.]+) OBS)?/);
  if (eq) { const [t, a, b, c, d] = eq.slice(1).map((x) => num(x || 0)); console.log(`  ${t === a + b + c + d ? "✓" : "✗"} Zimmet denklemi: ${eq[0]}`); }
  const hh = home.match(/Toplam Cihaz[^\n]*\t([\d.]+)\t/), pr = home.match(/Sorunlu Cihaz[^\n]*\t([\d.]+)\t/), cl = home.match(/Temiz Cihaz[^\n]*\t([\d.]+)\t/);
  if (hh && pr && cl) console.log(`  ${num(hh[1]) - num(pr[1]) === num(cl[1]) ? "✓" : "✗"} Sağlık: ${hh[1]} − ${pr[1]} = ${cl[1]}`);
  console.log("\nSayfa / konsol / ağ hataları:", errors.length ? "" : "yok");
  [...new Set(errors)].slice(0, 25).forEach((e) => console.log("  -", e));
  await ctx.close();
} finally {
  await browser.close(); await be.stop();
}
