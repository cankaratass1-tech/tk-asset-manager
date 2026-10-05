const express = require("express");
const { readSection, writeSection } = require("../store");

const router = express.Router();
const SECTION = "mailGroups";

router.get("/", (req, res) => {
  res.json(readSection(SECTION) || {});
});

router.put("/", (req, res) => {
  const groups = req.body || {};
  if (typeof groups !== "object" || Array.isArray(groups)) {
    return res.status(400).json({ error: "Geçersiz veri" });
  }
  writeSection(SECTION, groups);
  res.json(groups);
});

module.exports = router;
