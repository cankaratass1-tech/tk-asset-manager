const express = require("express");
const { readSection, writeSection } = require("../store");
const { loadLatestReport } = require("../excelSource");

const router = express.Router();
const SECTION = "fileSource";

router.get("/", (req, res) => {
  res.json(readSection(SECTION) || { folderPath: "" });
});

router.put("/", (req, res) => {
  const { folderPath } = req.body || {};
  if (!folderPath || !folderPath.trim()) return res.status(400).json({ error: "Klasör yolu zorunlu" });
  const next = { folderPath: folderPath.trim() };
  writeSection(SECTION, next);
  res.json(next);
});

// Belirli bir rapor öneki (ör. "İnaktifCihazlar") için en güncel dosyayı bulup
// sütun başlıklarını ve satır sayısını döner — dosyayı frontend'e taşımadan doğrulama
router.post("/test", (req, res) => {
  const saved = readSection(SECTION) || {};
  const folderPath = (req.body?.folderPath || saved.folderPath || "").trim();
  const prefix = (req.body?.prefix || "İnaktifCihazlar").trim();

  if (!folderPath) return res.status(400).json({ ok: false, message: "Klasör yolu girilmedi" });

  try {
    const { fileName, rows, modifiedAt } = loadLatestReport(folderPath, prefix, { sheetIndex: 1 });
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    // Kişisel veri (isim, mail vb.) API yanıtında hiç dönmez — sadece yapı/dolu-boş bilgisi
    res.json({
      ok: true,
      message: `Bulundu: ${fileName} (${rows.length} satır)`,
      fileName,
      modifiedAt,
      rowCount: rows.length,
      columns,
    });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
});

module.exports = router;
