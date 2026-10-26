// Üst yönetim ekranı (Operasyonel Durum Özeti) testi: gerçek tarayıcıda, bilinen anlık kayıtlarla. Beklenen değerler testte BAĞIMSIZ olarak (küme farkıyla)
// hesaplanır; ekrandaki KPI'larla karşılaştırılır. Filtreler (dönem, özel aralık, şirket), grafik etkileşimi, detay tablosu, CSV, boş veri ve mobil görünüm.
//   node e2e/execcheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";
import { readFileSync } from "node:fs";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const AJET = "TKAJ-AJET A.Ş.", TKAO = "TKAO-MHY A.O.";
const DAY = 86400000;
const D0 = Date.UTC(2027, 0, 1, 10); // seed tarihleri gelecekte: uygulamanın kendi (bugünkü) kayıtlarından sonra gelir, hep son kayıt bunlardır
const WEEKS = 30; // backend rapor başına en çok 30 kayıt tutar; 203 gün: üç aylık dönem ve önceki üç aylık dönem de tohumlarla karşılanır
const at = (w) => new Date(D0 + w * 7 * DAY).toISOString();
const companyOf = (key) => ([...key].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 2 === 0 ? AJET : TKAO);

// rapor başına: başlangıç adedi N, haftalık çözülen r, haftalık yeni n
const PLAN = { inaktif: { N: 200, r: 4, n: 1 }, zimmet: { N: 60, r: 1, n: 3 }, disk: { N: 30, r: 2, n: 2 }, kullanilmayan: { N: 40, r: 3, n: 1 } };
const states = {}; // rapor → hafta → Set(key)
for (const [rep, { N, r, n }] of Object.entries(PLAN)) {
  let cur = Array.from({ length: N }, (_, k) => `${rep}-${k}`);
  states[rep] = [];
  for (let w = 0; w < WEEKS; w++) {
    states[rep].push(new Set(cur));
    cur = [...cur.slice(r), ...Array.from({ length: n }, (_, j) => `${rep}-n${w}-${j}`)];
  }
}
// Bağımsız beklenen değer: iki hafta indeksi arasında küme farkı (şirket filtresi opsiyonel)
const expectFor = (baseW, endW, company) => {
  const keep = (k) => !company || companyOf(k) === company;
  let openStart = 0, openEnd = 0, cozulen = 0, yeni = 0;
  for (const rep of Object.keys(PLAN)) {
    const a = [...states[rep][baseW]].filter(keep), b = new Set([...states[rep][endW]].filter(keep));
    const aSet = new Set(a);
    openStart += aSet.size; openEnd += b.size;
    cozulen += a.filter((k) => !b.has(k)).length;
    yeni += [...b].filter((k) => !aSet.has(k)).length;
  }
  return { openStart, openEnd, cozulen, yeni, net: yeni - cozulen };
};
const pfx = (p) => (p == null ? "—" : `${p < 0 ? "−" : ""}%${Math.abs(p).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`);
const sgn = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("tr-TR")}`;
const num = (n) => n.toLocaleString("tr-TR");
const pct = (e) => (e.openStart > 0 ? Math.round(((e.openStart - e.openEnd) / e.openStart) * 1000) / 10 : null);

const be = await startBackend({ port: 5075 });
const be2 = await startBackend({ port: 5076 });
const browser = await launchBrowser();
const auth = (b) => ({ "Content-Type": "application/json", Authorization: `Bearer ${b.token}` });
try {
  for (const rep of Object.keys(PLAN)) {
    for (let w = 0; w < WEEKS; w++) {
      const devices = [...states[rep][w]].map((key) => ({ key, serial: key, hostname: key, company: companyOf(key) }));
      const r = await fetch(`${be.base}/api/snapshots`, { method: "POST", headers: auth(be), body: JSON.stringify({ reportId: rep, capturedAt: at(w), sourceFileModifiedAt: `exec-${rep}-${w}`, devices }) });
      if (!r.ok) throw new Error(`tohum yazılamadı ${rep} ${w}`);
    }
  }
  const open = async (b, vw = 1500, vh = 1000) => {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, acceptDownloads: true });
    await ctx.addInitScript((t) => { localStorage.setItem("varlikTakip.sessionToken", t); localStorage.setItem("varlikTakip.execDash", "1"); localStorage.setItem("varlikTakip.execRange", "week"); }, b.token);
    const page = await ctx.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push(e.message.slice(0, 140)));
    await page.goto(b.base);
    await page.waitForSelector("[data-exec-dashboard]", { timeout: 20000 });
    await page.waitForTimeout(2500);
    return { ctx, page, problems };
  };
  const { page, problems, ctx } = await open(be);
  const kpi = async (id) => (await page.locator(`[data-kpi="${id}"] [data-kpi-value]`).innerText()).trim();
  const compare = async (label, e) => {
    const got = { open: await kpi("open"), solved: await kpi("solved"), fresh: await kpi("new"), net: await kpi("net"), imp: await kpi("improve") };
    const want = { open: num(e.openEnd), solved: num(e.cozulen), fresh: num(e.yeni), net: sgn(e.net), imp: pfx(pct(e)) };
    check(`${label}: KPI'lar bağımsız hesapla aynı (açık ${want.open}, çözülen ${want.solved}, yeni ${want.fresh}, net ${want.net}, iyileşme ${want.imp})`, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
    check(`${label}: net iş akışı = yeni − çözülen ve açık değişimine eşit`, e.net === e.yeni - e.cozulen && e.net === e.openEnd - e.openStart);
  };
  const seg = (group, opt) => page.locator(`[data-seg="${group}"] [data-seg-opt="${opt}"]`);

  console.log("Üst yönetim ekranı — dönem filtreleri");
  check("Ana Sayfa üst yönetim ekranıyla açılıyor (başlık, durum, dönem metni)", /Operasyonel Durum Özeti/.test(await page.innerText("body")) && (await page.locator("[data-exec-status]").count()) === 1 && /Dönem:/.test(await page.locator("[data-exec-period]").innerText()));
  check("Beş KPI kartı görünüyor", (await page.locator("[data-kpi]").count()) === 5);
  await compare("Haftalık", expectFor(28, 29));
  await seg("range", "month").click(); await page.waitForTimeout(500);
  await compare("Aylık", expectFor(24, 29));
  await seg("range", "quarter").click(); await page.waitForTimeout(500);
  await compare("Son 3 ay", expectFor(16, 29));
  check("Son 3 ay: önceki eşdeğer (90 günlük) dönem de hesaplanıyor", /Önceki döneme göre/.test(await page.locator('[data-kpi="open"]').innerText()) && /Karşılaştırma:/.test(await page.locator("[data-exec-period]").innerText()));
  await seg("range", "month").click(); await page.waitForTimeout(500);
  const prevEnd = Object.keys(PLAN).reduce((a, rep) => a + states[rep][24].size, 0); // önceki aylık dönem, bugünkü dönemin tabanında (24. hafta) biter
  check("Aylık: önceki eşdeğer dönem (30 gün) hesaplanıyor; önceki dönem sonu bağımsız toplamla aynı", /Önceki döneme göre/.test(await page.locator('[data-kpi="open"]').innerText()) && /Karşılaştırma:/.test(await page.locator("[data-exec-period]").innerText()) && new RegExp(`Önceki dönem sonu\\s+${num(prevEnd)}`).test(await page.locator("[data-trend-summary]").innerText()), String(prevEnd));
  await seg("range", "quarter").click(); await page.waitForTimeout(400);

  console.log("\nÖzel aralık");
  await seg("range", "custom").click(); await page.waitForTimeout(400);
  const dateOf = (w) => { const d = new Date(D0 + w * 7 * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  await page.locator("[data-range-from]").fill(dateOf(10)); await page.locator("[data-range-to]").fill(dateOf(15)); await page.waitForTimeout(600);
  await compare("Özel (10.–15. hafta)", expectFor(9, 15)); // taban: aralık başlangıcından önceki son kayıt
  await page.locator("[data-range-from]").fill(dateOf(15)); await page.locator("[data-range-to]").fill(dateOf(10)); await page.waitForTimeout(500);
  check("Başlangıç > bitiş ise uyarı gösteriliyor, KPI uydurulmuyor", (await page.locator("[data-exec-invalid]").count()) === 1 && (await page.locator("[data-kpi]").count()) === 0);
  await seg("range", "month").click(); await page.waitForTimeout(500);

  console.log("\nŞirket filtresi");
  await seg("company", AJET).click(); await page.waitForTimeout(600);
  await compare("AJET (aylık)", expectFor(24, 29, AJET));
  const aj = expectFor(24, 29, AJET);
  await seg("company", TKAO).click(); await page.waitForTimeout(600);
  const tk = expectFor(24, 29, TKAO);
  await compare("TKAO (aylık)", tk);
  const all = expectFor(24, 29);
  check("Şirket toplamları genel toplamla tutarlı (açık, çözülen, yeni)", aj.openEnd + tk.openEnd === all.openEnd && aj.cozulen + tk.cozulen === all.cozulen && aj.yeni + tk.yeni === all.yeni);
  await seg("company", "all").click(); await page.waitForTimeout(500);

  console.log("\nGrafik, özet, paneller");
  const t = await page.locator("[data-trend-summary]").innerText();
  check("Grafik başlık özeti: başlangıç ve bitiş KPI ile aynı", t.includes(`Başlangıç ${num(all.openStart)}`) && t.includes(`Bitiş ${num(all.openEnd)}`), t.replace(/\n/g, " ").slice(0, 110));
  const hit = page.locator("[data-trend-hit]").nth(2);
  await hit.hover(); await page.waitForTimeout(250);
  const tip = await page.locator("[data-trend-tip]").innerText().catch(() => "");
  check("Grafikte tarih bazlı tooltip (tarih, açık, çözülen, yeni, net)", /\d{2}\.\d{2}\.\d{4}/.test(tip) && /Açık cihaz/.test(tip) && /Çözülen/.test(tip) && /Net/.test(tip), tip.replace(/\n/g, " | ").slice(0, 120));
  const svgBefore = await page.locator('[data-exec-trend] svg[role="img"]').innerHTML();
  await page.locator('[data-series-toggle="solved"]').click(); await page.locator('[data-series-toggle="fresh"]').click(); await page.waitForTimeout(300);
  const svgAfter = await page.locator('[data-exec-trend] svg[role="img"]').innerHTML();
  check("Seri düğmeleri çalışıyor (çözülen ve yeni kapatılınca sütunlar kalkıyor)", svgAfter.length < svgBefore.length && (await page.locator('[data-series-toggle="open"]').getAttribute("aria-pressed")) === "true");
  await page.locator('[data-series-toggle="solved"]').click(); await page.locator('[data-series-toggle="fresh"]').click();
  // Grafik okunabilirliği: eksen verinin aralığına göre ölçeklenir, çizgi düz çıkmaz; "başlangıca göre fark" görünümü
  const lineSpread = async () => page.locator('[data-exec-trend] svg[role="img"] polyline').first().evaluate((pl) => { const ys = pl.getAttribute("points").split(" ").map((p) => Number(p.split(",")[1])); return Math.max(...ys) - Math.min(...ys); });
  const ticks = async () => (await page.locator("[data-axis-tick]").allTextContents()).map((t) => Number(t.replace(/\./g, "").replace("−", "-").replace("+", "")));
  const tk0 = await ticks();
  check("Grafik (Sayı görünümü): eksen sıfırdan başlamıyor, veri aralığına göre ölçekleniyor", Math.min(...tk0) > 0.6 * Math.min(all.openStart, all.openEnd), tk0.join(", "));
  check("Grafik (Sayı görünümü): çizgi düz değil (dikey yayılım ≥ 40 px)", (await lineSpread()) >= 40, `${Math.round(await lineSpread())} px`);
  await page.locator('[data-trend-mode="change"]').click(); await page.waitForTimeout(300);
  const tk1 = await ticks();
  check("Grafik (Başlangıca göre fark): eksen 0'ı içeriyor, iyileşme sıfırın altında (eksi değerler), çizgi okunur", tk1.includes(0) && Math.min(...tk1) < 0 && (await lineSpread()) >= 40, `${tk1.join(", ")} · ${Math.round(await lineSpread())} px`);
  check("Grafik: başlangıç seviyesi çizgisi etiketli ve fark görünümünde son nokta toplam değişimi gösteriyor", /Başlangıç: \d/.test(await page.locator('[data-exec-trend] svg[role="img"]').innerHTML().then((h) => h.replace(/<[^>]+>/g, " "))) && (await page.locator('[data-exec-trend] svg[role="img"] text').allTextContents()).includes(sgn(all.openEnd - all.openStart)));
  await page.locator('[data-trend-hit]').nth(3).hover(); await page.waitForTimeout(200);
  check("Tooltip'te 'Başlangıca göre' farkı var", /Başlangıca göre/.test(await page.locator("[data-trend-tip]").innerText()));
  await page.locator('[data-trend-mode="level"]').click(); await page.waitForTimeout(300);
  const sBlocks = await page.locator("[data-summary-block]").allInnerTexts();
  check("Yönetici özeti: olumlu / dikkat / aksiyon üç bölümü dolu ve veriden rakam içeriyor", sBlocks.length === 3 && sBlocks.every((b) => b.length > 30) && /\d/.test(sBlocks.join(" ")), sBlocks.map((b) => b.split("\n")[1]?.slice(0, 50)).join(" // "));
  check("Özet hatalı zimmet artışını gösteriyor (zimmet artıyor)", /Hatalı zimmet/.test(sBlocks[1]), sBlocks[1].slice(0, 110));
  check("Özet nedensellik iddia etmiyor (aksiyon notu: nedensellik doğrulanamaz)", /nedensellik/.test(sBlocks[2]));
  const wkSummary = (await page.locator("[data-exec-summary]").innerText());
  await seg("range", "week").click(); await page.waitForTimeout(500);
  check("Dönem değişince özet yeniden üretiliyor (metin değişti)", (await page.locator("[data-exec-summary]").innerText()) !== wkSummary);
  await seg("range", "month").click(); await page.waitForTimeout(400);

  check("Şirket paneli: iki şirket ve 5 metrik, tek kazanan ilan edilmiyor", (await page.locator("[data-company-metric]").count()) === 5 && /kazanan ilan edilmez/.test(await page.locator("[data-exec-company]").innerText()));
  const catText = await page.locator("[data-exec-categories]").innerText();
  check("Konu paneli: 4 kategori; zimmet 'Artıyor', inaktif 'İyileşiyor' (veriye göre)", (await page.locator("[data-cat-row]").count()) === 4 && /Hatalı zimmet[\s\S]{0,40}Artıyor/.test(catText) && /İnaktif cihaz[\s\S]{0,40}İyileşiyor/.test(catText));
  check("Konu paneli: dönem başı, sonu, değişim, önceki dönem gösteriliyor", /Dönem başı/.test(catText) && /Dönem sonu/.test(catText) && /önceki dönem/.test(catText));
  // ---- Hedef: cihaz sağlığı oranı (varsayılan %95) ----
  const trNum = (t) => Number(String(t).replace(/\./g, "").replace(",", "."));
  const tval = async (k) => (await page.locator(`[data-target-val="${k}"]`).innerText()).trim();
  const openNow = trNum(await kpi("open"));
  const totalDev = trNum(await page.locator("[data-target-total]").innerText());
  const wantHealth = Math.round(Math.max(0, Math.min(100, ((totalDev - openNow) / totalDev) * 100)) * 10) / 10;
  check("Hedef kartı: varsayılan %95; güncel sağlık oranı (toplam − açık) ÷ toplam ile aynı", (await tval("Hedef")) === "%95" && trNum((await tval("Güncel")).replace("%", "")) === wantHealth, `toplam ${totalDev}, açık ${openNow}, sağlık %${wantHealth}`);
  const wantGap = Math.round((95 - wantHealth) * 10) / 10;
  check("Hedef kartı: hedefe kalan fark, gerçekleşme ve izin verilen açık sayısı doğru", wantHealth < 95 && trNum((await tval("Hedefe kalan fark")).replace(" puan", "")) === wantGap && trNum((await tval("Gerçekleşme")).replace("%", "")) === Math.round((wantHealth / 95) * 1000) / 10 && trNum(await page.locator("[data-target-allowed]").innerText()) === Math.floor((totalDev * 5) / 100 + 1e-9), `fark ${wantGap}`);
  check("Hedefin altındayken durum 'Hedefin altında'", /Hedefin altında/.test(await page.locator("[data-target-status]").innerText()));
  check("Grafikte hedef çizgisi (izin verilen en çok açık sayısı) çiziliyor", new RegExp(`Hedef: en çok ${Math.floor((totalDev * 5) / 100 + 1e-9).toLocaleString("tr-TR")} açık`).test(await page.locator("[data-exec-trend]").innerText().then((t) => t.replace(/\s+/g, " "))) || (await page.locator('[data-exec-trend] svg[role="img"]').innerHTML()).includes("Hedef: en çok"));
  check("KPI 'Genel iyileşme' notunda hedef durumu görünüyor", /Hedef: cihaz sağlığı %95/.test(await page.locator('[data-kpi="improve"]').innerText()));
  await page.locator("[data-target-input]").fill("30"); await page.locator("[data-target-input]").press("Enter"); await page.waitForTimeout(500);
  check("Hedef %30'a çekilince 'Hedefe ulaşıldı', fark gösterilmiyor", /Hedefe ulaşıldı/.test(await page.locator("[data-target-status]").innerText()) && (await tval("Hedefe kalan fark")) === "—");
  await page.locator("[data-target-input]").fill(""); await page.locator("[data-target-input]").press("Enter"); await page.waitForTimeout(500);
  check("Hedef kutusu boşaltılınca 'Hedef tanımlı değil' (uydurma hedef yok)", (await page.locator("[data-targets-empty]").count()) === 1 && (await page.locator("[data-target-card]").count()) === 0);
  await page.locator("[data-target-input]").fill("95"); await page.locator("[data-target-input]").press("Enter"); await page.waitForTimeout(500);
  check("Hedef %95'e dönünce kart geri geliyor", (await tval("Hedef")) === "%95");
  check("Riskler yalnızca ölçülen yönden: zimmet artışı listede", /Hatalı zimmet/.test(await page.locator("[data-risks]").innerText()));

  console.log("\nDetay tablosu");
  check("Detay tablosu başlangıçta kapalı (ana ekran sade)", (await page.locator("[data-exec-detail]").count()) === 0);
  await page.locator("[data-detail-toggle]").click(); await page.waitForSelector("[data-detail-row]");
  const nRows = await page.locator("[data-detail-row]").count();
  check("Tablo satırları şirket × konu × dönem (tümü + 2 şirket) ", nRows >= 3 * 4 * 3, String(nRows));
  const firstCells = async () => page.locator("[data-detail-row]").first().locator("td").allInnerTexts();
  const before = (await firstCells()).join("|");
  await page.locator('[data-sort="acik"]').click(); await page.locator('[data-sort="acik"]').click(); await page.waitForTimeout(200);
  const sortedOpen = (await page.locator("[data-detail-row]").evaluateAll((trs) => trs.map((tr) => Number(tr.children[3].innerText.replace(/\./g, "")))));
  check("Sıralama çalışıyor (Açık cihaz sütunu azalan sırada)", sortedOpen.every((v, i, a) => i === 0 || a[i - 1] >= v) && (await firstCells()).join("|") !== before);
  await page.locator("[data-detail-company]").selectOption({ label: AJET }); await page.waitForTimeout(200);
  const onlyAjet = await page.locator("[data-detail-row]").evaluateAll((trs, co) => trs.every((tr) => tr.children[1].innerText === co), AJET);
  check("Şirket filtresi tabloyu daraltıyor", onlyAjet && (await page.locator("[data-detail-row]").count()) < nRows);
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), page.locator("[data-detail-export]").click()]);
  const csv = readFileSync(await dl.path(), "utf8");
  check("CSV dışa aktarma: başlık satırı, BOM ve yalnızca filtrelenmiş satırlar", csv.startsWith("﻿Dönem;Şirket;Konu kategorisi;Açık cihaz") && csv.split("\r\n").length - 1 === (await page.locator("[data-detail-row]").count()), dl.suggestedFilename());

  check("Sayfa hatası yok", problems.length === 0, problems.join(" | "));
  await page.screenshot({ path: `${process.env.TEMP || "."}/exec-desktop.png`, fullPage: true });

  console.log("\nMobil ve diğer temalar");
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("Mobil (390 px): yatay taşma yok", over <= 2, `taşma ${over}px`);
  const kpiW = await page.locator('[data-kpi="open"]').evaluate((el) => el.getBoundingClientRect().width);
  check("Mobil: KPI kartları ekrana sığıyor", kpiW <= 390 && kpiW > 200, `${Math.round(kpiW)}px`);
  await page.screenshot({ path: `${process.env.TEMP || "."}/exec-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 820, height: 1100 }); await page.waitForTimeout(400);
  check("Tablet (820 px): yatay taşma yok", (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 2);
  await ctx.close();

  console.log("\nKısa geçmiş");
  const be3 = await startBackend({ port: 5077 });
  for (const rep of Object.keys(PLAN)) for (let w = 0; w < 4; w++) {
    const devices = [...states[rep][w]].map((key) => ({ key, serial: key, hostname: key, company: companyOf(key) }));
    await fetch(`${be3.base}/api/snapshots`, { method: "POST", headers: auth(be3), body: JSON.stringify({ reportId: rep, capturedAt: at(w), sourceFileModifiedAt: `k-${rep}-${w}`, devices }) });
  }
  const e3 = await open(be3);
  await e3.page.locator('[data-seg="range"] [data-seg-opt="quarter"]').click(); await e3.page.waitForTimeout(600);
  const kTxt = await e3.page.locator('[data-kpi="open"]').innerText();
  check("Kısa geçmişte (3 hafta) 3 aylık seçimde önceki dönem uydurulmuyor, durum açıkça yazılıyor", /yeterli geçmiş yok/.test(kTxt) && !/Karşılaştırma:/.test(await e3.page.locator("[data-exec-period]").innerText()), kTxt.replace(/\n/g, " | "));
  await e3.ctx.close(); await be3.stop();

  console.log("\nBoş / yetersiz veri");
  const e2 = await open(be2);
  const bodyTxt = await e2.page.innerText("body");
  check("Kayıt yokken KPI/sayı uydurulmuyor; açıklayıcı durum mesajı var", (await e2.page.locator("[data-kpi]").count()) === 0 && ((await e2.page.locator("[data-exec-empty]").count()) + (await e2.page.locator("[data-exec-insufficient]").count())) === 1 && /Veri yetersiz/.test(bodyTxt));
  check("Boş durum, 'Örnek veriyle göster' seçeneğini öneriyor", /Örnek veriyle göster/.test(await e2.page.locator("[data-exec-dashboard]").innerText()));

  console.log("\nÖrnek veriyle göster");
  // Uygulamanın kendi anlık kayıtları arka planda yazılabilir (sayı değişebilir); bu yüzden sayıya değil, örnek cihaz anahtarlarının hiç yazılmadığına bakılır
  const sampleKeysInBackend = async () => Object.values(await fetch(`${be2.base}/api/snapshots`, { headers: auth(be2) }).then((r) => r.json())).flat().flatMap((snap) => snap.devices || []).filter((d) => String(d.key).startsWith("ornek-")).length;
  await e2.page.locator("[data-sample-toggle]").click(); await e2.page.waitForTimeout(800);
  check("Örnek veri açılınca 5 KPI kartı, 'ÖRNEK VERİ' uyarısı ve durum rozeti görünüyor", (await e2.page.locator("[data-kpi]").count()) === 5 && /ÖRNEK VERİ/.test(await e2.page.locator("[data-sample-banner]").innerText()) && /Örnek veri/.test(await e2.page.locator("[data-exec-status]").innerText()) && /gerçek değil/.test(await e2.page.locator("[data-exec-period]").innerText()));
  check("Örnek veride tüm paneller dolu (grafik, özet, şirket, konu) ve iki şirket seçilebiliyor", (await e2.page.locator("[data-exec-trend] svg[role=img]").count()) === 1 && (await e2.page.locator("[data-summary-block]").count()) === 3 && (await e2.page.locator("[data-company-metric]").count()) === 5 && (await e2.page.locator("[data-cat-row]").count()) === 4 && (await e2.page.locator('[data-seg="company"] button').count()) === 3);
  for (const r of ["week", "month", "quarter"]) {
    await e2.page.locator(`[data-seg="range"] [data-seg-opt="${r}"]`).click(); await e2.page.waitForTimeout(400);
    check(`Örnek veri: ${r} döneminde KPI'lar ve önceki dönem karşılaştırması var`, (await e2.page.locator("[data-kpi]").count()) === 5 && /Karşılaştırma:/.test(await e2.page.locator("[data-exec-period]").innerText()));
  }
  await e2.page.locator("[data-detail-toggle]").click(); await e2.page.waitForSelector("[data-detail-row]");
  const [dl2] = await Promise.all([e2.page.waitForEvent("download", { timeout: 8000 }), e2.page.locator("[data-detail-export]").click()]);
  check("Örnek veri CSV'si 'ornek-veri-' önekiyle iner (gerçek veriyle karışmaz)", dl2.suggestedFilename().startsWith("ornek-veri-"), dl2.suggestedFilename());
  await e2.page.waitForTimeout(1500);
  check("Örnek veri backend'e yazılmadı (kayıtlarda 'ornek-' cihazı yok)", (await sampleKeysInBackend()) === 0, String(await sampleKeysInBackend()));
  await e2.page.locator("[data-sample-toggle]").click(); await e2.page.waitForTimeout(600);
  check("Örnek veri kapatılınca gerçek (boş) duruma dönülüyor, sayı kalmıyor", (await e2.page.locator("[data-kpi]").count()) === 0 && (await e2.page.locator("[data-sample-banner]").count()) === 0);
  await e2.ctx.close();

  console.log("\nOperasyon panosuna geçiş");
  const p3 = await open(be);
  await p3.page.locator("[data-open-ops]").click(); await p3.page.waitForTimeout(1500);
  check("'Operasyon panosu' mevcut panoyu açıyor, 'Yönetici ekranı' geri döndürüyor", /Yönetici ekranı/.test(await p3.page.innerText("body")) && (await p3.page.locator("[data-exec-dashboard]").count()) === 0);
  await p3.page.locator("[data-open-exec]").first().click(); await p3.page.waitForSelector("[data-exec-dashboard]", { timeout: 8000 });
  check("Geri dönüş çalışıyor", (await p3.page.locator("[data-exec-dashboard]").count()) === 1);
  await p3.ctx.close();
} finally {
  await browser.close();
  await be.stop();
  await be2.stop();
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
