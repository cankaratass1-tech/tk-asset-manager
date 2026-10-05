const express = require("express");
const bcrypt = require("bcryptjs");
const users = require("../users");
const session = require("../session");
const { authenticate, getAuthConfig, hashPassword } = require("../authProviders");
const { requireAuth } = require("../authMiddleware");

const router = express.Router();

// Başarısız login denemeleri loglanır — kullanıcı adı + zaman damgası, ŞİFRE ASLA LOGLANMAZ (gereksinim #9)
function logFailedAttempt(username) {
  console.warn(`[auth] Başarısız giriş denemesi — kullanıcı: ${username || "(boş)"}  zaman: ${new Date().toISOString()}`);
}

router.get("/setup-status", (req, res) => {
  res.json({ needsSetup: !users.hasMasterUser() });
});

// İlk kurulum: Master User oluşturma. Master zaten varsa tekrar oluşturmaya izin vermez.
router.post("/setup-master", async (req, res) => {
  if (users.hasMasterUser()) {
    return res.status(409).json({ ok: false, message: "Master User zaten oluşturulmuş" });
  }
  const { username, password } = req.body || {};
  if (!username || !username.trim()) return res.status(400).json({ ok: false, message: "Kullanıcı adı zorunlu" });
  if (!password || password.length < 8) {
    return res.status(400).json({ ok: false, message: "Şifre en az 8 karakter olmalı" });
  }
  const passwordHash = await hashPassword(password);
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
  const result = await authenticate({ domain, username, password });
  if (!result.ok) {
    logFailedAttempt(username);
    return res.status(401).json({ ok: false, message: result.message || "Kullanıcı adı, şifre veya domain hatalı" });
  }
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
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ ok: false, message: "Yeni şifre en az 8 karakter olmalı" });
  }
  const user = users.findById(req.user.id);
  if (!user || !user.passwordHash) {
    return res.status(400).json({ ok: false, message: "Bu hesap için yerel şifre değişikliği desteklenmiyor (LDAP/RADIUS/TACACS+ ile giriş yapıldı)" });
  }
  const match = await bcrypt.compare(currentPassword || "", user.passwordHash);
  if (!match) return res.status(401).json({ ok: false, message: "Mevcut şifre hatalı" });

  user.passwordHash = await hashPassword(newPassword);
  users.saveUser(user);
  res.json({ ok: true });
});

module.exports = router;
