// Ana Sayfa etkileşimleri: yeni görünümün varsayılan olması + eski görünüme dönüş (kalıcı tercih), Açık Bulgu Dağılımı'ndan filtreli rapora
// gitme (sayılar tutuyor mu), Açık Bulgu Trendi (dönem seçici, hover, noktaya tıklayınca ayrıntı, rapora gitme) — yeni görünüm ve Yönetici Özeti.
//   node e2e/interactcheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };
const num = (s) => Number(String(s ?? "").replace(/[^\d]/g, ""));

const be = await startBackend({ port: 5097 });
const browser = await launchBrowser({ freshStorage: true }); // gerçek varsayılanı test etmek için tercih ön-yazılmaz
const auth = { "Content-Type": "application/json", Authorization: `Bearer ${be.token}` };
try {
  // ---- trend için bilinen geçmiş: 4 farklı gün/ay, kategori başına bilinen sayıda cihaz ----
  const DATES = ["2026-07-10T10:00:00Z", "2026-08-10T10:00:00Z", "2026-08-11T10:00:00Z", "2026-09-05T10:00:00Z"];
  const SEED = { zimmet: [10, 20, 15, 12], inaktif: [5, 6, 7, 8], kullanilmayan: [3, 4, 2, 1], disk: [2, 9, 4, 6] };
  for (const [rid, counts] of Object.entries(SEED)) {
    for (let i = 0; i < DATES.length; i++) {
      await fetch(`${be.base}/api/snapshots`, { method: "POST", headers: auth, body: JSON.stringify({ reportId: rid, capturedAt: DATES[i], sourceFileModifiedAt: `i-${rid}-${i}`, devices: Array.from({ length: counts[i] }, (_, j) => ({ key: `${rid}-${i}-${j}`, serial: `${rid.toUpperCase()}-${i}-${j}`, hostname: `H-${rid}-${i}-${j}`, location: "TEST-LOK", company: "TKAJ-AJET A.Ş." })) }) });
    }
  }

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 120)));
  const txt = async () => (await page.innerText("body")).replace(/\n\s*\n/g, "\n");
  const boot = async () => { await page.goto(be.base); await page.waitForTimeout(4500); await page.locator('text="Ana Sayfa"').first().click(); await page.waitForTimeout(1500); };

  console.log("Varsayılan görünüm ve geri dönüş");
  await page.goto(be.base); await page.waitForTimeout(4500);
  let t = await txt();
  check("Varsayılan Ana Sayfa: üst yönetim ekranı (Operasyonel Durum Özeti)", /Operasyonel Durum Özeti/.test(t) && !/IT Operations Dashboard/.test(t));
  await page.locator("[data-open-ops]").click(); await page.waitForTimeout(1500);
  t = await txt();
  check("Varsayılan: yeni görünüm (Operasyon Panosu) açılıyor", /Operasyon Panosu/.test(t) && !/IT Operations Dashboard/.test(t));
  check("Yeni görünümde 'DEMO' ibaresi yok, eski görünüme dönüş seçeneği var", !/DEMO TASARIM/.test(t) && (await page.getByRole("button", { name: /Eski görünüme dön/ }).count()) === 1);
  await page.getByRole("button", { name: /Eski görünüme dön/ }).click(); await page.waitForTimeout(1200);
  check("'Eski görünüme dön': klasik dashboard (IT Operations Dashboard) açılıyor", /IT Operations Dashboard/.test(await txt()));
  await page.reload(); await page.waitForTimeout(4500);
  await page.locator('text="Ana Sayfa"').first().click(); await page.waitForTimeout(1200);
  check("Tercih kalıcı: yenileyince klasik görünümde kalıyor", /IT Operations Dashboard/.test(await txt()));
  await page.getByRole("button", { name: /Yeni görünüme geç/ }).click(); await page.waitForTimeout(1500);
  check("'Yeni görünüme geç': yeni görünüm geri geliyor", /Operasyon Panosu/.test(await txt()));
  await page.reload(); await page.waitForTimeout(4500);
  await page.locator('text="Ana Sayfa"').first().click(); await page.waitForTimeout(1200);
  check("Tercih kalıcı: yenileyince yeni görünümde kalıyor", /Operasyon Panosu/.test(await txt()));

  const distNum = async (id) => num((await page.locator(`[data-dist-row="${id}"]`).first().innerText()).split("\n").find((l) => /^\d[\d.]*$/.test(l.trim())));
  const footerCount = async () => { for (let i = 0; i < 20; i++) { const m = (await txt()).match(/(\d[\d.]*) kayıttan/); if (m) return num(m[1]); await page.waitForTimeout(500); } return NaN; };

  for (const view of ["new", "exec"]) {
    const label = view === "new" ? "Yeni görünüm" : "Yönetici Özeti";
    console.log(`\n${label} — Açık Bulgu Dağılımı`);
    await boot();
    if (view === "exec") { await page.evaluate(() => localStorage.setItem("varlikTakip.execView", "1")); await page.reload(); await page.waitForTimeout(4500); await page.locator('text="Ana Sayfa"').first().click(); await page.waitForTimeout(1500); }
    const rows = await page.locator("[data-dist-row]").count();
    check(`${label}: dağılımda 4 tıklanabilir kategori (role=button)`, rows === 4 && (await page.locator('[data-dist-row][role="button"]').count()) === 4, `${rows}`);
    for (const id of ["zimmet", "inaktif", "kullanilmayan", "disk"]) {
      await boot();
      if (view === "exec") { await page.evaluate(() => localStorage.setItem("varlikTakip.execView", "1")); await page.reload(); await page.waitForTimeout(4500); await page.locator('text="Ana Sayfa"').first().click(); await page.waitForTimeout(1500); }
      const n = await distNum(id);
      await page.locator(`[data-dist-row="${id}"]`).first().click();
      await page.waitForTimeout(2500);
      const c = await footerCount();
      check(`${label}: '${id}' satırına tıklayınca rapor açılıyor ve kayıt sayısı dağılımdaki sayıyla aynı`, c === n && n > 0, `dağılım ${n} ↔ rapor ${c}`);
      if (view === "exec") await page.evaluate(() => localStorage.setItem("varlikTakip.execView", "0"));
    }
  }

  for (const view of ["new", "exec"]) {
    const label = view === "new" ? "Yeni görünüm" : "Yönetici Özeti";
    console.log(`\n${label} — Açık Bulgu Trendi`);
    await page.evaluate((v) => localStorage.setItem("varlikTakip.execView", v === "exec" ? "1" : "0"), view);
    await boot();
    const pts = () => page.locator("[data-trend-point]").count();
    check(`${label}: aylık seçimde 4 dönem (Tem, Ağu, Eyl + güncel)`, (await pts()) === 4, `${await pts()}`);
    await page.locator('[data-trend-mode="day"]').click(); await page.waitForTimeout(500);
    check(`${label}: 'Günlük' seçilince grafik güncelleniyor (5 gün)`, (await pts()) === 5, `${await pts()}`);
    await page.locator('[data-trend-mode="week"]').click(); await page.waitForTimeout(400);
    const wk = await pts();
    check(`${label}: 'Haftalık' seçilince nokta sayısı değişiyor (4–5 hafta)`, wk >= 4 && wk <= 5, `${wk}`);
    await page.locator('[data-trend-mode="month"]').click(); await page.waitForTimeout(400);
    await page.locator('[data-trend-point="1"]').hover(); await page.waitForTimeout(300);
    const tip = await page.locator("[data-trend-tip]").innerText().catch(() => "");
    check(`${label}: hover bilgi kutusu tarih, toplam ve önceki döneme göre farkı gösteriyor`, /2026-08/.test(tip) && /Toplam açık bulgu: 28/.test(tip) && /\+(\d+)/.test(tip), tip.replace(/\n/g, " | ").slice(0, 150));
    await page.locator('[data-trend-point="0"]').click(); await page.waitForTimeout(600);
    check(`${label}: noktaya tıklayınca ayrıntı penceresi açılıyor (2026-07, toplam 20)`, (await page.locator("[data-trend-modal]").count()) === 1 && /2026-07/.test(await page.locator("[data-trend-modal]").innerText()) && /Toplam açık bulgu/.test(await page.locator("[data-trend-modal]").innerText()));
    for (const [id, expected] of [["zimmet", 10], ["inaktif", 5], ["disk", 2]]) {
      await page.locator(`[data-trend-cat="${id}"]`).click(); await page.waitForTimeout(250);
      const rowsN = await page.locator("[data-trend-list] tbody tr").count();
      check(`${label}: ayrıntıda '${id}' sekmesi o dönemin kayıtlı cihazlarını listeliyor (${expected})`, rowsN === expected, `${rowsN}`);
    }
    await page.locator('[data-trend-cat="zimmet"]').click();
    await page.locator("[data-trend-open-report]").click(); await page.waitForTimeout(2500);
    check(`${label}: ayrıntıdan 'Güncel raporu aç' ilgili filtreli rapora götürüyor`, (await footerCount()) > 0 && (await page.locator("[data-trend-modal]").count()) === 0);
  }
  check("Konsol hatası yok", problems.length === 0, problems.join(" | "));
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} etkileşim kontrolü geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((x) => console.log(`  ✗ ${x.name}`));
process.exit(failed.length ? 1 : 0);
