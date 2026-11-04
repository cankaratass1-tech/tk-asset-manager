// Toplu dosya yükleme testi: Ayarlar > Veri Girişi'ndeki tek bırakma alanı. Demo dosyalar karışık/anlamsız adlarla, tek seferde bırakılır;
// her dosyanın türünün otomatik tanındığı, aynı türden eski dosyanın atlandığı, tanınmayanın uyarıldığı ve verinin backend'e KALICI yazıldığı doğrulanır.
//   node e2e/bulkuploadcheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { mkdtempSync, copyFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const be = await startBackend({ port: 5085 });
const browser = await launchBrowser();
const src = join(be.dataDir, "..");
const work = mkdtempSync(join(tmpdir(), "varlik-bulk-"));
try {
  // sunucudaki hazır demo dosyalarını kaldır: veri yalnızca toplu yüklemeyle gelsin
  const imports = join(be.dataDir, "imports");
  const demoDir = join(import.meta.dirname, "..", "..", "backend", "demo-data");
  readdirSync(imports).forEach((f) => rmSync(join(imports, f), { force: true }));
  const cur = join(demoDir, "current");
  const pick = (p) => readdirSync(cur).find((f) => f.startsWith(p));
  // [kaynak, yeni ad, beklenen tür, beklenen eylem, tanıma yolu]
  const old = Date.now() - 7 * 86400000;
  const plan = [
    [join(cur, pick("SCCM")), "rapor-1.xlsx", "sccm", "use", "sütunlar"],
    [join(cur, pick("SCCM")), "SCCM Inventory Report_eski.xlsx", "sccm", "skip", "ad"],
    [join(cur, pick("DiskAlani")), "SCCM Low Disk Space.xlsx", "disk", "use", "sütunlar"], // adı SCCM ile başlıyor ama Disk Alanı raporu: SCCM envanteriyle çakışmamalı
    [join(cur, pick("Inaktif")), "bana gelen dosya.xlsx", "inaktif", "use", "sütunlar"],
    [join(cur, pick("TH_")), "TH_20260101000000.xlsx", "th", "use", "ad"],
    [join(cur, pick("Attached")), "monitorler.xlsx", "monitor", "use", "sütunlar"],
    [join(cur, pick("Lokasyon")), "mail listesi.xlsx", "lokasyon", "use", "sütunlar"],
    [join(cur, pick("Weekly")), "haftalik.xlsx", "bsod", "use", "sütunlar"],
    [join(demoDir, "battery-health.xlsx"), "pil.xlsx", "battery", "use", "sütunlar"],
    [join(demoDir, "bant-genisligi.csv"), "hatlar.csv", "bant", "use", "sütunlar"],
  ];
  const paths = plan.map(([from, to]) => { const p = join(work, to); copyFileSync(from, p); return p; });
  // copyFileSync kaynağın değişiklik tarihini korur; "yeni" SCCM kopyası şimdi, "eski" olan 7 gün önce
  utimesSync(paths[0], new Date(), new Date());
  utimesSync(paths[1], new Date(old), new Date(old));
  const bogus = join(work, "tatil planı.xlsx");
  const wsb = XLSX.utils.aoa_to_sheet([["Ad", "Soyad"], ["a", "b"]]);
  const wbb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wbb, wsb, "S"); XLSX.writeFile(wbb, bogus);
  paths.push(bogus);

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  await ctx.addInitScript((t) => { localStorage.setItem("varlikTakip.sessionToken", t); }, be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 140)));
  await page.goto(be.base);
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: /Ayarlar/ }).click();
  await page.waitForTimeout(1200);
  await page.locator('input[type="text"]').first().fill("smoke-admin");
  await page.locator('input[type="password"]').first().fill(be.adminHeaders["x-admin-password"]);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForTimeout(1500);
  await page.locator("text=Veri Girişi").last().click();
  await page.waitForTimeout(1200);

  console.log("Bırakma alanı");
  check("Ayarlar > Veri Girişi'nde tek bırakma alanı görünüyor", (await page.locator("[data-bulk-zone]").count()) === 1);
  check("Alan çoklu dosya kabul ediyor (xlsx + csv)", (await page.locator("[data-bulk-input]").getAttribute("multiple")) !== null && /csv/.test(await page.locator("[data-bulk-input]").getAttribute("accept")));

  await page.locator("[data-bulk-input]").setInputFiles(paths);
  await page.waitForFunction((n) => document.querySelectorAll("[data-bulk-row]").length === n && ![...document.querySelectorAll("[data-bulk-row]")].some((r) => r.getAttribute("data-bulk-row") === "wait"), paths.length, { timeout: 60000 });
  await page.waitForTimeout(800);

  console.log("\nOtomatik tanıma");
  const rows = await page.locator("[data-bulk-row]").evaluateAll((trs) => trs.map((tr) => ({ status: tr.getAttribute("data-bulk-row"), text: tr.innerText.replace(/\s+/g, " ") })));
  const labels = { sccm: "SCCM Envanteri", disk: "Disk Alanı", inaktif: "İnaktif Cihazlar", th: "TuruncuHat", monitor: "Monitör Raporu", lokasyon: "Lokasyon E-posta", bsod: "Weekly BSOD", battery: "Battery Health", bant: "Bant Genişliği" };
  plan.forEach(([, to, kind, action, via], i) => {
    const r = rows[i];
    const want = action === "use" ? "ok" : "skip";
    check(`'${to}' → ${labels[kind]} (${action === "use" ? "eklendi" : "eski olduğu için atlandı"}, tanıma: ${via})`, r.status === want && r.text.includes(labels[kind]) && (action === "skip" || r.text.includes(`tanıma: ${via}`)), r.text.slice(0, 120));
  });
  const last = rows[rows.length - 1];
  check("Hiçbir türe uymayan 'tatil planı.xlsx' uyarıyla 'Tanınmadı' gösteriliyor, eklenmiyor", last.status === "unknown" && /Tanınmadı/.test(last.text), last.text.slice(0, 110));
  check("Özet: 9 dosya eklendi", /9 \/ 11 dosya eklendi/.test(await page.locator("[data-bulk-results]").innerText()));

  console.log("\nKalıcılık (backend)");
  const saved = readdirSync(imports);
  for (const [p, label] of [["SCCM Inventory Report", "SCCM"], ["DiskAlani", "Disk"], ["İnaktifCihazlar", "İnaktif"], ["TH", "TH"], ["Attached Monitors Report", "Monitör"], ["LokasyonMailListesi", "Lokasyon"], ["Weekly_BSOD", "BSOD"]]) {
    check(`${label} dosyası sunucuda kayıtlı (${p}_*.xlsx)`, saved.some((f) => f.startsWith(`${p}_`)), saved.filter((f) => f.startsWith(p)).join(", "));
  }
  check("SCCM için yalnız 1 dosya var (eski kopya sunucuya yazılmadı)", saved.filter((f) => f.startsWith("SCCM Inventory Report_")).length === 1);
  const auth = { Authorization: `Bearer ${be.token}` };
  const sccm = await (await fetch(`${be.base}/api/reports/sccm`, { headers: auth })).json();
  check("Sayfa yenilemeden bağımsız: SCCM raporu sunucudan satırlarla dönüyor", (sccm.rows?.length ?? sccm.data?.length ?? 0) > 100, `${sccm.rows?.length ?? sccm.data?.length ?? "?"} satır`);

  await page.locator("[data-bulk-results]").scrollIntoViewIfNeeded().catch(() => {});
  if (process.env.BULK_SHOT) await page.screenshot({ path: process.env.BULK_SHOT });

  console.log("\nRapor ekranlarında görünüyor");
  await page.reload(); await page.waitForTimeout(3500);
  await page.locator("text=SCCM Ajan Raporu").first().click();
  await page.waitForSelector("table", { timeout: 20000 });
  const footer = (await page.locator("text=/kayıttan/").first().innerText()).replace(/\s+/g, " ");
  check("SCCM Ajan Raporu, yüklenen dosyayla açılıyor", /kayıttan/.test(footer) && !/^0 /.test(footer), footer);
  check("Sayfa hatası yok", problems.length === 0, problems.join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  await be.stop();
  rmSync(work, { recursive: true, force: true });
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
