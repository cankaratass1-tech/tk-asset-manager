// Gerçek dosyalarla: eski TuruncuHat (TH.xlsx) ile "Turuncuhat v2.xlsx" aynı SCCM/İnaktif/Monitör/BSOD dosyalarıyla karşılaştırılır.
// v2 eşlemesi doğruysa Zimmet sonuçları (Doğru/Hatalı/OBS…) eski biçimle aynı büyüklükte çıkmalıdır. Dosyalar yoksa test atlanır.
//   node e2e/gercekv2.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";
import { existsSync } from "node:fs";

const R = "C:/Users/Lenovo/Documents/Real/";
const SHARED = ["SCCM Inventory Report-W Collection.xlsx", "SahibiBilgisiBoşOlan--VarlıkSorumlusuİnaktifOlanCihazlar.xlsx", "Attached Monitors Report (1).xlsx", "Weekly_BSOD.xlsx", "C Size Less Than 10 GB.xlsx"].map((f) => R + f);
const LABELS = ["SCCM Envanteri", "İnaktif Cihazlar", "Monitör Raporu", "Weekly BSOD", "Disk Alanı", "TuruncuHat"]; // SHARED sırası + TH
const TH_OLD = R + "TH.xlsx", TH_V2 = R + "Turuncuhat v2.xlsx";
if (![...SHARED, TH_OLD, TH_V2].every(existsSync)) { console.log("Gerçek dosyalar bu makinede yok — test atlandı."); process.exit(0); }

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };
const num = (s) => Number(String(s).replace(/\./g, ""));

// Zimmet şeridi: "<sayı> <etiket>" çiftlerini tek seferde okur
const readStrip = (page) => page.evaluate(() => {
  const want = { toplam: "Toplam Kayıt", dogru: "Zimmet Doğru", hatali: "Zimmet Hatalı", dogrulanamayan: "Doğrulanamayan", obs: "OBS (Müdürlük)" };
  const out = {};
  for (const [k, label] of Object.entries(want)) {
    const el = [...document.querySelectorAll("div")].reverse().find((d) => d.children.length === 2 && d.children[1].innerText.trim() === label && /^[\d.]+$/.test(d.children[0].innerText.trim()));
    out[k] = el ? Number(el.children[0].innerText.replace(/\./g, "")) : 0;
  }
  return out;
});

async function run(label, thFile, port) {
  const be = await startBackend({ port });
  const browser = await launchBrowser();
  const out = {};
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
    const files = [...SHARED, thFile];
    await page.locator("[data-bulk-input]").setInputFiles(files);
    await page.waitForFunction((n) => document.querySelectorAll("[data-bulk-row]").length === n && ![...document.querySelectorAll("[data-bulk-row]")].some((r) => r.getAttribute("data-bulk-row") === "wait"), files.length, { timeout: 240000 });
    const rows = await page.locator("[data-bulk-row]").evaluateAll((trs) => trs.map((tr) => ({ s: tr.getAttribute("data-bulk-row"), t: tr.innerText.replace(/\s+/g, " ").slice(0, 100) })));
    out.bulkOk = rows.every((r) => r.s === "ok");
    out.bulk = rows;
    const auth = { Authorization: `Bearer ${be.token}` };
    let th = { rows: [] };
    for (let i = 0; i < 80 && !(th.rows && th.rows.length > 50000); i++) {
      th = await (await fetch(`${be.base}/api/reports/th-envanteri`, { headers: auth })).json();
      if (!(th.rows && th.rows.length > 50000)) await new Promise((r) => setTimeout(r, 3000));
    }
    out.thRows = th.rows?.length || 0;
    const kinds = {}; (th.rows || []).forEach((r) => { const k = String(r["Konum Kategorisi"] || "(boş)"); kinds[k] = (kinds[k] || 0) + 1; });
    out.kinds = kinds;
    await page.reload(); await page.waitForTimeout(5000);
    await page.getByText("Zimmet Uyuşmazlığı", { exact: true }).first().click();
    // şerit sayıları tutarlı (Toplam = Doğru + Hatalı + Doğrulanamayan + OBS) ve dolu olana kadar bekle
    // veriler (TuruncuHat, monitör, SCCM) arayüze sırayla gelir; şerit sayıları 3 ölçüm üst üste aynı kalana kadar beklenir
    let z = {}, same = 0, prev = "";
    for (let i = 0; i < 120 && same < 3; i++) {
      await page.waitForTimeout(3000);
      z = await readStrip(page);
      const key = JSON.stringify(z);
      same = key === prev && z.toplam > 5000 && z.toplam === z.dogru + z.hatali + z.dogrulanamayan + z.obs ? same + 1 : 0;
      prev = key;
    }
    out.zimmet = z;
    out.errors = problems;
    await ctx.close();
  } finally {
    await browser.close(); await be.stop();
  }
  console.log(`\n[${label}] TH satırı: ${out.thRows} | Konum: ${JSON.stringify(out.kinds)}\n[${label}] Zimmet: ${JSON.stringify(out.zimmet)}`);
  return out;
}

const a = await run("ESKİ TH.xlsx", TH_OLD, 5108);
const b = await run("v2", TH_V2, 5109);
console.log("\nKarşılaştırma");
for (const [n, o] of [["Eski", a], ["v2", b]]) check(`${n}: her dosya doğru türe gitti (SCCM envanteri Disk sanılmadı)`, o.bulk.length === LABELS.length && o.bulk.every((r, i) => r.t.includes(LABELS[i])), o.bulk.map((r, i) => `${LABELS[i]}: ${r.t.includes(LABELS[i]) ? "ok" : r.t.slice(0, 50)}`).filter((x) => !x.endsWith(": ok")).join(" | "));
check("Eski biçim: tüm dosyalar yüklendi", a.bulkOk, a.bulk.filter((r) => r.s !== "ok").map((r) => r.t).join(" | "));
check("v2: tüm dosyalar yüklendi (uyarı/hata yok)", b.bulkOk, b.bulk.filter((r) => r.s !== "ok").map((r) => r.t).join(" | "));
check("v2: TuruncuHat okundu (>50 bin Desktop/Notebook/Monitör)", b.thRows > 50000, `${b.thRows}`);
check("v2: Konum (User/OBS) bilgisi dolu", (b.kinds.User || 0) > 10000 && (b.kinds.OBS || 0) > 1000, JSON.stringify(b.kinds));
for (const [n, o] of [["Eski", a], ["v2", b]]) {
  const z = o.zimmet;
  check(`${n}: Zimmet listesi dolu ve tutarlı (Toplam = Doğru + Hatalı + Doğrulanamayan + OBS)`, z.toplam > 5000 && z.toplam === z.dogru + z.hatali + z.dogrulanamayan + z.obs, JSON.stringify(z));
  check(`${n}: 'Zimmet Doğru' sayısı anlamlı (>1000)`, z.dogru > 1000, `${z.dogru}`);
}
const share = (z) => z.dogru / Math.max(1, z.dogru + z.hatali);
check("v2: 'Zimmet Doğru' payı eski biçimle aynı büyüklükte (±10 puan)", Math.abs(share(a.zimmet) - share(b.zimmet)) < 0.1, `eski %${Math.round(share(a.zimmet) * 100)} / v2 %${Math.round(share(b.zimmet) * 100)}`);
check("Sayfa hatası yok", a.errors.length === 0 && b.errors.length === 0, [...a.errors, ...b.errors].join(" | "));
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
