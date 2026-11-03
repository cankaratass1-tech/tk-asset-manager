// Zimmet sahibi senaryoları (mail): bir kişiye birden fazla notebook zimmetli ve cihazlardan bazıları/hepsi başkaları tarafından kullanılıyor.
// Beklenen: cihazı kullanan sahibi değilse "Zimmet Hatalı" (transfer) mail alır — "birden fazla notebook zimmetli" demez; zimmet sahibine de
// hangi cihazın kimde olduğunu gösteren bilgilendirme gider (sahip zaten alıcıysa aynı mailde ek bölüm).
//   node e2e/zimmetowner.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { startSmtpSink, stripHtml } from "./mailkit.mjs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const sink = await startSmtpSink();
const be = await startBackend({ port: 5087 });
const browser = await launchBrowser();
try {
  // --- veri hazırlığı: demo TH/SCCM dosyalarında 6 notebook'u 2 gruba ayır (seri no yeniden adlandırılır: ZZGRP1-*, ZZGRP2-*)
  const imports = join(be.dataDir, "imports");
  const find = (p) => join(imports, readdirSync(imports).find((n) => n.startsWith(p)));
  const thFile = find("TH_"), scFile = find("SCCM Inventory Report");
  const thWb = XLSX.readFile(thFile), scWb = XLSX.readFile(scFile);
  const thWs = thWb.Sheets[thWb.SheetNames[0]], scWs = scWb.Sheets[scWb.SheetNames[0]];
  const thRows = XLSX.utils.sheet_to_json(thWs, { defval: "" });
  const scRows = XLSX.utils.sheet_to_json(scWs, { defval: "", range: 3 });
  const thHead = Object.keys(thRows[0]), scHead = XLSX.utils.sheet_to_json(scWs, { header: 1, range: 3 })[0];
  const thCell = (i, col) => XLSX.utils.encode_cell({ r: 1 + i, c: thHead.indexOf(col) });
  const scCell = (i, col) => XLSX.utils.encode_cell({ r: 4 + i, c: scHead.indexOf(col) });
  const lc = (v) => String(v).trim().toLowerCase();
  const scBySerial = new Map(scRows.map((r, i) => [lc(r["Serial Number"]), { r, i }]));
  const notebooksOf = new Map();
  thRows.forEach((r) => { if (r.Model === "NOTEBOOK" && r["Konum Kategorisi"] === "User") notebooksOf.set(lc(r["Owner Username"]), (notebooksOf.get(lc(r["Owner Username"])) || 0) + 1); });
  const cands = [];
  const seen = new Set();
  thRows.forEach((r, i) => {
    const sc = scBySerial.get(lc(r["Seri No"]));
    const u = lc(r["Owner Username"]);
    if (r.Model !== "NOTEBOOK" || r["Konum Kategorisi"] !== "User" || !sc || seen.has(u) || notebooksOf.get(u) !== 1) return;
    if (lc(sc.r["LastLogon UserName"]) !== u || !sc.r.LastLogonMail || lc(sc.r.LastLogonMail) !== lc(r["Cihaz Sahibinin Maili"])) return;
    seen.add(u); cands.push({ th: r, thIdx: i, sc: sc.r, scIdx: sc.i });
  });
  check("Demo veride bu senaryo için yeterli (6) tek-notebook'lu kullanıcı var", cands.length >= 6, `${cands.length} aday`);
  const [a, b, c, d, e, f] = cands;
  const setTh = (x, col, v) => { thWs[thCell(x.thIdx, col)] = { t: "s", v: String(v) }; };
  const setSc = (x, col, v) => { scWs[scCell(x.scIdx, col)] = { t: "s", v: String(v) }; };
  const OWNER = ["Sahibi", "Owner Username", "Cihaz Sahibinin Sicili", "Cihaz Sahibinin Maili"];
  // Grup 1: üçü de A'ya zimmetli; A kendi a cihazını kullanıyor, b ve c'yi B ve C kullanıyor
  [b, c].forEach((x) => OWNER.forEach((col) => setTh(x, col, a.th[col])));
  // Grup 2: üçü de TH'de uydurma sahibe (Z) zimmetli; üçünü de D, E, F kullanıyor (Z hiçbir cihazı kullanmıyor)
  const Z = { Sahibi: "Zeynep Sahip (Test Takimi)", "Owner Username": "zeynep.sahip", "Cihaz Sahibinin Sicili": "909090", "Cihaz Sahibinin Maili": "zeynep.sahip@test.local" };
  [d, e, f].forEach((x) => OWNER.forEach((col) => setTh(x, col, Z[col])));
  [[a, "ZZGRP1-A"], [b, "ZZGRP1-B"], [c, "ZZGRP1-C"], [d, "ZZGRP2-D"], [e, "ZZGRP2-E"], [f, "ZZGRP2-F"]].forEach(([x, sn]) => { setTh(x, "Seri No", sn); setSc(x, "Serial Number", sn); });
  XLSX.writeFile(thWb, thFile); XLSX.writeFile(scWb, scFile);
  const mail = (x) => lc(x.sc.LastLogonMail);

  const put = await fetch(`${be.base}/api/settings/smtp`, { method: "PUT", headers: { "Content-Type": "application/json", ...be.adminHeaders }, body: JSON.stringify({ host: "127.0.0.1", port: String(sink.port), username: "", password: "", fromAddress: "smoke@test.local", useTls: false }) });
  check("test SMTP ayarı kaydedildi", put.ok);

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (er) => problems.push(er.message.slice(0, 140)));
  await page.goto(be.base); await page.waitForTimeout(3500);
  await page.locator('text="Zimmet Uyuşmazlığı"').first().click(); await page.waitForTimeout(2000);
  const search = page.locator('input[placeholder^="İsim, seri no"]').first();
  const send = async (term) => {
    await search.fill(term); await page.waitForTimeout(800);
    await page.keyboard.press("Escape"); await page.mouse.click(5, 5); await page.waitForTimeout(300);
    const before = sink.messages.length;
    await page.getByRole("button", { name: /^E-posta Gönder$/ }).first().click();
    await page.getByRole("button", { name: "Onayla ve Gönder" }).click();
    const end = Date.now() + 20000; let last = before, stable = Date.now();
    while (Date.now() < end && (sink.messages.length === before || Date.now() - stable < 1800)) {
      await page.waitForTimeout(250);
      if (sink.messages.length !== last) { last = sink.messages.length; stable = Date.now(); }
    }
    return sink.messages.slice(before);
  };
  const toOf = (m) => lc(m.to.replace(/^.*<|>.*$/g, ""));
  const text = (m) => stripHtml(m.html);

  console.log("\nGrup 1: A'ya 3 notebook zimmetli — A a'yı kendisi kullanıyor, b'yi B, c'yi C kullanıyor");
  const g1 = await send("ZZGRP1");
  check("3 mail gidiyor (A'ya tek mail; sahibe ayrıca ikinci mail YOK)", g1.length === 3, g1.map((m) => toOf(m)).join(", "));
  check("Alıcılar: A, B ve C (cihazı fiilen kullananlar)", [a, b, c].every((x) => g1.some((m) => toOf(m) === mail(x))));
  const mA = g1.find((m) => toOf(m) === mail(a)), mB = g1.find((m) => toOf(m) === mail(b)), mC = g1.find((m) => toOf(m) === mail(c));
  check("A: 'Birden fazla zimmet' maili + 'Notebook zimmetlerinizin durumu' bölümünde 3 cihaz ve kullananlar", !!mA && /birden fazla notebook/.test(text(mA)) && /Notebook zimmetlerinizin durumu/.test(text(mA)) && ["ZZGRP1-A", "ZZGRP1-B", "ZZGRP1-C"].every((s) => text(mA).includes(s)));
  for (const [nm, m] of [["B", mB], ["C", mC]]) {
    check(`${nm}: zimmet TRANSFERİ maili (kayıtlı sahibi farklı… siz kullanıyorsunuz); 'birden fazla notebook zimmetli' DEMİYOR`, !!m && /kayıtlı sahibi farklı bir kişi görünüyor/.test(text(m)) && !/birden fazla notebook/.test(text(m)) && !/Mükerrer/i.test(m.subject), m ? m.subject : "mail yok");
  }
  check("B ve C'nin mailinde yalnız kendi kullandığı cihaz var", !!mB && !!mC && text(mB).includes("ZZGRP1-B") && !text(mB).includes("ZZGRP1-C") && text(mC).includes("ZZGRP1-C") && !text(mC).includes("ZZGRP1-B"));

  console.log("\nGrup 2: Z'ye 3 notebook zimmetli — üçünü de D, E, F kullanıyor (Z hiçbirini kullanmıyor)");
  const g2 = await send("ZZGRP2");
  check("4 mail gidiyor: D, E, F'ye transfer + Z'ye (zimmet sahibi) bilgilendirme", g2.length === 4, g2.map((m) => toOf(m)).join(", "));
  const mZ = g2.find((m) => toOf(m) === "zeynep.sahip@test.local");
  check("Zimmet sahibi Z'ye bilgilendirme maili gitti", !!mZ);
  check("Z'nin mailinde 3 cihaz ve şu an kullananlar ('Şu an kullanan' sütunu) listeleniyor", !!mZ && ["ZZGRP2-D", "ZZGRP2-E", "ZZGRP2-F"].every((s) => text(mZ).includes(s)) && text(mZ).includes("Şu an kullanan") && /NOTEBOOK ZİMMETLERİNİZİN DURUMU/i.test(text(mZ)), mZ ? mZ.subject : "");
  for (const [nm, x] of [["D", d], ["E", e], ["F", f]]) {
    const m = g2.find((mm) => toOf(mm) === mail(x));
    check(`${nm}: zimmet transferi maili ('birden fazla zimmet' iddiası yok)`, !!m && /kayıtlı sahibi farklı bir kişi görünüyor/.test(text(m)) && !/birden fazla notebook/.test(text(m)));
  }
  const all = [...g1, ...g2];
  check("Hiçbir mailde 'undefined' / 'NaN' / '[object' yok", all.every((m) => !/undefined|NaN|\[object/.test(`${m.subject}${text(m)}${m.text}`)));
  const hist = await (await fetch(`${be.base}/api/mail/history`, { headers: { Authorization: `Bearer ${be.token}` } })).json().catch(() => null);
  const ents = Array.isArray(hist) ? hist : [];
  check("Gönderim geçmişi: grup 2 kaydı 3 alıcı (kullanan) + 4 gönderim günlüğü (sahibe bilgilendirme dahil); grup 1 kaydı 3 gönderim günlüğü", ents.length >= 2 && ents[0].recipients === 3 && ents[0].sendLogIds?.length === 4 && ents[1].sendLogIds?.length === 3, ents.slice(0, 2).map((x) => `${x.recipients}/${x.sendLogIds?.length}`).join(" , "));
  check("Sayfa hatası yok", problems.length === 0, problems.join(" | "));
  await ctx.close();
} finally {
  await browser.close(); await be.stop(); await sink.stop();
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
