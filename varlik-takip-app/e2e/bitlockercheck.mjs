// BitLocker kontrolü testi: sol menüde BitLocker sekmesi yok; kontrol SCCM Ajan Raporu'nda. "BitLocker Sorunlu Cihazlar" filtresi, BitLocker bölümünde en az bir 0 değeri
// olan cihazları listeler (tek değerli, çok değerli, sayı/metin, Yes/No). Beklenen sayı testte BAĞIMSIZ bir yöntemle (regex) ham dosyadan hesaplanır.
//   node e2e/bitlockercheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };
const num = (t) => Number(String(t).replace(/\./g, "").replace(",", "."));

const be = await startBackend({ port: 5083 });
const browser = await launchBrowser();
try {
  // SCCM dosyasında BitLocker bölümüne çeşitli değer biçimleri yaz (kopya klasörde; kullanıcı verisi değişmez)
  const imports = join(be.dataDir, "imports");
  const file = join(imports, readdirSync(imports).find((n) => n.startsWith("SCCM Inventory Report")));
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const header = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })[3];
  const colIx = header.indexOf("Bitlocker Enabled");
  const hostIx = header.indexOf("Hostname");
  const cell = (r, c) => XLSX.utils.encode_cell({ r, c });
  // [değer, sorunlu mu, "Şifrelenmeyen Disk" sütununda beklenen metin]; sıra: 1. değer C diski, 2. değer Q diski, 3. değer harici USB
  const SPECIAL = [["1;1;0", true, "Harici USB"], ["1;1", false, "Tümü şifreli"], ["0", true, "C diski"], [0, true, "C diski"], ["1, 1, 1", false, "Tümü şifreli"], ["Yes", false, "Tümü şifreli"], ["No", true, "C diski"], ["", false, ""],
    ["1,0", true, "Q diski"], ["0,0,1", true, "C diski, Q diski"], ["0 1 0", true, "C diski, Harici USB"], ["1,1,1,0", true, "Ek disk 1"]];
  const names = [];
  SPECIAL.forEach(([v, bad, disks], i) => {
    const r = 4 + i;
    names.push({ host: String(ws[cell(r, hostIx)].v), bad, v, disks });
    ws[cell(r, colIx)] = typeof v === "number" ? { t: "n", v } : { t: "s", v };
  });
  XLSX.writeFile(wb, file);
  // bağımsız beklenen sayı: ham dosyayı yeniden oku, regex ile say
  const wb2 = XLSX.readFile(file);
  const raw = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { range: 3, defval: "" });
  const isBad = (v) => /(^|[^0-9.])0+(\.0+)?([^0-9.]|$)/.test(String(v)) || /(^|[^a-zçğıöşü])(no|hayır|false|off|disabled|kapalı)([^a-zçğıöşü]|$)/i.test(String(v));
  const expected = raw.filter((r) => isBad(r["Bitlocker Enabled"])).length;
  const total = raw.length;
  console.log(`  (dosya: ${total} cihaz, BitLocker 0 değerli: ${expected})`);

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  // eski kayıtlı ekran "bitlocker" olsa bile uygulama çökmeden SCCM raporuna düşmeli
  await ctx.addInitScript((t) => { localStorage.setItem("varlikTakip.sessionToken", t); localStorage.setItem("varlikTakip.lastView", JSON.stringify({ activeReport: "bitlocker", showDashboard: false })); }, be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 140)));
  await page.goto(be.base);
  await page.waitForTimeout(5000);
  const body = async () => (await page.innerText("body")).replace(/\n\s*\n/g, "\n");

  console.log("Menü");
  check("Eski kayıtlı 'BitLocker' ekranı uygulamayı çökertmiyor; SCCM Ajan Raporu açılıyor", /SCCM Ajan Raporu/.test(await body()) && problems.length === 0, problems.join(" | "));
  check("Sol menüde 'BitLocker Kontrol' sekmesi yok", !/BitLocker Kontrol/i.test(await page.locator("aside, .vt-shell > aside").first().innerText()));
  check("Sol menüde BitLocker adlı hiçbir sekme/başlık yok (yalnız SCCM Ajan Raporu kalıyor)", !/bitlocker/i.test(await page.locator("aside, .vt-shell > aside").first().innerText()));

  console.log("\nSCCM raporu + BitLocker Sorunlu Cihazlar filtresi");
  await page.waitForSelector("table", { timeout: 20000 });
  const btn = page.locator("[data-bitlocker-filter]");
  const footer = async () => (await page.locator("text=/kayıttan/").first().innerText()).replace(/\s+/g, " ");
  const footerTotal = async () => num((await footer()).match(/([\d.]+) kayıttan/)[1]);
  check("Filtre düğmesi 'BitLocker Sorunlu Cihazlar' adıyla görünüyor ve sayıyı gösteriyor", (await btn.count()) === 1 && new RegExp(`BitLocker Sorunlu Cihazlar \\(${expected.toLocaleString("tr-TR").replace(".", "\\.")}\\)`).test(await btn.innerText()), (await btn.innerText()).trim());
  check("Filtre kapalıyken tüm cihazlar listeleniyor", (await footerTotal()) === total, await footer());
  const colsBefore = await page.locator("thead th").count();
  const headsOff = await page.locator("thead th").allTextContents(); // CSS büyük harf dönüşümünden etkilenmez
  const dOff = headsOff.findIndex((h) => /Şifrelenmeyen Disk/.test(h)), bOff = headsOff.findIndex((h) => /Bitlocker Enabled/.test(h));
  check("Filtre kapalıyken 'Şifrelenmeyen Disk (hesaplanan)' sütunu Excel sırasında BitLocker sütununun hemen yanında", dOff === bOff + 1 && dOff > 0, headsOff.slice(bOff - 1, bOff + 3).join(" | ").replace(/\n/g, " "));
  await btn.click(); await page.waitForTimeout(600);
  check("Filtre açılınca yalnız BitLocker bölümünde 0 değeri olan cihazlar listeleniyor (sayı bağımsız hesapla aynı)", (await footerTotal()) === expected && (await btn.getAttribute("aria-pressed")) === "true", await footer());
  const rowsBad = await page.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => !!tr.querySelector("[data-bitlocker-bad]")));
  check("Listelenen her satırda BitLocker hücresi sorunlu olarak vurgulanıyor", rowsBad.length > 0 && rowsBad.every(Boolean), `${rowsBad.length} satır`);
  const search = page.locator('input[placeholder^="Herhangi bir sütunda ara"]');
  const heads = await page.locator("thead th").allTextContents();
  check("Filtre açıkken 'Şifrelenmeyen Disk (hesaplanan)' Hostname'in hemen yanına, ardından BitLocker değerleri geliyor", /Hostname/i.test(heads[0]) && /Şifrelenmeyen Disk/.test(heads[1]) && /Bitlocker Enabled/.test(heads[2]), heads.slice(0, 4).join(" | ").replace(/\n/g, " "));
  const diskCellOf = async (host) => {
    const hs = await page.locator("thead th").allTextContents();
    const ix = hs.findIndex((h) => /Şifrelenmeyen Disk/.test(h));
    return (await page.locator("tbody tr", { hasText: host }).first().locator("td").nth(ix).innerText()).trim();
  };
  for (const { host, bad, v, disks } of names) {
    await search.fill(host); await page.waitForTimeout(350);
    const shown = await page.locator("tbody tr", { hasText: host }).count();
    check(`Filtre açık, '${host}' (BitLocker: ${JSON.stringify(v)}) ${bad ? "listelenir" : "listelenmez"}`, bad ? shown >= 1 : shown === 0);
    if (bad) check(`  '${host}': şifrelenmeyen disk = ${disks}`, (await diskCellOf(host)) === disks, await diskCellOf(host));
  }
  await search.fill(""); await page.waitForTimeout(300);
  await btn.click(); await page.waitForTimeout(600);
  check("Filtre kaldırılınca tüm cihazlar normal şekilde geri geliyor", (await footerTotal()) === total && (await btn.getAttribute("aria-pressed")) === "false", await footer());
  for (const { host, v, disks } of names) {
    await search.fill(host); await page.waitForTimeout(250);
    check(`Filtre kapalı, '${host}' (${JSON.stringify(v)}) listede, sütunda '${disks || "—"}'`, (await page.locator("tbody tr", { hasText: host }).count()) >= 1 && (disks === "" ? (await diskCellOf(host)) === "—" : (await diskCellOf(host)) === disks), await diskCellOf(host));
  }
  await search.fill(""); await page.waitForTimeout(300);

  console.log("\nMevcut SCCM raporu bozulmadı");
  check("Excel'in 22 sütunu yerinde (BitLocker Enabled dahil) + yalnızca 1 hesaplanan sütun eklendi", (await page.locator("thead th").count()) === colsBefore && colsBefore === 23 && (await page.locator("thead th", { hasText: "Bitlocker Enabled" }).count()) === 1, `${colsBefore} sütun`);
  check("Raporda disk açıklaması (1. değer C, 2. değer Q, 3. değer harici USB) yazıyor", /C diskini/.test(await page.locator("[data-bitlocker-help]").innerText()) && /Q diskini/.test(await page.locator("[data-bitlocker-help]").innerText()) && /harici USB/.test(await page.locator("[data-bitlocker-help]").innerText()));
  await page.locator("thead th", { hasText: "Model" }).first().locator("div").first().click(); await page.waitForTimeout(400);
  check("Sütun filtresi (Excel AutoFilter) hâlâ açılıyor", (await page.locator('input[placeholder$="içinde ara..."]').count()) === 1);
  await page.keyboard.press("Escape"); await page.mouse.click(5, 5); await page.waitForTimeout(300);
  // BitLocker filtresi + sütun filtresi birlikte
  await btn.click(); await page.waitForTimeout(400);
  const n1 = await footerTotal();
  await page.locator("thead th", { hasText: "İştirak" }).first().locator("div").first().click(); await page.waitForTimeout(400);
  const firstOpt = page.locator("div", { hasText: /^TKAO-MHY A\.O\.\d+$/ }).last();
  await firstOpt.click().catch(() => {}); await page.waitForTimeout(500);
  const n2 = await footerTotal();
  check("BitLocker filtresi diğer filtrelerle birlikte çalışıyor (sonuç daralıyor, 0'dan büyük)", n2 > 0 && n2 < n1, `${n1} → ${n2}`);
  check("Sayfa hatası yok", problems.length === 0, problems.join(" | "));
  await page.screenshot({ path: `${process.env.TEMP || "."}/bitlocker-sccm.png` });
  await ctx.close();
} finally {
  await browser.close();
  await be.stop();
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
