// Cihaz Aksiyon Geçmişi testi: snapshot'lardan türetilen olaylar (rapora girdi/çıktı, zimmet devri), TuruncuHat güncelleme tarihi,
// kategori çipleri ve günlere göre gruplama. Beklenenler elle tohumlanan veriden bilinir.
//   node e2e/historycheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const be = await startBackend({ port: 5071 });
const browser = await launchBrowser();
const auth = { "Content-Type": "application/json", Authorization: `Bearer ${be.token}` };
try {
  // TH demo: "Son Güncelleme Tarihi" sütunu var mı ve seri no → tarih haritası
  const imports = join(be.dataDir, "imports");
  const thFile = readdirSync(imports).find((n) => n.startsWith("TH_"));
  const th = XLSX.utils.sheet_to_json(XLSX.read(readFileSync(join(imports, thFile))).Sheets[XLSX.read(readFileSync(join(imports, thFile))).SheetNames[0]], { defval: "" });
  const updBySerial = new Map(th.map((r) => [String(r["Seri No"]).trim().toLowerCase(), String(r["Son Güncelleme Tarihi"] || "")]));
  check("Demo TH'de 'Son Güncelleme Tarihi' sütunu dolu", [...updBySerial.values()].filter(Boolean).length > 1000);

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 120)));
  await page.goto(be.base);
  await page.waitForTimeout(4000);
  await page.locator('text="Zimmet Uyuşmazlığı"').first().click();
  await page.waitForTimeout(2500);
  // ilk satırın cihazı: TH'de güncelleme tarihi olan bir satır seç
  const serials = await page.locator('span[title="Detayını sağda göster"]').allInnerTexts();
  const S = serials.map((x) => x.trim()).find((x) => updBySerial.get(x.toLowerCase())) || serials[0].trim();
  const upd = updBySerial.get(S.toLowerCase()) || "";
  console.log(`  (cihaz ${S}, TH güncelleme tarihi ${upd || "yok"})`);

  // tohum: 3 snapshot (girdi → çıktı → tekrar girdi, sahip değişti) + manuel not
  const key = S.toLowerCase();
  const seed = [["2026-06-15T10:00:00Z", true, "Eski Sahip"], ["2026-07-15T10:00:00Z", false, ""], ["2026-08-15T10:00:00Z", true, "Yeni Sahip"]];
  for (const [at, present, owner] of seed) {
    await fetch(`${be.base}/api/snapshots`, { method: "POST", headers: auth, body: JSON.stringify({ reportId: "zimmet", capturedAt: at, sourceFileModifiedAt: `h-${at}`, devices: present ? [{ key, serial: S, owner }] : [{ key: "baska-cihaz", serial: "x" }] }) });
  }
  await fetch(`${be.base}/api/devices/actions/${encodeURIComponent(key)}`, { method: "POST", headers: auth, body: JSON.stringify({ type: "Not", description: "Kullanıcı arandı", user: "tester", ts: "2026-09-02T09:30:00Z" }) });
  const tl = await fetch(`${be.base}/api/snapshots/device/${encodeURIComponent(key)}`, { headers: auth }).then((r) => r.json());
  check("Backend cihaz zaman çizgisi: zimmet raporunda ≥3 snapshot (uygulamanın kendi anlık kaydı dahil), 2'sinde var, sahipler kayıtlı", Array.isArray(tl.zimmet) && tl.zimmet.length >= 3 && tl.zimmet.filter((x) => x.present).length === 2 && tl.zimmet.some((x) => x.owner === "Yeni Sahip"), JSON.stringify(tl).slice(0, 120));

  await page.reload();
  await page.waitForTimeout(4500);
  await page.locator('text="Zimmet Uyuşmazlığı"').first().click();
  await page.waitForTimeout(2500);
  await page.locator('span[title="Detayını sağda göster"]', { hasText: S }).first().click();
  await page.waitForSelector("[data-action-history] [data-history-event]", { timeout: 15000 });
  const inline = page.locator("[data-history-preview] [data-history-event]");
  check("Panelde yalnız son 3 kayıt gösteriliyor (aşağı doğru uzamıyor)", (await inline.count()) === 3, `${await inline.count()}`);
  check("'Tümünü gör' bağlantısı var ve kayıt sayısı başlıkta", (await page.locator("[data-history-open]").count()) === 1 && /Cihaz Aksiyon Geçmişi \(\d+\)/i.test(await page.locator("[data-action-history]").innerText()));
  check("Çipler panelde değil, popup'ta", (await page.locator("[data-history-chip]").count()) === 0);
  await page.locator("[data-history-open]").click();
  await page.waitForSelector("[data-history-modal]");
  const panel = page.locator("[data-history-modal]");
  check("Popup açıldı ve tüm kayıtlar listeleniyor (>3)", (await panel.locator("[data-history-event]").count()) > 3, `${await panel.locator("[data-history-event]").count()}`);
  const txt = async () => (await panel.innerText()).replace(/\n+/g, " | ");
  let t = await txt();
  console.log("  ", t.slice(0, 400));
  check("Zimmet devri: 'Eski Sahip → Yeni Sahip' görünüyor", /Eski Sahip → Yeni Sahip/.test(t));
  check("Devir tarihi dürüstçe etiketli (TH tarihi aralıkta değilse 'fark edildiği tarih')", /fark edildiği tarih|TuruncuHat son güncelleme tarihi/.test(t));
  check("Rapora girdi / Rapordan çıktı / İlk kayıtlı tespit olayları var", /İlk Kayıtlı Tespit/.test(t) && /Rapordan Çıktı/.test(t) && /Rapora Girdi/.test(t));
  check("Türetilen olaylar 'otomatik' rozetli", (await panel.locator("text=otomatik").count()) >= 3);
  check("Manuel not da listede", /Kullanıcı arandı/.test(t));
  if (upd) check("TuruncuHat güncelleme olayı ('kaynak' rozeti) var", /Zimmet Kaydı Güncellendi/.test(t) && (await panel.locator("text=kaynak").count()) >= 1);
  check("Günlere göre gruplama başlıkları var", (await panel.locator("[data-history-day]").count()) >= 2);

  const chip = (id) => panel.locator(`[data-history-chip="${id}"]`);
  check("Çipler: Tümü / Zimmet / Rapor / Not-Durum (mail yoksa Mail çipi yok)", (await chip("all").count()) === 1 && (await chip("zimmet").count()) === 1 && (await chip("rapor").count()) === 1 && (await chip("not").count()) === 1 && (await chip("mail").count()) === 0);
  await chip("zimmet").click();
  await page.waitForTimeout(300);
  const nz = await panel.locator('[data-history-event="zimmet"]').count();
  const other = (await panel.locator("[data-history-event]").count()) - nz;
  check("'Zimmet' çipi yalnız zimmet olaylarını gösteriyor", nz >= 1 && other === 0, `${nz} zimmet, ${other} diğer`);
  await chip("not").click();
  await page.waitForTimeout(300);
  t = await txt();
  check("'Not / Durum' çipi yalnız notu gösteriyor", /Kullanıcı arandı/.test(t) && !/Zimmet Devri/.test(t));
  await chip("all").click();
  await panel.locator("[data-history-close]").click();
  await page.waitForTimeout(300);
  check("Popup kapanınca detay paneli açık kalıyor", (await page.locator("[data-history-modal]").count()) === 0 && (await page.locator("[data-action-history]").count()) === 1);
  check("Konsol hatası yok", problems.length === 0, problems.join(" | "));
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} geçmiş kontrolü geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((x) => console.log(`  ✗ ${x.name}`));
process.exit(failed.length ? 1 : 0);
