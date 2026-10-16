// Veri DEĞİŞİNCE dashboard'lar ve raporlar değişimi gösteriyor mu? Kaynak dosyalara bilinen sayıda kayıt eklenir/değiştirilir;
// sayfa yenilenince tüm dashboard'larda (klasik, yeni tasarım, yönetici özeti) ve ilgili raporlarda FARK tam olarak beklenen kadar olmalı.
//   node e2e/changecheck.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };
const num = (s) => Number(String(s ?? "").replace(/[^\d]/g, ""));

const be = await startBackend({ port: 5075 });
const browser = await launchBrowser();
try {
  const imports = join(be.dataDir, "imports");
  const pick = (p) => readdirSync(imports).find((n) => n.includes(p));
  const load = (p, sheet, hr) => { const f = join(imports, pick(p)); const wb = XLSX.read(readFileSync(f)); const name = wb.SheetNames[sheet]; return { f, wb, name, a: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" }), hr }; };
  const save = (d) => { d.wb.Sheets[d.name] = XLSX.utils.aoa_to_sheet(d.a); writeFileSync(d.f, XLSX.write(d.wb, { type: "buffer", bookType: "xlsx" })); };

  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  await ctx.addInitScript((t) => { localStorage.setItem("varlikTakip.sessionToken", t); }, be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 120)));
  const txt = async () => (await page.innerText("body")).replace(/\n\s*\n/g, "\n");
  const grab = (t, re) => num((t.match(re) || [])[1]);

  // ---- dashboard sayıları (üç görünüm) ----
  // uygulama son açık raporu hatırlar → her yüklemeden sonra Ana Sayfa'ya git
  const boot = async () => { await page.goto(be.base); await page.waitForTimeout(3000); await page.locator('text="Ana Sayfa"').first().click(); await page.waitForTimeout(1200); };
  const bootReport = async (name) => { await page.goto(be.base); await page.waitForTimeout(3000); await page.locator(`text="${name}"`).first().click(); await page.waitForTimeout(2500); };
  // veri yüklenip üç sayı da görünene kadar bekler (en çok ~25 sn)
  const settle = async (read) => {
    let v = { inaktif: 0, disk: 0, zimmet: 0 };
    for (let i = 0; i < 25; i++) {
      v = read(await txt());
      if (v.inaktif > 0 && v.disk > 0 && v.zimmet > 0) break;
      await page.waitForTimeout(1000);
    }
    return v;
  };
  const classic = async () => settle((t) => ({ inaktif: grab(t, /(\d[\d.]*)\ninaktif cihaz/), disk: grab(t, /(\d[\d.]*)\nkritik disk/), zimmet: grab(t, /(\d[\d.]*)\nzimmet uyuşmazlığı/) }));
  const setFlags = async (demo, exec) => { await page.evaluate(([d, e]) => { localStorage.setItem("varlikTakip.dashboardDemo", d); localStorage.setItem("varlikTakip.execView", e); }, [demo, exec]); };
  const v2 = async () => {
    await setFlags("1", "0"); await boot();
    return settle((t) => ({ inaktif: grab(t, /İnaktif cihaz\n(\d[\d.]*)/i) || grab(t, /(\d[\d.]*)\nİnaktif cihaz/i), disk: grab(t, /Kritik disk\n(\d[\d.]*)/i), zimmet: grab(t, /Hatalı zimmet\n(\d[\d.]*)/i) }));
  };
  const exec = async () => {
    await setFlags("1", "1"); await boot();
    // "Açık bulgu dağılımı": ■ / ad / sayı / %oran satırları
    return settle((t) => ({ inaktif: grab(t, /İnaktif cihaz\n(\d[\d.]*)\n%/), disk: grab(t, /Kritik disk\n(\d[\d.]*)\n%/), zimmet: grab(t, /Hatalı zimmet\n(\d[\d.]*)\n%/) }));
  };
  const reportCount = async (name, re) => { await setFlags("0", "0"); await bootReport(name); return grab(await txt(), re); };

  await page.goto(be.base); // localStorage için gerçek bir sayfa gerekli
  console.log("Önce (demo veri)");
  await setFlags("0", "0"); await boot();
  const c0 = await classic();
  console.log("  klasik dashboard:", JSON.stringify(c0));
  check("Klasik dashboard üç sayıyı da gösteriyor (>0)", c0.inaktif > 0 && c0.disk > 0 && c0.zimmet > 0);
  const v0 = await v2();
  console.log("  yeni tasarım:   ", JSON.stringify(v0));
  check("Yeni tasarım (demo) dashboard'u aynı sayıları gösteriyor", v0.inaktif === c0.inaktif && v0.disk === c0.disk && v0.zimmet === c0.zimmet);
  const x0 = await exec();
  console.log("  yönetici özeti: ", JSON.stringify(x0));
  check("Yönetici özeti de aynı sayıları gösteriyor", x0.disk === c0.disk && x0.zimmet === c0.zimmet && x0.inaktif === c0.inaktif);
  const r0 = { zimmet: await reportCount("Zimmet Uyuşmazlığı", /(\d[\d.]*)\s*\n?\s*zimmet hatalı/i), disk: await reportCount("Disk Alanı", /(\d[\d.]*) kayıttan/), inaktif: await reportCount("İnaktif Cihazlar", /(\d[\d.]*) kayıttan/) };
  console.log("  raporlar:       ", JSON.stringify(r0));

  // ---- DEĞİŞİM: kaynak dosyalara bilinen sayıda kayıt ----
  console.log("\nKaynak dosyaları değiştiriliyor: +5 kritik disk, +4 inaktif cihaz, +3 zimmet uyuşmazlığı");
  // 1) Disk: SCCM'de olup disk dosyasında olmayan 5 hostname → C: sürücüsü 1.5 GB boş
  const sccm = load("SCCM", 0, 3);
  const sH = sccm.a[3];
  const sRows = sccm.a.slice(4).filter((r) => r.some((c) => String(c).trim()));
  const disk = load("DiskAlani", 0, 5);
  const dH = disk.a[5].map(String);
  const nameIx = dH.indexOf("Name") >= 0 ? dH.indexOf("Name") : dH.indexOf("Device ID");
  const dRows = disk.a.slice(6).filter((r) => r.some((c) => String(c).trim()));
  const diskNames = new Set(dRows.map((r) => String(r[nameIx]).trim().toLowerCase().split(".")[0]));
  const newHosts = sRows.map((r) => String(r[sH.indexOf("Hostname")]).trim()).filter((h) => !diskNames.has(h.toLowerCase().split(".")[0])).slice(0, 5);
  newHosts.forEach((h, i) => {
    const r = [...dRows[0]];
    r[nameIx] = h; r[dH.indexOf("Free Space")] = 1500 + i * 100; r[dH.indexOf("Size")] = 256000;
    if (dH.indexOf("Volume Name") >= 0) r[dH.indexOf("Volume Name")] = "C";
    disk.a.push(r);
  });
  save(disk);
  // 2) İnaktif: TH'de olup İnaktif'te olmayan 4 bilgisayar (DESKTOP/NOTEBOOK, User)
  const th = load("TH_", 0, 0);
  const tH = th.a[0].map(String);
  const ina = load("naktifCihazlar", 1, 0);
  const iH = ina.a[0].map(String);
  const inaSerials = new Set(ina.a.slice(1).map((r) => String(r[iH.indexOf("Seri No")]).trim().toLowerCase()));
  const candTh = th.a.slice(1).filter((r) => ["DESKTOP", "NOTEBOOK"].includes(String(r[tH.indexOf("Model")])) && !inaSerials.has(String(r[tH.indexOf("Seri No")]).trim().toLowerCase())).slice(0, 4);
  candTh.forEach((t) => {
    const r = new Array(iH.length).fill("");
    const map = { "Seri No": "Seri No", "Sahibi": "Sahibi", "Cihaz Sahibinin LBS'i": "Cihaz Sahibinin LBS'i", "Sahibi Firma": "Sahibi Firma", "LBS Location Parent": "LBS Location Parent", "Konum Kategorisi": "Konum Kategorisi" };
    Object.entries(map).forEach(([ik, tk]) => { if (iH.includes(ik) && tH.includes(tk)) r[iH.indexOf(ik)] = t[tH.indexOf(tk)]; });
    if (iH.includes("Asset")) r[iH.indexOf("Asset")] = t[tH.indexOf("Asset")];
    ina.a.push(r);
  });
  save(ina);
  // 3) Zimmet: şu an DOĞRU olan 3 cihaz (TH sahibi = SCCM son kullanıcı, kişi zimmeti) → başka kullanıcı kullanıyor
  const lluIx = sH.indexOf("LastLogon UserName"), sicIx = sH.indexOf("Last LogonSicil "), serIx = sH.indexOf("Serial Number"), hostIx = sH.indexOf("Hostname");
  const thBySerial = new Map(th.a.slice(1).map((r) => [String(r[tH.indexOf("Seri No")]).trim().toLowerCase(), r]));
  const monitorHosts = new Set(load("Attached", 0, 1).a.slice(2).map((r) => String(r[1]).trim().toLowerCase().split(".")[0]));
  let changed = 0;
  for (const r of sccm.a.slice(4)) {
    if (changed >= 3) break;
    const t = thBySerial.get(String(r[serIx]).trim().toLowerCase());
    if (!t || !["DESKTOP", "NOTEBOOK"].includes(String(t[tH.indexOf("Model")])) || String(t[tH.indexOf("Konum Kategorisi")]) !== "User") continue;
    const ou = String(t[tH.indexOf("Owner Username")]).trim().toLowerCase();
    if (!ou || ou !== String(r[lluIx]).trim().toLowerCase()) continue;
    if (monitorHosts.has(String(r[hostIx]).trim().toLowerCase().split(".")[0])) continue; // monitör uyuşmazlığı karışmasın
    r[lluIx] = "zz_degisim" + changed; if (sicIx >= 0) r[sicIx] = "99999" + changed; changed++;
  }
  save(sccm);
  console.log(`  eklenen disk: ${newHosts.length}, inaktif: ${candTh.length}, değişen zimmet: ${changed}`);
  check("Değişiklik hazırlığı tamam (5 disk, 4 inaktif, 3 zimmet)", newHosts.length === 5 && candTh.length === 4 && changed === 3);

  console.log("\nSonra (yenilenmiş sayfalarda)");
  await setFlags("0", "0"); await boot();
  const c1 = await classic();
  console.log("  klasik dashboard:", JSON.stringify(c1));
  check("Klasik dashboard: kritik disk +5", c1.disk === c0.disk + 5, `${c0.disk} → ${c1.disk}`);
  check("Klasik dashboard: inaktif cihaz +4", c1.inaktif === c0.inaktif + 4, `${c0.inaktif} → ${c1.inaktif}`);
  const dz = c1.zimmet - c0.zimmet; // 3 cihaz değişti; biri zaten sorunlu (ör. mükerrer çift zimmet) olabilir
  check("Klasik dashboard: zimmet uyuşmazlığı arttı (+2…+3)", dz >= 2 && dz <= 3, `${c0.zimmet} → ${c1.zimmet} (+${dz})`);
  const v1 = await v2();
  check("Yeni tasarım dashboard'u değişimi yansıtıyor (+5 / +4 / aynı zimmet farkı)", v1.disk === v0.disk + 5 && v1.inaktif === v0.inaktif + 4 && v1.zimmet === v0.zimmet + dz, JSON.stringify(v1));
  const x1 = await exec();
  check("Yönetici özeti değişimi yansıtıyor (+5 / +4 / aynı zimmet farkı)", x1.disk === x0.disk + 5 && x1.inaktif === x0.inaktif + 4 && x1.zimmet === x0.zimmet + dz, JSON.stringify(x1));
  const r1 = { zimmet: await reportCount("Zimmet Uyuşmazlığı", /(\d[\d.]*)\s*\n?\s*zimmet hatalı/i), disk: await reportCount("Disk Alanı", /(\d[\d.]*) kayıttan/), inaktif: await reportCount("İnaktif Cihazlar", /(\d[\d.]*) kayıttan/) };
  console.log("  raporlar:", JSON.stringify(r1));
  check("Zimmet raporu: hatalı sayısı dashboard ile aynı farkla arttı", r1.zimmet === r0.zimmet + dz, `${r0.zimmet} → ${r1.zimmet}`);
  check("Disk raporu: kayıt sayısı +5", r1.disk === r0.disk + 5, `${r0.disk} → ${r1.disk}`);
  check("İnaktif raporu: kayıt sayısı +4", r1.inaktif === r0.inaktif + 4, `${r0.inaktif} → ${r1.inaktif}`);
  check("Konsol hatası yok", problems.length === 0, problems.join(" | "));
} finally {
  await browser.close();
  await be.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} değişim kontrolü geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((x) => console.log(`  ✗ ${x.name}`));
process.exit(failed.length ? 1 : 0);
