const express = require("express");
const { readSection, writeSection } = require("../store");

// Genel uygulama ayarları (kişisel veri değil): "Kullanılmayan Cihazlar" raporunun
// "son giriş çok eski" eşiği ve ileride bağlanacak LakeSide batarya dosya kaynağı.
// Okuma requireAuth ile (rapor ekranı okur), yazma requireSettingsAuth ile (Ayarlar).
const router = express.Router();
const SECTION = "appConfig";
const DEFAULTS = { unusedStaleDays: 90, lakesideBatterySource: { folderPath: "" } };

function current() {
  const saved = readSection(SECTION) || {};
  return {
    unusedStaleDays: Number(saved.unusedStaleDays) > 0 ? Number(saved.unusedStaleDays) : DEFAULTS.unusedStaleDays,
    lakesideBatterySource: {
      folderPath: (saved.lakesideBatterySource && saved.lakesideBatterySource.folderPath) || "",
    },
  };
}

router.get("/", (req, res) => {
  res.json(current());
});

router.put("/", (req, res) => {
  const body = req.body || {};
  const next = current();
  if (body.unusedStaleDays != null) {
    const n = Number(body.unusedStaleDays);
    if (!Number.isFinite(n) || n < 1 || n > 3650) {
      return res.status(400).json({ error: "unusedStaleDays 1-3650 aralığında olmalı" });
    }
    next.unusedStaleDays = Math.round(n);
  }
  if (body.lakesideBatterySource && typeof body.lakesideBatterySource.folderPath === "string") {
    next.lakesideBatterySource = { folderPath: body.lakesideBatterySource.folderPath.trim() };
  }
  writeSection(SECTION, next);
  res.json(next);
});

module.exports = router;
