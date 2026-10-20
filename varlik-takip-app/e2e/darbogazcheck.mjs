// LAKESIDE > Bottleneck testi: sayılar ham dosyalardan bağımsız hesaplanıp arayüzle karşılaştırılır (CPU/RAM alanları kaldırıldı).
//   node e2e/darbogazcheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { classifyDisk } from "../src/services/dashboardService.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const num = (s) => Number(String(s ?? "").replace(/[^\d]/g, ""));

const be = await startBackend({ port: 5068 });
const browser = await launchBrowser();
try {
  const imports = join(be.dataDir, "imports");
  const short = (h) => String(h).trim().split(".")[0].toLowerCase();
  const rows = (prefix, hr) => { const f = readdirSync(imports).find((n) => n.includes(prefix)); const wb = XLSX.read(readFileSync(join(imports, f))); const a = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }); const H = a[hr].map(String); return a.slice(hr + 1).filter((r) => r.some((c) => String(c).trim())).map((r) => Object.fromEntries(H.map((h, i) => [h, r[i]]))); };
  // beklenen: disk seviyesi kritik/uyarı olan cihaz sayısı (cihazın en kötü birimi) ve BSOD'u olan cihaz sayısı
  const disk = rows("DiskAlani", 5);
  const minFree = new Map();
  disk.forEach((r) => { const h = short(r["Name"] || r["Device ID"]); const gb = Number(r["Free Space"]) / 1024; if (!minFree.has(h) || gb < minFree.get(h)) minFree.set(h, gb); });
  const diskBad = [...minFree.values()].filter((gb) => ["critical", "warning"].includes(classifyDisk(gb))).length;
  const bsodHosts = new Set(rows("Weekly_BSOD", 1).map((r) => short(r["Machine Name"]))).size;

  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 120)));
  await page.goto(be.base);
  await page.waitForTimeout(4500);
  const txt = async () => (await page.innerText("body")).replace(/\n\s*\n/g, "\n");
  const count = async () => num(((await page.locator("[data-darbogaz-count]").innerText()) || "").split(" ")[0]);

  console.log("Menü ve ekran");
  check("LAKESIDE kategorisinde 'Bottleneck' menüsü var", (await txt()).includes("Bottleneck"));
  await page.locator('text="Bottleneck"').first().click();
  await page.waitForSelector("[data-darbogaz-summary]", { timeout: 25000 });
  await page.waitForTimeout(1500);
  const sum = (await page.locator("[data-darbogaz-summary]").innerText()).split("\n").map((s) => s.trim()).filter(Boolean);
  const tileVal = (label) => num(sum[sum.indexOf(label) - 1]);
  check("Özet: analiz edilen cihaz > 1000 ve bottleneck cihaz > 0", tileVal("Analiz edilen cihaz") > 1000 && tileVal("Bottleneck cihaz") > 0, `${tileVal("Analiz edilen cihaz")} / ${tileVal("Bottleneck cihaz")}`);
  check("Varsayılan liste yalnızca bottleneck cihazlar (sayı özetle aynı)", (await count()) === tileVal("Bottleneck cihaz"), `${await count()}`);
  const heads = (await page.locator("[data-darbogaz-table] th").allInnerTexts()).map((x) => x.toUpperCase().replace("İ", "I"));
  check("Tablo sütunları: Disk, BSOD, Pil, Cihaz yaşı, Skor", ["DISK", "BSOD", "PIL", "CIHAZ YAŞI", "SKOR"].every((h) => heads.includes(h.replace("İ", "I"))), heads.join(","));
  check("CPU ve RAM sütunları kaldırıldı", !heads.includes("CPU") && !heads.includes("RAM"));
  check("Neden kartları yalnız 4 sinyal (Disk, BSOD, Pil, Cihaz yaşı); CPU/RAM kartı yok", (await page.locator("[data-darbogaz-cause]").count()) === 4 && (await page.locator('[data-darbogaz-cause="cpu"], [data-darbogaz-cause="ram"]').count()) === 0);
  check("CPU/RAM dosyası yükleme düğmesi kaldırıldı", (await page.locator("[data-darbogaz-upload]").count()) === 0 && !/CPU\/RAM/i.test(await txt()));

  console.log("\nNeden filtresi (ham dosyalarla karşılaştırma)");
  await page.locator("text=Bottleneck olmayanları da göster").click();
  await page.locator('[data-darbogaz-cause="disk"]').click();
  await page.waitForTimeout(500);
  check("Disk filtresi + tümü: en kötü birimi kritik/uyarı olan cihaz sayısı ham dosyayla aynı", (await count()) === diskBad, `${await count()} ↔ ${diskBad}`);
  await page.locator('[data-darbogaz-cause="disk"]').click();
  await page.locator('[data-darbogaz-cause="bsod"]').click();
  await page.waitForTimeout(500);
  check("BSOD filtresi + tümü: BSOD kaydı olan cihaz sayısı ham dosyayla aynı", (await count()) === bsodHosts, `${await count()} ↔ ${bsodHosts}`);
  await page.locator('[data-darbogaz-cause="bsod"]').click();
  await page.locator("text=Bottleneck olmayanları da göster").click(); // yalnız bottleneck listesine dön
  await page.locator("text=Sadece kritik").click();
  await page.waitForTimeout(400);
  check("'Sadece kritik' filtresi çalışıyor (liste daralıyor)", (await count()) > 0 && (await count()) <= tileVal("Bottleneck cihaz"), `${await count()}`);
  check("Konsol hatası yok", problems.length === 0, problems.join(" | "));
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} bottleneck kontrolü geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((x) => console.log(`  ✗ ${x.name}`));
process.exit(failed.length ? 1 : 0);
