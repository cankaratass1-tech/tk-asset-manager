// LDAP/Active Directory kimlik doğrulaması — ldapts (pure-JS, promise tabanlı) ile bind dener.
// Config: { server, port, ldaps, baseDN, bindUser, bindPassword, authMethod }. Şifre/bindPassword
// hiçbir zaman loglanmaz; sadece hata mesajı (ldapts'ın kendi mesajı) kullanıcıya döner.
const { Client } = require("ldapts");

function buildUrl(cfg) {
  const scheme = cfg.ldaps ? "ldaps" : "ldap";
  const port = cfg.port || (cfg.ldaps ? 636 : 389);
  return `${scheme}://${cfg.server}:${port}`;
}

// Kullanıcının girdiği domain/username'i, DOMAIN\username veya UPN (username@domain) formatına çevirir —
// gereksinim #6.1: "authentication altyapısının gerektirdiği durumlarda DOMAIN\\kullanici formatında işlenebilmeli"
function toUserPrincipal(domain, username) {
  if (username.includes("\\") || username.includes("@")) return username;
  return domain ? `${domain}\\${username}` : username;
}

async function authenticateLdap(cfg, domain, username, password) {
  if (!cfg || !cfg.server) return { ok: false, message: "LDAP sunucusu yapılandırılmamış" };
  const client = new Client({ url: buildUrl(cfg), connectTimeout: 8000, timeout: 8000 });
  const bindDn = toUserPrincipal(domain || cfg.domain, username);
  try {
    await client.bind(bindDn, password);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: `LDAP kimlik doğrulama başarısız: ${err.message}` };
  } finally {
    try {
      await client.unbind();
    } catch {
      // yoksay — bağlantı zaten kapanmış olabilir
    }
  }
}

// Ayarlar > Kimlik Doğrulama sayfasındaki "Bağlantıyı Test Et" — bindUser/bindPassword ile
// servis hesabının sunucuya bağlanabildiğini doğrular (gerçek kullanıcı girişini simüle etmez).
async function testLdapConnection(cfg) {
  if (!cfg || !cfg.server) return { ok: false, message: "LDAP sunucu adresi girilmedi" };
  const client = new Client({ url: buildUrl(cfg), connectTimeout: 8000, timeout: 8000 });
  try {
    if (cfg.bindUser) {
      await client.bind(cfg.bindUser, cfg.bindPassword || "");
    } else {
      // Bind kullanıcı tanımlı değilse sadece TCP bağlantısının/sunucunun ulaşılabilir olduğu doğrulanır
      await client.bind("", "");
    }
    return { ok: true, message: "LDAP sunucusuna bağlanıldı" };
  } catch (err) {
    return { ok: false, message: `LDAP bağlantı testi başarısız: ${err.message}` };
  } finally {
    try {
      await client.unbind();
    } catch {
      // yoksay
    }
  }
}

module.exports = { authenticateLdap, testLdapConnection };
