// /api/mail/send için sunucu tarafı politika: alıcı doğrulama, alan adı izin listesi, boyut sınırları ve kullanıcı başına kota.
// İzin verilen alan adları MAIL_ALLOWED_DOMAINS (virgülle ayrılmış) ile verilir; boşsa alan adı kısıtı uygulanmaz.

const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@([A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})+)$/;

const LIMITS = {
  maxRecipients: 50,
  maxSubject: 250,
  maxText: 200 * 1024,
  maxHtml: 500 * 1024,
  windowMs: 60 * 60 * 1000,
  maxRecipientsPerWindow: 1000,
  maxRequestsPerWindow: 600,
};

function envInt(name, fallback) {
  const n = Number.parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function allowedDomains(env = process.env) {
  return String(env.MAIL_ALLOWED_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

function domainAllowed(domain, allowed) {
  if (!allowed.length) return true;
  const d = domain.toLowerCase();
  return allowed.some((a) => d === a || d.endsWith(`.${a}`));
}

// { ok, recipients } | { ok:false, message }
function validateRecipients(to, allowed = allowedDomains(), maxRecipients = envInt("MAIL_MAX_RECIPIENTS", LIMITS.maxRecipients)) {
  if (typeof to !== "string" || !to.trim()) return { ok: false, message: "Alıcı (to) zorunlu" };
  const parts = to.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { ok: false, message: "Alıcı (to) zorunlu" };
  if (parts.length > maxRecipients) return { ok: false, message: `Tek istekte en fazla ${maxRecipients} alıcı olabilir` };
  const seen = new Set();
  for (const p of parts) {
    const m = ADDRESS.exec(p);
    if (!m) return { ok: false, message: `Geçersiz e-posta adresi: ${p.slice(0, 80)}` };
    if (!domainAllowed(m[1], allowed)) return { ok: false, message: `Bu alan adına gönderim izinli değil: ${m[1]}` };
    seen.add(p.toLowerCase());
  }
  return { ok: true, recipients: [...seen] };
}

function validateContent({ subject, text, html }) {
  if (typeof subject !== "string" || !subject.trim()) return { ok: false, message: "Konu (subject) zorunlu" };
  if (/[\r\n]/.test(subject)) return { ok: false, message: "Konu satır sonu içeremez" };
  if (subject.length > LIMITS.maxSubject) return { ok: false, message: "Konu çok uzun" };
  if (text != null && (typeof text !== "string" || text.length > LIMITS.maxText)) return { ok: false, message: "Metin gövdesi geçersiz ya da çok uzun" };
  if (html != null && (typeof html !== "string" || html.length > LIMITS.maxHtml)) return { ok: false, message: "HTML gövdesi geçersiz ya da çok uzun" };
  return { ok: true };
}

// Kayan pencerede kullanıcı başına istek ve alıcı sayısı kotası.
function createQuota(options = {}, now = () => Date.now()) {
  const cfg = {
    windowMs: LIMITS.windowMs,
    maxRecipients: envInt("MAIL_HOURLY_RECIPIENTS", LIMITS.maxRecipientsPerWindow),
    maxRequests: envInt("MAIL_HOURLY_REQUESTS", LIMITS.maxRequestsPerWindow),
    ...options,
  };
  const hits = new Map(); // kullanıcı -> [{ t, n }]
  return {
    // { allowed, retryAfterSec }; izin verilirse kullanım kaydedilir
    take(userKey, recipientCount) {
      const t = now();
      const list = (hits.get(userKey) || []).filter((h) => t - h.t < cfg.windowMs);
      const usedRecipients = list.reduce((s, h) => s + h.n, 0);
      if (list.length + 1 > cfg.maxRequests || usedRecipients + recipientCount > cfg.maxRecipients) {
        hits.set(userKey, list);
        const retryAfterSec = list.length ? Math.max(1, Math.ceil((list[0].t + cfg.windowMs - t) / 1000)) : 1;
        return { allowed: false, retryAfterSec };
      }
      list.push({ t, n: recipientCount });
      hits.set(userKey, list);
      return { allowed: true, retryAfterSec: 0 };
    },
    reset() {
      hits.clear();
    },
  };
}

module.exports = { validateRecipients, validateContent, createQuota, allowedDomains, domainAllowed, LIMITS };
