const express = require("express");
const XLSX = require("xlsx");
const { checkWorkbook, summarize } = require("../fileSchemas");
const bantStore = require("../bantGenisligiStore");

// Ofis Bant Genişliği CSV'sini Ayarlar > Veri Input'tan TEK SEFERLİK yükleyip backend'e kalıcı
// kaydeder — dosya adı sabit bir desene uymadığı için diğer raporlar gibi klasör
// senkronu yerine bu yol kullanılıyor.
const router = express.Router();

router.post("/", (req, res) => {
  const { fileName, contentBase64 } = req.body || {};
  if (!contentBase64) return res.status(400).json({ ok: false, message: "Dosya içeriği eksik" });
  try {
    const buf = Buffer.from(contentBase64, "base64");
    bantStore.save(fileName, buf);
    // Sütun kontrolü bilgilendirme amaçlıdır: dosya yine de kaydedilir, eksikler kullanıcıya bildirilir (bkz. fileSchemas.js)
    const check = checkWorkbook("bant", XLSX.read(buf, { type: "buffer", cellDates: true }));
    const loaded = bantStore.load();
    res.json({ ok: true, fileName: loaded.fileName, modifiedAt: loaded.modifiedAt, rows: loaded.rows, check, checkSummary: summarize(check) });
  } catch (err) {
    res.status(502).json({ ok: false, message: `Dosya okunamadı: ${err.message}` });
  }
});

module.exports = router;
