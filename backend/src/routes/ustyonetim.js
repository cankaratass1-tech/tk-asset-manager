// Üst Yönetim İstisna Listesi — kim üst yönetim sayılır bilgisi ARTIK Excel'den (TH'nin ünvan
// sütunundan) OKUNMUYOR (bkz. konuşma: "excelden o verileri çekme hiç") — kritik "üst yönetime
// hiçbir şekilde mail gitmemeli" kuralı, Excel veri kalitesine/satır satır doğruluğuna bağlı
// olmasın diye burada admin tarafından elle yönetilen, sabit bir e-posta listesi olarak tutuluyor.
const express = require("express");
const fs = require("fs");
const path = require("path");
const { readSection, writeSection } = require("../store");

const router = express.Router();
const SECTION = "ustYonetimListesi";
// Render'ın diski kalıcı olmayabilir (bkz. konuşma) — store hiç yazılmamışsa bundled seed'den
// (demo amaçlı, TH'deki gerçek isimlerden türetilmiş) otomatik doldurulur; admin sonradan
// Ayarlar'dan düzenleyebilir.
const SEED_FILE = path.join(__dirname, "..", "..", "demo-data", "ust-yonetim-seed.json");

function loadWithSeed() {
  const s = readSection(SECTION);
  if (s) return { emails: Array.isArray(s.emails) ? s.emails : [] };
  try {
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
    const seeded = { emails: Array.isArray(seed.emails) ? seed.emails : [] };
    writeSection(SECTION, seeded);
    return seeded;
  } catch {
    return { emails: [] };
  }
}

router.get("/", (req, res) => {
  res.json(loadWithSeed());
});

router.put("/", (req, res) => {
  const emails = Array.isArray(req.body?.emails)
    ? req.body.emails.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const state = { emails: [...new Set(emails)] };
  writeSection(SECTION, state);
  res.json(state);
});

module.exports = router;
module.exports.loadWithSeed = loadWithSeed;
