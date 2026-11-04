// Monitör raporu: başlık satırı 2. satırda DEĞİLSE (ilk satırda / daha aşağıda) yüklenen dosya boş gelmemeli.
// Hem tarayıcıdaki elle yükleme (toast'taki kayıt sayısı) hem sunucuda kalıcı okuma (/api/reports/monitor-raporu) doğrulanır.
//   node e2e/monitorheader.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const be = await startBackend({ port: 5095 });
const browser = await launchBrowser();
const work = mkdtempSync(join(tmpdir(), "varlik-mon-"));
try {
  const cur = join(import.meta.dirname, "..", "..", "backend", "demo-data", "current");
  const src = XLSX.read(readFileSync(join(cur, readdirSync(cur).find((f) => f.startsWith("Attached")))), { type: "buffer" });
  const grid = XLSX.utils.sheet_to_json(src.Sheets[src.SheetNames[0]], { header: 1, defval: "" });
  const headerIdx = grid.findIndex((r) => r.map((c) => String(c).trim()).includes("ID Monitor Serial Number"));
  const body = grid.slice(headerIdx, headerIdx + 51); // başlık + 50 veri satırı
  const make = (name, pad) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...Array(pad).fill(["Attached Monitors"]), ...body]), "S");
    const p = join(work, name);
    XLSX.writeFile(wb, p);
    return p;
  };

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
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

  for (const [pad, label] of [[0, "başlık 1. satırda"], [4, "başlık 5. satırda"]]) {
    const f = make(`Attached Monitors Report_${pad}.xlsx`, pad);
    await page.locator("[data-bulk-input]").setInputFiles([f]);
    await page.waitForFunction(() => document.querySelectorAll("[data-bulk-row]").length >= 1 && ![...document.querySelectorAll("[data-bulk-row]")].some((r) => r.getAttribute("data-bulk-row") === "wait"), null, { timeout: 30000 });
    await page.waitForTimeout(800);
    const st = await page.locator("[data-bulk-row]").first().getAttribute("data-bulk-row");
    check(`Monitör (${label}): yükleme başarılı görünüyor`, st === "ok", st);
    const j = await (await fetch(`${be.base}/api/reports/monitor-raporu`, { headers: { Authorization: `Bearer ${be.token}` } })).json();
    check(`Monitör (${label}): sunucu kalıcı dosyadan 50 kayıt okuyor (boş değil)`, j.ok && j.rows.length === 50 && !!j.rows[0]["ID Monitor Serial Number"], `${j.rows?.length} satır`);
    await page.getByText("Listeyi temizle").click().catch(() => {});
  }
  check("Sayfa hatası yok", problems.length === 0, problems.join(" | "));
  await ctx.close();
} finally {
  await browser.close(); await be.stop();
  rmSync(work, { recursive: true, force: true });
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
