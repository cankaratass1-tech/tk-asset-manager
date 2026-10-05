// Ayarları yerel diske (data/settings.enc.json) şifreli olarak kalıcı kılar
const fs = require("fs");
const path = require("path");
const { encrypt, decrypt, getDataDir } = require("./crypto");

const STORE_PATH = path.join(getDataDir(), "settings.enc.json");

function readAll() {
  if (!fs.existsSync(STORE_PATH)) return {};
  const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  const result = {};
  for (const key of Object.keys(raw)) {
    try {
      result[key] = decrypt(raw[key]);
    } catch {
      result[key] = null;
    }
  }
  return result;
}

function writeSection(section, value) {
  const raw = fs.existsSync(STORE_PATH) ? JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) : {};
  raw[section] = encrypt(value);
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(raw, null, 2), { mode: 0o600 });
}

function readSection(section) {
  return readAll()[section] || null;
}

module.exports = { readSection, writeSection };
