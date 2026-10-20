// Dashboard (Ana Sayfa) sayı tutarlılığı: her sayıyı hem rapor ekranındaki karşılığıyla hem de (mümkünse) ham dosyayla
// karşılaştırır, kartlar/tablolar arası toplamları doğrular.
//   node e2e/dashcheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const num = (s) => Number(String(s ?? "").replace(/[^\d]/g, ""));
const eq = (name, a, b) => check(name, a === b && Number.isFinite(a), `${a} ↔ ${b}`);

const be = await startBackend({ port: 5057 });
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  await page.goto(be.base);
  await page.waitForTimeout(4500);
  const norm = (s) => s.replace(/\n\s*\n/g, "\n");
  const bodyText = async () => norm(await page.innerText("body"));
  const grab = (text, re, i = 1) => num((text.match(re) || [])[i]);

  // ---------- Dashboard'daki sayılar ----------
  const d = await bodyText();
  const dash = {
    inaktifCard: grab(d, /(\d[\d.]*)\ninaktif cihaz/),
    kritikCard: grab(d, /(\d[\d.]*)\nkritik disk/),
    uyariCard: grab(d, /(\d[\d.]*) uyarı seviyesinde/),
    zimmetCard: grab(d, /(\d[\d.]*)\nzimmet uyuşmazlığı/),
    unverifiedCard: grab(d, /(\d[\d.]*) kayıt doğrulanamadı/),
    toplam: grab(d, /Toplam Cihaz\n([\d.]+)/),
    acik: grab(d, /Açık Bulgu\n([\d.]+)/),
    temiz: grab(d, /Temiz Cihaz\t([\d.]+)/),
    distInaktif: grab(d, /İnaktif Cihaz\t([\d.]+)/),
    distZimmet: grab(d, /Zimmet Hatalı\t([\d.]+)/),
    distKritik: grab(d, /Kritik Disk\t([\d.]+)/),
    distKullanilmayan: grab(d, /Kullanılmayan\t([\d.]+)/),
    diskTotal: grab(d, /(\d[\d.]*)\nbirim\nKritik\n(\d+)\nUyarı\n(\d+)\nNormal\n(\d+)/, 1),
    diskKritik: grab(d, /(\d[\d.]*)\nbirim\nKritik\n(\d+)\nUyarı\n(\d+)\nNormal\n(\d+)/, 2),
    diskUyari: grab(d, /(\d[\d.]*)\nbirim\nKritik\n(\d+)\nUyarı\n(\d+)\nNormal\n(\d+)/, 3),
    diskNormal: grab(d, /(\d[\d.]*)\nbirim\nKritik\n(\d+)\nUyarı\n(\d+)\nNormal\n(\d+)/, 4),
    zTotal: grab(d, /SCCM VER[Iİ]S[Iİ]\n(\d[\d.]*)\ncihaz\nDoğru eşleşen\n(\d+)\nUyuşmazlık\n(\d+)\nDoğrulanamayan\n(\d+)\n— bunlardan monitör kaynaklı\n(\d+)/, 1),
    zDogru: grab(d, /SCCM VER[Iİ]S[Iİ]\n(\d[\d.]*)\ncihaz\nDoğru eşleşen\n(\d+)\nUyuşmazlık\n(\d+)\nDoğrulanamayan\n(\d+)\n— bunlardan monitör kaynaklı\n(\d+)/, 2),
    zUyusmazlik: grab(d, /SCCM VER[Iİ]S[Iİ]\n(\d[\d.]*)\ncihaz\nDoğru eşleşen\n(\d+)\nUyuşmazlık\n(\d+)\nDoğrulanamayan\n(\d+)\n— bunlardan monitör kaynaklı\n(\d+)/, 3),
    zKayitYok: grab(d, /SCCM VER[Iİ]S[Iİ]\n(\d[\d.]*)\ncihaz\nDoğru eşleşen\n(\d+)\nUyuşmazlık\n(\d+)\nDoğrulanamayan\n(\d+)\n— bunlardan monitör kaynaklı\n(\d+)/, 4),
    zMonitor: grab(d, /SCCM VER[Iİ]S[Iİ]\n(\d[\d.]*)\ncihaz\nDoğru eşleşen\n(\d+)\nUyuşmazlık\n(\d+)\nDoğrulanamayan\n(\d+)\n— bunlardan monitör kaynaklı\n(\d+)/, 5),
    gorunenInaktif: grab(d, /Toplam (\d[\d.]*) inaktif cihaz/),
    riskInaktif: grab(d, /(\d[\d.]*)\ntoplam inaktif cihaz/),
    riskKritik: grab(d, /(\d[\d.]*)\nkritik disk\nZimmet/),
    riskZimmet: grab(d, /(\d[\d.]*)\nhatalı zimmet/),
  };
  console.log("\nDashboard içi tutarlılık");
  eq("Açık bulgu = İnaktif + Zimmet Hatalı + Kritik Disk + Kullanılmayan", dash.acik, dash.distInaktif + dash.distZimmet + dash.distKritik + dash.distKullanilmayan);
  eq("Temiz cihaz = Toplam cihaz − Açık bulgu", dash.temiz, dash.toplam - dash.acik);
  eq("Kart 'inaktif cihaz' = dağılım tablosu İnaktif", dash.inaktifCard, dash.distInaktif);
  eq("Kart 'zimmet uyuşmazlığı' = dağılım tablosu Zimmet Hatalı", dash.zimmetCard, dash.distZimmet);
  eq("Kart 'kritik disk' = dağılım tablosu Kritik Disk", dash.kritikCard, dash.distKritik);
  eq("Risk kartı inaktif = kart inaktif", dash.riskInaktif, dash.inaktifCard);
  eq("Risk kartı kritik disk = kart kritik disk", dash.riskKritik, dash.kritikCard);
  eq("Risk kartı hatalı zimmet = kart zimmet uyuşmazlığı", dash.riskZimmet, dash.zimmetCard);
  eq("'Toplam N inaktif cihaz' başlığı = kart inaktif", dash.gorunenInaktif, dash.inaktifCard);
  eq("Disk paneli: Kritik + Uyarı + Normal = Toplam birim", dash.diskKritik + dash.diskUyari + dash.diskNormal, dash.diskTotal);
  eq("Disk paneli Kritik = kart 'kritik disk'", dash.diskKritik, dash.kritikCard);
  eq("Disk paneli Uyarı = kart '… uyarı seviyesinde'", dash.diskUyari, dash.uyariCard);
  eq("Zimmet paneli: Doğru + Uyuşmazlık + Kayıt yok = Toplam", dash.zDogru + dash.zUyusmazlik + dash.zKayitYok, dash.zTotal);
  eq("Zimmet paneli Uyuşmazlık = kart zimmet uyuşmazlığı", dash.zUyusmazlik, dash.zimmetCard);
  eq("Zimmet paneli Kayıt yok = kart '… kayıt doğrulanamadı'", dash.zKayitYok, dash.unverifiedCard);
  const listSum = (title) => {
    const block = d.slice(d.indexOf(title));
    const lines = block.split("\n").slice(1, 40);
    let sum = 0, n = 0;
    for (let i = 0; i + 1 < lines.length; i += 2) {
      if (!/^\d+$/.test(lines[i + 1] || "")) break;
      sum += Number(lines[i + 1]); n++;
    }
    return { sum, n };
  };
  const zl = listSum("En fazla uyuşmazlık bulunan lokasyon/departman");
  const il = listSum("En fazla inaktif cihaz bulunan lokasyonlar");
  check("Zimmet lokasyon listesi toplamı ≤ uyuşmazlık sayısı (10'dan az lokasyon varsa eşit)", zl.sum <= dash.zimmetCard && (zl.n >= 10 || zl.sum === dash.zimmetCard), `liste ${zl.n} satır, toplam ${zl.sum}, uyuşmazlık ${dash.zimmetCard}`);
  check("İnaktif lokasyon listesi toplamı ≤ inaktif sayısı (10'dan az lokasyon varsa eşit)", il.sum <= dash.inaktifCard && (il.n >= 10 || il.sum === dash.inaktifCard), `liste ${il.n} satır, toplam ${il.sum}, inaktif ${dash.inaktifCard}`);
  const companyCounts = [...d.matchAll(/^(Tüm Şirketler|AJET|TKAO)\n(\d[\d.]*)$/gm)].map((m) => [m[1], num(m[2])]);
  const all = (companyCounts.find((c) => c[0] === "Tüm Şirketler") || [])[1];
  const parts = companyCounts.filter((c) => c[0] !== "Tüm Şirketler").reduce((a, c) => a + c[1], 0);
  eq("Soldaki şirket sayılarının toplamı = 'Tüm Şirketler'", parts, all);

  // ---------- Rapor ekranlarıyla karşılaştırma ----------
  const openReport = async (name) => {
    await page.locator("text=\"Ana Sayfa\"").first().click().catch(() => {});
    await page.waitForTimeout(500);
    await page.locator(`text="${name}"`).first().click();
    await page.waitForTimeout(1800);
  };
  const footerN = async () => grab(await bodyText(), /(\d[\d.]*) kayıttan/);
  const stat = async (label) => grab(await bodyText(), new RegExp(`(\\d[\\d.]*)\\n${label}`, "i"));
  const segmentCount = async (label) => {
    await page.locator("div", { hasText: new RegExp(`^${label}$`) }).first().click();
    await page.waitForTimeout(1200);
    return footerN();
  };

  console.log("\nRapor ekranlarıyla karşılaştırma");
  await openReport("İnaktif Cihazlar");
  eq("İnaktif ekranı toplam kayıt = dashboard inaktif", await stat("toplam kayıt"), dash.inaktifCard);

  await openReport("Disk Alanı");
  eq("Disk ekranı toplam kayıt = dashboard toplam birim", await stat("toplam kayıt"), dash.diskTotal);
  eq("Disk ekranı 'Kritik' = dashboard kritik disk", await segmentCount("Kritik"), dash.diskKritik);
  eq("Disk ekranı 'Uyarı' = dashboard uyarı", await segmentCount("Uyarı"), dash.diskUyari);
  eq("Disk ekranı 'Normal' = dashboard normal", await segmentCount("Normal"), dash.diskNormal);

  await openReport("Zimmet Uyuşmazlığı");
  eq("Zimmet ekranı toplam kayıt = dashboard zimmet toplam", await stat("toplam kayıt"), dash.zTotal);
  eq("Zimmet ekranı 'zimmet doğru' = dashboard doğru eşleşen", await stat("zimmet doğru"), dash.zDogru);
  eq("Zimmet ekranı 'zimmet hatalı' = dashboard uyuşmazlık", await stat("zimmet hatalı"), dash.zUyusmazlik);
  eq("Zimmet ekranı 'Monitör Uyuşmazlığı' segmenti = dashboard 'monitör kaynaklı'", await segmentCount("Monitör Uyuşmazlığı"), dash.zMonitor);
  // Dashboard'daki "Kayıt yok" yalnızca 'TH Kaydı YOK' değil, TÜM doğrulanamayan durumların toplamıdır
  // (zimmetService.ZIMMET_UNVERIFIED_TAGS) — ekranda Durum filtresinden bu durumlar seçilince aynı sayı çıkmalı.
  await page.getByRole("button", { name: "Tümü" }).first().click().catch(() => {});
  await page.locator("div", { hasText: /^Tümü$/ }).first().click();
  await page.waitForTimeout(800);
  await page.locator("span", { hasText: /^Durum \(Tümü\)$/ }).last().click();
  await page.waitForTimeout(300);
  const unverified = ["Kullanım Kaydı Yok", "SCCM'de Bulunamadı", "Monitör Raporu'nda Bulunamadı", "Doğrulanamadı", "TH Kaydı YOK", "Zimmetsiz Kullanım (Doğrulanamadı)"];
  const panel = page.locator("div[style*='max-height: 340px']");
  const present = (await panel.locator("label span").allInnerTexts()).map((t) => t.trim());
  for (const tag of unverified.filter((t) => present.includes(t))) await panel.locator("label", { hasText: new RegExp(`^${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).first().click();
  await page.waitForTimeout(1200);
  eq(`Zimmet ekranı doğrulanamayan durumların toplamı (${unverified.filter((t) => present.includes(t)).length} durum) = dashboard 'doğrulanamayan'`, await footerN(), dash.zKayitYok);
  await page.mouse.click(5, 5);

  await openReport("Kullanılmayan Cihazlar");
  eq("Kullanılmayan ekranı toplam kayıt = dashboard Kullanılmayan", await stat("toplam kayıt"), dash.distKullanilmayan);

  // ---------- Ham dosyalarla karşılaştırma ----------
  console.log("\nHam dosyalarla karşılaştırma");
  const imports = join(be.dataDir, "imports");
  const rows = (prefix, sheetIndex, headerRow) => {
    const f = readdirSync(imports).find((n) => n.startsWith(prefix));
    const wb = XLSX.read(readFileSync(join(imports, f)));
    const a = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[sheetIndex]], { header: 1, defval: "" });
    return { header: a[headerRow], data: a.slice(headerRow + 1).filter((r) => r.some((c) => String(c).trim() !== "")) };
  };
  const inaktif = rows("InaktifCihazlar", 1, 0);
  eq("Ham İnaktif dosyası satır sayısı = dashboard inaktif", inaktif.data.length, dash.inaktifCard);
  const disk = rows("DiskAlani", 0, 5);
  eq("Ham Disk dosyası satır sayısı = dashboard toplam birim", disk.data.length, dash.diskTotal);
  const sccm = rows("SCCM Inventory Report", 0, 3);
  eq("Ham SCCM dosyası satır sayısı = dashboard 'Toplam Cihaz'", sccm.data.length, dash.toplam);
  // Zimmet toplamı (TH+SCCM karşılaştırması) SCCM satır sayısından büyük olabilir: TuruncuHat'ta olup SCCM'de olmayan kayıtlar da listelenir
  check("Zimmet paneli 'SCCM VER[Iİ]S[Iİ]' toplamı SCCM dosyasından farklıysa bu açıkça fark ediliyor", true, `zimmet toplamı ${dash.zTotal}, ham SCCM ${sccm.data.length} (fark ${dash.zTotal - sccm.data.length} = TuruncuHat'ta olup SCCM'de olmayan/monitör kayıtları)`);
} finally {
  await browser.close();
  await be.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} dashboard kontrolü geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((f) => console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`));
process.exit(failed.length ? 1 : 0);
