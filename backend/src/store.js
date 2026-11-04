// Ayarları yerel diske (data/settings.enc.json) şifreli olarak kalıcı kılar
const fs = require("fs");
const path = require("path");
const { encrypt, decrypt, getDataDir } = require("./crypto");

const STORE_PATH = path.join(getDataDir(), "settings.enc.json");

// Dosya (rapor anlık görüntüleri dahil onlarca MB olabilir) her istekte yeniden okunup ayrıştırılmasın:
// ham içerik, dosya değişmediği sürece (mtime+boyut) bellekte tutulur.
let rawCache = null; // { mtimeMs, size, raw }

function readRaw() {
  let st;
  try {
    st = fs.statSync(STORE_PATH);
  } catch {
    rawCache = null;
    return {};
  }
  if (rawCache && rawCache.mtimeMs === st.mtimeMs && rawCache.size === st.size) return rawCache.raw;
  const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  rawCache = { mtimeMs: st.mtimeMs, size: st.size, raw };
  return raw;
}

function readAll() {
  const raw = readRaw();
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
  const raw = { ...readRaw() };
  raw[section] = encrypt(value);
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(raw, null, 2), { mode: 0o600 });
  rawCache = null;
}

// Yalnızca istenen bölüm çözülür — küçük bölümler (kullanıcılar, mail geçmişi) büyük bölümlerin yüküne girmez
function readSection(section) {
  const entry = readRaw()[section];
  if (entry === undefined) return null;
  try {
    return decrypt(entry) || null;
  } catch {
    return null;
  }
}

module.exports = { readSection, writeSection };
