const express = require("express");
const XLSX = require("xlsx");
const { checkWorkbook, summarize } = require("../fileSchemas");
const batteryStore = require("../batteryHealthStore");

// Battery Health Excel'ini Ayarlar > Veri Input'tan TEK SEFERLİK yükleyip backend'e kalıcı
// kaydeder (bkz. konuşma: "gömülü olsun her seferinde yüklemeyelim") — bantgenisligiupload.js
// ile aynı desen.
const router = express.Router();

router.post("/", (req, res) => {
  const { fileName, contentBase64 } = req.body || {};
  if (!contentBase64) return res.status(400).json({ ok: false, message: "Dosya içeriği eksik" });
  try {
    const buf = Buffer.from(contentBase64, "base64");
    batteryStore.save(fileName, buf);
    // Sütun kontrolü bilgilendirme amaçlıdır: dosya yine de kaydedilir, eksikler kullanıcıya bildirilir (bkz. fileSchemas.js)
    const check = checkWorkbook("battery", XLSX.read(buf, { type: "buffer", cellDates: true }));
    const loaded = batteryStore.load();
    res.json({ ok: true, fileName: loaded.fileName, modifiedAt: loaded.modifiedAt, rows: loaded.rows, check, checkSummary: summarize(check) });
  } catch (err) {
    res.status(502).json({ ok: false, message: `Dosya okunamadı: ${err.message}` });
  }
});

module.exports = router;
