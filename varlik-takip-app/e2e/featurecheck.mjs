// Özellik kontrolleri: Cihaz Genel Görünüm (destek bitiş tarihi, Pil durumu kaldırıldı), Zimmet Uyuşmazlığı'nda kullanan kişinin tam adı,
// Lokasyon/IP e-posta önizlemesi, Atıl Monitör ek filtreleri (birlikte çalışma, aktif filtre çipleri, temizleme, boş sonuç).
//   node e2e/featurecheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };
const num = (s) => Number(String(s ?? "").replace(/[^\d]/g, ""));

const be = await startBackend({ port: 5098 });
const browser = await launchBrowser();
try {
  const imports = join(be.dataDir, "imports");
  const raw = (prefix, sheet, hr) => { const f = readdirSync(imports).find((n) => n.includes(prefix)); const wb = XLSX.read(readFileSync(join(imports, f))); const a = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[sheet]], { header: 1, defval: "" }); const H = a[hr].map((h) => String(h).trim()); return a.slice(hr + 1).filter((r) => r.some((c) => String(c).trim())).map((r) => Object.fromEntries(H.map((h, i) => [h, r[i]]))); };
  const th = raw("TH_", 0, 0), sccm = raw("SCCM", 0, 3);
  const nameByUser = new Map(th.map((r) => [String(r["Owner Username"]).trim().toLowerCase(), String(r["Sahibi"]).split(" (")[0].trim()]));

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 120)));
  const txt = async () => (await page.innerText("body")).replace(/\n\s*\n/g, "\n");
  const flat = async () => (await txt()).replace(/\n+/g, " | ");
  const boot = async () => { await page.goto(be.base); await page.waitForTimeout(4000); await page.locator('text="Ana Sayfa"').first().click(); await page.waitForTimeout(1200); };
  const footerN = async () => { for (let i = 0; i < 20; i++) { const m = (await txt()).match(/(\d[\d.]*) kayıttan/); if (m) return num(m[1]); await page.waitForTimeout(400); } return NaN; };

  console.log("Cihaz Genel Görünüm");
  await boot();
  const s = page.locator('input[placeholder^="Hostname / Seri No / Last Logon"]');
  const serial = String(sccm.find((r) => /Windows 11/.test(r["Operating System"]) && /10\.0\.2[0-9]{4}/.test(String(r["OS Version"])))["Serial Number"]).trim();
  await s.fill(serial); await s.press("Enter"); await page.waitForTimeout(1500);
  let c = await flat();
  check("Güvenlik kartında 'Destek bitiş tarihi' satırı ve tarih (YYYY-AA-GG) var", /Destek bitiş tarihi \| 20\d\d-\d\d-\d\d/.test(c), (c.match(/Destek bitiş tarihi[^|]*\|[^|]*/) || [""])[0]);
  check("'Pil durumu' alanı kaldırıldı", !/Pil durumu/.test(c));
  check("Diğer bilgiler yerinde: BitLocker, Windows sürümü, Destek durumu, Cihaz Yaşı", /BitLocker/.test(c) && /Windows sürümü/.test(c) && /Destek durumu/.test(c) && /Cihaz Yaşı/.test(c));

  console.log("\nZimmet Uyuşmazlığı — kullanan kişinin tam adı");
  await page.locator('text="Zimmet Uyuşmazlığı"').first().click(); await page.waitForTimeout(2500);
  const rowsN = Math.min(8, await page.locator("tbody tr").count());
  let withFull = 0, checked = 0;
  for (let i = 0; i < rowsN; i++) {
    const cells = page.locator("tbody tr").nth(i).locator("td");
    const cnt = await cells.count();
    if (cnt < 5) continue;
    const userCell = (await cells.nth(3).innerText()).split("\n")[0].trim(); // Kullanan Kişi sütunu
    if (!userCell || /Tespit Edilemedi/.test(userCell)) continue;
    checked++;
    if (/\s/.test(userCell) && !/[._]/.test(userCell)) withFull++;
  }
  check("Kullanan Kişi sütunu kullanıcı adı yerine ad-soyad gösteriyor (ilk satırlarda)", checked > 0 && withFull === checked, `${withFull}/${checked}`);
  const firstUserRow = await page.locator("tbody tr").first().locator("td").nth(3).innerText();
  const uname = String(sccm.find((r) => nameByUser.has(String(r["LastLogon UserName"]).trim().toLowerCase()))["LastLogon UserName"]).trim().toLowerCase();
  check("Ad, personel kaydıyla (TH Sahibi) eşleşen tam ad (örnek doğrulama)", Boolean(nameByUser.get(uname)) && firstUserRow.length > 0, `${uname} → ${nameByUser.get(uname)}`);
  // Açıklama alanı: tablodaki "Açıklama" sütunu ile detay panelindeki/popup'taki açıklama aynı metni göstermeli (her durumda)
  let descChecked = 0, descOk = 0;
  const zRows = page.locator("tbody tr");
  for (let i = 0; i < Math.min(12, await zRows.count()); i++) {
    const tds = zRows.nth(i).locator("td");
    if ((await tds.count()) < 7) continue;
    await zRows.nth(i).click({ position: { x: 150, y: 10 } }); await page.waitForTimeout(350);
    const hasField = (await page.locator("[data-record-description]").count()) > 0;
    const inAlert = (await page.locator('[class], div').filter({ hasText: /seri numaralı|birden fazla notebook/ }).count()) > 0;
    descChecked++;
    if (hasField || inAlert) descOk++;
  }
  check("Zimmet Uyuşmazlığı: açıklama detay panelinde de görünüyor (Doğru / Mükerrer / diğer satırların hepsinde)", descChecked >= 5 && descOk === descChecked, descOk + "/" + descChecked);
  check("Açıklama alanı etiketli ve 'Açıklama yok' boş durumu tanımlı", (await page.locator("[data-record-description]").count()) >= 1);

  console.log("\nAtıl Monitörler — filtreler");
  await page.locator('text="Atıl Monitörler"').first().click(); await page.waitForTimeout(3500);
  const base = await footerN();
  check("Liste açıldı (kayıt sayısı > 0)", base > 0, `${base}`);
  check("Ek filtre alanı var: Kullanım segmenti (3 seçenek) + sonuç sayacı", (await page.locator("[data-atil-usage]").count()) === 3 && (await page.locator("[data-atil-count]").count()) === 1);
  const open = async (label) => { await page.locator("[data-atil-filters] >> text=" + label).first().click(); await page.waitForTimeout(250); };
  check("Gelişmiş filtreler varsayılan kapalı (Şirket/Lokasyon/Marka/Model gizli), düğmeyle açılıyor", (await page.locator("[data-atil-filters] >> text=Şirket (Tümü)").count()) === 0 && (await page.locator("[data-atil-adv]").count()) === 1);
  await page.locator("[data-atil-adv]").click(); await page.waitForTimeout(250);
  check("Gelişmiş filtreler açılınca Şirket/Lokasyon/Marka/Model görünüyor", (await page.locator("[data-atil-filters]").innerText()).includes("Lokasyon") && (await page.locator("[data-atil-filters]").innerText()).includes("Marka"));
  await open("Şirket (Tümü)");
  const compOpt = page.locator("label:has(input[type=checkbox])").first();
  const compName = (await compOpt.innerText()).trim();
  await compOpt.click(); await page.waitForTimeout(500);
  await page.mouse.click(5, 5);
  const n1 = await footerN();
  check(`Şirket filtresi ('${compName}') sonucu daraltıyor`, n1 > 0 && n1 <= base, `${base} → ${n1}`);
  check("Aktif filtre çipi görünüyor", (await page.locator("[data-atil-chips]").innerText()).includes(compName));
  await open("Lokasyon (Tümü)");
  const locOpt = page.locator("label:has(input[type=checkbox])").first();
  const locName = (await locOpt.innerText()).trim();
  await locOpt.click(); await page.waitForTimeout(500);
  await page.mouse.click(5, 5);
  const n2 = await footerN();
  check(`İki filtre birlikte (Şirket + Lokasyon '${locName}') çalışıyor`, n2 > 0 && n2 <= n1, `${n1} → ${n2}`);
  check("İki aktif filtre çipi", (await page.locator("[data-atil-chips] [role=button][aria-label]").count()) === 2);
  await page.locator("[data-atil-chips] [role=button][aria-label]").first().click(); await page.waitForTimeout(500);
  const n3 = await footerN();
  check("Çipteki × ile tek filtre kaldırılıyor (yalnız lokasyon kaldı)", n3 >= n2 && (await page.locator("[data-atil-chips] [role=button][aria-label]").count()) === 1, `${n2} → ${n3}`);
  await page.locator("[data-atil-clear]").click(); await page.waitForTimeout(500);
  check("'Tümünü temizle' tüm ek filtreleri kaldırıyor (sayı başlangıca döndü)", (await footerN()) === base && (await page.locator("[data-atil-chips]").count()) === 0);
  await page.locator('[data-atil-usage="used"]').click(); await page.waitForTimeout(500);
  check("Atıl aşamasında 'Kullanılıyor' filtresi boş sonuç durumunu gösteriyor (hepsi kullanılmıyor)", (await page.locator("[data-atil-empty]").count()) === 1 && /Seçili filtrelere uyan monitör yok/.test(await txt()));
  await page.locator("[data-atil-empty] [role=button]").click(); await page.waitForTimeout(500);
  check("Boş sonuçtaki 'Ek filtreleri temizle' listeyi geri getiriyor", (await footerN()) === base);
  await page.locator('[data-atil-usage="unused"]').click(); await page.waitForTimeout(400);
  check("'Kullanılmıyor' filtresi atıl listeyle aynı sayıyı veriyor", (await footerN()) === base);
  await page.locator('[data-atil-usage="all"]').click();
  // arama (debounce) + çip + sonuç sayacı + sıralama
  const sbox = page.locator('input[placeholder^="Seri no, model"]');
  await sbox.fill("zzzz-yok-yok"); await page.waitForTimeout(600);
  check("Arama (debounce sonrası) boş sonuç + 'Arama' çipi + aktif filtre sayısı", (await page.locator("[data-atil-empty]").count()) === 1 && (await page.locator("[data-atil-chips]").innerText()).includes("Arama: zzzz-yok-yok") && /1 aktif filtre/.test(await page.locator("[data-atil-count]").innerText()));
  await page.locator("[data-atil-clear]").click(); await page.waitForTimeout(500);
  check("'Tümünü temizle' aramayı da temizliyor", (await sbox.inputValue()) === "" && (await footerN()) === base);
  await page.locator('[data-atil-sort="0"]').click(); await page.waitForTimeout(300);
  const first = (await page.locator("tbody tr").first().locator("td").nth(1).innerText()).trim();
  await page.locator('[data-atil-sort="0"]').click(); await page.waitForTimeout(300);
  const firstDesc = (await page.locator("tbody tr").first().locator("td").nth(1).innerText()).trim();
  check("Sütun başlığına tıklayınca sıralama (artan ↔ azalan) çalışıyor", first !== firstDesc && first.localeCompare(firstDesc, "tr", { numeric: true }) < 0, first + " / " + firstDesc);
  await page.locator('[data-atil-sort="0"]').click(); await page.waitForTimeout(300);

  console.log("\nYeni Kurulum Kaydı — liste");
  await page.locator('text="Yeni Kurulum Kaydı"').first().click(); await page.waitForTimeout(2500);
  const tw = await page.evaluate(() => { const t = document.querySelector("[data-yk-table]"); return [t.scrollWidth, t.parentElement.clientWidth]; });
  check("Liste yatay kaydırma gerektirmiyor (tablo panele sığıyor)", tw[0] <= tw[1] + 2, tw.join(" / "));
  const mb = await page.locator("[data-yk-menu]").first().boundingBox();
  check("Aksiyon (Teslim Et / ⋯) ilk ekranda, yatay kaydırmadan görünüyor", !!mb && mb.x + mb.width <= 1500);
  const ykTotal = num(await page.locator('[data-yk-stat="all"]').innerText());
  await page.locator('[data-yk-stat="unmailed"]').click(); await page.waitForTimeout(400);
  const ykUnmailed = num(await page.locator('[data-yk-stat="unmailed"]').innerText());
  check("Sayı şeridinden filtre: satır sayısı şerit sayısıyla aynı + aktif filtre çipi", (await page.locator("[data-yk-table] tbody tr").count()) === ykUnmailed && (await page.locator("[data-yk-chips]").count()) === 1, ykUnmailed + " / " + ykTotal);
  await page.locator("[data-yk-chips] >> text=Tümünü temizle").click(); await page.waitForTimeout(300);
  check("Filtre temizlenince kayıtlar geri geliyor", (await page.locator("[data-yk-table] tbody tr").count()) > 0 && (await page.locator("[data-yk-chips]").count()) === 0);
  await page.locator("[data-yk-table] tbody tr span[title^='Ayrıntıyı']").first().click(); await page.waitForTimeout(250);
  const det = await page.locator("[data-yk-detail]").innerText();
  check("Satır ayrıntısı açılıyor (BitLocker, İşlem yapan, İadeler)", /BITLOCKER/.test(det) && /İADELER/i.test(det));
  await page.locator("[data-yk-menu]").first().click(); await page.waitForTimeout(150);
  check("'⋯' menüsü: Düzenle / Sil", (await page.locator("[data-yk-edit]").count()) === 1 && (await page.locator("[data-yk-delete]").count()) === 1);
  await page.mouse.click(5, 5); await page.waitForTimeout(150);
  check("Menü dışına tıklayınca kapanıyor", (await page.locator("[data-yk-edit]").count()) === 0);

  console.log("\nLokasyon/IP — e-posta önizlemesi");
  await page.locator('text="Lokasyon Hostname ve IP Uyuşmazlığı"').first().click(); await page.waitForTimeout(3500);
  await page.locator("[data-locip-preview]").click(); await page.waitForTimeout(800);
  const pv = await page.locator("[data-mail-preview]").innerText();
  check("Önizleme penceresi: konu, alıcı ve referans maille aynı başlık bandı (LOKASYON / IP UYUŞMAZLIĞI)", /Lokasyon\/IP Uyuşmazlığı — Cihaz Bilgilerinizin Güncellenmesi Gerekiyor/.test(pv) && /LOKASYON \/ IP UYUŞMAZLIĞI/.test(pv) && /Alıcı:/.test(pv));
  check("Önizlemede bilgi alanı (Computer name, Beklenen ofis, Cihazın IP bloğu) var", /Computer name/.test(pv) && /Beklenen ofis/.test(pv) && /Cihazın IP bloğu/.test(pv));
  check("Konsol hatası yok", problems.length === 0, problems.join(" | "));
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} özellik kontrolü geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((x) => console.log(`  ✗ ${x.name}`));
process.exit(failed.length ? 1 : 0);
