// Şirket filtresi (sol menü: Tüm Şirketler / AJET / TKAO) kontrolü. [ŞİRKET-FİLTRESİ — bkz. KRITIK-NOTLAR.md]
// Filtre; İnaktif, Kullanılmayan, Zimmet, Lokasyon IP, BSOD, Battery, Atıl Monitör ekranlarına ve Dashboard kartlarına uygulanır.
// Disk Alanı dosyasında şirket bilgisi yoktur: sol menüde "—", dashboard'da disk şirket görünümüne dahil edilmez.
//   node e2e/companycheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const num = (s) => Number(String(s ?? "").replace(/[^\d]/g, ""));

const be = await startBackend({ port: 5059 });
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  await page.goto(be.base);
  await page.waitForTimeout(4000);
  const txt = async () => (await page.innerText("body")).replace(/\n\s*\n/g, "\n");
  const pick = (t, re) => num((t.match(re) || [])[1]);
  const sideRaw = async () => Object.fromEntries([...(await txt()).matchAll(/^(Tüm Şirketler|AJET|TKAO)\n(\d[\d.]*|—)$/gm)].map((m) => [m[1], m[2]]));
  const side = async () => Object.fromEntries(Object.entries(await sideRaw()).map(([k, v]) => [k, num(v)]));
  const select = async (name, co) => {
    await page.locator(`text="${name}"`).first().click();
    await page.waitForTimeout(800);
    await page.locator(`text="${co}"`).first().click();
    await page.waitForTimeout(1600);
  };
  const COMPANIES = ["AJET", "TKAO"];
  const totalRe = /(\d[\d.]*)\ntoplam kayıt/;

  // ---- ham dosya: Sahibi Firma dağılımı (İnaktif) ----
  const imports = join(be.dataDir, "imports");
  const f = readdirSync(imports).find((n) => n.startsWith("InaktifCihazlar"));
  const wb = XLSX.read(readFileSync(join(imports, f)));
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { defval: "" });
  const rawCount = (co) => raw.filter((r) => String(r["Sahibi Firma"]).toUpperCase().includes(co)).length;

  console.log("\nAna Sayfa sol menü sayıları (İnaktif tabanlı)");
  const s0 = await side();
  for (const co of COMPANIES) check(`Sidebar '${co}' = ham İnaktif dosyası (Sahibi Firma)`, s0[co] === rawCount(co), `${s0[co]} ↔ ${rawCount(co)}`);
  check("Sidebar şirket sayılarının toplamı = 'Tüm Şirketler'", COMPANIES.reduce((a, c) => a + s0[c], 0) === s0["Tüm Şirketler"], JSON.stringify(s0));

  // ---- her rapor: şirket seçilince ekran = sidebar; AJET + TKAO = Tüm Şirketler ----
  const REPORTS = [
    ["İnaktif Cihazlar", true],
    ["Kullanılmayan Cihazlar", true],
    ["Zimmet Uyuşmazlığı", false],
    ["Lokasyon Hostname ve IP Uyuşmazlığı", false],
    ["BSOD", false],
    ["Battery Health", false],
  ];
  const screenTotals = {};
  for (const [name, mustSumExactly] of REPORTS) {
    console.log(`\n${name}`);
    await select(name, "Tüm Şirketler");
    const t0 = await txt();
    const all = pick(t0, totalRe);
    const sAll = await side();
    check(`${name}: sol menüde 'Tüm Şirketler' sayısı = ekran toplamı`, sAll["Tüm Şirketler"] === all, `${sAll["Tüm Şirketler"]} ↔ ${all}`);
    const parts = {};
    for (const co of COMPANIES) {
      await select(name, co);
      const t = await txt();
      parts[co] = pick(t, totalRe);
      const sc = await side();
      check(`${name} [${co}]: ekran toplamı = sol menü sayısı`, parts[co] === sc[co], `${parts[co]} ↔ ${sc[co]}`);
      check(`${name} [${co}]: toplamı aşmıyor`, parts[co] <= all, `${parts[co]} / ${all}`);
    }
    // filtre gerçekten uygulanıyorsa en az bir şirketin sayısı toplamdan küçük olmalı (küçük demo listelerde biri toplamın tamamı olabilir)
    check(`${name}: filtre uygulanıyor (en az bir şirket toplamdan küçük)`, COMPANIES.some((c) => parts[c] < all), `${parts.AJET} / ${parts.TKAO} / ${all}`);
    const sum = COMPANIES.reduce((a, c) => a + parts[c], 0);
    // Şirketi bilinmeyen satırlar (ör. SCCM'de eşleşmeyen BSOD/Battery cihazı) iki şirkete de girmez → toplam ≤ Tüm
    check(`${name}: AJET + TKAO ${mustSumExactly ? "=" : "≤"} Tüm Şirketler`, mustSumExactly ? sum === all : sum <= all, `${parts.AJET} + ${parts.TKAO} = ${sum} ↔ ${all}${sum < all ? ` (${all - sum} satırın şirketi belirsiz)` : ""}`);
    screenTotals[name] = { all, ...parts };
  }

  console.log("\nAtıl Monitörler");
  const atilTotal = async (co) => {
    await select("Atıl Monitörler", co);
    return pick(await txt(), /TuruncuHat monitör toplam[^\n]*\n?(\d[\d.]*)|(\d[\d.]*)\nTuruncuHat monitör toplam/);
  };
  await select("Atıl Monitörler", "Tüm Şirketler");
  const aText = await txt();
  const atilNum = (t) => {
    const m = t.match(/TuruncuHat monitör toplam\s*\n?\s*(\d[\d.]*)/) || t.match(/(\d[\d.]*)\s*\n?\s*TuruncuHat monitör toplam/);
    return m ? num(m[1]) : NaN;
  };
  const aAll = atilNum(aText);
  const aParts = [];
  for (const co of COMPANIES) {
    await select("Atıl Monitörler", co);
    aParts.push(atilNum(await txt()));
  }
  check("Atıl Monitörler: AJET + TKAO = Tüm Şirketler ('TuruncuHat monitör toplam')", aParts.every((n) => n > 0 && n < aAll) && aParts.reduce((a, b) => a + b, 0) === aAll, `${aParts.join(" + ")} ↔ ${aAll}`);
  void atilTotal;

  console.log("\nDisk Alanı (dosyada şirket bilgisi yok)");
  await select("Disk Alanı", "AJET");
  const sd = await sideRaw();
  check("Disk ekranında sol menü şirket sayıları '—' gösteriyor (yanıltıcı 0 değil)", sd["AJET"] === "—" && sd["TKAO"] === "—" && sd["Tüm Şirketler"] === "—", JSON.stringify(sd));

  console.log("\nDashboard");
  await select("Ana Sayfa", "Tüm Şirketler");
  const dAll = await txt();
  const open = (t) => pick(t, /Açık Bulgu\n([\d.]+)/);
  const dev = (t) => pick(t, /Toplam Cihaz\n([\d.]+)/);
  const card = (t, label) => pick(t, new RegExp(`(\\d[\\d.]*)\\n${label}`));
  for (const co of COMPANIES) {
    await select("Ana Sayfa", co);
    const d = await txt();
    check(`Ana Sayfa [${co}]: Açık bulgu = inaktif + zimmet hatalı + kullanılmayan (disk hariç)`, open(d) === pick(d, /İnaktif Cihaz\t([\d.]+)/) + pick(d, /Zimmet Hatalı\t([\d.]+)/) + pick(d, /Kullanılmayan\t([\d.]+)/) && pick(d, /Kritik Disk\t([\d.]+)/) === 0, `açık ${open(d)}`);
    check(`Ana Sayfa [${co}]: Açık bulgu ve Toplam cihaz Tüm Şirketler'den küçük`, open(d) < open(dAll) && dev(d) < dev(dAll), `açık ${open(d)}/${open(dAll)}, toplam cihaz ${dev(d)}/${dev(dAll)}`);
    check(`Ana Sayfa [${co}]: 'inaktif cihaz' kartı = İnaktif ekranı`, card(d, "inaktif cihaz") === screenTotals["İnaktif Cihazlar"][co], `${card(d, "inaktif cihaz")} ↔ ${screenTotals["İnaktif Cihazlar"][co]}`);
    check(`Ana Sayfa [${co}]: kullanılmayan = Kullanılmayan ekranı`, pick(d, /Kullanılmayan\t([\d.]+)/) === screenTotals["Kullanılmayan Cihazlar"][co], `${pick(d, /Kullanılmayan\t([\d.]+)/)} ↔ ${screenTotals["Kullanılmayan Cihazlar"][co]}`);
    check(`Ana Sayfa [${co}]: disk kartı '—' ve açıklama notu görünüyor`, d.includes("şirket bazında ayrılamaz") && d.includes("disk sayıları şirket görünümüne dahil edilmedi"));
  }
  // Zimmet kartı = Zimmet ekranındaki 'zimmet hatalı' (şirket seçiliyken)
  for (const co of COMPANIES) {
    await select("Zimmet Uyuşmazlığı", co);
    const zHatali = pick(await txt(), /(\d[\d.]*)\nzimmet hatalı/);
    await select("Ana Sayfa", co);
    check(`Ana Sayfa [${co}]: zimmet uyuşmazlığı kartı = Zimmet ekranı 'zimmet hatalı'`, card(await txt(), "zimmet uyuşmazlığı") === zHatali, `${card(await txt(), "zimmet uyuşmazlığı")} ↔ ${zHatali}`);
  }
  await select("Ana Sayfa", "Tüm Şirketler");
  const dBack = await txt();
  check("Ana Sayfa: Tüm Şirketler'e dönünce eski değerler geri geliyor (Açık bulgu, disk dahil)", open(dBack) === open(dAll) && pick(dBack, /Kritik Disk\t([\d.]+)/) === pick(dAll, /Kritik Disk\t([\d.]+)/), `${open(dBack)} ↔ ${open(dAll)}`);
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} kontrol geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((f) => console.log(`  ✗ ${f.name}`));
process.exit(failed.length ? 1 : 0);
