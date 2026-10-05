const express = require("express");
const { readSection, writeSection } = require("../store");
const { ntlmGet } = require("../ntlmClient");

const router = express.Router();
const SECTION = "datasource";

// Kaydedilmiş şifre/API anahtarı istemciye ham döndürülmez, sadece "tanımlı mı" bilgisi verilir
function maskConfig(cfg) {
  if (!cfg) return null;
  return {
    url: cfg.url || "",
    authMethod: cfg.authMethod || "windows",
    username: cfg.username || "",
    hasPassword: Boolean(cfg.password),
    hasApiKey: Boolean(cfg.apiKey),
    domain: cfg.domain || "",
    workstation: cfg.workstation || "",
  };
}

router.get("/", (req, res) => {
  res.json(maskConfig(readSection(SECTION)));
});

router.put("/", (req, res) => {
  const { url, authMethod, username, password, apiKey, domain, workstation } = req.body || {};
  if (!url || !url.trim()) return res.status(400).json({ error: "url zorunlu" });

  // Boş bırakılan sır alanları eskisini korur
  const existing = readSection(SECTION) || {};
  const next = {
    url: url.trim(),
    authMethod: authMethod || "windows",
    username: username ?? existing.username ?? "",
    password: password || existing.password || "",
    apiKey: apiKey || existing.apiKey || "",
    domain: domain ?? existing.domain ?? "",
    workstation: workstation ?? existing.workstation ?? "",
  };
  writeSection(SECTION, next);
  res.json(maskConfig(next));
});

// Bağlantı testi kayıtlı ayarları kullanır; body ile geçici override edilebilir
router.post("/test", async (req, res) => {
  const saved = readSection(SECTION) || {};
  // Boş string gönderilen alanlar kayıtlı sırrı ezmez
  const overrides = Object.fromEntries(Object.entries(req.body || {}).filter(([, v]) => v !== ""));
  const cfg = { ...saved, ...overrides };

  if (!cfg.url || !cfg.url.trim()) {
    return res.status(400).json({ ok: false, message: "URL girilmedi" });
  }

  try {
    if (cfg.authMethod === "windows") {
      const result = await ntlmGet({
        url: cfg.url,
        username: cfg.username,
        password: cfg.password,
        domain: cfg.domain,
        workstation: cfg.workstation,
      });
      const ok = result.statusCode >= 200 && result.statusCode < 300;
      return res.json({
        ok,
        status: result.statusCode,
        message: ok
          ? "NTLM el sıkışması tamamlandı, sunucu yanıt verdi"
          : `Sunucu ${result.statusCode} döndü`,
      });
    }

    const headers = {};
    if (cfg.authMethod === "apikey" && cfg.apiKey) headers["x-api-key"] = cfg.apiKey;
    else if (cfg.authMethod === "basic") headers["Authorization"] = "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");

    const response = await fetch(cfg.url, { headers });
    const bodyText = await response.text();
    let recordCount = null;
    try {
      const parsed = JSON.parse(bodyText);
      if (Array.isArray(parsed)) recordCount = parsed.length;
    } catch {
      /* JSON değilse kayıt sayısı gösterilmez, yine de bağlantı sonucu raporlanır */
    }

    res.json({
      ok: response.ok,
      status: response.status,
      message: response.ok ? "Bağlantı başarılı" : `Sunucu ${response.status} döndü`,
      recordCount,
    });
  } catch (err) {
    res.status(502).json({ ok: false, message: `Sunucuya ulaşılamadı: ${err.message}` });
  }
});

module.exports = router;
