// Genel API korumasi: Authorization: Bearer <token> header'ini session.js ile dogrular ve
// req.user'i set eder. Ayarlar altindaki eski x-admin-username/password kapisi (auth.js,
// requireSettingsAuth) mevcut calisan akisi bozmamak icin ayri tutulur ve dokunulmaz — bu
// middleware sadece daha once tamamen acik olan /api/mail ve /api/reports icin ve yeni
// /api/settings/authsettings (Master-only) icin kullanilir.
const session = require("./session");
const users = require("./users");

function requireAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token ? session.verify(token) : null;
  if (!payload) return res.status(401).json({ error: "Yetkisiz — giriş yapmalısınız" });
  const user = users.findById(payload.userId);
  if (!user) return res.status(401).json({ error: "Yetkisiz — kullanıcı bulunamadı" });
  req.user = users.publicUser(user);
  next();
}

function requireMasterAuth(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "master") {
      return res.status(403).json({ error: "Bu işlem için Master User yetkisi gerekli" });
    }
    next();
  });
}

module.exports = { requireAuth, requireMasterAuth };
