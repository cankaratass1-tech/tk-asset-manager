// Kimlik doğrulama uçları için deneme sınırlayıcı (bellek içi, bağımlılıksız).
//
// Üç katman uygulanır:
//  - çift: aynı kapsam + IP + kullanıcı adı için ardışık hata sınırı (artan bekleme)
//  - kullanıcı: aynı kullanıcı adı için tüm IP'lerden ardışık hata sınırı (dağıtık deneme)
//  - IP: aynı IP için pencere içindeki toplam hata sınırı
// Başarılı doğrulama çift ve kullanıcı sayaçlarını sıfırlar, IP penceresini sıfırlamaz.
// İstemci IP'si doğrudan soket adresinden alınır (proxy başlıklarına güvenilmez).

const DEFAULTS = {
  pairMax: 5,
  userMax: 20,
  ipMax: 40,
  ipWindowMs: 10 * 60 * 1000,
  baseLockMs: 30 * 1000,
  maxLockMs: 15 * 60 * 1000,
  maxEntries: 10000,
};

function normalizeIp(addr) {
  return String(addr || "bilinmiyor").replace(/^::ffff:/, "");
}

function normalizeName(name) {
  return String(name ?? "").trim().toLowerCase().slice(0, 128);
}

function createRateLimiter(options = {}, now = () => Date.now()) {
  const cfg = { ...DEFAULTS, ...options };
  const streaks = new Map(); // anahtar -> { count, lockedUntil }
  const ipHits = new Map(); // "kapsam|ip" -> zaman damgaları

  const pairKey = ({ scope, ip, username }) => `p|${scope}|${normalizeIp(ip)}|${normalizeName(username)}`;
  const userKey = ({ scope, username }) => `u|${scope}|${normalizeName(username)}`;
  const ipKey = ({ scope, ip }) => `${scope}|${normalizeIp(ip)}`;

  function prune() {
    if (streaks.size > cfg.maxEntries) {
      const t = now();
      for (const [k, v] of streaks) if (v.lockedUntil <= t) streaks.delete(k);
      if (streaks.size > cfg.maxEntries) streaks.clear();
    }
    if (ipHits.size > cfg.maxEntries) ipHits.clear();
  }

  function recentHits(key) {
    const t = now();
    const hits = (ipHits.get(key) || []).filter((ts) => t - ts < cfg.ipWindowMs);
    if (hits.length) ipHits.set(key, hits);
    else ipHits.delete(key);
    return hits;
  }

  function bump(map, key, max) {
    const cur = map.get(key) || { count: 0, lockedUntil: 0 };
    cur.count += 1;
    if (cur.count >= max) {
      const wait = Math.min(cfg.baseLockMs * 2 ** (cur.count - max), cfg.maxLockMs);
      cur.lockedUntil = now() + wait;
    }
    map.set(key, cur);
  }

  return {
    // { allowed, retryAfterSec }
    check(ctx) {
      const t = now();
      let until = 0;
      for (const key of [pairKey(ctx), userKey(ctx)]) {
        const s = streaks.get(key);
        if (s && s.lockedUntil > until) until = s.lockedUntil;
      }
      const hits = recentHits(ipKey(ctx));
      if (hits.length >= cfg.ipMax) until = Math.max(until, hits[0] + cfg.ipWindowMs);
      if (until > t) return { allowed: false, retryAfterSec: Math.ceil((until - t) / 1000) };
      return { allowed: true, retryAfterSec: 0 };
    },
    fail(ctx) {
      prune();
      bump(streaks, pairKey(ctx), cfg.pairMax);
      bump(streaks, userKey(ctx), cfg.userMax);
      const key = ipKey(ctx);
      const hits = recentHits(key);
      hits.push(now());
      ipHits.set(key, hits);
    },
    success(ctx) {
      streaks.delete(pairKey(ctx));
      streaks.delete(userKey(ctx));
    },
    reset() {
      streaks.clear();
      ipHits.clear();
    },
  };
}

function clientIp(req) {
  return normalizeIp(req.socket && req.socket.remoteAddress);
}

function waitText(sec) {
  if (sec >= 120) return `${Math.ceil(sec / 60)} dakika`;
  return `${sec} saniye`;
}

// 429 yanıtı: Retry-After başlığı ve okunabilir mesaj. messageKey: gövdede mesajın taşındığı alan.
function blockedResponse(res, retryAfterSec, messageKey = "message") {
  const message = `Çok fazla başarısız deneme. ${waitText(retryAfterSec)} sonra tekrar deneyin.`;
  res.set("Retry-After", String(retryAfterSec));
  const body = messageKey === "error" ? { error: message } : { ok: false, message };
  return res.status(429).json({ ...body, retryAfterSec });
}

module.exports = { createRateLimiter, authLimiter: createRateLimiter(), clientIp, blockedResponse, DEFAULTS };
