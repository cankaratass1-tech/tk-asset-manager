const test = require("node:test");
const assert = require("node:assert/strict");
const { validateRecipients, validateContent, createQuota, domainAllowed } = require("./mailPolicy");

test("alıcı: ayraçlar, yineleme ve küçük harfe çevirme", () => {
  const r = validateRecipients("A@Sirket.com; a@sirket.com, b@sirket.com", []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.recipients, ["a@sirket.com", "b@sirket.com"]);
});

test("alıcı: boş, dizi ve biçimsiz değerler reddedilir", () => {
  for (const bad of ["", "  ", null, undefined, ["a@b.com"], "a@b", "a b@c.com", "<a@b.com>", "a@b.com\nb@c.com"]) {
    assert.equal(validateRecipients(bad, []).ok, false, String(bad));
  }
});

test("alan adı izin listesi: alt alan adı kabul, benzer ad reddedilir", () => {
  assert.equal(domainAllowed("sirket.com", ["sirket.com"]), true);
  assert.equal(domainAllowed("alt.sirket.com", ["sirket.com"]), true);
  assert.equal(domainAllowed("evilsirket.com", ["sirket.com"]), false);
  assert.equal(domainAllowed("herhangi.com", []), true);
});

test("içerik: satır sonu, boyut ve tür denetimi", () => {
  assert.equal(validateContent({ subject: "Konu", text: "m", html: "<p>m</p>" }).ok, true);
  assert.equal(validateContent({ subject: "a\nb" }).ok, false);
  assert.equal(validateContent({ subject: "" }).ok, false);
  assert.equal(validateContent({ subject: "x", html: "a".repeat(500 * 1024 + 1) }).ok, false);
  assert.equal(validateContent({ subject: "x", text: 5 }).ok, false);
});

test("kota: alıcı ve istek sayısı pencere içinde sınırlanır, süre dolunca açılır", () => {
  let t = 0;
  const q = createQuota({ windowMs: 1000, maxRecipients: 5, maxRequests: 10 }, () => t);
  assert.equal(q.take("u", 3).allowed, true);
  assert.equal(q.take("u", 3).allowed, false);
  assert.equal(q.take("baska", 3).allowed, true);
  t = 1001;
  assert.equal(q.take("u", 3).allowed, true);
  const r = createQuota({ windowMs: 1000, maxRecipients: 100, maxRequests: 2 }, () => t);
  r.take("u", 1);
  r.take("u", 1);
  const blocked = r.take("u", 1);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
});
