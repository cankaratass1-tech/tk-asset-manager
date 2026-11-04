// Hangi raporda hangi cihaz türü görünür: ekrandaki HER satır denetlenir (TuruncuHat'taki gerçek türle karşılaştırılarak) ve tüm raporlarda sayfa hatası aranır.
//   - İnaktif: yalnız bilgisayar (Desktop/Notebook); monitör yok
//   - Disk Alanı: tüm diskler (tür ayrımı yok)
//   - Zimmet Uyuşmazlığı: Desktop, Notebook, Monitör (başka tür yok); şirket bilgisi satırda
//   - Kullanılmayan: yalnız bilgisayar
//   - Atıl Monitörler: yalnız monitör
//   node e2e/cihazturleri.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };
const n = (v) => String(v ?? "").trim().toLowerCase();

const cur = join(import.meta.dirname, "..", "..", "backend", "demo-data", "current");
const thWb = XLSX.read(readFileSync(join(cur, readdirSync(cur).find((f) => f.startsWith("TH_")))), { type: "buffer" });
const thType = new Map(XLSX.utils.sheet_to_json(thWb.Sheets[thWb.SheetNames[0]], { defval: "" }).map((r) => [n(r["Seri No"]), String(r.Model).toUpperCase()]));

const be = await startBackend({ port: 5096 });
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 140)}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 140)}`); });
  await page.goto(be.base); await page.waitForTimeout(5000);

  const open = async (name) => { await page.getByText(name, { exact: true }).first().click(); await page.waitForTimeout(2500); };
  const showAll = async () => {
    const all = page.locator("xpath=//div[normalize-space()='100']/following-sibling::div[normalize-space()='Tümü']").first();
    if (await all.count()) { await all.click(); await page.waitForTimeout(1500); }
  };
  const rows = () => page.locator("tbody tr").evaluateAll((trs) => trs.filter((t) => t.querySelector("input[type=checkbox]")).map((t) => ({ cells: [...t.querySelectorAll("td")].map((td) => td.innerText.trim()), text: t.innerText })));
  const footerCount = async () => Number((((await page.locator("text=/kayıttan/").first().innerText().catch(() => "")).match(/^(\d+) kayıttan/)) || [])[1]);
  const serialOf = (r) => (r.cells[2] || r.cells[1] || "").split("\n")[0].trim();

  // ---------- İnaktif ----------
  console.log("İnaktif Cihazlar");
  await open("İnaktif Cihazlar"); await showAll();
  let rs = await rows();
  const iTypes = rs.map((r) => thType.get(n(serialOf(r))) || "(TH'de yok)");
  const iBad = iTypes.filter((t) => !["DESKTOP", "NOTEBOOK", "(TH'de yok)"].includes(t));
  check("İnaktif: listede monitör / başka tür yok (TH'deki gerçek türle)", rs.length > 0 && iBad.length === 0, `${rs.length} satır; sayım: ${JSON.stringify(iTypes.reduce((a, t) => ({ ...a, [t]: (a[t] || 0) + 1 }), {}))}`);
  check("İnaktif: metinde 'Monitor' geçen satır yok", !rs.some((r) => /monitor|monitör/i.test(r.cells.slice(1, 3).join(" "))));

  // ---------- Disk ----------
  console.log("\nDisk Alanı");
  await open("Disk Alanı");
  check("Disk: tüm diskler listeleniyor (tür ayrımı yok)", (await footerCount()) === 400, `${await footerCount()} kayıt`);

  // ---------- Zimmet ----------
  console.log("\nZimmet Uyuşmazlığı");
  await open("Zimmet Uyuşmazlığı");
  const noDepo = (await page.locator("tbody tr", { hasText: /Depo (Warehouse)/ }).count()) === 0;
  check("Zimmet: yalnız User (kişi) zimmetleri listeleniyor (depo yok)", noDepo);
  await showAll();
  rs = await rows();
  check("Zimmet: yalnız User zimmetleri (2888 kayıt) listeleniyor", (await footerCount()) === 2888, `${await footerCount()} kayıt`);
  const kinds = rs.map((r) => ((r.cells[2] || "").split("\n")[1] || "").split(" — ")[0].trim().toLowerCase());
  const okKinds = new Set(["desktop", "laptop", "notebook", "monitor"]);
  const badKinds = kinds.filter((k) => !okKinds.has(k));
  const cnt = kinds.reduce((a, k) => ({ ...a, [k]: (a[k] || 0) + 1 }), {});
  check("Zimmet: yalnız Desktop / Notebook(Laptop) / Monitör satırları (tablet, yazıcı vb. yok)", rs.length > 0 && badKinds.length === 0, JSON.stringify(cnt));
  check("Zimmet: monitör satırları da listeleniyor", (cnt.monitor || 0) > 0);
  check("Zimmet: satırlarda şirket etiketi görünüyor", (await page.locator("[data-company-tag]").count()) > 0, `${await page.locator("[data-company-tag]").count()} etiket`);

  // ---------- Kullanılmayan ----------
  console.log("\nKullanılmayan Cihazlar");
  await open("Kullanılmayan Cihazlar"); await showAll();
  rs = await rows();
  const uTypes = rs.map((r) => thType.get(n(serialOf(r))) || "(TH'de yok)");
  check("Kullanılmayan: yalnız bilgisayar (Desktop/Notebook), monitör yok", rs.length > 0 && uTypes.every((t) => ["DESKTOP", "NOTEBOOK"].includes(t)), `${rs.length} satır; ${JSON.stringify(uTypes.reduce((a, t) => ({ ...a, [t]: (a[t] || 0) + 1 }), {}))}`);

  // ---------- Atıl Monitörler ----------
  console.log("\nAtıl Monitörler");
  await open("Atıl Monitörler"); await showAll();
  const body = await page.locator("body").innerText();
  const serials = [...new Set((body.match(/[A-Z0-9]{6,}/g) || []).filter((s) => thType.has(n(s))))];
  const nonMon = serials.filter((s) => thType.get(n(s)) !== "MONITOR");
  check("Atıl Monitörler: ekrandaki TH seri numaralarının hepsi MONITOR", serials.length > 0 && nonMon.length === 0, `${serials.length} seri no; monitör olmayan: ${nonMon.slice(0, 3).join(", ") || "yok"}`);

  // ---------- Tüm raporlarda hata taraması ----------
  console.log("\nTüm raporlar");
  for (const name of ["Ana Sayfa", "İnaktif Cihazlar", "Disk Alanı", "Zimmet Uyuşmazlığı", "Lokasyon Hostname ve IP Uyuşmazlığı", "Kullanılmayan Cihazlar", "Atıl Monitörler", "Kapatma Onayı Bekleyen Kayıtlar", "Yeni Kurulum Kaydı", "SCCM Ajan Raporu", "Battery Health", "Ajan Yüklü Cihazlar", "BSOD", "Bottleneck", "Ofis Bant Genişliği", "Gönderim Geçmişi"]) {
    await page.getByText(name, { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  check("Tüm sayfalar gezildi: sayfa/konsol hatası yok", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
} finally {
  await browser.close(); await be.stop();
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
