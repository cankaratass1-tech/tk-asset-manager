// Ayarlar > Kimlik Doğrulama — authType (local/ldap/radius/tacacs) ve her sağlayıcının
// yapılandırmasını yönetir. smtp.js ile birebir aynı desen: maskConfig + GET/PUT + test uçları.
// Hassas alanlar (bindPassword, sharedSecret) store.js üzerinden zaten AES-256-GCM şifreli saklanır.
const express = require("express");
const { readSection, writeSection } = require("../store");
const { testLdapConnection, testRadiusConnection, testTacacsConnection } = require("../authProviders");

const router = express.Router();
const SECTION = "authConfig";

function maskConfig(cfg) {
  if (!cfg) return { authType: "local", defaultDomain: "" };
  return {
    authType: cfg.authType || "local",
    defaultDomain: cfg.defaultDomain || "",
    ldap: cfg.ldap
      ? { ...cfg.ldap, bindPassword: undefined, hasBindPassword: Boolean(cfg.ldap.bindPassword) }
      : null,
    radius: cfg.radius
      ? { ...cfg.radius, sharedSecret: undefined, hasSharedSecret: Boolean(cfg.radius.sharedSecret) }
      : null,
    tacacs: cfg.tacacs
      ? { ...cfg.tacacs, sharedSecret: undefined, hasSharedSecret: Boolean(cfg.tacacs.sharedSecret) }
      : null,
  };
}

router.get("/", (req, res) => {
  res.json(maskConfig(readSection(SECTION)));
});

router.put("/", (req, res) => {
  const body = req.body || {};
  const existing = readSection(SECTION) || {};
  const next = {
    authType: body.authType || existing.authType || "local",
    defaultDomain: body.defaultDomain ?? existing.defaultDomain ?? "",
    ldap: body.ldap
      ? { ...existing.ldap, ...body.ldap, bindPassword: body.ldap.bindPassword || existing.ldap?.bindPassword || "" }
      : existing.ldap || null,
    radius: body.radius
      ? { ...existing.radius, ...body.radius, sharedSecret: body.radius.sharedSecret || existing.radius?.sharedSecret || "" }
      : existing.radius || null,
    tacacs: body.tacacs
      ? { ...existing.tacacs, ...body.tacacs, sharedSecret: body.tacacs.sharedSecret || existing.tacacs?.sharedSecret || "" }
      : existing.tacacs || null,
  };
  writeSection(SECTION, next);
  res.json(maskConfig(next));
});

function withSavedSecret(body, saved, provider, secretField) {
  if (!body[provider]) return saved?.[provider] || {};
  const cfg = { ...body[provider] };
  if (!cfg[secretField]) cfg[secretField] = saved?.[provider]?.[secretField] || "";
  return cfg;
}

router.post("/test-ldap", async (req, res) => {
  const saved = readSection(SECTION) || {};
  const cfg = withSavedSecret(req.body || {}, saved, "ldap", "bindPassword");
  const result = await testLdapConnection(cfg);
  res.status(result.ok ? 200 : 502).json(result);
});

router.post("/test-radius", async (req, res) => {
  const saved = readSection(SECTION) || {};
  const cfg = withSavedSecret(req.body || {}, saved, "radius", "sharedSecret");
  const { testUsername, testPassword } = req.body || {};
  const result = await testRadiusConnection(cfg, testUsername, testPassword);
  res.status(result.ok ? 200 : 502).json(result);
});

router.post("/test-tacacs", async (req, res) => {
  const saved = readSection(SECTION) || {};
  const cfg = withSavedSecret(req.body || {}, saved, "tacacs", "sharedSecret");
  const { testUsername, testPassword } = req.body || {};
  const result = await testTacacsConnection(cfg, testUsername, testPassword);
  res.status(result.ok ? 200 : 502).json(result);
});

module.exports = router;
