// Ana Sayfa sayıları ile liste ekranlarındaki sayıların tutarlılığı: İnaktif, Disk, Kullanılmayan, Zimmet ve cihaz sağlığı.
//   node e2e/dashboardtutarlilik.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };
const num = (s) => Number(String(s).replace(/\./g, ""));

const be = await startBackend({ port: 5090 });
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 140)));
  await page.goto(be.base); await page.waitForTimeout(5000);

  const body = () => page.locator("body").innerText();
  const stat = async (label) => num((await page.locator("div", { hasText: new RegExp(`^[\\d.]+\\s*${label}$`) }).last().innerText()).split(/\s/)[0]);

  // ---- Ana Sayfa değerleri ----
  const home = await body();
  const dInaktif = num((home.match(/([\d.]+)\s*\n\s*inaktif cihaz/) || [])[1]);
  const dDisk = num((home.match(/([\d.]+)\s*\n\s*kritik disk/) || [])[1]);
  const dZimmet = num((home.match(/([\d.]+)\s*\n\s*zimmet uyuşmazlığı/) || [])[1]);
  const dUnused = num((home.match(/Kullanılmayan\s+([\d.]+)\s+%/) || [])[1]);
  console.log(`Ana Sayfa: inaktif ${dInaktif}, kritik disk ${dDisk}, zimmet hatalı ${dZimmet}, kullanılmayan ${dUnused}`);

  // ---- Cihaz sağlığı: Toplam − Sorunlu = Temiz ve Açık bulgu = dört kategorinin toplamı ----
  const rowVal = (label) => num((home.match(new RegExp(`${label}[^\\n]*\\t([\\d.]+)\\t`)) || [])[1]);
  const total = rowVal("Toplam Cihaz \\(SCCM envanteri\\)"), prob = rowVal("Sorunlu Cihaz \\(en az bir bulgusu olan, tekil\\)"), clean = rowVal("Temiz Cihaz");
  check("Cihaz sağlığı: Toplam − Sorunlu = Temiz", total > 0 && total - prob === clean, `${total} − ${prob} = ${clean}`);
  const open = num((home.match(/AÇIK BULGU DAĞILIMI\s*\n\s*([\d.]+)/) || [])[1]);
  check("Açık bulgu = inaktif + zimmet hatalı + kritik disk + kullanılmayan", open === dInaktif + dZimmet + dDisk + dUnused, `${open} = ${dInaktif} + ${dZimmet} + ${dDisk} + ${dUnused}`);
  check("Sorunlu cihaz sayısı açık bulgudan büyük olamaz (tekilleştirilmiş)", prob > 0 && prob <= open, `${prob} ≤ ${open}`);
  check("Sağlık yüzdesi = Temiz / Toplam", new RegExp(`%${Math.round((clean / total) * 100)}\\b`).test(home), `%${Math.round((clean / total) * 100)}`);

  // ---- İnaktif ----
  await page.getByText("İnaktif Cihazlar", { exact: true }).first().click(); await page.waitForTimeout(2500);
  const iT = await stat("Toplam Kayıt"), iA = await stat("Kullanılmıyor"), iB = await stat("Kullanımda");
  check("İnaktif: Ana Sayfa = listedeki toplam", dInaktif === iT, `${dInaktif} / ${iT}`);
  check("İnaktif: Kullanılmıyor + Kullanımda = Toplam", iA + iB === iT, `${iA} + ${iB} = ${iT}`);

  // ---- Disk ----
  await page.getByText("Disk Alanı", { exact: true }).first().click(); await page.waitForTimeout(2500);
  const kT = await stat("Toplam Kayıt"), kC = await stat("Kritik \\(≤10 GB\\)");
  check("Disk: Ana Sayfa kritik = listedeki kritik", dDisk === kC, `${dDisk} / ${kC}`);
  const kW = await stat("Uyarı \\(≤20 GB\\)").catch(() => null), kN = await stat("Normal \\(>20 GB\\)").catch(() => null);
  check("Disk: Kritik + Uyarı + Normal (+ Bilinmiyor) = Toplam", kW != null && kN != null && kC + kW + kN + (await stat("Bilinmiyor").catch(() => 0)) === kT, `${kC} + ${kW} + ${kN} → ${kT}`);

  // ---- Kullanılmayan ----
  await page.getByText("Kullanılmayan Cihazlar", { exact: true }).first().click(); await page.waitForTimeout(2500);
  const uT = await stat("Toplam Kayıt");
  check("Kullanılmayan: Ana Sayfa = listedeki toplam", dUnused === uT, `${dUnused} / ${uT}`);

  check("Sayfa hatası yok", problems.length === 0, problems.join(" | "));
  await ctx.close();
} finally {
  await browser.close(); await be.stop();
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
