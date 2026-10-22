const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "sendlog-"));
const log = require("./mailSendLog");

test("kayıt: gönderen, alıcı, sonuç saklanır; liste gövdeyi taşımaz, tek kayıt taşır", () => {
  const id = log.record({ username: "ali", to: ["a@x.com", "b@x.com"], subject: "Konu", html: "<p>Merhaba</p>", text: "Merhaba", ok: true, messageId: "m1" });
  const l = log.list().find((e) => e.id === id);
  assert.equal(l.username, "ali");
  assert.deepEqual(l.to, ["a@x.com", "b@x.com"]);
  assert.equal(l.source, "manuel");
  assert.equal(l.html, undefined);
  assert.equal(l.hasBody, true);
  assert.equal(log.get(id).html, "<p>Merhaba</p>");
});

test("başarısız gönderim hata nedeniyle kaydedilir; otomatik kaynak ayrı etiketlenir", () => {
  const id = log.record({ source: "otomatik", username: "sistem", to: "c@x.com", subject: "S", ok: false, error: "SMTP kapalı" });
  const e = log.get(id);
  assert.equal(e.ok, false);
  assert.equal(e.error, "SMTP kapalı");
  assert.equal(e.source, "otomatik");
});

test("gövde yalnız en yeni KEEP_BODIES kayıtta tutulur, üst bilgi kalır", () => {
  const first = log.record({ username: "u", to: ["z@x.com"], subject: "ilk", html: "<b>x</b>", ok: true });
  for (let i = 0; i < log.KEEP_BODIES + 2; i++) log.record({ username: "u", to: ["z@x.com"], subject: `s${i}`, html: "<b>x</b>", ok: true });
  const old = log.get(first);
  assert.equal(old.subject, "ilk");
  assert.equal(old.html, "");
  assert.equal(old.bodyDropped, true);
  assert.equal(log.list().find((e) => e.id === first).hasBody, false);
});

test("zamanlayıcı e-postası geçmişe 'Otomatik (sistem)' olarak ve günlüğe yazılır, başarısızlık da kaydedilir", () => {
  const { recordAutoSend } = require("./anomalyScheduler");
  const { readSection } = require("./store");
  const cfg = { recipients: ["a@x.com", "b@x.com"] };
  recordAutoSend({ cfg, subject: "Otomatik Tarama — 2 Yeni Uyuşmazlık", text: "t", html: "<p>h</p>", ok: true, messageId: "m", count: 2 });
  recordAutoSend({ cfg, subject: "Otomatik Tarama — 1 Yeni Uyuşmazlık", text: "t", html: "<p>h</p>", ok: false, error: "SMTP kapalı", count: 1 });
  const hist = readSection("mailHistory");
  assert.equal(hist.length, 2);
  const [fail, okEntry] = hist;
  assert.equal(okEntry.senderUsername, "Otomatik (sistem)");
  assert.equal(okEntry.status, "Başarılı");
  assert.equal(okEntry.recipients, 2);
  assert.equal(fail.status, "Başarısız");
  assert.equal(log.get(okEntry.sendLogIds[0]).source, "otomatik");
  assert.equal(log.get(fail.sendLogIds[0]).error, "SMTP kapalı");
  const details = readSection("mailHistoryDetails");
  assert.equal(details[okEntry.id].length, 2);
});
