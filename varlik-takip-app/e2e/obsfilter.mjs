// Zimmet Uyuşmazlığı'nda OBS (müdürlük) cihazlar HİÇ yoktur: segment, sayaç kartı, Zimmet Türü seçeneği ve listede OBS rozeti olmamalı;
// sayılar tutmalı (Toplam = Doğru + Hatalı + Doğrulanamayan) ve Ana Sayfa ile liste aynı olmalı. Sayfa açılınca varsayılan Zimmet Türü = User.
//   node e2e/obsfilter.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";

if (!process.argv.includes("--skip-build")) buildFrontend();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`); };

const be = await startBackend({ port: 5088 });
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 140)));
  await page.goto(be.base); await page.waitForTimeout(3500);
  await page.locator('text="Zimmet Uyuşmazlığı"').first().click(); await page.waitForTimeout(2500);

  const count = async () => Number(((await page.locator("text=/kayıttan/").first().innerText()).match(/^(\d+) kayıttan/) || [])[1]);
  const strip = () => page.evaluate(() => {
    const want = { toplam: "Toplam Kayıt", dogru: "Zimmet Doğru", hatali: "Zimmet Hatalı", dogrulanamayan: "Doğrulanamayan" };
    const out = {};
    for (const [k, label] of Object.entries(want)) {
      const el = [...document.querySelectorAll("div")].reverse().find((d) => d.children.length === 2 && d.children[1].innerText.trim() === label && /^[\d.]+$/.test(d.children[0].innerText.trim()));
      out[k] = el ? Number(el.children[0].innerText.replace(/\./g, "")) : 0;
    }
    return out;
  });

  // 1) varsayılan görünüm
  const types = async () => page.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => (/OBS/.test(tr.innerText) ? "obs" : /User \(Kişi\)/.test(tr.innerText) ? "user" : "other")));
  const t0 = await types();
  check("Açılışta varsayılan: yalnız User (Kişi) listeleniyor, OBS satırı yok", t0.length > 0 && t0.every((t) => t === "user"), `${await count()} kayıt`);
  check("Zimmet Türü filtresi yok (yalnız User zimmetleri sayılır)", (await page.locator("div", { hasText: /^User (Kişi)s*▾$/ }).count()) === 0);

  const sUser = await strip(); // varsayılan görünüm (User) — Ana Sayfa bu sayıyı göstermeli
  // 2) OBS hiçbir yerde yok
  const body = await page.locator("body").innerText();
  check("Segment çubuğunda ve şeritte 'OBS' yok", !/OBS \(Müdürlük\)/.test(body) && !/\bOBS\b/.test(body.split("kayıttan")[0].split("Zimmet Uyuşmazlığı")[1] || ""));
  const all = await types();
  check("Hiçbir satırda OBS rozeti yok", all.length > 0 && !all.includes("obs"), `${await count()} kayıt`);
  const s = await strip();
  check("Şerit tutarlı: Toplam = Doğru + Hatalı + Doğrulanamayan", s.toplam > 0 && s.toplam === s.dogru + s.hatali + s.dogrulanamayan, JSON.stringify(s));

  // 3) Ana Sayfa ile aynı
  await page.getByText("Ana Sayfa", { exact: true }).first().click(); await page.waitForTimeout(2500);
  const home = (await page.locator("body").innerText());
  const eq = home.match(/Toplam ([\d.]+) = ([\d.]+) doğru \+ ([\d.]+) hatalı \+ ([\d.]+) doğrulanamadı( \+ [\d.]+ OBS)?/);
  const n = (x) => Number(String(x).replace(/\./g, ""));
  check("Ana Sayfa denklemi OBS içermiyor ve tutuyor", !!eq && !eq[5] && n(eq[1]) === n(eq[2]) + n(eq[3]) + n(eq[4]), eq ? eq[0] : "denklem yok");
  check("Ana Sayfa ile varsayılan (User) liste şeridi aynı sayıları veriyor", !!eq && n(eq[1]) === sUser.toplam && n(eq[2]) === sUser.dogru && n(eq[3]) === sUser.hatali && n(eq[4]) === sUser.dogrulanamayan, eq ? `${eq[1]} / ${sUser.toplam}` : "");
  check("Sayfa hatası yok", problems.length === 0, problems.join(" | "));
  await ctx.close();
} finally {
  await browser.close(); await be.stop();
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\nSonuç: ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);
