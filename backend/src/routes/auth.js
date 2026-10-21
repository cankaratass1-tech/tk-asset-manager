const express = require("express");
const bcrypt = require("bcryptjs");
const users = require("../users");
const session = require("../session");
const { authenticate, getAuthConfig, hashPassword } = require("../authProviders");
const { requireAuth } = require("../authMiddleware");
const { authLimiter, clientIp, blockedResponse } = require("../rateLimit");
const { verifySetupCode } = require("../setupCode");

const router = express.Router();

// Başarısız login denemeleri loglanır — kullanıcı adı, kaynak IP ve zaman damgası, ŞİFRE ASLA LOGLANMAZ (gereksinim #9)
function logFailedAttempt(username, ip, scope = "giriş") {
  console.warn(`[auth] Başarısız ${scope} denemesi — kullanıcı: ${username || "(boş)"}  ip: ${ip}  zaman: ${new Date().toISOString()}`);
}

router.get("/setup-status", (req, res) => {
  res.json({ needsSetup: !users.hasMasterUser(), requiresSetupCode: true });
});

// İlk kurulum: Master User oluşturma. Master zaten varsa tekrar oluşturmaya izin vermez.
// Kurulum kodu (bkz. setupCode.js) olmadan kimse Master olamaz; hatalı kod denemeleri sınırlanır.
router.post("/setup-master", async (req, res) => {
  if (users.hasMasterUser()) {
    return res.status(409).json({ ok: false, message: "Master User zaten oluşturulmuş" });
  }
  const ip = clientIp(req);
  const ctx = { scope: "setup", ip, username: "" };
  const gate = authLimiter.check(ctx);
  if (!gate.allowed) return blockedResponse(res, gate.retryAfterSec);

  const { username, password, setupCode } = req.body || {};
  if (typeof setupCode !== "string" || !verifySetupCode(setupCode)) {
    authLimiter.fail(ctx);
    logFailedAttempt("(kurulum)", ip, "kurulum");
    return res.status(403).json({ ok: false, message: "Kurulum kodu hatalı. Kodu sunucu konsolundan ya da SETUP_CODE ortam değişkeninden alın." });
  }
  authLimiter.success(ctx);
  if (typeof username !== "string" || !username.trim()) return res.status(400).json({ ok: false, message: "Kullanıcı adı zorunlu" });
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ ok: false, message: "Şifre en az 8 karakter olmalı" });
  }
  const passwordHash = await hashPassword(password);
  // hashPassword beklerken başka bir istek Master oluşturmuş olabilir
  if (users.hasMasterUser()) {
    return res.status(409).json({ ok: false, message: "Master User zaten oluşturulmuş" });
  }
  const user = users.createUser({ username: username.trim(), role: "master", passwordHash });
  const token = session.sign({ userId: user.id, username: user.username, role: user.role });
  res.json({ ok: true, token, user: users.publicUser(user) });
});

// Domain adı kaynak kodda hard-code edilmez — Ayarlar > Kimlik Doğrulama'da yapılandırılan
// varsayılan domain login ekranına burada servis edilir (gereksinim #6.1)
router.get("/domain", (req, res) => {
  res.json({ defaultDomain: getAuthConfig().defaultDomain || "" });
});

router.post("/login", async (req, res) => {
  const { domain, username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ ok: false, message: "Kullanıcı adı ve şifre zorunlu" });
  }
  const ip = clientIp(req);
  const ctx = { scope: "login", ip, username };
  const gate = authLimiter.check(ctx);
  if (!gate.allowed) return blockedResponse(res, gate.retryAfterSec);

  const result = await authenticate({ domain, username, password });
  if (!result.ok) {
    authLimiter.fail(ctx);
    logFailedAttempt(username, ip);
    return res.status(401).json({ ok: false, message: result.message || "Kullanıcı adı, şifre veya domain hatalı" });
  }
  authLimiter.success(ctx);
  const token = session.sign({ userId: result.user.id, username: result.user.username, role: result.user.role });
  res.json({ ok: true, token, user: users.publicUser(result.user) });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// Kullanıcının kendi şifresini değiştirmesi (Master dahil) — sadece Local hesaplar için (passwordHash
// var olanlar); LDAP/RADIUS/TACACS+ ile doğrulanan kullanıcıların şifresi burada tutulmadığından
// değiştirilemez, o değişiklik dış dizinde yapılmalı. Mevcut şifre asla loglanmaz.
router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return res.status(400).json({ ok: false, message: "Yeni şifre en az 8 karakter olmalı" });
  }
  const user = users.findById(req.user.id);
  if (!user || !user.passwordHash) {
    return res.status(400).json({ ok: false, message: "Bu hesap için yerel şifre değişikliği desteklenmiyor (LDAP/RADIUS/TACACS+ ile giriş yapıldı)" });
  }
  const ip = clientIp(req);
  const ctx = { scope: "password", ip, username: user.id };
  const gate = authLimiter.check(ctx);
  if (!gate.allowed) return blockedResponse(res, gate.retryAfterSec);
  const match = await bcrypt.compare(typeof currentPassword === "string" ? currentPassword : "", user.passwordHash);
  if (!match) {
    authLimiter.fail(ctx);
    logFailedAttempt(user.username, ip, "şifre değiştirme");
    return res.status(401).json({ ok: false, message: "Mevcut şifre hatalı" });
  }
  authLimiter.success(ctx);

  user.passwordHash = await hashPassword(newPassword);
  users.saveUser(user);
  res.json({ ok: true });
});

module.exports = router;
