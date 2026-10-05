const express = require("express");
const nodemailer = require("nodemailer");
const { readSection } = require("../store");
const { buildTransport } = require("../mailTransport");

const router = express.Router();

// Alıcı listesi çağıran taraftan gelir; backend alıcı belirleme mantığı içermez
router.post("/send", async (req, res) => {
  const { to, subject, text, html } = req.body || {};
  if (!to || !to.trim()) return res.status(400).json({ ok: false, message: "Alıcı (to) zorunlu" });
  if (!subject || !subject.trim()) return res.status(400).json({ ok: false, message: "Konu (subject) zorunlu" });

  const cfg = readSection("smtp");
  if (!cfg || !cfg.host) {
    return res.status(400).json({ ok: false, message: "SMTP ayarları henüz kaydedilmedi (Ayarlar > Mail sunucu ayarları)" });
  }

  try {
    const transporter = buildTransport(cfg);
    const info = await transporter.sendMail({
      from: cfg.fromAddress || cfg.username,
      to,
      subject,
      text: text || "",
      html: html || undefined,
    });
    res.json({ ok: true, messageId: info.messageId, accepted: info.accepted, previewUrl: nodemailer.getTestMessageUrl(info) || undefined });
  } catch (err) {
    res.status(502).json({ ok: false, message: `Mail gönderilemedi: ${err.message}` });
  }
});

module.exports = router;
