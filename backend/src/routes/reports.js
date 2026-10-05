const express = require("express");
const { readSection } = require("../store");
const { loadLatestReport } = require("../excelSource");
const bantStore = require("../bantGenisligiStore");
const batteryStore = require("../batteryHealthStore");

const router = express.Router();

// Ofis Bant Genişliği — Ayarlar > Veri Input'tan tek seferlik yüklenip kalıcı saklanan CSV
// (bkz. konuşma: "bir kez yükleyeyim bir daha yüklemekle uğraşmayayım"). Henüz yüklenmediyse
// 404 döner, frontend "henüz yüklenmedi" mesajını gösterir.
router.get("/bant-genisligi", (req, res) => {
  const loaded = bantStore.load();
  if (!loaded) return res.status(404).json({ ok: false, message: "Henüz bir Bant Genişliği dosyası yüklenmedi" });
  res.json({ ok: true, fileName: loaded.fileName, modifiedAt: loaded.modifiedAt, rows: loaded.rows });
});

// LakeSide Battery Health — Ayarlar > Veri Input'tan tek seferlik yüklenip kalıcı saklanan Excel
// (bkz. konuşma: "gömülü olsun her seferinde yüklemeyelim"). Henüz yüklenmediyse 404 döner.
router.get("/battery-health", (req, res) => {
  const loaded = batteryStore.load();
  if (!loaded) return res.status(404).json({ ok: false, message: "Henüz bir Battery Health dosyası yüklenmedi" });
  res.json({ ok: true, fileName: loaded.fileName, modifiedAt: loaded.modifiedAt, rows: loaded.rows });
});

// İnaktif Cihazlar: SharePoint/OneDrive senkron klasöründeki "İnaktifCihazlar_yyyyMMddHHmmss.xlsx"
// dosyalarının en güncelini okuyup ham satırları döner. Kullanılacak veri dosyanın 2. sheet'inde
// (1. sheet değil) — bkz. konuşma. Sütun -> rapor alanı eşlemesi frontend'de yapılır.
router.get("/inaktif-cihazlar", (req, res) => {
  const cfg = readSection("fileSource") || {};
  if (!cfg.folderPath) {
    return res.status(400).json({ ok: false, message: "Dosya kaynağı klasörü tanımlı değil (Ayarlar > Dosya Kaynağı)" });
  }
  try {
    const { fileName, rows, modifiedAt } = loadLatestReport(cfg.folderPath, "İnaktifCihazlar", { sheetIndex: 1 });
    res.json({ ok: true, fileName, modifiedAt, rows });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
});

// Disk Alanı: aynı klasördeki "DiskAlani_yyyyMMddHHmmss.xlsx" dosyalarının en güncelini okur.
// SCCM "Computers with low free disk space" raporu — gerçek sütun başlıkları 1. satırda değil,
// üstte rapor adı/açıklama satırları olduğu için 6. satırda (headerRow: 5, 0-tabanlı).
router.get("/disk-alani", (req, res) => {
  const cfg = readSection("fileSource") || {};
  if (!cfg.folderPath) {
    return res.status(400).json({ ok: false, message: "Dosya kaynağı klasörü tanımlı değil (Ayarlar > Dosya Kaynağı)" });
  }
  try {
    const { fileName, rows, modifiedAt } = loadLatestReport(cfg.folderPath, "DiskAlani", { sheetIndex: 0, headerRow: 5 });
    res.json({ ok: true, fileName, modifiedAt, rows });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
});

// SCCM envanter raporu: Zimmet Uyuşmazlığı artık bu gerçek veriden hesaplanıyor (bkz. konuşma).
// Dosya adı diğerleri gibi tarih damgalı değil ("SCCM Inventory Report-W Collection.xlsx"),
// findLatestFile bu durumda prefix ile başlayan en son değiştirilmiş dosyaya düşer. Gerçek
// sütun başlıkları 1. satırda değil, 4. satırda (headerRow: 3, 0-tabanlı) — üstte rapor
// başlığı/boş satırlar var.
router.get("/sccm", (req, res) => {
  const cfg = readSection("fileSource") || {};
  if (!cfg.folderPath) {
    return res.status(400).json({ ok: false, message: "Dosya kaynağı klasörü tanımlı değil (Ayarlar > Dosya Kaynağı)" });
  }
  try {
    const { fileName, rows, modifiedAt } = loadLatestReport(cfg.folderPath, "SCCM Inventory Report", { sheetIndex: 0, headerRow: 3 });
    res.json({ ok: true, fileName, modifiedAt, rows });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
});

// Lokasyon Mail Listesi: tüm lokasyon mailleri (İnaktif Cihazlar mail dağıtımı) ve Lokasyon
// Hostname/IP Uyuşmazlığı raporu için TEK kaynak — Lokasyon Kodu, Açık Lokasyon Adı, Mail
// Adresi, Node_CP_ContactMail2, IP_Address sütunları (bkz. konuşma). Başlıklar 1. satırda.
router.get("/lokasyon-mail", (req, res) => {
  const cfg = readSection("fileSource") || {};
  if (!cfg.folderPath) {
    return res.status(400).json({ ok: false, message: "Dosya kaynağı klasörü tanımlı değil (Ayarlar > Dosya Kaynağı)" });
  }
  try {
    const { fileName, rows, modifiedAt } = loadLatestReport(cfg.folderPath, "LokasyonMailListesi", { sheetIndex: 0, headerRow: 0 });
    res.json({ ok: true, fileName, modifiedAt, rows });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
});

// TuruncuHat envanteri: aynı senkron klasördeki "TH*.xlsx" dosyalarının en güncelini okur.
// Gerçek dosya adı tarih damgalı değil ("TH.xlsx") — findLatestFile prefix ile başlayan en son
// değiştirilmiş dosyaya düşer (SCCM uçundaki gibi). Başlıklar 1. satırda (headerRow: 0).
// Diğer üç rapor (İnaktif/Disk/SCCM) gibi backend'den otomatik yüklenebilsin diye eklendi —
// önceden sadece tarayıcıda manuel dosya seçimiyle geliyordu, sayfa yenilenince kayboluyordu
// (bkz. konuşma: "diğerleri gibi görünmüyor").
router.get("/th-envanteri", (req, res) => {
  const cfg = readSection("fileSource") || {};
  if (!cfg.folderPath) {
    return res.status(400).json({ ok: false, message: "Dosya kaynağı klasörü tanımlı değil (Ayarlar > Dosya Kaynağı)" });
  }
  try {
    const { fileName, rows, modifiedAt } = loadLatestReport(cfg.folderPath, "TH", { sheetIndex: 0, headerRow: 0 });
    res.json({ ok: true, fileName, modifiedAt, rows });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
});

// LAKESIDE Weekly BSOD: aynı senkron klasördeki "Weekly_BSOD_yyyyMMddHHmmss.xlsx" dosyalarının
// en güncelini okur. Dosyada 1. satır boş, gerçek başlıklar 2. satırda (headerRow: 1) —
// "Crash Date | Machine Name | Application Name | BSOD Count" (bkz. bsodFileService.js).
// Önceden sadece tarayıcıda elle dosya seçimiyle geliyordu, sayfa yenilenince kayboluyordu
// (bkz. konuşma) — diğer raporlar gibi backend'den otomatik yüklensin diye eklendi.
router.get("/bsod", (req, res) => {
  const cfg = readSection("fileSource") || {};
  if (!cfg.folderPath) {
    return res.status(400).json({ ok: false, message: "Dosya kaynağı klasörü tanımlı değil (Ayarlar > Dosya Kaynağı)" });
  }
  try {
    const { fileName, rows, modifiedAt } = loadLatestReport(cfg.folderPath, "Weekly_BSOD", { sheetIndex: 0, headerRow: 1 });
    res.json({ ok: true, fileName, modifiedAt, rows });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
});

// Monitor Raporu: aynı klasördeki "Attached Monitors Report*.xlsx" dosyalarının en güncelini
// okur. Başlıklar 2. satırda (headerRow: 1) — üstte tek bir rapor başlığı satırı var.
router.get("/monitor-raporu", (req, res) => {
  const cfg = readSection("fileSource") || {};
  if (!cfg.folderPath) {
    return res.status(400).json({ ok: false, message: "Dosya kaynağı klasörü tanımlı değil (Ayarlar > Dosya Kaynağı)" });
  }
  try {
    const { fileName, rows, modifiedAt } = loadLatestReport(cfg.folderPath, "Attached Monitors Report", { sheetIndex: 0, headerRow: 1 });
    res.json({ ok: true, fileName, modifiedAt, rows });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
});

module.exports = router;
