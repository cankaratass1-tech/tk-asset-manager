const express = require("express");
const { readSection, writeSection } = require("../store");
const { runScan, currentConfig, SECTION } = require("../anomalyScheduler");

// Zamanlanmış Otomatik Tarama ayarları — Ayarlar > Veri Input ekranındaki "Zamanlanmış Otomatik
// Tarama" bölümünü gerçek backend'e bağlar (bkz. konuşma). Okuma requireAuth, yazma/manuel
// çalıştırma requireSettingsAuth (server.js'te mount edilirken uygulanıyor, appconfig ile aynı desen).
const router = express.Router();

router.get("/", (req, res) => {
  const cfg = currentConfig();
  // knownKeys iç durum — istemciye sızdırmaya gerek yok, sadece boyutunu göster.
  res.json({ ...cfg, knownKeys: undefined, knownCount: (cfg.knownKeys || []).length });
});

router.put("/", (req, res) => {
  const body = req.body || {};
  const cfg = currentConfig();
  const next = { ...cfg };
  if (typeof body.enabled === "boolean") next.enabled = body.enabled;
  if (["daily", "weekly", "monthly"].includes(body.cadence)) next.cadence = body.cadence;
  if (typeof body.day === "string") next.day = body.day;
  if (typeof body.time === "string" && /^\d{2}:\d{2}$/.test(body.time)) next.time = body.time;
  if (Array.isArray(body.recipients)) {
    next.recipients = body.recipients.map((s) => String(s).trim()).filter((s) => /@/.test(s));
  }
  writeSection(SECTION, next);
  res.json({ ...next, knownKeys: undefined, knownCount: (next.knownKeys || []).length });
});

// Manuel "Şimdi Tara" — kullanıcı zamanlamayı beklemeden test edebilsin diye.
router.post("/run-now", async (req, res) => {
  try {
    const result = await runScan({ force: true });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
});

module.exports = router;
