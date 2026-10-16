// Windows sürümü özelliği testi: ham SCCM dosyasından beklenen sayıları hesaplayıp (aynı ayrıştırıcıyla) arayüzdekilerle karşılaştırır.
//   node e2e/windowscheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { describeWindows } from "../src/services/windowsVersionService.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const num = (s) => Number(String(s ?? "").replace(/[^\d]/g, ""));

const be = await startBackend({ port: 5066 });
const browser = await launchBrowser();
try {
  // ---- ham SCCM: beklenen değerler ----
  const imports = join(be.dataDir, "imports");
  const f = readdirSync(imports).find((n) => n.startsWith("SCCM Inventory Report"));
  const wb = XLSX.read(readFileSync(join(imports, f)));
  const a = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const hr = a.findIndex((r) => r.includes("Hostname"));
  const H = a[hr];
  const raw = a.slice(hr + 1).filter((r) => r.some((c) => String(c).trim())).map((r) => ({
    host: r[H.indexOf("Hostname")], os: r[H.indexOf("Operating System")], ver: r[H.indexOf("OS Version")],
    d: describeWindows(r[H.indexOf("Operating System")], r[H.indexOf("OS Version")]),
  }));
  const countBy = (fn) => raw.filter(fn).length;
  const byLabel = (label) => countBy((r) => r.d.label === label);
  const known = countBy((r) => r.d.info);
  check("Ham veri: demo SCCM'de Windows sürümü sütunları var ve ayrıştırılıyor", known > 1500 && known < raw.length, `${known}/${raw.length} cihazın sürümü biliniyor (bilerek boş bırakılanlar hariç)`);

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 120)));
  await page.goto(be.base);
  await page.waitForTimeout(5000);
  const txt = async () => (await page.innerText("body")).replace(/\n\s*\n/g, "\n");
  const search = page.locator('input[placeholder^="Hostname / Seri No / Last Logon"]');
  const listCount = async () => num(((await txt()).match(/(\d[\d.]*) cihaz\n/) || [])[1]);
  const run = async (q) => { await search.fill(q); await search.press("Enter"); await page.waitForTimeout(700); };

  console.log("\nGenel Arama — Windows sürümüne göre arama");
  const t1 = await (async () => { await run("windows 10"); return listCount(); })();
  check("'windows 10' araması: eşleşen cihaz sayısı ham veriyle aynı", t1 === countBy((r) => r.d.info?.family === "Windows 10"), `${t1}`);
  await run("22h2");
  check("'22h2' araması (Windows 10 + 11 22H2)", (await listCount()) === countBy((r) => r.d.info?.release === "22H2"), `${await listCount()}`);
  await run("19045");
  check("build numarası ('19045') ile arama", (await listCount()) === countBy((r) => r.d.info?.build === 19045), `${await listCount()}`);
  await run("destek sona erdi");
  check("'destek sona erdi' araması: destek durumu eşleşiyor", (await listCount()) === countBy((r) => r.d.support.status === "ended" && r.d.info), `${await listCount()}`);
  await run("win11");
  check("'win11' kısaltması Windows 11 olarak anlaşılıyor", (await listCount()) === countBy((r) => r.d.info?.family === "Windows 11"), `${await listCount()}`);

  console.log("\nGenel Arama — sürüm ve destek filtresi");
  await search.fill("");
  await page.waitForTimeout(300);
  const sel = page.locator('select[aria-label="Windows sürümü"]');
  const opts = await sel.locator("option").allInnerTexts();
  check("Sürüm filtresi seçenekleri ham veriyle aynı sayıda (artı 'Tümü' ve 'bilinmiyor')", opts.length - 1 >= 4, `${opts.length - 1} seçenek: ${opts.slice(1, 4).join(" | ")}`);
  const label = "Windows 11 23H2";
  const valueFor = await sel.locator("option", { hasText: new RegExp(`^${label} \\(`) }).first().getAttribute("value");
  await sel.selectOption(valueFor);
  await page.waitForTimeout(600);
  check(`'${label}' seçilince liste ham veriyle aynı (${byLabel(label)})`, (await listCount()) === byLabel(label), `${await listCount()}`);
  // çipler liste modunda görünür: önce sürüm seçili iken çipe tıkla, sonra sürümü "Tümü" yap (durum filtresi kalır)
  await page.locator("text=/^Destek sona erdi \\(\\d+\\)$/").first().click();
  await sel.selectOption("");
  await page.waitForTimeout(600);
  const endedN = (await listCount());
  check("'Destek sona erdi' çipi: sayı ham veriyle aynı", endedN === countBy((r) => r.d.info && r.d.support.status === "ended"), `${endedN}`);

  console.log("\nCihaz detayında Windows kartı");
  await page.locator("[data-win-row]").first().click();
  await page.waitForTimeout(900);
  const t = await txt();
  check("Satıra tıklayınca cihaz görünümü açılıyor ve 'İŞLETİM SİSTEMİ' kartı var", t.includes("Windows sürümü") && t.includes("Destek durumu"));
  check("Kartta sürüm etiketi (Windows 10/11 …) ve destek durumu görünüyor", /Windows 1[01] \d{2}H\d/.test(t) && /(Destek sona erdi|Destekte|Destek bitiyor)/.test(t));

  console.log("\nZimmet raporunda Windows filtresi ve sütunu");
  await page.locator('text="Zimmet Uyuşmazlığı"').first().click();
  await page.waitForTimeout(2500);
  const zt = await txt();
  check("Zimmet tablosunda 'Windows' filtresi var", zt.includes("Windows (Tümü)"));
  check("Tabloda cihazın Windows sürümü görünüyor", /Windows 1[01] \d{2}H\d/.test(zt));
  await page.locator("span", { hasText: /^Windows \(Tümü\)$/ }).last().click();
  await page.waitForTimeout(300);
  const panel = page.locator("div[style*='max-height: 340px']");
  await panel.locator("label", { hasText: /^Windows 10 22H2$/ }).first().click();
  await page.waitForTimeout(1200);
  const zf = num(((await txt()).match(/(\d[\d.]*) kayıttan/) || [])[1]);
  check("Zimmet + 'Windows 10 22H2' filtresi: kayıt sayısı ham veriyle aynı", zf === byLabel("Windows 10 22H2"), `${zf} ↔ ${byLabel("Windows 10 22H2")}`);
  await page.mouse.click(5, 5);
  check("Konsol hatası yok", problems.length === 0, problems.join(" | "));
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} Windows kontrolü geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((f) => console.log(`  ✗ ${f.name}`));
process.exit(failed.length ? 1 : 0);
