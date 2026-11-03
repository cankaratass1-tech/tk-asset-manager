// Senaryo testi: TEK bir cihaz üzerinde, kaynak dosyalar adım adım değiştirilir; her adımda arayüzün (rapor, cihaz kartı, geçmiş,
// Bottleneck, Lokasyon/IP) değişimi GÖSTERİP göstermediği kontrol edilir ve önce/sonra ekran görüntüsü alınır.
//   node e2e/scenarios.mjs [--skip-build]     (görüntüler: SHOT_DIR, varsayılan ../senaryo-gorselleri)
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

if (!process.argv.includes("--skip-build")) buildFrontend();
const SHOT = process.env.SHOT_DIR || "../senaryo-gorselleri";
mkdirSync(SHOT, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };
const short = (h) => String(h).trim().split(".")[0].toLowerCase();

const be = await startBackend({ port: 5080 });
const browser = await launchBrowser();
try {
  const imports = join(be.dataDir, "imports");
  const pick = (p) => readdirSync(imports).find((n) => n.includes(p));
  const load = (p, sheet, hr) => { const f = p === "battery" ? join(be.dataDir, "uploads", "battery-health.xlsx") : join(imports, pick(p)); const wb = XLSX.read(readFileSync(f)); const name = wb.SheetNames[sheet]; const a = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" }); return { f, wb, name, a, hr, H: a[hr].map((h) => String(h).trim()) }; };
  const save = (d) => { d.wb.Sheets[d.name] = XLSX.utils.aoa_to_sheet(d.a); writeFileSync(d.f, XLSX.write(d.wb, { type: "buffer", bookType: "xlsx" })); };
  const body = (d) => d.a.slice(d.hr + 1);
  const col = (d, n) => d.H.indexOf(n);

  // pil dosyası yedek (bundled) olarak okunur; değiştirilebilir bir kopya için önce yükle
  const bundled = new URL("../../backend/demo-data/battery-health.xlsx", import.meta.url);
  await fetch(`${be.base}/api/settings/battery-health-upload`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${be.token}` }, body: JSON.stringify({ fileName: "battery-health.xlsx", contentBase64: readFileSync(bundled).toString("base64") }) });
  // ---- senaryo cihazı: zimmeti ZATEN uyuşmayan (anlık kayıtta görünür), pil + disk verisi olan, monitörsüz laptop ----
  let sccm = load("SCCM", 0, 3), th = load("TH_", 0, 0), bat = load("battery", 0, 0), disk = load("DiskAlani", 0, 5), mon = load("Attached", 0, 1);
  const batHosts = new Set(body(bat).map((r) => short(r[col(bat, "System")])));
  const diskHosts = new Set(body(disk).map((r) => short(r[col(disk, "Name") >= 0 ? col(disk, "Name") : col(disk, "Device ID")])));
  const monHosts = new Set(body(mon).map((r) => short(r[col(mon, "Hostname")])));
  const thBySerial = new Map(body(th).map((r) => [String(r[col(th, "Seri No")]).trim().toLowerCase(), r]));
  let dev = null;
  for (const r of body(sccm)) {
    const t = thBySerial.get(String(r[col(sccm, "Serial Number")]).trim().toLowerCase());
    if (!t || String(t[col(th, "Model")]) !== "NOTEBOOK" || String(t[col(th, "Konum Kategorisi")]) !== "User") continue;
    const ou = String(t[col(th, "Owner Username")]).trim().toLowerCase(), lu = String(r[col(sccm, "LastLogon UserName")]).trim().toLowerCase();
    const h = short(r[col(sccm, "Hostname")]);
    if (!ou || !lu || ou === lu || !batHosts.has(h) || !diskHosts.has(h) || monHosts.has(h)) continue;
    dev = { serial: String(r[col(sccm, "Serial Number")]).trim(), host: String(r[col(sccm, "Hostname")]).trim(), owner: String(t[col(th, "Sahibi")]).trim(), lastUser: String(r[col(sccm, "LastLogon UserName")]).trim() };
    break;
  }
  if (!dev) throw new Error("senaryo cihazı bulunamadı");
  console.log(`Senaryo cihazı: ${dev.serial} · ${dev.host} · zimmetli "${dev.owner}" · kullanan "${dev.lastUser}"\n`);

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 120)));
  const txt = async () => (await page.innerText("body")).replace(/\n\s*\n/g, "\n");
  const flat = async () => (await txt()).replace(/\n+/g, " | ");
  const shot = (n) => page.screenshot({ path: `${SHOT}/${n}.png` });
  const boot = async () => { await page.goto(be.base); await page.waitForTimeout(3500); };
  const card = async (q) => { // Cihaz Genel Görünüm: arama → kart
    await boot(); await page.locator('text="Ana Sayfa"').first().click(); await page.waitForTimeout(800);
    await page.locator("[data-device-search-btn]").click(); await page.waitForTimeout(500); // Cihaz Ara penceresi (sağ üst)
    const s = page.locator('input[placeholder^="Hostname / Seri No / Last Logon"]');
    await s.fill(q); await s.press("Enter"); await page.waitForTimeout(1500);
    return flat();
  };
  const zimmetRow = async (serial) => { // Zimmet raporu: seri no ile ara → satır metni
    await boot(); await page.locator('text="Zimmet Uyuşmazlığı"').first().click(); await page.waitForTimeout(2500);
    await page.locator('input[placeholder^="İsim, seri no"]').fill(serial); await page.waitForTimeout(1200);
    return (await page.locator("tbody tr").first().innerText()).replace(/\n+/g, " | ");
  };
  const bottleneckRow = async (host) => {
    await boot(); await page.locator('text="Bottleneck"').first().click(); await page.waitForTimeout(3500);
    await page.locator("text=Darboğaz olmayanları da göster, text=Bottleneck olmayanları da göster").first().click().catch(() => {});
    await page.locator('input[placeholder^="Hostname / seri no"]').fill(host); await page.waitForTimeout(1200);
    const n = await page.locator("[data-darbogaz-row]").count();
    return n ? (await page.locator("[data-darbogaz-row]").first().innerText()).replace(/\n+/g, " | ") : "";
  };

  // ============ 0) BAŞLANGIÇ ============
  console.log("0) Başlangıç");
  let c = await card(dev.serial);
  check("Cihaz kartı açılıyor (hostname, zimmetli kişi, Windows, batarya, disk)", c.includes(dev.host.split(".")[0]) && /Windows 1[01]/.test(c) && /Batarya sağlığı/.test(c) && /Boş Alan/.test(c), c.slice(c.indexOf("Hostname"), c.indexOf("Hostname") + 200));
  const winBefore = (c.match(/Windows 1[01] \d\dH\d/) || [""])[0];
  const batBefore = (c.match(/Batarya sağlığı \| %(\d+)/) || [])[1];
  console.log(`   Windows: ${winBefore}, pil: %${batBefore}`);
  await shot("0-baslangic-cihaz-karti");
  let z = await zimmetRow(dev.serial);
  check("Zimmet raporu: cihaz uyuşmazlık olarak görünüyor", /Hatalı/.test(z) && z.includes(dev.owner.split(" ")[0]), z.slice(0, 140));

  // ============ 1) ZİMMET DEVRİ ============
  console.log("\n1) Zimmet devri: TuruncuHat'ta cihaz başka birine geçti");
  th = load("TH_", 0, 0);
  const thRow = body(th).find((r) => String(r[col(th, "Seri No")]).trim() === dev.serial);
  const NEW_OWNER = "Zeynep Senaryo", NEW_USER = "z_senaryo";
  thRow[col(th, "Sahibi")] = NEW_OWNER; thRow[col(th, "Owner Username")] = NEW_USER; thRow[col(th, "Cihaz Sahibinin Sicili")] = "880001";
  thRow[col(th, "Cihaz Sahibinin Maili")] = "z_senaryo@mhy.com.tr"; thRow[col(th, "Son Güncelleme Tarihi")] = "2026-09-25";
  save(th);
  z = await zimmetRow(dev.serial);
  check("Zimmet raporu yeni zimmetli kişiyi gösteriyor", z.includes("Zeynep") && !z.includes(dev.owner), z.slice(0, 150));
  await shot("1-zimmet-devri-rapor");
  await page.locator('span[title="Detayını sağda göster"]').first().click();
  await page.waitForTimeout(1500);
  const histText = async () => { const open = page.locator("[data-history-open]"); if (await open.count()) { await open.click(); await page.waitForTimeout(500); return (await page.locator("[data-history-modal]").innerText()).replace(/\n+/g, " | "); } return (await page.locator("[data-action-history]").innerText()).replace(/\n+/g, " | "); };
  const hist = await histText();
  check("Cihaz Aksiyon Geçmişi: 'Zimmet Devri … → Zeynep Senaryo' + 'TuruncuHat Son Güncelleme' kaydı", /Zimmet Devri/.test(hist) && /→ Zeynep Senaryo/.test(hist) && /Zimmet Kaydı Güncellendi/.test(hist), hist.slice(0, 260));
  await shot("1-zimmet-devri-gecmis");

  // ============ 2) İSİM DEĞİŞİKLİĞİ ============
  console.log("\n2) Kişi adı değişti (soyadı güncellemesi) — aynı kişi, yeni yazım");
  th = load("TH_", 0, 0);
  body(th).find((r) => String(r[col(th, "Seri No")]).trim() === dev.serial)[col(th, "Sahibi")] = "Zeynep Yeni-Soyad";
  save(th);
  z = await zimmetRow(dev.serial);
  check("Zimmet raporu yeni adı gösteriyor, eskisini değil", z.includes("Yeni-Soyad") && !z.includes("Zeynep Senaryo"), z.slice(0, 120));
  c = await card(dev.serial);
  check("Cihaz kartında sahibi yeni ad", c.includes("Yeni-Soyad"), "");

  // ============ 3) HOSTNAME DEĞİŞİKLİĞİ ============
  console.log("\n3) Hostname değişti (SCCM'de yeniden adlandırma)");
  sccm = load("SCCM", 0, 3);
  const NEW_HOST = "ZZSENARYO01";
  body(sccm).find((r) => String(r[col(sccm, "Serial Number")]).trim() === dev.serial)[col(sccm, "Hostname")] = NEW_HOST;
  save(sccm);
  c = await card(NEW_HOST);
  check("Yeni hostname ile arama aynı cihazı (aynı seri no) buluyor", c.includes(NEW_HOST) && c.includes(dev.serial), "");
  const cOld = await card(dev.host.split(".")[0]);
  check("Eski hostname ile arama artık SCCM kaydı bulmuyor", !cOld.includes(NEW_HOST), "");
  c = await card(dev.serial);
  check("Hostname'e bağlı kaynaklar (disk, pil) yeni adla eşleşmiyor → kartta 'Veri Yok' (gerçek veri akışı sonucu)", /Disk verisi \| Veri Yok/.test(c) || /Batarya sağlığı \| Veri Yok/.test(c), (c.match(/Batarya sağlığı[^|]*\|[^|]*/) || [""])[0]);
  await shot("3-hostname-degisti");
  // eski adı geri al ki sonraki senaryolar (pil/disk) aynı cihazla sürsün
  sccm = load("SCCM", 0, 3);
  body(sccm).find((r) => String(r[col(sccm, "Serial Number")]).trim() === dev.serial)[col(sccm, "Hostname")] = dev.host;
  save(sccm);

  // ============ 4) WINDOWS YÜKSELTME ============
  console.log("\n4) Windows yükseltildi (10 22H2 → 11 23H2)");
  sccm = load("SCCM", 0, 3);
  const sRow = body(sccm).find((r) => String(r[col(sccm, "Serial Number")]).trim() === dev.serial);
  sRow[col(sccm, "Operating System")] = "Microsoft Windows 11 Enterprise"; sRow[col(sccm, "OS Version")] = "10.0.22631";
  save(sccm);
  c = await card(dev.serial);
  check(`Cihaz kartı Windows 11 23H2 gösteriyor (önce: ${winBefore})`, /Windows 11 23H2/.test(c), (c.match(/Windows sürümü \| [^|]*/) || [""])[0]);
  await shot("4-windows-yukseltme");

  // ============ 5) PİL BOZULDU ============
  console.log("\n5) Pil sağlığı çöktü (→ %42)");
  bat = load("battery", 0, 0);
  const bRow = body(bat).find((r) => short(r[col(bat, "System")]) === short(dev.host));
  const hcol = bat.H.findIndex((h) => /battery health/i.test(h));
  bRow[hcol] = 42; bRow[col(bat, "Full Charge Capacity")] = Math.round(Number(bRow[col(bat, "Design Capacity")]) * 0.42);
  save(bat);
  c = await card(dev.serial);
  check(`Cihaz kartı: Batarya sağlığı %42 + 'Değişmeli' (önce %${batBefore})`, /Batarya sağlığı \| %42 \| Değişmeli/.test(c), (c.match(/Batarya sağlığı[^|]*\|[^|]*\|[^|]*/) || [""])[0]);
  await shot("5-pil-bozuldu-kart");

  // ============ 6) DİSK DOLDU ============
  console.log("\n6) Disk doldu (C: 0.9 GB boş)");
  disk = load("DiskAlani", 0, 5);
  const dNameIx = col(disk, "Name") >= 0 ? col(disk, "Name") : col(disk, "Device ID");
  body(disk).filter((r) => short(r[dNameIx]) === short(dev.host)).forEach((r) => { r[col(disk, "Free Space")] = 920; });
  save(disk);
  c = await card(dev.serial);
  check("Cihaz kartı: Disk boş alan 0.9 GB + 'Yetersiz'", /Boş Alan \| 0\.9 GB/.test(c) && /Yetersiz|Kritik/.test(c), (c.match(/Boş Alan[^|]*\|[^|]*\|[^|]*/) || [""])[0]);

  // ============ 7) BOTTLENECK ============
  console.log("\n7) Bottleneck: pil + disk birlikte kritik → cihaz darboğaz listesinde");
  const b = await bottleneckRow(dev.host.split(".")[0]);
  // Sağlık skoru: 100 − pil kritik (30) − disk kritik (40) = 30 (yaş da kritikse daha düşük); 50 altı = Acil
  check("Bottleneck raporunda cihaz var; Pil ve Disk kritik (kırmızı), sağlık skoru ≤ 30 ve grup Acil", /%42/.test(b) && /0\.9 GB/.test(b) && /Acil/.test(b) && Number((b.match(/^\s*(\d+)/) || [0, 999])[1]) <= 30, b.slice(0, 180));
  await shot("7-bottleneck");

  // ============ 8) LOKASYON / IP ============
  console.log("\n8) Cihaz başka ofisin IP aralığına taşındı");
  sccm = load("SCCM", 0, 3);
  const sRow2 = body(sccm).find((r) => String(r[col(sccm, "Serial Number")]).trim() === dev.serial);
  const before = String(sRow2[col(sccm, "IPAddresses")]);
  sRow2[col(sccm, "IPAddresses")] = "172.28.250.77";
  sRow2[col(sccm, "Hostname")] = "ABJ1B99"; // lokasyon kodu bilinen (ABJ1 = Abidjan) bir ad: rapor yalnız kodu bilinen cihazları karşılaştırır
  save(sccm);
  await boot(); await page.locator('text="Lokasyon Hostname ve IP Uyuşmazlığı"').first().click(); await page.waitForTimeout(3000);
  const li = (await page.locator("tbody tr", { hasText: dev.serial }).first().innerText().catch(() => "")).replace(/\n+/g, " | ");
  check(`Lokasyon/IP raporu: cihaz uyuşmazlık olarak görünüyor (ABJ1B99, IP → 172.28.250.77; ABJ1 aralığı 172.28.157.x)`, li.includes(dev.serial) && !/eşleşiyor/.test(li), li.slice(0, 160));
  await shot("8-lokasyon-ip");

  // ============ 9) CİHAZ KALDIRILDI ============
  console.log("\n9) Cihaz SCCM envanterinden çıktı");
  sccm = load("SCCM", 0, 3);
  sccm.a = sccm.a.filter((r, i) => i <= 3 || String(r[col(sccm, "Serial Number")]).trim() !== dev.serial);
  save(sccm);
  c = await card(dev.serial);
  check("Cihaz kartı: SCCM'de mevcut = Hayır (TuruncuHat kaydı duruyor)", /SCCM'de mevcut \| Hayır/.test(c), (c.match(/SCCM'de mevcut[^|]*\|[^|]*/) || [""])[0]);
  await shot("9-cihaz-kaldirildi");
  check("Konsol hatası yok", problems.length === 0, problems.join(" | "));
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} senaryo kontrolü geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}  (görüntüler: ${SHOT})`);
failed.forEach((x) => console.log(`  ✗ ${x.name}`));
process.exit(failed.length ? 1 : 0);
