// Gerçek (kullanıcıya ait) dosyalarla tam akış — dosyalar bu makinede yoksa atlanır. Veri repoya girmez, yalnız yerelde okunur.
//   - Documents\Real\C Size Less Than 10 GB.xlsx  (SCCM alt kümesi biçimi, Disk Alanı)
//   - Downloads\Attached Monitors Report.xlsx     (38 bin satır)
//   - Documents\Real\TH.xlsx                      (181 bin satır; açılmış sayfa XML'i SheetJS sınırını aşar → akışlı okuma)
//   node e2e/gercekdosyalar.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { existsSync, readFileSync } from "node:fs";

const FILES = {
  disk: "C:/Users/Lenovo/Documents/Real/C Size Less Than 10 GB.xlsx",
  monitor: "C:/Users/Lenovo/Downloads/Attached Monitors Report.xlsx",
  th: "C:/Users/Lenovo/Documents/Real/TH.xlsx",
};
if (!Object.values(FILES).every(existsSync)) { console.log("Gerçek dosyalar bu makinede yok — test atlandı."); process.exit(0); }

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

// beklenen disk satırı sayısı: Type Desktop/Laptop olan ve Hostname dolu satırlar
const dwb = XLSX.read(readFileSync(FILES.disk), { type: "buffer", dense: true });
const dsheet = dwb.Sheets[dwb.SheetNames[0]];
const grid = XLSX.utils.sheet_to_json(dsheet, { header: 1, defval: "" });
const hi = grid.findIndex((r) => r.map((c) => String(c).trim()).includes("Hostname"));
const H = grid[hi].map((c) => String(c).replace(/\s+/g, " ").trim());
const ti = H.indexOf("Type"), hn = H.indexOf("Hostname");
const dataRows = grid.slice(hi + 1).filter((r) => String(r[hn]).trim() !== "");
const wantDisk = dataRows.filter((r) => ["", "desktop", "laptop", "notebook"].includes(String(r[ti]).trim().toLowerCase())).length; // Type boşsa (tür bilinmiyor) satır tutulur
console.log(`Beklenen: disk dosyasında ${dataRows.length} satır, bunların ${wantDisk}'i Desktop/Laptop ya da Type boş`);

const be = await startBackend({ port: 5106 });
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
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

  await page.locator("[data-bulk-input]").setInputFiles([FILES.disk, FILES.monitor, FILES.th]);
  await page.waitForFunction(() => document.querySelectorAll("[data-bulk-row]").length === 3 && ![...document.querySelectorAll("[data-bulk-row]")].some((r) => r.getAttribute("data-bulk-row") === "wait"), null, { timeout: 180000 });
  const rows = await page.locator("[data-bulk-row]").evaluateAll((trs) => trs.map((tr) => ({ s: tr.getAttribute("data-bulk-row"), t: tr.innerText.replace(/\s+/g, " ") })));
  check("'C Size Less Than 10 GB.xlsx' Disk Alanı olarak tanındı (SCCM envanteri sanılmadı)", /Disk Alanı/.test(rows[0].t) && rows[0].s === "ok", rows[0].t.slice(0, 90));
  check("Gerçek monitör raporu yüklendi", rows[1].s === "ok" && /Monitör/.test(rows[1].t), rows[1].t.slice(0, 80));
  check("Büyük TuruncuHat (181 bin satır) yüklendi", rows[2].s === "ok" && /TuruncuHat/.test(rows[2].t), rows[2].t.slice(0, 80));

  // sunucu tarafı: TH akışla okunuyor (boş değil) ve yalnız Desktop/Notebook/Monitör
  const auth = { Authorization: `Bearer ${be.token}` };
  // büyük dosya sunucuya eşzamansız kaydedilir; yüklenmesini bekle
  let th = { rows: [] };
  for (let i = 0; i < 60 && !(th.rows && th.rows.length > 50000); i++) {
    th = await (await fetch(`${be.base}/api/reports/th-envanteri`, { headers: auth })).json();
    if (!(th.rows && th.rows.length > 50000)) await new Promise((r) => setTimeout(r, 3000));
  }
  const types = new Set((th.rows || []).map((r) => String(r.Model).toUpperCase()));
  check("TuruncuHat: sunucu büyük dosyayı okudu, yalnız Desktop/Notebook/Monitör", th.ok && th.rows.length > 50000 && [...types].every((t) => ["DESKTOP", "NOTEBOOK", "MONITOR"].includes(t)), `${th.rows?.length} satır; ${[...types].join(",")}`);
  const dk = await (await fetch(`${be.base}/api/reports/disk-alani`, { headers: auth })).json();
  check("Disk: sunucu satırları okudu (Type'ı Server/Virtual olan yok)", dk.ok && dk.rows.length === wantDisk, `${dk.rows?.length} / beklenen ${wantDisk}`);

  // arayüz: Atıl Monitörler dolu (TH + Monitör Raporu birlikte)
  await page.reload(); await page.waitForTimeout(4000);
  await page.getByText("Atıl Monitörler", { exact: true }).first().click();
  await page.waitForFunction(() => !/dosyaları gerekir/.test(document.body.innerText) && /kayıt|monitör/i.test(document.body.innerText), null, { timeout: 120000 }).catch(() => {});
  const body = await page.locator("body").innerText();
  check("Atıl Monitörler: 'dosyaları gerekir' mesajı yok, rapor dolu", !/dosyaları gerekir/.test(body));
  await page.getByText("Disk Alanı", { exact: true }).first().click();
  await page.waitForFunction(() => /^[1-9]\d* kayıttan/m.test(document.body.innerText), null, { timeout: 90000 }).catch(() => {});
  const foot = (await page.locator("text=/kayıttan/").first().innerText().catch(() => "")).replace(/\s+/g, " ");
  check("Disk Alanı ekranı dolu", new RegExp(`^${wantDisk} kayıttan`).test(foot), foot);
  check("Sayfa hatası yok", problems.length === 0, problems.join(" | "));
  await ctx.close();
} finally {
  await browser.close(); await be.stop();
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
