// Mail testi: uygulamayı gerçek tarayıcıda sürer, "Mail Gönder" butonlarına basar ve giden mailleri süreç içi
// bir SMTP kum havuzunda yakalayıp içeriğini doğrular (hiçbir gerçek adrese mail gitmez).
//   node e2e/mailtest.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser } from "./harness.mjs";
import { startSmtpSink, stripHtml } from "./mailkit.mjs";

const args = process.argv.slice(2);
if (!args.includes("--skip-build")) buildFrontend();

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const sink = await startSmtpSink();
const be = await startBackend({ port: 5056 });
const browser = await launchBrowser();

try {
  // SMTP ayarı: kum havuzu (TLS/kimlik doğrulama yok)
  const put = await fetch(`${be.base}/api/settings/smtp`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...be.adminHeaders },
    body: JSON.stringify({ host: "127.0.0.1", port: String(sink.port), username: "", password: "", fromAddress: "smoke@test.local", useTls: false }),
  });
  check("test SMTP ayarı kaydedildi", put.ok);

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addInitScript((t) => localStorage.setItem("varlikTakip.sessionToken", t), be.token);
  const page = await ctx.newPage();
  await page.goto(be.base);
  await page.waitForTimeout(3500);

  const bodyText = () => page.innerText("body");
  const openReport = async (name) => {
    await page.locator(`text="${name}"`).first().click();
    await page.waitForTimeout(1800);
  };
  const segment = async (label) => {
    await page.locator("div", { hasText: new RegExp(`^${label}$`) }).first().click();
    await page.waitForTimeout(900);
  };
  const selectRows = async (n) => {
    const boxes = page.locator("tbody tr input[type=checkbox]");
    for (let i = 0; i < n; i++) await boxes.nth(i).check();
    await page.waitForTimeout(300);
  };
  const toastOf = async () => ((await bodyText()).match(/(✅|⚠️|❌)[^\n]*/) || [""])[0];

  // butona bas, yeni mailleri topla (ilk mail gelince biraz daha bekleyip ek mailleri de al)
  const sendAndCollect = async (clickFn) => {
    const before = sink.messages.length;
    await clickFn();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && sink.messages.length === before) await page.waitForTimeout(300);
    await page.waitForTimeout(1200);
    return { mails: sink.messages.slice(before), toast: await toastOf() };
  };

  const sane = (label, mails) => {
    mails.forEach((m, i) => {
      const body = `${m.subject}\n${stripHtml(m.html)}\n${m.text}`;
      const bad = ["undefined", "NaN", "[object", "null"].filter((w) => body.includes(w));
      const thy = /thy\b|thynet/i.test(`${m.to}\n${m.from}\n${body}`);
      const emailOk = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(m.to.replace(/^.*<|>.*$/g, "").trim());
      check(`${label}: mail ${i + 1} sağlıklı (alıcı geçerli, konu dolu, boş/bozuk değer yok, THY izi yok)`, emailOk && m.subject.length > 3 && (stripHtml(m.html).length > 20 || m.text.length > 20) && bad.length === 0 && !thy, `to=${m.to}${bad.length ? ` bozuk: ${bad}` : ""}${thy ? " THY izi!" : ""}`);
    });
  };
  const mailButton = () => page.getByRole("button", { name: /^Mail Gönder$/ }).first();

  // ---------- Zimmet Uyuşmazlığı ----------
  console.log("\nZimmet Uyuşmazlığı");
  await openReport("Zimmet Uyuşmazlığı");

  await segment("Zimmet Hatalı");
  await selectRows(1);
  let r = await sendAndCollect(() => mailButton().click());
  check("Zimmet Hatalı: seçili kayda mail gidiyor (onaysız)", r.mails.length >= 1, r.toast);
  if (r.mails[0]) {
    const t = stripHtml(r.mails[0].html);
    // bildirim, seçilen kayıt sayısını doğru vermeli; aynı kişiye ait ek (mükerrer) kayıtlar ayrı not edilmeli
    const extraInMail = /birden fazla notebook/.test(t);
    check("Zimmet Hatalı: bildirim seçilen kayıt sayısını veriyor (1 kayıt) ve ek kayıtları ayrı belirtiyor", /1 kayıt/.test(r.toast) && (!extraInMail || /\+\d+ ilgili kayıt, aynı kişiye ait olduğu için aynı maile eklendi/.test(r.toast)), r.toast);
    sane("Zimmet Hatalı", r.mails);
    check("Zimmet Hatalı: şablon metni (kayıtlı sahibi farklı… fiilen siz kullanıyorsunuz)", /kayıtlı sahibi farklı bir kişi görünüyor/.test(t) && /fiilen siz kullanıyorsunuz/.test(t));
    check("Zimmet Hatalı: tablo sütunları (Seri No … Last Logon)", ["Seri No", "Barkod", "Marka", "Model", "Varlık Adı", "Kayıtlı Sahibi (Eski)", "Hostname", "Last Logon"].every((h) => t.includes(h)));
    check("Zimmet Hatalı: kayıtlı sahibi unvanıyla yazılmış (Ad Soyad (… Takimi))", /\(.*Takimi\)/.test(t));
    check("Zimmet Hatalı: Turuncuhat talimatı (mhy.com.tr)", t.includes("turuncuhat.mhy.com.tr"));
  }

  await page.locator("input[type=checkbox]").first().uncheck().catch(() => {});
  await segment("Mükerrer Çift Zimmet");
  await selectRows(1);
  r = await sendAndCollect(() => mailButton().click());
  check("Mükerrer Çift Zimmet: seçili kayda mail gidiyor", r.mails.length >= 1, r.toast);
  if (r.mails[0]) {
    sane("Mükerrer", r.mails);
    const t = stripHtml(r.mails[0].html);
    check("Mükerrer: 'birden fazla notebook' bölümü ve 'Zimmetli Kişi' sütunu", /birden fazla notebook/.test(t) && t.includes("Zimmetli Kişi"));
  }

  await page.reload();
  await page.waitForTimeout(3000);
  await openReport("Zimmet Uyuşmazlığı");
  await segment("Monitör Uyuşmazlığı");
  await selectRows(1);
  r = await sendAndCollect(() => mailButton().click());
  check("Monitör Uyuşmazlığı: seçili kayda mail gidiyor (artık 'gönderilecek kayıt yok' demiyor)", r.mails.length >= 1, r.toast);
  if (r.mails[0]) {
    sane("Monitör Uyuşmazlığı", r.mails);
    const t = stripHtml(r.mails[0].html);
    check("Monitör Uyuşmazlığı: tek tablo, aynı metin, monitör satırı", /kayıtlı sahibi farklı bir kişi görünüyor/.test(t) && (r.mails[0].html.match(/<table/g) || []).length === 1 && t.includes("Kayıtlı Sahibi (Eski)"));
  }

  // seçim yokken: onay penceresi, vazgeçince mail yok
  await page.reload();
  await page.waitForTimeout(3000);
  await openReport("Zimmet Uyuşmazlığı");
  await segment("Zimmet Hatalı");
  const before = sink.messages.length;
  await mailButton().click();
  await page.waitForTimeout(500);
  const modal = await bodyText();
  check("Seçim yokken: onay penceresi açılıyor ('Listede seçim yapılmadı')", modal.includes("Mail Gönderimini Onayla") && modal.includes("Listede seçim yapılmadı"));
  await page.getByRole("button", { name: "Vazgeç" }).first().click();
  await page.waitForTimeout(1500);
  check("Seçim yokken: Vazgeç'e basınca mail gitmiyor", sink.messages.length === before);

  // ---------- Atıl Monitörler ----------
  console.log("\nAtıl Monitörler");
  await openReport("Atıl Monitörler");
  await page.getByText(/Bilgi dışı kullanılan/).first().click();
  await page.waitForTimeout(800);
  await selectRows(1);
  r = await sendAndCollect(() => page.getByRole("button", { name: /Bilgi Dışı Kullanıma Mail Gönder/ }).first().click());
  check("Atıl Monitörler: seçili bilgi dışı kullanıma mail gidiyor", r.mails.length >= 1, r.toast);
  if (r.mails[0]) {
    sane("Atıl Monitörler", r.mails);
    const t = stripHtml(r.mails[0].html);
    check("Atıl Monitörler: Zimmet Uyuşmazlığı şablonu (konu, metin, sütunlar)", /Zimmet Uyuşmazlığı/.test(r.mails[0].subject) && /kayıtlı sahibi farklı bir kişi görünüyor/.test(t) && t.includes("Kayıtlı Sahibi (Eski)") && t.includes("Last Logon"));
    check("Atıl Monitörler: kayıtlı sahibi unvanıyla yazılmış", /\(.*Takimi\)/.test(t));
  }

  // ---------- Diğer raporlar: ilk 2 kayda mail ----------
  const OTHERS = ["İnaktif Cihazlar", "Disk Alanı", "Kullanılmayan Cihazlar", "Lokasyon Hostname ve IP Uyuşmazlığı", "BSOD", "Battery Health"];
  for (const name of OTHERS) {
    console.log(`\n${name}`);
    try {
      await page.reload();
      await page.waitForTimeout(3000);
      await openReport(name);
      await selectRows(2);
      r = await sendAndCollect(() => mailButton().click());
      check(`${name}: seçili kayıtlara mail gidiyor`, r.mails.length >= 1, r.toast || "mail gelmedi ve bildirim yok");
      sane(name, r.mails);
    } catch (e) {
      check(`${name}: test akışı tamamlandı`, false, String(e.message).split("\n")[0].slice(0, 160));
    }
  }
} finally {
  await browser.close();
  await be.stop();
  await sink.stop();
}

const failed = results.filter((x) => !x.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} mail kontrolü geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((f) => console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`));
process.exit(failed.length ? 1 : 0);
