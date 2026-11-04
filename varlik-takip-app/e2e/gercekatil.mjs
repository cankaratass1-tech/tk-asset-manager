// Atıl Monitörler: gerçek dosyalarla "Bilgi dışı kullanılan" sayısı — eski TH (kullanıcı adı var) ve v2 (kullanıcı adı yok → e-posta yedeği). Dosya yoksa atlanır.
//   node e2e/gercekatil.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";
import { existsSync } from "node:fs";

const R = "C:/Users/Lenovo/Documents/Real/";
const MON = R + "Attached Monitors Report (1).xlsx", TH_OLD = R + "TH.xlsx", TH_V2 = R + "Turuncuhat v2.xlsx";
if (![MON, TH_OLD, TH_V2].every(existsSync)) { console.log("Gerçek dosyalar bu makinede yok — test atlandı."); process.exit(0); }
if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };
const num = (s) => Number(String(s).replace(/\./g, ""));

async function run(label, thFile, port) {
  const be = await startBackend({ port });
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 } });
    await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
    await page.goto(be.base); await page.waitForTimeout(3500);
    await page.getByRole("button", { name: /Ayarlar/ }).click(); await page.waitForTimeout(1200);
    await page.locator('input[type="text"]').first().fill("smoke-admin");
    await page.locator('input[type="password"]').first().fill(be.adminHeaders["x-admin-password"]);
    await page.getByRole("button", { name: "Giriş Yap" }).click(); await page.waitForTimeout(1500);
    await page.locator("text=Veri Girişi").last().click(); await page.waitForTimeout(1200);
    await page.locator("[data-bulk-input]").setInputFiles([MON, thFile]);
    await page.waitForFunction(() => document.querySelectorAll("[data-bulk-row]").length === 2 && ![...document.querySelectorAll("[data-bulk-row]")].some((r) => r.getAttribute("data-bulk-row") === "wait"), null, { timeout: 240000 });
    const auth = { Authorization: `Bearer ${be.token}` };
    let th = { rows: [] };
    for (let i = 0; i < 80 && !(th.rows && th.rows.length > 50000); i++) { th = await (await fetch(`${be.base}/api/reports/th-envanteri`, { headers: auth })).json(); if (!(th.rows && th.rows.length > 50000)) await new Promise((r) => setTimeout(r, 3000)); }
    await page.reload(); await page.waitForTimeout(6000);
    await page.getByText("Atıl Monitörler", { exact: true }).first().click();
    let st = { atil: 0, outside: 0 }, prev = "", same = 0;
    for (let i = 0; i < 60 && same < 3; i++) {
      await page.waitForTimeout(2500);
      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      const o = body.match(/([\d.]+) Bilgi dışı kullanılan/i), a = body.match(/([\d.]+) Atıl/i);
      st = { atil: a ? num(a[1]) : 0, outside: o ? num(o[1]) : 0 };
      const key = JSON.stringify(st); same = key === prev && st.atil > 0 ? same + 1 : 0; prev = key;
    }
    console.log(`[${label}] Atıl: ${st.atil} | Bilgi dışı kullanılan: ${st.outside}`);
    return { ...st, errs };
  } finally { await browser.close(); await be.stop(); }
}

const a = await run("ESKİ TH.xlsx", TH_OLD, 5140);
const b = await run("v2", TH_V2, 5141);
check("Eski biçim: Bilgi dışı kullanılan > 0 (kullanıcı adıyla)", a.outside > 1000, `${a.outside}`);
check("v2: Bilgi dışı kullanılan artık 0 DEĞİL (e-posta yedeği)", b.outside > 1000, `${b.outside}`);
check("v2 ile eski biçim aynı büyüklükte (±%15)", Math.abs(a.outside - b.outside) / Math.max(1, a.outside) < 0.15, `eski ${a.outside} / v2 ${b.outside}`);
check("Atıl sayısı iki biçimde de yakın (±%10)", Math.abs(a.atil - b.atil) / Math.max(1, a.atil) < 0.1, `eski ${a.atil} / v2 ${b.atil}`);
check("Sayfa hatası yok", a.errs.length === 0 && b.errs.length === 0, [...a.errs, ...b.errs].join(" | "));
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
