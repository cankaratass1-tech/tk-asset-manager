const express = require("express");
const { saveImport, KINDS } = require("../importStore");

const router = express.Router();

// Ayarlar > Veri Input'tan elle seçilen dosyanın ham baytları (Content-Type: application/octet-stream)
// ?kind=sccm&name=dosya.xlsx — yalnızca Master User (bkz. server.js). Dosya sunucuda kalıcı saklanır;
// uygulama yeniden açıldığında rapor ekranları veriyi buradan otomatik yükler.
router.post("/", async (req, res) => {
  const kind = String(req.query.kind || "");
  const name = String(req.query.name || "");
  if (!KINDS[kind]) return res.status(400).json({ ok: false, message: "Bilinmeyen dosya türü" });
  try {
    const saved = await saveImport(kind, req.body, name);
    res.json({ ok: true, fileName: saved.fileName, size: saved.size, check: saved.check, checkSummary: saved.checkSummary });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

module.exports = router;
