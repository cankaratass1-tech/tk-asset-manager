// Demo dashboard (DashboardV2) testi: lokasyona tıklayınca rapor o lokasyonla (ve doğru segmentle) açılıyor mu, sayılar tutuyor mu.
//   node e2e/dashdemo.mjs [--skip-build]   (demo henüz commit edilmedi; benimsenirse test:dash ile birleştirilebilir)
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const num = (s) => Number(String(s ?? "").replace(/[^\d]/g, ""));

const be = await startBackend({ port: 5063 });
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => { localStorage.setItem("varlikTakip.sessionToken", t); localStorage.setItem("varlikTakip.dashboardDemo", "1"); }, be.token);
  const page = await ctx.newPage();
  await page.goto(be.base);
  await page.waitForTimeout(4500);
  const txt = async () => (await page.innerText("body")).replace(/\n\s*\n/g, "\n");
  const footerN = async () => num(((await txt()).match(/(\d[\d.]*) kayıttan/) || [])[1]);

  // Lokasyon satırları: ilk 5 zimmet, sonraki 5 inaktif ("<ad> — <sayı> cihazı raporda göster")
  const bars = async () => {
    const titles = await page.locator('div[title$="cihazı raporda göster"]').evaluateAll((els) => els.map((e) => e.getAttribute("title")));
    return titles.map((t) => { const m = t.match(/^(.*) — (\d[\d.]*) cihazı/); return { name: m[1], count: Number(m[2].replace(/\./g, "")) }; });
  };
  const goHome = async () => { await page.locator('text="Ana Sayfa"').first().click(); await page.waitForTimeout(1500); };

  console.log("\nBaşlık");
  check("Kart başlığı 'Lokasyonlar'", (await txt()).includes("Lokasyonlar") && !(await txt()).includes("Sıcak noktalar"));

  console.log("\nZimmet lokasyonu → rapor (Tüm Şirketler)");
  let b = await bars();
  check("Dashboard'da zimmet ve inaktif lokasyon satırları var", b.length >= 2, `${b.length} satır`);
  const z0 = b[0];
  await page.locator('div[title$="cihazı raporda göster"]').nth(0).click();
  await page.waitForTimeout(2000);
  let t = await txt();
  check(`Zimmet raporu açıldı (${z0.name})`, t.includes("Zimmet Uyuşmazlığı —"));
  check("Lokasyon filtresi seçili lokasyonu gösteriyor", t.includes(z0.name));
  check(`Zimmet raporu: kayıt sayısı = dashboard'daki ${z0.count} (yalnızca hatalı zimmetler)`, (await footerN()) === z0.count, `${await footerN()} ↔ ${z0.count}`);

  console.log("\nİnaktif lokasyonu → rapor");
  await goHome();
  b = await bars();
  const nZ = Math.min(5, b.length);
  const iIdx = nZ; // ilk inaktif satırı
  const i0 = b[iIdx];
  await page.locator('div[title$="cihazı raporda göster"]').nth(iIdx).click();
  await page.waitForTimeout(2000);
  t = await txt();
  check(`İnaktif raporu açıldı (${i0.name})`, t.includes("İnaktif Cihazlar —"));
  check(`İnaktif raporu: kayıt sayısı = dashboard'daki ${i0.count}`, (await footerN()) === i0.count, `${await footerN()} ↔ ${i0.count}`);

  console.log("\nŞirket seçiliyken (AJET)");
  await goHome();
  await page.locator('text="AJET"').first().click();
  await page.waitForTimeout(1500);
  b = await bars();
  const a0 = b[0];
  await page.locator('div[title$="cihazı raporda göster"]').nth(0).click();
  await page.waitForTimeout(2000);
  t = await txt();
  check(`AJET: zimmet raporu açıldı (${a0.name})`, t.includes("Zimmet Uyuşmazlığı —"));
  check(`AJET: rapor sayısı = dashboard'daki ${a0.count} (şirket de rapora taşındı)`, (await footerN()) === a0.count, `${await footerN()} ↔ ${a0.count}`);

  console.log("\nAynı rapordayken tekrar (efektler çalışmayan yol)");
  await goHome();
  b = await bars();
  const a1 = b[Math.min(1, Math.max(0, Math.min(5, b.length) - 1))];
  const idx = b.indexOf(a1);
  await page.locator('div[title$="cihazı raporda göster"]').nth(idx).click();
  await page.waitForTimeout(2000);
  check(`Aynı rapor/şirket: ikinci lokasyon (${a1.name}) doğru filtreleniyor`, (await footerN()) === a1.count, `${await footerN()} ↔ ${a1.count}`);

  console.log("\nAksiyon listesi satırları → rapor (sayı = rapordaki kayıt sayısı)");
  await goHome();
  await page.locator('text="Tüm Şirketler"').first().click();
  await page.waitForTimeout(1200);
  const ACTIONS = {
    disk: ["Disk Alanı —", "footer"],
    zimmet: ["Zimmet Uyuşmazlığı —", "footer"],
    monitor: ["Zimmet Uyuşmazlığı —", "footer"],
    lokip: ["Lokasyon Hostname ve IP Uyuşmazlığı —", "footer"],
    inaktif: ["İnaktif Cihazlar —", "footer"],
    unused: ["Kullanılmayan Cihazlar —", "footer"],
    bsod: ["BSOD —", "footer"],
    battery: ["Battery Health —", "footer"],
    bilgidisi: ["Atıl Monitörler", "atil"],
    atil: ["Atıl Monitörler", "atil"],
    closure: ["Kapatma Onayı Bekleyen Kayıtlar", null],
  };
  for (const [id, [title, mode]] of Object.entries(ACTIONS)) {
    await goHome();
    const row = page.locator('[data-action="' + id + '"]');
    if ((await row.count()) === 0) { console.log("  – " + id + ": listede yok (sayı 0 ya da veri yüklenmedi), atlandı"); continue; }
    const n = num((await row.innerText()).split("\n").find((l) => /^\d[\d.]*$/.test(l.trim())));
    await row.click();
    await page.waitForTimeout(2200);
    const t = await txt();
    let got = null;
    if (mode === "footer") got = await footerN();
    if (mode === "atil") got = num((t.match(/Excel'e Aktar \((\d+)\)/) || [])[1]);
    const opened = t.includes(title);
    check(id + ": " + title.replace(" —", "") + " açıldı" + (mode ? " ve sayı tutuyor (" + n + ")" : ""), opened && (mode ? got === n : true), mode ? got + " ↔ " + n : "");
  }

  console.log("\nEski görünüme dönüş");
  await goHome();
  await page.getByRole("button", { name: /Eski görünüme dön/ }).click();
  await page.waitForTimeout(1500);
  check("Eski dashboard geri geliyor ('IT Operations Dashboard')", (await txt()).includes("IT Operations Dashboard"));
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} kontrol geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
process.exit(failed.length ? 1 : 0);
