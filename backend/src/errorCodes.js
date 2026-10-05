const crypto = require("crypto");

// Yol öneki -> modül kodu. Sıra önemli: daha özel olanlar önce.
const MODULES = [
  ["/api/settings/bant-genisligi-upload", "UPL"],
  ["/api/settings/battery-health-upload", "UPL"],
  ["/api/settings/smtp", "SMTP"],
  ["/api/settings/filesource", "FSRC"],
  ["/api/settings/datasource", "DSRC"],
  ["/api/settings/mailgroups", "MGRP"],
  ["/api/settings/authsettings", "AUTHCFG"],
  ["/api/settings", "SET"],
  ["/api/auth", "AUTH"],
  ["/api/mail/history", "MHST"],
  ["/api/mail", "MAIL"],
  ["/api/reports", "RPT"],
  ["/api/devices", "DEV"],
  ["/api/snapshots", "SNAP"],
  ["/api/newinstalls", "NEW"],
];

function moduleFor(url) {
  const path = url.split("?")[0];
  for (const [prefix, code] of MODULES) if (path.startsWith(prefix)) return code;
  return "SYS";
}

function codeFor(url, status) {
  if (status === 401 || status === 403) return `AUTH-${status}`;
  return `${moduleFor(url)}-${status}`;
}

// Hata yanıtlarına `code` + `errorId` ekler ve veri içermeyen tek satırlık log yazar
// (istek gövdesi/sorgu parametresi loglanmaz — yalnızca yol, kod, durum ve mesaj).
function errorCodeMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400 && body && typeof body === "object" && !Array.isArray(body) && !body.code) {
      const code = codeFor(req.originalUrl || req.url, res.statusCode);
      const errorId = crypto.randomBytes(3).toString("hex");
      body = { ...body, code, errorId };
      const msg = String(body.message || body.error || "").slice(0, 200);
      const who = req.user ? req.user.username : "-";
      console.error(`[HATA] ${code} #${errorId} ${req.method} ${(req.originalUrl || req.url).split("?")[0]} -> ${res.statusCode} kullanici=${who} mesaj="${msg}"`);
    }
    return originalJson(body);
  };
  next();
}

module.exports = { errorCodeMiddleware, codeFor };
