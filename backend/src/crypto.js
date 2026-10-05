// Ayarlarda saklanan sırları (SMTP şifresi, API anahtarı, veri kaynağı şifresi) diskte AES-256-GCM ile şifreli tutar.
// Anahtar kaynağı: BACKEND_SECRET_KEY ortam değişkeni verilmişse o kullanılır; verilmemişse
// DATA_DIR altında bir secret.key dosyası otomatik üretilip kalıcı kılınır.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const KEY_ENV = "BACKEND_SECRET_KEY";
const ALGORITHM = "aes-256-gcm";

function getDataDir() {
  return process.env.DATA_DIR || path.join(__dirname, "..", "data");
}

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;

  const fromEnv = process.env[KEY_ENV];
  if (fromEnv) {
    if (fromEnv.length !== 64) {
      throw new Error(`${KEY_ENV} 32 byte (64 hex karakter) olmalı`);
    }
    cachedKey = Buffer.from(fromEnv, "hex");
    return cachedKey;
  }

  const dataDir = getDataDir();
  const keyPath = path.join(dataDir, "secret.key");
  fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(keyPath)) {
    cachedKey = Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "hex");
    return cachedKey;
  }

  const generated = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, generated.toString("hex"), { mode: 0o600 });
  cachedKey = generated;
  return cachedKey;
}

function encrypt(plainTextObject) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(plainTextObject), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    data: encrypted.toString("hex"),
  };
}

function decrypt(payload) {
  if (!payload) return null;
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(payload.data, "hex")), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

module.exports = { encrypt, decrypt, getDataDir };
