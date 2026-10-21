// "Yeni Kurulum" Excel çıktısı için yol politikası. Sunucu, yalnızca bu kurallara uyan bir .xlsx
// dosyasına yazar; uygulama kodunun/verisinin bulunduğu klasörlere ve .xlsx olmayan dosyalara yazılmaz.
const fs = require("fs");
const path = require("path");
const { getDataDir } = require("./crypto");

const MAX_EXISTING_BYTES = 50 * 1024 * 1024;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const fail = (message) => ({ ok: false, message });

function inside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// Uygulamanın kendi dosyalarının ve yüklenen rapor dosyalarının bulunduğu klasörler
function protectedDirs() {
  const backendRoot = path.join(__dirname, "..");
  const dataDir = getDataDir();
  return [
    path.join(backendRoot, "src"),
    path.join(backendRoot, "node_modules"),
    path.join(backendRoot, "demo-data"),
    path.join(backendRoot, "assets"),
    path.join(backendRoot, "scripts"),
    path.join(backendRoot, "..", "varlik-takip-app"),
    path.join(dataDir, "imports"),
    path.join(dataDir, "uploads"),
  ];
}

// { ok: true, path, createParent } | { ok: false, message }
function validateExcelPath(input) {
  if (typeof input !== "string") return fail("Excel yolu metin olmalı");
  const raw = input.trim();
  if (!raw || raw.length > 260) return fail("Excel yolu 1-260 karakter olmalı");
  if (/[\u0000-\u001f]/.test(raw)) return fail("Excel yolu geçersiz karakter içeriyor");
  if (!path.isAbsolute(raw)) return fail("Excel yolu tam (mutlak) bir yol olmalı");

  const resolved = path.resolve(raw);
  if (path.extname(resolved).toLowerCase() !== ".xlsx") return fail("Dosya uzantısı .xlsx olmalı");
  if (RESERVED_NAMES.test(path.basename(resolved, path.extname(resolved)))) return fail("Dosya adı geçersiz");
  if (protectedDirs().some((dir) => inside(resolved, dir))) {
    return fail("Bu klasör uygulama dosyalarına ait, Excel yolu olarak kullanılamaz");
  }

  let stat = null;
  try {
    stat = fs.statSync(resolved);
  } catch {
    // dosya henüz yok
  }
  if (stat && !stat.isFile()) return fail("Hedef bir dosya değil");

  // Uygulamanın kendi veri klasörü dışındaki yollar için klasör önceden var olmalı (keyfi klasör oluşturulmaz)
  const createParent = inside(resolved, getDataDir());
  if (!createParent) {
    let parentStat = null;
    try {
      parentStat = fs.statSync(path.dirname(resolved));
    } catch {
      // klasör yok
    }
    if (!parentStat || !parentStat.isDirectory()) return fail("Klasör bulunamadı, önce klasörü oluşturun");
  }
  return { ok: true, path: resolved, createParent };
}

// Hedef dosya varsa gerçekten bir .xlsx (ZIP imzası) olmalı; aksi halde okunmaz ve üzerine yazılmaz.
// { ok: true, existed } | { ok: false, message }
function checkExistingXlsx(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return { ok: true, existed: false };
  }
  if (!stat.isFile()) return fail("Hedef bir dosya değil");
  if (stat.size === 0) return { ok: true, existed: false };
  if (stat.size > MAX_EXISTING_BYTES) return fail("Hedef dosya çok büyük");
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(2);
    fs.readSync(fd, head, 0, 2, 0);
    if (!(head[0] === 0x50 && head[1] === 0x4b)) return fail("Hedef dosya geçerli bir .xlsx değil, üzerine yazılmadı");
  } finally {
    fs.closeSync(fd);
  }
  return { ok: true, existed: true };
}

module.exports = { validateExcelPath, checkExistingXlsx };
