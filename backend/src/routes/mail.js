const fs = require("fs");
const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");
const { readSection } = require("../store");
const { buildTransport } = require("../mailTransport");
const { validateRecipients, validateContent, createQuota } = require("../mailPolicy");
const sendLog = require("../mailSendLog");

const router = express.Router();
const quota = createQuota();

// Mail başlığındaki logo: gövdede <img src="cid:mail-logo"> varsa dosya gömülü ek olarak eklenir (Outlook/Gmail'de dış bağlantı/base64'e göre güvenilir).
const LOGO_PATH = path.join(__dirname, "..", "..", "assets", "mail-logo.png");
const logoAttachments = (html) =>
  html && html.includes("cid:mail-logo") && fs.existsSync(LOGO_PATH) ? [{ filename: "logo.png", path: LOGO_PATH, cid: "mail-logo" }] : [];

// Alıcı listesi ve içerik istemciden gelir; sunucu adres biçimini, alan adı izin listesini (MAIL_ALLOWED_DOMAINS),
// boyut sınırlarını ve kullanıcı başına saatlik kotayı uygular.
router.post("/send", async (req, res) => {
  const { to, subject, text, html } = req.body || {};
  const rcpt = validateRecipients(to);
  if (!rcpt.ok) return res.status(400).json({ ok: false, message: rcpt.message });
  const content = validateContent({ subject, text, html });
  if (!content.ok) return res.status(400).json({ ok: false, message: content.message });

  const userKey = String((req.user && (req.user.id || req.user.username)) || "bilinmiyor");
  const q = quota.take(userKey, rcpt.recipients.length);
  if (!q.allowed) {
    res.set("Retry-After", String(q.retryAfterSec));
    return res.status(429).json({ ok: false, message: "Mail gönderim kotası doldu. Daha sonra tekrar deneyin.", retryAfterSec: q.retryAfterSec });
  }

  const logSend = (extra) => {
    try {
      return sendLog.record({ source: "manuel", username: req.user && req.user.username, userId: req.user && req.user.id, to: rcpt.recipients, subject, text: text || "", html: html || "", ...extra });
    } catch (e) {
      console.error("[mail] gönderim günlüğü yazılamadı:", e.message); // günlük hatası maili engellemez
      return null;
    }
  };

  const cfg = readSection("smtp");
  if (!cfg || !cfg.host) {
    return res.status(400).json({ ok: false, message: "SMTP ayarları henüz kaydedilmedi (Ayarlar > Mail sunucu ayarları)" });
  }

  try {
    const transporter = buildTransport(cfg);
    const info = await transporter.sendMail({
      from: cfg.fromAddress || cfg.username,
      to: rcpt.recipients,
      subject,
      text: text || "",
      html: html || undefined,
      attachments: logoAttachments(html),
    });
    const logId = logSend({ ok: true, messageId: info.messageId });
    console.log(`[mail] kullanıcı=${(req.user && req.user.username) || "?"} alıcı=${rcpt.recipients.length} konu="${subject.slice(0, 80)}"`);
    res.json({ ok: true, logId, messageId: info.messageId, accepted: info.accepted, previewUrl: nodemailer.getTestMessageUrl(info) || undefined });
  } catch (err) {
    const logId = logSend({ ok: false, error: err.message });
    res.status(502).json({ ok: false, logId, message: `Mail gönderilemedi: ${err.message}` });
  }
});

// Gönderim günlüğü (backend kaydı): liste üst bilgi taşır, tek kayıt gövdeyi de verir.
router.get("/send-log", (req, res) => res.json(sendLog.list()));
router.get("/send-log/:id", (req, res) => {
  const e = sendLog.get(req.params.id);
  if (!e) return res.status(404).json({ error: "Kayıt bulunamadı" });
  res.json(e);
});

module.exports = router;
