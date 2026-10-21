// Güvenlik testleri: ilk kurulum kodu, giriş deneme sınırı ve Excel yolu politikası.
// Gerçek uygulama (createApp) geçici bir veri klasörüyle başlatılır; gerçek veriye dokunulmaz.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "varlik-sec-"));
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "varlik-sec-out-"));
const SETUP_CODE = "test-kurulum-kodu-0123456789abcdef";
process.env.DATA_DIR = dataDir;
process.env.SETUP_CODE = SETUP_CODE;
process.env.ADMIN_USERNAME = "yonetici";
process.env.ADMIN_PASSWORD = "yonetici-sifresi-123";

const { createApp } = require("../server");
const users = require("./users");
const session = require("./session");
const { authLimiter } = require("./rateLimit");

let server;
let base;

async function call(method, url, { body, headers = {} } = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, json };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const MASTER_PASSWORD = "master-sifresi-123";

test.before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const dir of [dataDir, outDir]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows dosya kilidi, geçici klasör
    }
  }
});

test.beforeEach(() => authLimiter.reset());

test("ilk kurulum: kurulum kodu olmadan Master oluşturulamaz", async () => {
  const noCode = await call("POST", "/api/auth/setup-master", { body: { username: "x", password: MASTER_PASSWORD } });
  assert.equal(noCode.status, 403);
  const wrong = await call("POST", "/api/auth/setup-master", { body: { username: "x", password: MASTER_PASSWORD, setupCode: "yanlis" } });
  assert.equal(wrong.status, 403);
  const objectCode = await call("POST", "/api/auth/setup-master", { body: { username: "x", password: MASTER_PASSWORD, setupCode: { $ne: 1 } } });
  assert.equal(objectCode.status, 403);
  assert.equal(users.hasMasterUser(), false);
});

test("ilk kurulum: hatalı kod denemeleri sınırlanır, doğru kod da bekleme sırasında reddedilir", async () => {
  for (let i = 0; i < 5; i++) {
    const r = await call("POST", "/api/auth/setup-master", { body: { username: "x", password: MASTER_PASSWORD, setupCode: `yanlis-${i}` } });
    assert.equal(r.status, 403);
  }
  const blocked = await call("POST", "/api/auth/setup-master", { body: { username: "x", password: MASTER_PASSWORD, setupCode: SETUP_CODE } });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(users.hasMasterUser(), false);
});

test("ilk kurulum: doğru kodla Master oluşur, ikinci deneme 409 döner", async () => {
  const created = await call("POST", "/api/auth/setup-master", { body: { username: "master", password: MASTER_PASSWORD, setupCode: SETUP_CODE } });
  assert.equal(created.status, 200);
  assert.equal(created.json.ok, true);
  assert.ok(created.json.token);
  const again = await call("POST", "/api/auth/setup-master", { body: { username: "baska", password: MASTER_PASSWORD, setupCode: SETUP_CODE } });
  assert.equal(again.status, 409);
  assert.equal(users.listUsers().filter((u) => u.role === "master").length, 1);
});

test("giriş: ardışık hatalardan sonra doğru şifre bile bekleme süresince reddedilir", async () => {
  for (let i = 0; i < 5; i++) {
    const r = await call("POST", "/api/auth/login", { body: { username: "master", password: `yanlis-${i}` } });
    assert.equal(r.status, 401);
  }
  const blocked = await call("POST", "/api/auth/login", { body: { username: "master", password: MASTER_PASSWORD } });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  authLimiter.reset();
  const ok = await call("POST", "/api/auth/login", { body: { username: "master", password: MASTER_PASSWORD } });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.token);
});

test("giriş: başarılı giriş hata sayacını sıfırlar", async () => {
  for (let i = 0; i < 4; i++) await call("POST", "/api/auth/login", { body: { username: "master", password: "yanlis" } });
  const ok = await call("POST", "/api/auth/login", { body: { username: "master", password: MASTER_PASSWORD } });
  assert.equal(ok.status, 200);
  for (let i = 0; i < 4; i++) {
    const r = await call("POST", "/api/auth/login", { body: { username: "master", password: "yanlis" } });
    assert.equal(r.status, 401);
  }
});

test("giriş: metin olmayan kullanıcı adı/şifre 400 döner", async () => {
  const r = await call("POST", "/api/auth/login", { body: { username: { a: 1 }, password: ["x"] } });
  assert.equal(r.status, 400);
});

test("yönetici girişi: ardışık hatalardan sonra 429 döner", async () => {
  for (let i = 0; i < 5; i++) {
    const r = await call("POST", "/api/settings/login", { body: { username: "yonetici", password: `yanlis-${i}` } });
    assert.equal(r.status, 401);
  }
  const blocked = await call("POST", "/api/settings/login", { body: { username: "yonetici", password: "yonetici-sifresi-123" } });
  assert.equal(blocked.status, 429);
});

test("yönetici girişi: ayarlar uçlarında hatalı başlıklar da sınırlanır, başlıksız istekler sayılmaz", async () => {
  for (let i = 0; i < 12; i++) {
    const r = await call("GET", "/api/settings/smtp");
    assert.equal(r.status, 401);
  }
  const good = await call("GET", "/api/settings/smtp", { headers: { "x-admin-username": "yonetici", "x-admin-password": "yonetici-sifresi-123" } });
  assert.equal(good.status, 200);
  authLimiter.reset();
  const bad = { "x-admin-username": "yonetici", "x-admin-password": "yanlis" };
  for (let i = 0; i < 5; i++) assert.equal((await call("GET", "/api/settings/smtp", { headers: bad })).status, 401);
  assert.equal((await call("GET", "/api/settings/smtp", { headers: bad })).status, 429);
});

test("şifre değiştirme: hatalı mevcut şifre denemeleri sınırlanır", async () => {
  const login = await call("POST", "/api/auth/login", { body: { username: "master", password: MASTER_PASSWORD } });
  const headers = bearer(login.json.token);
  for (let i = 0; i < 5; i++) {
    const r = await call("POST", "/api/auth/change-password", { headers, body: { currentPassword: `yanlis-${i}`, newPassword: "yeni-sifre-12345" } });
    assert.equal(r.status, 401);
  }
  const blocked = await call("POST", "/api/auth/change-password", { headers, body: { currentPassword: MASTER_PASSWORD, newPassword: "yeni-sifre-12345" } });
  assert.equal(blocked.status, 429);
});

test("Excel yolu: yalnızca Master değiştirebilir, politikaya uymayan yollar reddedilir", async () => {
  const normal = users.createUser({ username: "normal", role: "user", passwordHash: null });
  const userHeaders = bearer(session.sign({ userId: normal.id, username: normal.username, role: normal.role }));
  const master = users.listUsers().find((u) => u.role === "master");
  const masterHeaders = bearer(session.sign({ userId: master.id, username: master.username, role: master.role }));
  const target = path.join(outDir, "kurulum.xlsx");

  const asUser = await call("PUT", "/api/newinstalls/config/excel-path", { headers: userHeaders, body: { excelPath: target } });
  assert.equal(asUser.status, 403);

  const invalid = [
    "kurulum.xlsx", // göreli yol
    path.join(outDir, "kurulum.txt"), // .xlsx değil
    path.join(outDir, "yok-klasor", "kurulum.xlsx"), // klasör yok
    path.join(dataDir, "imports", "x.xlsx"), // yüklenen rapor klasörü
    path.join(__dirname, "ele-gecirme.xlsx"), // uygulama kodu klasörü
    path.join(outDir, "con.xlsx"), // ayrılmış aygıt adı
    `${target}\u0000.txt`, // boş karakter
    outDir, // klasör
  ];
  for (const bad of invalid) {
    const r = await call("PUT", "/api/newinstalls/config/excel-path", { headers: masterHeaders, body: { excelPath: bad } });
    assert.equal(r.status, 400, `reddedilmeliydi: ${JSON.stringify(bad)}`);
  }

  const ok = await call("PUT", "/api/newinstalls/config/excel-path", { headers: masterHeaders, body: { excelPath: target } });
  assert.equal(ok.status, 200);
  assert.equal(path.resolve(ok.json.excelPath), path.resolve(target));
});

test("Excel aktarımı: istek gövdesindeki yol yok sayılır, yalnızca kayıtlı yola yazılır", async () => {
  const user = users.listUsers().find((u) => u.username === "normal");
  const headers = bearer(session.sign({ userId: user.id, username: user.username, role: user.role }));
  const target = path.join(outDir, "kurulum.xlsx");
  const attacker = path.join(outDir, "saldirgan.xlsx");

  const res = await call("POST", "/api/newinstalls/sync-excel", { headers, body: { excelPath: attacker } });
  assert.equal(res.status, 200);
  assert.equal(path.resolve(res.json.file), path.resolve(target));
  assert.equal(fs.existsSync(attacker), false);
  assert.equal(fs.existsSync(target), true);
});

test("Excel aktarımı: hedef geçerli bir .xlsx değilse üzerine yazılmaz", async () => {
  const master = users.listUsers().find((u) => u.role === "master");
  const masterHeaders = bearer(session.sign({ userId: master.id, username: master.username, role: master.role }));
  const decoy = path.join(outDir, "metin.xlsx");
  fs.writeFileSync(decoy, "bu bir excel dosyasi degil");
  const set = await call("PUT", "/api/newinstalls/config/excel-path", { headers: masterHeaders, body: { excelPath: decoy } });
  assert.equal(set.status, 200);

  const res = await call("POST", "/api/newinstalls/sync-excel", { headers: masterHeaders, body: {} });
  assert.equal(res.status, 400);
  assert.equal(fs.readFileSync(decoy, "utf8"), "bu bir excel dosyasi degil");
});

test("Excel aktarımı: kimlik doğrulama olmadan erişilemez", async () => {
  const res = await call("POST", "/api/newinstalls/sync-excel", { body: {} });
  assert.equal(res.status, 401);
  const put = await call("PUT", "/api/newinstalls/config/excel-path", { body: { excelPath: path.join(outDir, "x.xlsx") } });
  assert.equal(put.status, 401);
});

test("mail gönderimi: kimlik doğrulama olmadan erişilemez", async () => {
  const res = await call("POST", "/api/mail/send", { body: { to: "a@sirket.com", subject: "x" } });
  assert.equal(res.status, 401);
});

test("mail gönderimi: geçersiz alıcı, başlık enjeksiyonu ve aşırı alıcı reddedilir", async () => {
  const user = users.findByUsername("normal");
  const headers = bearer(session.sign({ userId: user.id, username: user.username, role: user.role }));
  const send = (body) => call("POST", "/api/mail/send", { headers, body });

  assert.equal((await send({ to: "adres-degil", subject: "x" })).status, 400);
  assert.equal((await send({ to: "a@sirket.com\r\nBcc: x@disari.com", subject: "x" })).status, 400);
  assert.equal((await send({ to: "Ad <a@sirket.com>", subject: "x" })).status, 400);
  assert.equal((await send({ to: "a@sirket.com", subject: "x\r\nBcc: y@disari.com" })).status, 400);
  assert.equal((await send({ to: ["a@sirket.com"], subject: "x" })).status, 400);
  const many = Array.from({ length: 51 }, (_, i) => `k${i}@sirket.com`).join(",");
  assert.equal((await send({ to: many, subject: "x" })).status, 400);
  // geçerli istek doğrulamayı geçer; SMTP tanımlı olmadığından ayar hatasıyla biter
  const ok = await send({ to: "a@sirket.com", subject: "x" });
  assert.equal(ok.status, 400);
  assert.match(ok.json.message, /SMTP ayarları/);
});

test("mail gönderimi: izinli alan adı listesi dışındaki alıcı reddedilir", async () => {
  const user = users.findByUsername("normal");
  const headers = bearer(session.sign({ userId: user.id, username: user.username, role: user.role }));
  process.env.MAIL_ALLOWED_DOMAINS = "sirket.com";
  try {
    const bad = await call("POST", "/api/mail/send", { headers, body: { to: "a@sirket.com,b@disari.com", subject: "x" } });
    assert.equal(bad.status, 400);
    assert.match(bad.json.message, /izinli değil/);
    const sub = await call("POST", "/api/mail/send", { headers, body: { to: "a@alt.sirket.com", subject: "x" } });
    assert.match(sub.json.message, /SMTP ayarları/);
    const lookalike = await call("POST", "/api/mail/send", { headers, body: { to: "a@evilsirket.com", subject: "x" } });
    assert.equal(lookalike.status, 400);
  } finally {
    delete process.env.MAIL_ALLOWED_DOMAINS;
  }
});
