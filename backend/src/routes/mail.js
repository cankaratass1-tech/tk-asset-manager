const fs = require("fs");
const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");
const { readSection } = require("../store");
const { buildTransport } = require("../mailTransport");

const router = express.Router();

// Mail başlığındaki logo: gövdede <img src="cid:mail-logo"> varsa dosya gömülü ek olarak eklenir (Outlook/Gmail'de dış bağlantı/base64'e göre güvenilir).
const LOGO_PATH = path.join(__dirname, "..", "..", "assets", "mail-logo.png");
const logoAttachments = (html) =>
  html && html.includes("cid:mail-logo") && fs.existsSync(LOGO_PATH) ? [{ filename: "logo.png", path: LOGO_PATH, cid: "mail-logo" }] : [];

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
      attachments: logoAttachments(html),
    });
    res.json({ ok: true, messageId: info.messageId, accepted: info.accepted, previewUrl: nodemailer.getTestMessageUrl(info) || undefined });
  } catch (err) {
    res.status(502).json({ ok: false, message: `Mail gönderilemedi: ${err.message}` });
  }
});

module.exports = router;
