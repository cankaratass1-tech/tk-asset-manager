// Gönderim Geçmişi — ilişkisel yapı (gereksinim #14): ana kayıtlar "mailHistory" section'ında,
// alıcı/cihaz detay kayıtları ayrı bir "mailHistoryDetails" section'ında, sendingId (=main
// kaydın id'si) ile ilişkilendirilir. Gerçek bir SQL DB yerine mevcut store.js (encrypted JSON)
// deseni kullanılır (bkz. plan — kullanıcı native bağımlılık istemedi); GET /, JS .filter() ile
// sorgulanabilirlik sağlar (bu veri hacminde performans sorunu yok).
const express = require("express");
const { readSection, writeSection } = require("../store");

const router = express.Router();
const MAIN_SECTION = "mailHistory";
const DETAILS_SECTION = "mailHistoryDetails";
const MAX_ENTRIES = 500;

router.get("/", (req, res) => {
  const { dateFrom, dateTo, senderUsername, reportType, status, person, device } = req.query || {};
  let rows = readSection(MAIN_SECTION) || [];
  const allDetails = readSection(DETAILS_SECTION) || {};

  if (dateFrom) rows = rows.filter((h) => !h.isoDate || h.isoDate >= dateFrom);
  if (dateTo) rows = rows.filter((h) => !h.isoDate || h.isoDate <= dateTo);
  if (senderUsername) rows = rows.filter((h) => (h.senderUsername || "").toLowerCase() === senderUsername.toLowerCase());
  if (reportType) rows = rows.filter((h) => h.reportType === reportType);
  if (status) rows = rows.filter((h) => h.status === status);
  if (person || device) {
    const q = (person || device || "").toLowerCase();
    rows = rows.filter((h) => {
      const details = allDetails[h.id] || h.details || [];
      return details.some((d) =>
        `${d.recipientUser || ""} ${d.recipientEmail || d.to || ""} ${d.device || d.deviceName || d.location || ""}`
          .toLowerCase()
          .includes(q)
      );
    });
  }

  res.json(rows);
});

router.get("/:id/details", (req, res) => {
  const allDetails = readSection(DETAILS_SECTION) || {};
  res.json(allDetails[req.params.id] || []);
});

router.post("/", (req, res) => {
  const entry = req.body || {};
  if (!entry.id) return res.status(400).json({ error: "id zorunlu" });

  const { details, ...mainFields } = entry;
  const current = readSection(MAIN_SECTION) || [];
  const nextMain = [mainFields, ...current].slice(0, MAX_ENTRIES);
  writeSection(MAIN_SECTION, nextMain);

  if (Array.isArray(details)) {
    const allDetails = readSection(DETAILS_SECTION) || {};
    allDetails[entry.id] = details;
    // Ana kayıtla aynı MAX_ENTRIES penceresinde kalsın — silinen ana kayıtların detayı birikmesin
    const keepIds = new Set(nextMain.map((h) => h.id));
    for (const key of Object.keys(allDetails)) {
      if (!keepIds.has(Number(key)) && !keepIds.has(key)) delete allDetails[key];
    }
    writeSection(DETAILS_SECTION, allDetails);
  }

  res.json(entry);
});

module.exports = router;
