// "Verileri temizle": uygulamanın kendi veri klasöründeki yüklenmiş rapor verilerini sıfırlar (Ayarlar > Veri Girişi > Tüm verileri temizle).
// SİLİNİR: yüklenen rapor dosyaları (imports), Bant Genişliği / Battery Health yüklemeleri, geçmiş karşılaştırma kayıtları (snapshots), Yeni Kurulum kayıtları,
//          Gönderim Geçmişi + gönderim günlüğü, cihaz not/aksiyon geçmişi.
// KORUNUR:  kullanıcılar, SMTP, mail grupları, Üst Yönetim listesi, klasör/yetki ayarları.
// Ayarlar'da dış bir klasör (ör. SharePoint) tanımlıysa o klasöre DOKUNULMAZ — yalnızca uygulamanın kendi "imports" ve "uploads" klasörleri temizlenir.
const fs = require("fs");
const path = require("path");
const express = require("express");
const { readSection, writeSection } = require("../store");
const { getDataDir } = require("../crypto");
const { importsDir } = require("../importStore");
const { clearReportCache } = require("../excelSource");

const router = express.Router();

function emptyDir(dir) {
  let removed = 0;
  if (!fs.existsSync(dir)) return removed;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    try {
      if (fs.statSync(p).isFile()) { fs.unlinkSync(p); removed += 1; }
    } catch { /* kilitli/okunamayan dosya atlanır */ }
  }
  return removed;
}

router.post("/", (req, res) => {
  try {
    const files = emptyDir(importsDir()) + emptyDir(path.join(getDataDir(), "uploads"));
    // Bölüm boş değere (null) yazılınca okuyucular kendi varsayılanına döner
    ["reportSnapshots", "bantGenisligiUpload", "batteryHealthUpload", "mailHistory", "mailHistoryDetails", "mailSendLog", "deviceMeta", "deviceActions"].forEach((s) => writeSection(s, null));
    const ni = readSection("yeniKurulumlar") || {};
    writeSection("yeniKurulumlar", { ...ni, records: [], managedKeys: [] }); // null olsaydı örnek veriden yeniden dolardı
    clearReportCache();
    res.json({ ok: true, removedFiles: files, message: "Yüklenen veriler temizlendi" });
  } catch (err) {
    res.status(500).json({ ok: false, message: `Veriler temizlenemedi: ${err.message}` });
  }
});

module.exports = router;
