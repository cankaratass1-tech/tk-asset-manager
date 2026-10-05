const express = require("express");
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
    const loaded = batteryStore.load();
    res.json({ ok: true, fileName: loaded.fileName, modifiedAt: loaded.modifiedAt, rows: loaded.rows });
  } catch (err) {
    res.status(502).json({ ok: false, message: `Dosya okunamadı: ${err.message}` });
  }
});

module.exports = router;
