// Duman testi: demo veriyle bütün ekranları tek tek açar ve temel doğruluk kontrollerini yapar.
//   node e2e/smoke.mjs [--skip-build] [--only=zimmet,disk]
// Kullanıcının gerçek verisine dokunmaz: geçici veri klasörüyle ayrı bir backend (port 5055) başlatır.
// Çıkış kodu: tüm kontroller geçtiyse 0, aksi halde 1.
//
// Kontroller (tablo raporları): konsol/ağ hatası yok · hata ekranı (UI-001) yok · "toplam kayıt" sayısı tablodaki
// satır sayısıyla aynı · her filtre menüsünün seçenekleri tabloda gerçekten görünen değerler · filtre seçilince
// liste daralıyor · Excel çıktısındaki satır sayısı ekrandakiyle aynı.
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean);

// Sol menüdeki ad → kontrol türü. "table": ortak tablo ekranı (App.jsx), "screen": kendi ekranı olan rapor.
const REPORTS = [
  { id: "inaktif", name: "İnaktif Cihazlar", kind: "table" },
  { id: "disk", name: "Disk Alanı", kind: "table" },
  { id: "zimmet", name: "Zimmet Uyuşmazlığı", kind: "table" },
  { id: "lokasyon-ip", name: "Lokasyon Hostname ve IP Uyuşmazlığı", kind: "table" },
  { id: "kullanilmayan", name: "Kullanılmayan Cihazlar", kind: "table" },
  { id: "bsod", name: "BSOD", kind: "table" },
  { id: "battery-health", name: "Battery Health", kind: "table" },
  { id: "atil-monitor", name: "Atıl Monitörler", kind: "screen" },
  { id: "kapatma-onayi", name: "Kapatma Onayı Bekleyen Kayıtlar", kind: "screen" },
  { id: "yeni-kurulum", name: "Yeni Kurulum Kaydı", kind: "screen" },
  { id: "sccm-ajan", name: "SCCM Ajan Raporu", kind: "screen" },
];
// Tabloda görünmeyen/özel alanlardan beslenen filtreler — "tabloda geçiyor mu" kontrolü uygulanmaz
const SKIP_OPTION_CHECK = new Set(["Üst Lokasyon"]);
// Bilinen, bilinçli bırakılmış uyumsuzluklar (başarısızlık sayılmaz, "⚠" ile raporlanır). Çözülünce listeden silin.
//   zimmet|Lokasyon: Zimmet tablosunda Lokasyon sütunu yok (ofis yalnızca kart görünümü/detayda) — sütun eklenene dek.
const KNOWN_ISSUES = new Set(["zimmet|Lokasyon"]);

const results = [];
const check = (report, name, ok, detail = "", knownKey = "") => {
  const known = !ok && KNOWN_ISSUES.has(knownKey);
  results.push({ report, name, ok: ok || known, known, detail });
  console.log(`${ok ? "  ✓" : known ? "  ⚠" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}${known ? " [bilinen]" : ""}`);
};
const num = (s) => Number(String(s).replace(/[^\d]/g, ""));

if (!args.includes("--skip-build")) buildFrontend();
const be = await startBackend();
const browser = await launchBrowser();

try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();

  let problems = [];
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text().slice(0, 160)}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 160)}`));
  page.on("response", (r) => r.url().includes("/api/") && r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url().replace(be.base, "")}`));

  const openReport = async (name) => {
    await page.locator(`text="${name}"`).first().click();
    await page.waitForTimeout(1800);
  };
  const bodyText = () => page.innerText("body");
  const rowCount = () => page.locator("tbody tr").count();

  await page.goto(be.base);
  await page.waitForTimeout(3500);

  // 0) Ana sayfa
  console.log("\nAna Sayfa");
  check("home", "ana sayfa açılıyor (Cihaz Genel Görünüm)", (await bodyText()).includes("Cihaz Genel Görünüm"));
  check("home", "konsol/ağ hatası yok", problems.length === 0, problems.join(" | "));

  for (const rep of REPORTS) {
    if (only.length && !only.includes(rep.id)) continue;
    console.log(`\n${rep.name}`);
    problems = [];
    try {
    await openReport(rep.name);
    const text = await bodyText();
    check(rep.id, "ekran açıldı (başlık görünüyor)", text.includes(rep.name));
    check(rep.id, "hata ekranı (UI-001) yok", !text.includes("UI-001"));

    if (rep.kind === "table") {
      const total = num((text.match(/(\d[\d.]*)\s*\n\s*toplam kayıt/) || [])[1]);
      check(rep.id, "toplam kayıt sayısı okundu", total > 0, `toplam=${total}`);

      // sayfa boyutu "Tümü" → satır sayısı toplamla aynı olmalı
      const sizeBtn = page.locator('div[title="Sayfada gösterilecek kayıt sayısı"] div', { hasText: /^Tümü$/ });
      // alt bilgi: "N kayıttan M tanesi gösteriliyor" — N filtrelenmiş toplam, M ekranda görünen satır
      const footer = async () => {
        const m = (await bodyText()).match(/(\d[\d.]*) kayıttan (\d[\d.]*) tanesi gösteriliyor/);
        return m ? { n: num(m[1]), shown: num(m[2]) } : { n: -1, shown: -1 };
      };
      if (total > 0) {
        if (await sizeBtn.count()) await sizeBtn.click();
        // binlerce satır çizilirken bekle: alt bilgide "N kayıttan N tanesi" görünene kadar
        await page.waitForFunction(() => /(\d+) kayıttan \1 tanesi/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
        const f0 = await footer();
        check(rep.id, "ekranda gösterilen satır = toplam kayıt (sayfa boyutu Tümü)", f0.n === total && f0.shown === total, `alt bilgi: ${f0.n} kayıttan ${f0.shown}, toplam=${total}`);

        // filtre menüleri
        const labels = (await page.locator("text=/\\(Tümü\\)$/").allInnerTexts()).map((t) => t.replace(/\s*\(Tümü\)$/, "").trim());
        const tableText = await page.locator("tbody").innerText();
        for (const label of labels) {
          const trigger = page.locator("span", { hasText: new RegExp(`^${label} \\(Tümü\\)$`) }).last();
          await trigger.click();
          await page.waitForTimeout(250);
          const panel = page.locator("div[style*='max-height: 340px']");
          const options = (await panel.locator("label span").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
          const uniq = [...new Set(options)];
          if (!SKIP_OPTION_CHECK.has(label)) {
            const missing = uniq.filter((o) => !tableText.includes(o)).slice(0, 3);
            check(rep.id, `"${label}" filtresi: seçenekler tabloda görünen değerler`, uniq.length > 0 && missing.length === 0, missing.length ? `tabloda olmayan: ${missing.map((m) => m.slice(0, 50)).join(" | ")}` : `${uniq.length} seçenek`, `${rep.id}|${label}`);
          }
          if (uniq.length > 0) {
            await panel.locator("label", { hasText: uniq[0] }).first().click();
            await page.waitForTimeout(900);
            const f1 = await footer();
            check(rep.id, `"${label}" filtresi seçilince liste daralıyor/korunuyor`, f1.n > 0 && f1.n <= total, `${total} → ${f1.n}`);
            await page.locator("text=Temizle").first().click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(500);
          }
          await page.mouse.click(5, 5);
          await page.waitForTimeout(300);
        }

        // Excel çıktısı: ekrandaki (filtresiz) liste sayısıyla aynı satır sayısı
        const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.getByRole("button", { name: /Excel'e Aktar/ }).first().click()]);
        const file = await download.path();
        const wb = XLSX.read(readFileSync(file));
        const exported = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]).length;
        check(rep.id, "Excel çıktısı satır sayısı = toplam kayıt", exported === total, `excel=${exported}, toplam=${total}`);
      }
    }
      // --- ekrana özel kontroller ---
      if (rep.id === "atil-monitor") {
        const label = await page.getByRole("button", { name: /^Excel'e Aktar \(\d+\)$/ }).first().innerText();
        const n = num(label);
        check(rep.id, "liste dolu (Atıl monitör sayısı > 0)", n > 0, `Excel'e Aktar (${n})`);
        const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.getByRole("button", { name: /^Excel'e Aktar \(\d+\)$/ }).first().click()]);
        const wb = XLSX.read(readFileSync(await dl.path()));
        const exported = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]).length;
        check(rep.id, "Excel çıktısı satır sayısı = ekrandaki sayı", exported === n, `excel=${exported}, ekran=${n}`);
        const mailBtn = page.getByRole("button", { name: /Bilgi Dışı Kullanıma Mail Gönder/ });
        check(rep.id, "'Bilgi Dışı Kullanıma Mail Gönder' butonu var", (await mailBtn.count()) > 0);
        await mailBtn.first().click();
        await page.waitForTimeout(400);
        const confirmText = await bodyText();
        check(rep.id, "seçim yokken mail için onay penceresi açılıyor", confirmText.includes("Mail Gönderimini Onayla") && /\d+ monitör, \d+ kullanıcı/.test(confirmText));
        await page.getByRole("button", { name: "Vazgeç" }).first().click();
      }
      if (rep.id === "yeni-kurulum") {
        const serial = page.locator('input[placeholder^="SYNP"]');
        await serial.fill("PF");
        await page.waitForTimeout(500);
        const opts = page.locator("div[style*='max-height: 280px'] > div");
        const optCount = await opts.count();
        check(rep.id, "Seri No yazınca öneri listesi açılıyor", optCount > 0, `${optCount} öneri`);
        if (optCount > 0) {
          const pick = (await opts.first().innerText()).trim();
          await opts.first().click();
          await page.waitForTimeout(500);
          check(rep.id, "öneri seçilince Seri No alanı doluyor", (await serial.inputValue()) === pick, pick);
        }
        const bit = page.locator("label", { hasText: "Bitlocker Kontrol" }).locator("xpath=following-sibling::div[1]");
        await bit.click();
        await page.waitForTimeout(300);
        const bitOpts = await page.locator("div[style*='max-height: 280px'] > div").allInnerTexts();
        check(rep.id, "Bitlocker seçenekleri Seri No ile aynı açılır listeyle geliyor", bitOpts.some((t) => t.includes("ENABLE")) && bitOpts.some((t) => t.includes("SÜREÇ")), bitOpts.join(" | "));
      }
    } catch (e) {
      check(rep.id, "test akışı hatasız tamamlandı", false, String(e.message).split("\n")[0].slice(0, 160));
    }
    check(rep.id, "konsol/ağ hatası yok", problems.length === 0, problems.slice(0, 3).join(" | "));
  }
} finally {
  await browser.close();
  await be.stop();
}

const failed = results.filter((r) => !r.ok);
const knownCount = results.filter((r) => r.known).length;
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} kontrol geçti${knownCount ? ` (${knownCount} bilinen uyarı)` : ""}${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((f) => console.log(`  ✗ [${f.report}] ${f.name}${f.detail ? ` — ${f.detail}` : ""}`));
process.exit(failed.length ? 1 : 0);
