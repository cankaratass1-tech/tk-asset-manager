const express = require("express");
const { readSection, writeSection } = require("../store");
const { buildTransport } = require("../mailTransport");

const router = express.Router();
const SECTION = "smtp";

function maskConfig(cfg) {
  if (!cfg) return null;
  return {
    host: cfg.host || "",
    port: cfg.port || "587",
    username: cfg.username || "",
    hasPassword: Boolean(cfg.password),
    fromAddress: cfg.fromAddress || "",
    useTls: cfg.useTls !== false,
  };
}

router.get("/", (req, res) => {
  res.json(maskConfig(readSection(SECTION)));
});

router.put("/", (req, res) => {
  const { host, port, username, password, fromAddress, useTls } = req.body || {};
  if (!host || !host.trim()) return res.status(400).json({ error: "host zorunlu" });

  const existing = readSection(SECTION) || {};
  const next = {
    host: host.trim(),
    port: port || existing.port || "587",
    username: username ?? existing.username ?? "",
    password: password || existing.password || "",
    fromAddress: fromAddress ?? existing.fromAddress ?? "",
    useTls: useTls !== undefined ? useTls : existing.useTls !== false,
  };
  writeSection(SECTION, next);
  res.json(maskConfig(next));
});

router.post("/test", async (req, res) => {
  const saved = readSection(SECTION) || {};
  const body = req.body || {};
  // Frontend, kaydedilmiş şifreyi asla forma geri yüklemez (backend maskeler), bu yüzden
  // şifre boşsa kayıtlı şifreye geri düş. Diğer alanlar (username dahil) formdaki değer neyse
  // odur — boş bırakmak "no authentication" testini ifade edebilir, kayıtlı değeri geri getirmemeli.
  const cfg = {
    host: body.host !== undefined ? body.host : saved.host,
    port: body.port !== undefined ? body.port : saved.port,
    username: body.username !== undefined ? body.username : saved.username,
    password: body.password || saved.password,
    fromAddress: body.fromAddress !== undefined ? body.fromAddress : saved.fromAddress,
    useTls: body.useTls !== undefined ? body.useTls : saved.useTls,
  };

  if (!cfg.host || !cfg.host.trim()) {
    return res.status(400).json({ ok: false, message: "SMTP sunucu adresi girilmedi" });
  }

  try {
    const transporter = buildTransport(cfg);
    await transporter.verify();
    res.json({ ok: true, message: "SMTP sunucusuna bağlanıldı ve kimlik doğrulandı" });
  } catch (err) {
    res.status(502).json({ ok: false, message: `Bağlantı/kimlik doğrulama başarısız: ${err.message}` });
  }
});

module.exports = router;
