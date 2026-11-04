// Filtreler: (1) bir raporda seçilen filtre başka rapora TAŞINMAZ (ve "filtreler sıfırlandı" döngüsüne girilmez),
// (2) her raporda her açılır filtre çalışır: ilk seçenek seçilince kayıt sayısı > 0 ve ≤ toplam olur, "sıfırlandı" uyarısı çıkmaz.
//   node e2e/filtreler.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const be = await startBackend({ port: 5130 });
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
  await page.goto(be.base); await page.waitForTimeout(4500);

  const open = async (name) => { await page.getByText(name, { exact: true }).first().click(); await page.waitForTimeout(2200); };
  const count = async () => Number((((await page.locator("text=/kayıttan/").first().innerText().catch(() => "")).match(/^(\d+) kayıttan/)) || [])[1]);
  const total = async () => Number((((await page.locator("text=/kayıttan/").first().innerText().catch(() => "")).match(/filtre öncesi (\d+)/)) || [])[1]) || count();
  const toastReset = () => page.getByText(/filtreler sıfırlandı/).count();
  const triggers = () => page.locator("div").filter({ hasText: /\(Tümü\)\s*▾$/ }).filter({ hasNot: page.locator("div") });

  // ---- 1) rapor değişince filtre taşınmaz ----
  console.log("Rapor değişince filtre taşınma");
  await open("Zimmet Uyuşmazlığı");
  const durum = triggers().filter({ hasText: /^Durum/ }).first();
  check("Zimmet'te 'Durum' filtresi var", (await durum.count()) === 1);
  await durum.click(); await page.waitForTimeout(300);
  await page.locator("label:has(input[type=checkbox])").filter({ hasText: /^Zimmet Hatalı$/ }).first().click(); await page.waitForTimeout(900);
  const zFiltered = await count();
  check("Zimmet: 'Zimmet Hatalı' seçilince liste daralıyor", zFiltered > 0, `${zFiltered}`);
  await page.mouse.click(5, 5);
  await open("İnaktif Cihazlar");
  const iTotal = await count();
  const toastSeen = await (async () => { for (let i = 0; i < 6; i++) { if (await toastReset()) return true; await page.waitForTimeout(500); } return false; })();
  check("İnaktif'e geçince liste dolu (0 kayıt değil) ve 'filtreler sıfırlandı' döngüsü yok", iTotal > 0 && !toastSeen, `${iTotal} kayıt${toastSeen ? " — SIFIRLANDI uyarısı çıktı" : ""}`);
  check("İnaktif'te Durum filtresi 'Tümü'", (await triggers().filter({ hasText: /^Durum/ }).count()) >= 1);

  // ---- 2) her raporda her filtre çalışır ----
  for (const name of ["İnaktif Cihazlar", "Disk Alanı", "Zimmet Uyuşmazlığı", "Kullanılmayan Cihazlar", "Lokasyon Hostname ve IP Uyuşmazlığı", "BSOD"]) {
    console.log(`\n${name}`);
    await open(name);
    const base = await count();
    const labels = await triggers().evaluateAll((els) => els.map((e) => e.innerText.replace(/\s*\(Tümü\)\s*▾$/, "").trim()));
    check(`${name}: filtre açılır kutuları bulundu`, labels.length > 0, labels.join(", "));
    for (const label of labels) {
      const t = triggers().filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(Tümü\\)`) }).first();
      if (!(await t.count())) continue;
      await t.click(); await page.waitForTimeout(300);
      const first = page.locator("label:has(input[type=checkbox])").first();
      if (!(await first.count())) { check(`${name} › ${label}: seçenek listesi dolu`, false, "seçenek yok"); await page.mouse.click(5, 5); continue; }
      const optText = (await first.innerText()).trim();
      await first.click(); await page.waitForTimeout(900);
      const c = await count();
      const reset = await toastReset();
      check(`${name} › ${label} = "${optText.slice(0, 28)}": liste daraldı/aynı kaldı ve boş değil`, c > 0 && c <= base && !reset, `${base} → ${c}${reset ? " (SIFIRLANDI uyarısı)" : ""}`);
      const clear = page.getByText(/^Temizle \(\d+\)$/).first();
      if (await clear.count()) await clear.click();
      await page.mouse.click(5, 5); await page.waitForTimeout(500);
    }
  }
  check("Sayfa hatası yok", errs.length === 0, errs.join(" | "));
  await ctx.close();
} finally {
  await browser.close(); await be.stop();
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
