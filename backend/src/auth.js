// Ayarlar ekranı için basit kullanıcı adı/şifre koruması. Amaç ağdaki herkesin SMTP/API
// kimlik bilgilerini ve mail gruplarını değiştirebilmesini engellemek — genel kimlik doğrulama
// sistemi değil, sadece Ayarlar uçlarını kapatan bir kapı. İlk çalıştırmada otomatik bir şifre
// üretilip DATA_DIR altına yazılır ve konsola basılır (secret.key ile aynı desen).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDataDir } = require("./crypto");

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

function verifyCredentials(username, password) {
  if (!username || !password) return false;
  const creds = loadOrCreateCredentials();
  return username === creds.username && password === creds.password;
}

// Express middleware — x-admin-username / x-admin-password header'larını doğrular
function requireSettingsAuth(req, res, next) {
  const username = req.headers["x-admin-username"];
  const password = req.headers["x-admin-password"];
  if (verifyCredentials(username, password)) return next();
  res.status(401).json({ error: "Yetkisiz — Ayarlar için giriş gerekli" });
}

module.exports = { loadOrCreateCredentials, verifyCredentials, requireSettingsAuth };
