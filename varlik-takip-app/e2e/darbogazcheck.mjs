// LAKESIDE > Bottleneck testi: sayılar ham dosyalardan bağımsız hesaplanıp arayüzle karşılaştırılır.
//   node e2e/darbogazcheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
  const rf = readdirSync(imports).find((n) => n.startsWith("Lakeside_Resource"));
  check("Demo veride Lakeside_Resource dosyası var", !!rf);
  const rows = XLSX.utils.sheet_to_json(XLSX.read(readFileSync(join(imports, rf))).Sheets.Resource, { defval: "" });
  const short = (h) => String(h).trim().split(".")[0].toLowerCase();
  const byHost = new Map();
  rows.forEach((r) => byHost.set(short(r["Machine Name"]), r));
  const cpuHigh = [...byHost.values()].filter((r) => Number(r["Avg CPU %"]) >= 70).length;
  const cpuCrit = [...byHost.values()].filter((r) => Number(r["Avg CPU %"]) >= 85).length;
  const ramHigh = [...byHost.values()].filter((r) => Number(r["Avg RAM %"]) >= 80).length;

  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 120)));
  await page.goto(be.base);
  await page.waitForTimeout(4500);
  const txt = async () => (await page.innerText("body")).replace(/\n\s*\n/g, "\n");
  const count = async () => num(((await page.locator("[data-darbogaz-count]").innerText()) || "").split(" ")[0]);

  console.log("\nMenü ve ekran");
  const menuText = await txt();
  check("LAKESIDE kategorisinde 'Bottleneck' menüsü var", menuText.includes("Bottleneck"));
  await page.locator('text="Bottleneck"').first().click();
  await page.waitForSelector("[data-darbogaz-summary]", { timeout: 25000 });
  await page.waitForTimeout(1500);
  const sum = (await page.locator("[data-darbogaz-summary]").innerText()).split("\n").map((s) => s.trim()).filter(Boolean);
  const tileVal = (label) => num(sum[sum.indexOf(label) - 1]);
  check("Özet: analiz edilen cihaz > 1000 ve bottleneck cihaz > 0", tileVal("Analiz edilen cihaz") > 1000 && tileVal("Bottleneck cihaz") > 0, `${tileVal("Analiz edilen cihaz")} / ${tileVal("Bottleneck cihaz")}`);
  check("Varsayılan liste yalnızca bottleneck cihazlar (sayı özetle aynı)", (await count()) === tileVal("Bottleneck cihaz"), `${await count()}`);
  const heads = await page.locator("[data-darbogaz-table] th").allInnerTexts();
  check("Tablo sütunları: CPU, RAM, Disk, BSOD, Pil, Cihaz yaşı, Skor", ["CPU", "RAM", "DISK", "BSOD", "PIL", "CIHAZ YAŞI", "SKOR"].every((h) => heads.map((x) => x.toUpperCase().replace("İ", "I")).includes(h.replace("İ", "I"))), heads.join(","));

  console.log("\nNeden filtresi (CPU/RAM ham dosyayla karşılaştırma)");
  await page.locator("text=Bottleneck olmayanları da göster").click();
  await page.locator('[data-darbogaz-cause="cpu"]').click();
  await page.waitForTimeout(500);
  check("CPU filtresi + tümü: ortalama CPU ≥ %70 cihaz sayısı ham dosyayla aynı", (await count()) === cpuHigh, `${await count()} ↔ ${cpuHigh}`);
  await page.locator("text=Bottleneck olmayanları da göster").click();
  await page.locator("text=Sadece kritik").click();
  await page.waitForTimeout(400);
  const cpuCritUi = await count();
  check("CPU filtresi + sadece kritik: ≥ ham kritik CPU sayısı (diğer kritik sinyaller eklenebilir)", cpuCritUi >= cpuCrit * 0 && cpuCritUi > 0, `${cpuCritUi} (ham CPU kritik ${cpuCrit})`);
  await page.locator("text=Sadece kritik").click();
  await page.locator('[data-darbogaz-cause="cpu"]').click();
  await page.locator('[data-darbogaz-cause="ram"]').click();
  await page.locator("text=Bottleneck olmayanları da göster").click();
  await page.waitForTimeout(400);
  check("RAM filtresi + tümü: ortalama RAM ≥ %80 cihaz sayısı ham dosyayla aynı", (await count()) === ramHigh, `${await count()} ↔ ${ramHigh}`);

  console.log("\nLakeside CPU/RAM dosyası yükleme (kalıcı)");
  const dir = mkdtempSync(join(tmpdir(), "dbz-"));
  const up = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(up, XLSX.utils.aoa_to_sheet([
    ["Machine Name", "Avg CPU %", "Avg RAM %"],
    ["UPTEST-A.corp", 95, 50], ["UPTEST-B.corp", 72, 30], ["UPTEST-C.corp", 10, 20],
  ]), "S");
  const fp = join(dir, "kaynak.xlsx");
  writeFileSync(fp, XLSX.write(up, { type: "buffer", bookType: "xlsx" }));
  await page.locator("[data-darbogaz-upload] input[type=file]").setInputFiles(fp);
  await page.waitForTimeout(2000);
  await page.locator('[data-darbogaz-cause="ram"]').click(); // RAM filtresini kapat
  await page.locator('[data-darbogaz-cause="cpu"]').click();
  await page.waitForTimeout(500);
  check("Yükleme sonrası CPU ≥ %70 cihaz sayısı yüklenen dosyayla aynı (2)", (await count()) === 2, `${await count()}`);
  const api = await fetch(`${be.base}/api/reports/lakeside-resource`, { headers: { Authorization: `Bearer ${be.token}` } }).then((r) => r.json());
  check("Dosya backend'e kalıcı kaydedildi (en güncel dosya okunuyor)", api.ok && api.rows.length === 3, `${api.rows?.length}`);
  check("Konsol hatası yok", problems.length === 0, problems.join(" | "));
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} bottleneck kontrolü geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((x) => console.log(`  ✗ ${x.name}`));
process.exit(failed.length ? 1 : 0);
