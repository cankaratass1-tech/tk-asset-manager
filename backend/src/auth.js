// Ayarlar ekranı için basit kullanıcı adı/şifre koruması. Amaç ağdaki herkesin SMTP/API
// kimlik bilgilerini ve mail gruplarını değiştirebilmesini engellemek — genel kimlik doğrulama
// sistemi değil, sadece Ayarlar uçlarını kapatan bir kapı. İlk çalıştırmada otomatik bir şifre
// üretilip DATA_DIR altına yazılır ve konsola basılır (secret.key ile aynı desen).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDataDir } = require("./crypto");
const { authLimiter, clientIp, blockedResponse } = require("./rateLimit");

const CREDENTIALS_PATH = path.join(getDataDir(), "admin-credentials.json");

let cached = null;

function loadOrCreateCredentials() {
  if (cached) return cached;

  const envUser = process.env.ADMIN_USERNAME;
  const envPass = process.env.ADMIN_PASSWORD;
  if (envUser && envPass) {
    cached = { username: envUser, password: envPass };
    return cached;
  }

  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(CREDENTIALS_PATH)) {
    cached = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
    return cached;
  }

  const generated = { username: "admin", password: crypto.randomBytes(6).toString("hex") };
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(generated, null, 2), { mode: 0o600 });
  cached = generated;
  console.log(
    `Ayarlar ekranı için giriş bilgileri oluşturuldu — kullanıcı: ${generated.username}  şifre: ${generated.password}\n` +
      `(bkz. ${CREDENTIALS_PATH} — .env'de ADMIN_USERNAME/ADMIN_PASSWORD tanımlarsanız onlar kullanılır)`
  );
  return cached;
}

const digest = (v) => crypto.createHash("sha256").update(String(v)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

function verifyCredentials(username, password) {
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) return false;
  const creds = loadOrCreateCredentials();
  // iki karşılaştırma da her zaman yapılır (erken çıkış zamanlama farkı yaratmasın)
  const userOk = safeEqual(username, creds.username);
  const passOk = safeEqual(password, creds.password);
  return userOk && passOk;
}

// Yönetici girişi denemesi: deneme sınırı uygulanır. Dönen durum: "ok" | "bad" | "blocked" | "missing".
// "missing": kimlik bilgisi hiç gönderilmemiş (giriş yapmamış istemci), hata sayılmaz.
function attemptAdminLogin(req, username, password) {
  const ctx = { scope: "admin", ip: clientIp(req), username: typeof username === "string" ? username : "" };
  const gate = authLimiter.check(ctx);
  if (!gate.allowed) return { status: "blocked", retryAfterSec: gate.retryAfterSec };
  if (!password) return { status: "missing" };
  if (verifyCredentials(username, password)) {
    authLimiter.success(ctx);
    return { status: "ok" };
  }
  authLimiter.fail(ctx);
  console.warn(`[auth] Başarısız yönetici girişi denemesi — ip: ${ctx.ip}  zaman: ${new Date().toISOString()}`);
  return { status: "bad" };
}

// Express middleware — x-admin-username / x-admin-password header'larını doğrular
function requireSettingsAuth(req, res, next) {
  const result = attemptAdminLogin(req, req.headers["x-admin-username"], req.headers["x-admin-password"]);
  if (result.status === "ok") return next();
  if (result.status === "blocked") return blockedResponse(res, result.retryAfterSec, "error");
  res.status(401).json({ error: "Yetkisiz — Ayarlar için giriş gerekli" });
}

module.exports = { loadOrCreateCredentials, verifyCredentials, attemptAdminLogin, requireSettingsAuth };
