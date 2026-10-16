// Yönetici Özeti > Açık bulgu trendi: lejanta tıklayınca grafik yalnız o kategoriyi gösterir.
//   node e2e/trendlegend.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const be = await startBackend({ port: 5070 });
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => { localStorage.setItem("varlikTakip.sessionToken", t); localStorage.setItem("varlikTakip.dashboardDemo", "1"); localStorage.setItem("varlikTakip.execView", "1"); }, be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 120)));
  // 3 geçmiş dönem (Haz/Tem/Ağu) — kategori başına bilinen cihaz sayıları: zimmet 12/20/15, inaktif 5/6/7, kullanılmayan 3/4/2, disk 2/9/4
  const SEED = { zimmet: [12, 20, 15], inaktif: [5, 6, 7], kullanilmayan: [3, 4, 2], disk: [2, 9, 4] };
  const months = ["2026-06-15T10:00:00Z", "2026-07-15T10:00:00Z", "2026-08-15T10:00:00Z"];
  for (const [rid, counts] of Object.entries(SEED)) {
    for (let i = 0; i < 3; i++) {
      await fetch(`${be.base}/api/snapshots`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${be.token}` },
        body: JSON.stringify({ reportId: rid, capturedAt: months[i], sourceFileModifiedAt: `${rid}-${months[i]}`, devices: Array.from({ length: counts[i] }, (_, j) => ({ key: `${rid}-${i}-${j}`, serial: `${rid}-${i}-${j}`, company: "TKAJ-AJET A.Ş." })) }) });
    }
  }
  await page.goto(be.base);
  await page.waitForTimeout(5000);
  const chartLabels = async () => (await page.locator("svg text").evaluateAll((els) => els.map((e) => (e.textContent || "").trim())));
  const polys = () => page.locator("svg polygon").count();
  const legends = page.locator("[data-trend-legend]");
  const n = await legends.count();
  check("Lejantta 4 kategori tıklanabilir (Hatalı zimmet, İnaktif, Kullanılmayan, Kritik disk)", n === 4, `${n}`);
  const all = await polys();
  check("Başlangıçta yığılı grafik: 4 alan", all >= 4, `${all} polygon`);
  const labels = ["zimmet", "inaktif", "kullanilmayan", "disk"];
  const t0 = await chartLabels();
  check("Tümü: ilk dönem toplamı 22 (12+5+3+2)", t0.includes("22"), t0.filter((x) => /^d+$/.test(x)).join(","));
  const seen = {};
  for (const k of labels) {
    await page.locator(`[data-trend-legend="${k}"]`).click();
    await page.waitForTimeout(300);
    const p = await polys();
    const pressed = await page.locator(`[data-trend-legend="${k}"]`).getAttribute("aria-pressed");
    const sub = (await page.innerText("body")).includes("yalnız");
    seen[k] = { p, pressed, sub };
    const tl = await chartLabels();
    const vals = SEED[k].map(String);
    check(`  ↳ ${k}: grafik etiketleri yalnız o kategorinin değerleri (${vals.join("/")})`, vals.every((v) => tl.includes(v)) && !tl.includes("22"), tl.filter((x) => /^d+$/.test(x)).join(","));
    check(`'${k}' tıklanınca yalnız o alan çiziliyor (${all} → ${p}), seçili ve alt başlık değişti`, p === all - 3 && pressed === "true" && sub, JSON.stringify(seen[k]));
  }
  await page.locator('[data-trend-legend="disk"]').click();
  await page.waitForTimeout(300);
  check("Aynı kategoriye tekrar tıklayınca tüm kategoriler geri geliyor", (await polys()) === all);
  await page.locator('[data-trend-legend="zimmet"]').click();
  await page.locator('[data-trend-legend="inaktif"]').click();
  await page.waitForTimeout(300);
  check("Başka kategoriye geçince doğrudan o kategori gösteriliyor", (await polys()) === all - 3 && (await page.locator('[data-trend-legend="inaktif"]').getAttribute("aria-pressed")) === "true");
  check("Konsol hatası yok", problems.length === 0, problems.join(" | "));
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} kontrol geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
process.exit(failed.length ? 1 : 0);
