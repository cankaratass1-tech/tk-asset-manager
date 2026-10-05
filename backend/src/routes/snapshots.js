// Dönemsel çözüm/müdahale istatistikleri için hafif "snapshot" geçmişi (madde 2, 13).
// Uygulama sadece en son Excel'i okuyor, tarihsel veri yok — bu yüzden her gerçek veri
// yüklemesinde frontend o anki PROBLEMLİ cihazların kimlik listesini (tam satır değil!) buraya
// yazar. Dönemsel karşılaştırma (Devam Eden / Çözülen / Yeni Tespit) bu snapshot'lar arasında
// cihaz eşleştirmesiyle yapılır — yalnızca toplam sayı farkından DEĞİL.
//
// Şema (reportSnapshots section): { [reportId]: [ { capturedAt, sourceFileModifiedAt,
//   devices: [ { key, hostname, serial, location, lbsParent, company } ] }, ... ] }
// Aynı sourceFileModifiedAt için ikinci kez yazılmaz (idempotent — aynı dosya iki kez yüklenince
// mükerrer snapshot birikmesin). Rapor başına son MAX_SNAPSHOTS tutulur.
const express = require("express");
const { readSection, writeSection } = require("../store");

const router = express.Router();
const SECTION = "reportSnapshots";
const MAX_SNAPSHOTS = 30;
const MAX_DEVICES = 20000; // güvenlik sınırı — devasa bir liste depoyu şişirmesin

router.get("/", (req, res) => {
  const all = readSection(SECTION) || {};
  const reportId = req.query.reportId;
  if (reportId) return res.json(all[reportId] || []);
  res.json(all);
});

router.post("/", (req, res) => {
  const b = req.body || {};
  const reportId = String(b.reportId || "").trim();
  if (!reportId) return res.status(400).json({ error: "reportId zorunlu" });
  if (!Array.isArray(b.devices)) return res.status(400).json({ error: "devices dizi olmalı" });

  const all = readSection(SECTION) || {};
  const list = all[reportId] || [];

  const srcMod = b.sourceFileModifiedAt || "";
  // Aynı kaynak dosya için zaten snapshot varsa tekrar ekleme.
  if (srcMod && list.some((s) => s.sourceFileModifiedAt === srcMod)) {
    return res.json({ ok: true, skipped: "aynı kaynak dosya için snapshot zaten var", count: list.length });
  }

  const devices = b.devices.slice(0, MAX_DEVICES).map((d) => ({
    key: String(d.key || d.serial || d.hostname || "").trim().toLowerCase(),
    hostname: d.hostname ? String(d.hostname) : "",
    serial: d.serial ? String(d.serial) : "",
    location: d.location ? String(d.location) : "",
    lbsParent: d.lbsParent ? String(d.lbsParent) : "",
    company: d.company ? String(d.company) : "",
  })).filter((d) => d.key);

  const snapshot = {
    capturedAt: b.capturedAt || new Date().toISOString(),
    sourceFileModifiedAt: srcMod,
    deviceCount: devices.length,
    devices,
  };

  all[reportId] = [...list, snapshot].slice(-MAX_SNAPSHOTS);
  writeSection(SECTION, all);
  res.json({ ok: true, count: all[reportId].length });
});

module.exports = router;
