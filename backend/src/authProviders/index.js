// Tek giriş noktası: authenticate() önce HER ZAMAN local users store'una bakar (Master User ve
// diğer local hesaplar LDAP/RADIUS/TACACS+ yapılandırmasından bağımsız çalışmalı — gereksinim #7),
// eşleşme yoksa yapılandırılmış dış authType'a (ldap/radius/tacacs) delege eder. Böylece
// authType değişse bile Master User girişi asla kesintiye uğramaz.
const { readSection } = require("../store");
const users = require("../users");
const { authenticateLocal, hashPassword } = require("./local");
const { authenticateLdap, testLdapConnection } = require("./ldap");
const { authenticateRadius, testRadiusConnection } = require("./radius");
const { authenticateTacacs, testTacacsConnection } = require("./tacacs");

function getAuthConfig() {
  return readSection("authConfig") || { authType: "local", defaultDomain: "" };
}

async function authenticate({ domain, username, password }) {
  if (!username || !password) return { ok: false, message: "Kullanıcı adı ve şifre zorunlu" };

  const localUser = users.findByUsername(username);
  if (localUser && localUser.passwordHash) {
    const result = await authenticateLocal(username, password);
    if (result.ok) users.touchLastLogin(result.user.id);
    return result;
  }

  const cfg = getAuthConfig();
  let result;
  if (cfg.authType === "ldap") {
    result = await authenticateLdap(cfg.ldap, domain, username, password);
  } else if (cfg.authType === "radius") {
    result = await authenticateRadius(cfg.radius, username, password);
  } else if (cfg.authType === "tacacs") {
    result = await authenticateTacacs(cfg.tacacs, username, password);
  } else {
    return { ok: false, message: "Kullanıcı adı veya şifre hatalı" };
  }

  if (!result.ok) return result;

  // Dış dizinde doğrulanan kullanıcı ilk kez giriyorsa yerel bir "user" rolü kaydı oluşturulur
  // (yetkilendirme/gönderim geçmişinde referans için) — şifre burada TUTULMAZ (passwordHash: null).
  let user = localUser || users.findByUsername(username);
  if (!user) user = users.createUser({ username, domain: domain || cfg.defaultDomain || "", passwordHash: null, role: "user" });
  users.touchLastLogin(user.id);
  return { ok: true, user };
}

module.exports = { authenticate, getAuthConfig, hashPassword, testLdapConnection, testRadiusConnection, testTacacsConnection };
