// Cihaz bazlı kalıcı veri (gereksinim madde 5 — "Cihaz Aksiyon Geçmişi"):
//  - deviceMeta:    her cihazın not/durum/ertele bilgisi (önceden sadece React state'teydi, sayfa
//                   yenilenince kaybolyordu — artık burada kalıcı). Anahtar: normalize seri no
//                   (yoksa hostname) — aynı cihaz farklı raporlarda tek kayıt (madde 14).
//  - deviceActions: her cihazın kronolojik aksiyon logu (not eklendi, mail gönderildi, durum
//                   değişti, rapordan çıktı/girdi, ...). Append-only.
// Mevcut store.js (AES-256-GCM şifreli JSON section) deseni kullanılır; yeni bağımlılık yok.
const express = require("express");
const { readSection, writeSection } = require("../store");

const router = express.Router();
const META_SECTION = "deviceMeta";
const ACTIONS_SECTION = "deviceActions";
const MAX_EVENTS_PER_DEVICE = 200;

// Tüm cihaz meta'sı — frontend açılışta tek istekte hydrate eder (N ayrı istek yerine).
router.get("/meta", (req, res) => {
  res.json(readSection(META_SECTION) || {});
});

// Bir cihazın meta'sını tümüyle değiştirir ({ status, snoozed, note, notes:[] }).
router.put("/meta/:deviceKey", (req, res) => {
  const key = String(req.params.deviceKey || "").trim();
  if (!key) return res.status(400).json({ error: "deviceKey zorunlu" });
  const all = readSection(META_SECTION) || {};
  const body = req.body || {};
  // Boş/anlamsız meta'yı sakla-ma — depoyu şişirmesin
  const isEmpty = !body.status && !body.snoozed && !body.note && !(Array.isArray(body.notes) && body.notes.length);
  if (isEmpty) delete all[key];
  else all[key] = { status: body.status || null, snoozed: !!body.snoozed, note: body.note || "", notes: Array.isArray(body.notes) ? body.notes : [] };
  writeSection(META_SECTION, all);
  res.json({ ok: true });
});

// Bir cihazın aksiyon logu (en yeni önce).
router.get("/actions/:deviceKey", (req, res) => {
  const key = String(req.params.deviceKey || "").trim();
  const all = readSection(ACTIONS_SECTION) || {};
  const events = all[key] || [];
  res.json([...events].sort((a, b) => String(b.ts).localeCompare(String(a.ts))));
});

// Aksiyon logu — birden çok cihaz için tek istekte (opsiyonel; ?keys=a,b,c).
router.get("/actions", (req, res) => {
  const all = readSection(ACTIONS_SECTION) || {};
  const keys = String(req.query.keys || "").split(",").map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) return res.json(all);
  const out = {};
  keys.forEach((k) => { if (all[k]) out[k] = all[k]; });
  res.json(out);
});

// Bir cihaza aksiyon event'i ekler.
router.post("/actions/:deviceKey", (req, res) => {
  const key = String(req.params.deviceKey || "").trim();
  if (!key) return res.status(400).json({ error: "deviceKey zorunlu" });
  const b = req.body || {};
  if (!b.type) return res.status(400).json({ error: "type zorunlu" });
  const event = {
    ts: b.ts || new Date().toISOString(),
    type: String(b.type),
    description: b.description ? String(b.description) : "",
    user: b.user ? String(b.user) : "",
    reportId: b.reportId ? String(b.reportId) : "",
    mailSubject: b.mailSubject ? String(b.mailSubject) : "",
    status: b.status ? String(b.status) : "",
    source: b.source ? String(b.source) : "app",
  };
  const all = readSection(ACTIONS_SECTION) || {};
  const events = all[key] || [];
  events.push(event);
  all[key] = events.slice(-MAX_EVENTS_PER_DEVICE);
  writeSection(ACTIONS_SECTION, all);
  res.json({ ok: true, event });
});

module.exports = router;
