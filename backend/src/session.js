// Basit, bağımlılıksız oturum token'ı: crypto.js'teki mevcut secret key ile HMAC-imzalı opak
// token (JWT kütüphanesi eklemeden aynı amaca hizmet eder). Token asla loglanmaz.
const crypto = require("crypto");
const { getDataDir } = require("./crypto");
const fs = require("fs");
const path = require("path");

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 saat

function getSigningKey() {
  // Ayrı bir dosyada tutulur ki secret.key (ayar şifreleme anahtarı) ile karışmasın; aynı
  // getDataDir()/otomatik üretim deseni izlenir.
  const keyPath = path.join(getDataDir(), "session.key");
  if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, "utf8").trim();
  const generated = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(getDataDir(), { recursive: true });
  fs.writeFileSync(keyPath, generated, { mode: 0o600 });
  return generated;
}

let cachedKey = null;
function key() {
  if (!cachedKey) cachedKey = getSigningKey();
  return cachedKey;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload) {
  const body = { ...payload, exp: Date.now() + SESSION_TTL_MS };
  const encoded = base64url(JSON.stringify(body));
  const mac = crypto.createHmac("sha256", key()).update(encoded).digest("base64url");
  return `${encoded}.${mac}`;
}

function verify(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [encoded, mac] = token.split(".");
  const expectedMac = crypto.createHmac("sha256", key()).update(encoded).digest("base64url");
  const a = Buffer.from(mac || "");
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

module.exports = { sign, verify };
