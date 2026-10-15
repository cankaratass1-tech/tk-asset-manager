// Mail testi: uygulamayı gerçek tarayıcıda sürer, "Mail Gönder" butonlarına basar ve giden mailleri süreç içi
// bir SMTP kum havuzunda yakalayıp içeriğini doğrular (hiçbir gerçek adrese mail gitmez).
//   node e2e/mailtest.mjs [--skip-build]
import { buildFrontend, startBackend, launchBrowser, XLSX } from "./harness.mjs";
import { startSmtpSink, stripHtml } from "./mailkit.mjs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
  const toastOf = async () => ((await bodyText()).match(/(✅|⚠️|❌|⛔)[^\n]*/) || [""])[0];

  // butona bas, yeni mailleri topla: ilk mail gelince mail sayısı 1,5 sn boyunca değişmeyene kadar bekle (toplu gönderimler
  // birden çok mail üretir), ardından bildirimin (toast) görünmesini en çok 4 sn bekle
  const sendAndCollect = async (clickFn) => {
    const before = sink.messages.length;
    await clickFn();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && sink.messages.length === before) await page.waitForTimeout(300);
    let last = sink.messages.length;
    let stableSince = Date.now();
    while (Date.now() - stableSince < 1500 && Date.now() < deadline + 15000) {
      await page.waitForTimeout(250);
      if (sink.messages.length !== last) { last = sink.messages.length; stableSince = Date.now(); }
    }
    let toast = await toastOf();
    for (let i = 0; i < 16 && !toast; i++) { await page.waitForTimeout(250); toast = await toastOf(); }
    return { mails: sink.messages.slice(before), toast };
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
  check("Zimmet Hatalı: gönderimden sonra seçim temizlendi (onay kutusu boş)", r.mails.length >= 1 && !(await page.locator("tbody tr input[type=checkbox]").first().isChecked()));
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
  check("Atıl Monitörler: gönderimden sonra seçim temizlendi (buton 'seçili' göstermiyor)", r.mails.length >= 1 && (await page.getByRole("button", { name: /Bilgi Dışı Kullanıma Mail Gönder$/ }).count()) === 1);
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
      if (r.mails.length >= 1) check(`${name}: gönderimden sonra seçim temizlendi`, !(await page.locator("tbody tr input[type=checkbox]").first().isChecked()));
      sane(name, r.mails);
    } catch (e) {
      check(`${name}: test akışı tamamlandı`, false, String(e.message).split("\n")[0].slice(0, 160));
    }
  }
  // ---------- Yeni Kurulum Kaydı ----------
  const api = async (path, opts = {}) =>
    (await fetch(`${be.base}${path}`, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${be.token}`, ...(opts.headers || {}) } })).json();
  page.on("dialog", (d) => d.dismiss().catch(() => {})); // beklenmeyen prompt/alert: sessizce kapat (test takılmasın)
  const BAD_WORDS = ["undefined", "NaN", "[object", "null"];

  console.log("\nYeni Kurulum Kaydı");
  try {
    // 3 senaryo (TR tek, EN tek, TR iki kayıt) için yeterli "gönderilmemiş" kayıt olsun diye 3 test kaydı eklenir
    for (let i = 1; i <= 3; i++) {
      await api("/api/newinstalls", { method: "POST", body: JSON.stringify({ serial: `SMOKE${i}`, hostname: `SMOKE-HOST-${i}`, model: "NOTEBOOK", location: "MERKEZ BINA", userInfo: `TEST KULLANICI ${i}`, atoNo: `ATO-TEST-${i}`, date: "2026-10-01", bitlocker: "ENABLE", processedBy: "SMOKE", status: "HAZIRLANDI", reason: "YENİ İŞE GİRİŞ" }) });
    }
    await page.reload();
    await page.waitForTimeout(3000);
    await openReport("Yeni Kurulum Kaydı");
    const recRows = page.locator("tr", { hasText: /gönderilmedi · 0/ });
    const nUnsent = await recRows.count();
    check("Yeni Kurulum: mail gönderilmemiş kayıtlar listede", nUnsent >= 3, `${nUnsent} kayıt`);

    // 1) tek kayıt, elle alıcı, Türkçe
    const first = recRows.first();
    const firstText = await first.innerText();
    await first.locator("input[type=checkbox]").check();
    await page.locator('input[placeholder^="Mail alıcı"]').fill("alici@test.local");
    let r1 = await sendAndCollect(() => page.getByRole("button", { name: /Mail Gönder — TR \(1 seçili\)/ }).click());
    check("Yeni Kurulum (TR, 1 kayıt): mail gidiyor", r1.mails.length === 1, r1.toast);
    if (r1.mails[0]) {
      const m = r1.mails[0];
      const t = stripHtml(m.html);
      sane("Yeni Kurulum TR", r1.mails);
      check("Yeni Kurulum (TR): alıcı elle girilen adres", m.to.includes("alici@test.local"), m.to);
      check("Yeni Kurulum (TR): konu 'Cihazınız Hazır — ATO Kapatma Onayı'", m.subject === "Cihazınız Hazır — ATO Kapatma Onayı", m.subject);
      check("Yeni Kurulum (TR): şablon metni ve adres/konum", t.includes("Cihazınız hazırlanmıştır") && t.includes("Corporate Club") && m.html.includes("goo.gl/maps"));
      check("Yeni Kurulum (TR): tablo başlıkları", ["Seri Numarası", "Barkod", "Model", "Marka", "Varlık Kataloğu", "Varlık Transfer Emri"].every((h) => t.includes(h)));
      const ato = (firstText.match(/ATO-[\w-]+/) || [])[0];
      check("Yeni Kurulum (TR): kaydın ATO numarası tabloda (Varlık Transfer Emri)", !!ato && t.includes(ato), ato);
      check("Yeni Kurulum (TR): tek satırlık tablo", (m.html.match(/<tbody>[\s\S]*<\/tbody>/) || [""])[0].split("<tr>").length - 1 === 1);
    }
    const sentBadge = await page.locator("tr", { hasText: /gönderildi · 1/ }).count();
    check("Yeni Kurulum: gönderilen kaydın rozeti 'gönderildi · 1' oldu", sentBadge >= 1);
    // gönderimden sonra seçim temizlenmeli: buton "(1 seçili)" değil "(tümü)" göstermeli — aksi halde aynı kayıt yeniden gider
    check("Yeni Kurulum: gönderimden sonra seçim temizlendi (buton '(tümü)' gösteriyor)", (await page.getByRole("button", { name: /Mail Gönder — TR \(tümü\)/ }).count()) === 1);

    // 2) İngilizce, 1 kayıt (sayfa yenilenir: önceki gönderimdeki seçim ekranda kalıyor — gözlem notu)
    await page.reload();
    await page.waitForTimeout(3000);
    await openReport("Yeni Kurulum Kaydı");
    await page.locator("tr", { hasText: /gönderilmedi · 0/ }).first().locator("input[type=checkbox]").check();
    await page.locator('input[placeholder^="Mail alıcı"]').fill("alici@test.local");
    await page.locator("select").filter({ has: page.locator('option[value="en"]') }).selectOption("en");
    const r2 = await sendAndCollect(() => page.getByRole("button", { name: /Mail Gönder — EN/ }).click());
    check("Yeni Kurulum (EN): mail gidiyor", r2.mails.length === 1, r2.toast);
    if (r2.mails[0]) {
      const t = stripHtml(r2.mails[0].html);
      sane("Yeni Kurulum EN", r2.mails);
      check("Yeni Kurulum (EN): İngilizce konu ve metin ve tablo başlıkları", r2.mails[0].subject === "Your Device Is Ready — ATO Closure Approval" && t.includes("Your device has been prepared") && ["Serial Number", "Barcode", "Asset Transfer Order"].every((h) => t.includes(h)), r2.mails[0].subject);
    }

    // 3) iki kayıt tek mailde (çoğul konu, 2 satır) — önceki gönderimin seçimi ekranda kaldığı için sayfa yenilenir
    await page.reload();
    await page.waitForTimeout(3000);
    await openReport("Yeni Kurulum Kaydı");
    const boxes = page.locator("tr", { hasText: /gönderilmedi · 0/ });
    check("Yeni Kurulum (2 kayıt senaryosu): yeterli gönderilmemiş kayıt kaldı", (await boxes.count()) >= 2, `${await boxes.count()} kayıt`);
    if ((await boxes.count()) >= 2) {
      await boxes.nth(0).locator("input[type=checkbox]").check();
      await boxes.nth(1).locator("input[type=checkbox]").check();
      await page.locator('input[placeholder^="Mail alıcı"]').fill("alici@test.local");
      const r3 = await sendAndCollect(() => page.getByRole("button", { name: /Mail Gönder — TR \(2 seçili\)/ }).click());
      check("Yeni Kurulum (2 kayıt): tek mailde gidiyor", r3.mails.length === 1, r3.toast);
      if (r3.mails[0]) {
        check("Yeni Kurulum (2 kayıt): çoğul konu ve 2 satırlı tablo", /Cihazlarınız Hazır — ATO Kapatma Onayı \(2 cihaz\)/.test(r3.mails[0].subject) && (r3.mails[0].html.match(/<tbody>[\s\S]*<\/tbody>/) || [""])[0].split("<tr>").length - 1 === 2, r3.mails[0].subject);
        sane("Yeni Kurulum 2 kayıt", r3.mails);
      }
    }
  } catch (e) {
    check("Yeni Kurulum: test akışı tamamlandı", false, String(e.message).split("\n")[0].slice(0, 160));
  }

  // ---------- Kapatma Onayı Bekleyen Kayıtlar ----------
  console.log("\nKapatma Onayı Bekleyen Kayıtlar");
  try {
    const recs = (await api("/api/newinstalls")).records || [];
    const pending = recs.filter((r) => r.mailSentAt && String(r.status).toUpperCase() !== "TESLİM EDİLDİ");
    check("Kapatma Onayı: bekleyen kayıt var (mail gitmiş, teslim edilmemiş)", pending.length >= 3, `${pending.length} kayıt`);
    // üst yönetim kuralı: bekleyen bir kaydın TH sahibinin mailini üst yönetim listesine ekle
    const thFile = readdirSync(join(be.dataDir, "imports")).find((n) => n.startsWith("TH_"));
    const thWb = XLSX.read(readFileSync(join(be.dataDir, "imports", thFile)));
    const thRaw = XLSX.utils.sheet_to_json(thWb.Sheets[thWb.SheetNames[0]], { defval: "" });
    const mailOf = (serial) => (thRaw.find((r) => String(r["Seri No"]).toLowerCase() === String(serial).toLowerCase()) || {})["Cihaz Sahibinin Maili"] || "";
    const withMail = pending.filter((r) => mailOf(r.serial));
    const target = withMail[0];
    const ustMail = target ? mailOf(target.serial).toLowerCase() : "";
    const put = await fetch(`${be.base}/api/settings/ust-yonetim`, { method: "PUT", headers: { "Content-Type": "application/json", ...be.adminHeaders }, body: JSON.stringify({ emails: ustMail ? [ustMail] : [] }) });
    check("Kapatma Onayı: üst yönetim listesine bir bekleyen kaydın sahibi eklendi (test kurulumu)", put.ok && !!ustMail, ustMail);

    await page.reload();
    await page.waitForTimeout(3000);
    await openReport("Kapatma Onayı Bekleyen Kayıtlar");
    await page.waitForTimeout(800);
    // Üst yönetim kayıtları bu ekrandan TAMAMEN gizlenir (kod: PendingClosureScreen.pending) — liste, kayıtların bir eksiği olmalı
    const visibleRows = await page.locator("tbody tr").count();
    check("Kapatma Onayı: üst yönetim kaydı listede hiç görünmüyor", visibleRows === pending.length - 1 && !(await bodyText()).includes(target.serial), `${visibleRows} satır / ${pending.length} bekleyen (1 üst yönetim gizli)`);

    // tek satır gönderimi (üst yönetim olmayan, maili olan ilk kayıt)
    const sendBtns = page.getByRole("button", { name: /✉️ Gönder \(TR\)/ });
    check("Kapatma Onayı: gönderilebilir satırlar var", (await sendBtns.count()) >= 1, `${await sendBtns.count()} buton`);
    const rSingle = await sendAndCollect(() => sendBtns.first().click());
    check("Kapatma Onayı (tek satır, TR): mail gidiyor", rSingle.mails.length === 1, rSingle.toast);
    if (rSingle.mails[0]) {
      const m = rSingle.mails[0];
      const t = stripHtml(m.html);
      sane("Kapatma Onayı tek", rSingle.mails);
      check("Kapatma Onayı: konu 'Kapatma Onayı Bekleniyor — TuruncuHat'", m.subject === "Kapatma Onayı Bekleniyor — TuruncuHat", m.subject);
      check("Kapatma Onayı: şablon metni ve tablo başlıkları", /kapatma onayı bekleyen turuncuhat kayıtları/.test(t) && ["Barkod", "Seri No", "Varlık Adı", "ATO Code", "Etkilenen Kullanıcı"].every((h) => t.includes(h)));
      check("Kapatma Onayı: alıcı ÜST YÖNETİM DEĞİL", m.to.replace(/^.*<|>.*$/g, "").trim().toLowerCase() !== ustMail, m.to);
      check("Kapatma Onayı: alıcı TuruncuHat'taki kişi maili (mhy.com.tr)", /@mhy\.com\.tr/.test(m.to), m.to);
    }

    // toplu: seçim yok → "tümü"; üst yönetim kaydı hariç, her kişiye ayrı mail
    const bulk = page.getByRole("button", { name: /Hatırlatma Gönder — TR \(tümü\)/ });
    const rBulk = await sendAndCollect(() => bulk.click());
    check("Kapatma Onayı (toplu, tümü): kişi başına ayrı mail gidiyor", rBulk.mails.length >= 1, rBulk.toast);
    check("Kapatma Onayı (toplu): üst yönetim adresine hiç mail gitmedi", rBulk.mails.every((m) => !m.to.toLowerCase().includes(ustMail)), `${rBulk.mails.length} mail`);
    // beklenen: üst yönetim hariç, TuruncuHat'ta maili olan bekleyen kayıtların benzersiz alıcı sayısı (maili olmayanlar için
    // uygulama elle adres sorar — testte prompt kapatıldığı için atlanır)
    const nowPending = ((await api("/api/newinstalls")).records || []).filter((r) => r.mailSentAt && String(r.status).toUpperCase() !== "TESLİM EDİLDİ");
    const expectedRecipients = new Set(nowPending.map((r) => mailOf(r.serial).toLowerCase()).filter((m) => m && m !== ustMail)).size;
    check("Kapatma Onayı (toplu): bekleyen kayıtların sahiplerine gitti (benzersiz alıcı sayısı), üst yönetim hariç", rBulk.mails.length === expectedRecipients && expectedRecipients > 0, `${rBulk.mails.length} mail ↔ ${expectedRecipients} beklenen alıcı`);
    sane("Kapatma Onayı toplu", rBulk.mails);
    const uniqueTo = new Set(rBulk.mails.map((m) => m.to));
    check("Kapatma Onayı (toplu): her alıcıya tek mail (aynı kişi birleşiyor)", uniqueTo.size === rBulk.mails.length, `${rBulk.mails.length} mail, ${uniqueTo.size} alıcı`);

    // üst yönetim adresi elle yazılırsa engellenir
    await page.locator('input[placeholder^="Mail alıcı"]').fill(ustMail);
    const beforeUst = sink.messages.length;
    await page.getByRole("button", { name: /Hatırlatma Gönder — TR/ }).click();
    let ustToast = "";
    for (let i = 0; i < 10 && !/üst yönetime ait/.test(ustToast); i++) {
      await page.waitForTimeout(250);
      ustToast = await toastOf();
    }
    check("Kapatma Onayı: üst yönetim adresi elle girilirse mail gönderilmiyor", sink.messages.length === beforeUst && /üst yönetime ait/.test(ustToast), ustToast || "bildirim görünmedi");
    await page.locator('input[placeholder^="Mail alıcı"]').fill("");

    // İngilizce toplu: kayıtlar zaten hatırlatıldı ama tekrar gönderilebilir
    await page.locator("select").filter({ has: page.locator('option[value="en"]') }).selectOption("en");
    const rEn = await sendAndCollect(() => page.getByRole("button", { name: /Hatırlatma Gönder — EN/ }).click());
    check("Kapatma Onayı (EN): İngilizce mail gidiyor", rEn.mails.length >= 1 && rEn.mails.every((m) => m.subject === "Closure Approval Pending — TuruncuHat"), rEn.mails[0]?.subject || rEn.toast);
    if (rEn.mails[0]) check("Kapatma Onayı (EN): İngilizce tablo başlıkları", ["Barcode", "Serial Number", "Asset Name", "ATO Code", "Affected User"].every((h) => stripHtml(rEn.mails[0].html).includes(h)));
  } catch (e) {
    check("Kapatma Onayı: test akışı tamamlandı", false, String(e.message).split("\n")[0].slice(0, 160));
  }
  void BAD_WORDS;
} finally {
  await browser.close();
  await be.stop();
  await sink.stop();
}

const failed = results.filter((x) => !x.ok);
console.log(`\nSonuç: ${results.length - failed.length}/${results.length} mail kontrolü geçti${failed.length ? `, ${failed.length} BAŞARISIZ` : ""}`);
failed.forEach((f) => console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`));
process.exit(failed.length ? 1 : 0);
