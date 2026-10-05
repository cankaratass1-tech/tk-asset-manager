// Zamanlanmış Otomatik Tarama (bkz. konuşma: "yeni uyuşmazlıkları özetler" — Ayarlar > Veri
// Input ekranında önceden sadece görsel/demo bir bölümdü, burada GERÇEK çalışır hale getirildi).
//
// Frontend'deki comparisonService.js (ES module, Vite/tarayıcı için) burada require EDİLEMEZ —
// backend CommonJS. Bu yüzden sadece bu özellik için gereken İKİ kontrolün (Mükerrer Çift Zimmet,
// Lokasyon Hostname/IP Uyuşmazlığı) minimal bir kopyası burada tutuluyor — mantık frontend'deki
// gerçek servislerle (comparisonService.js / locationIpService.js) AYNI kalmalı, biri değişirse
// diğeri de güncellenmeli.
//
// Akış: her N dakikada bir "tick" — zamanı gelmişse tarar, önceki taramadaki bilinen anomali
// anahtar kümesiyle (knownKeys) karşılaştırır, YENİ çıkanları mail atar. İlk çalıştırmada mail
// atılmaz (henüz "önce" yok) — sadece baseline (mevcut durum) kaydedilir.
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { readSection, writeSection } = require("./store");
const { loadLatestReport } = require("./excelSource");
const { buildTransport } = require("./mailTransport");

const SECTION = "anomalySchedule";
const DAY_MAP = { Pazartesi: 1, Salı: 2, Çarşamba: 3, Perşembe: 4, Cuma: 5 };
const TICK_MS = 5 * 60 * 1000; // 5 dakikada bir kontrol — gerçek çalışma sadece zamanı geldiğinde

function col(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return String(row[name]).trim();
  }
  return "";
}
const norm = (v) => String(v || "").trim().toLowerCase();

function extractLocationCode(value) {
  const m = String(value || "").trim().match(/^([A-Za-zÇĞİÖŞÜçğıöşü]+)(\d)/);
  return m ? (m[1] + m[2]).toUpperCase() : "";
}
function ipPrefix(ip) {
  const parts = String(ip || "").trim().split(".");
  return parts.length >= 3 ? parts.slice(0, 3).join(".") : "";
}

function defaultConfig() {
  return { enabled: false, cadence: "weekly", day: "Pazartesi", time: "09:00", recipients: [], lastRunAt: null, knownKeys: [] };
}

function currentConfig() {
  const saved = readSection(SECTION) || {};
  return { ...defaultConfig(), ...saved, recipients: Array.isArray(saved.recipients) ? saved.recipients : [] };
}

function computeNextRun(cfg, afterDate) {
  const [hh, mm] = (cfg.time || "09:00").split(":").map((n) => Number(n) || 0);
  if (cfg.cadence === "daily") {
    const next = new Date(afterDate);
    next.setHours(hh, mm, 0, 0);
    if (next <= afterDate) next.setDate(next.getDate() + 1);
    return next;
  }
  if (cfg.cadence === "monthly") {
    const next = new Date(afterDate);
    next.setHours(hh, mm, 0, 0);
    if (next <= afterDate) next.setMonth(next.getMonth() + 1);
    return next;
  }
  // weekly (varsayılan)
  const targetDow = DAY_MAP[cfg.day] ?? 1;
  const next = new Date(afterDate);
  next.setHours(hh, mm, 0, 0);
  const diff = (targetDow - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + diff);
  if (next <= afterDate) next.setDate(next.getDate() + 7);
  return next;
}

// ---- TH: Mükerrer Çift Zimmet (comparisonService.js'teki mantıkla AYNI, sadece TH gerekir) ----
function findDuplicateNotebooks(thRawRows) {
  const rows = thRawRows.map((raw) => ({
    serial: col(raw, "Seri No"),
    owner: col(raw, "Sahibi"),
    ownerUsername: col(raw, "Owner Username"),
    ownerSicil: col(raw, "Cihaz Sahibinin Sicili"),
    deviceType: col(raw, "Model"),
    assignmentType: col(raw, "Konum Kategorisi") || col(raw, "LBS Location Parent"),
  }));
  const identity = (r) => norm(r.ownerUsername) || norm(r.ownerSicil) || norm(r.owner);
  const groups = new Map();
  rows
    .filter((r) => r.deviceType === "NOTEBOOK" && r.assignmentType === "User")
    .forEach((r) => {
      const id = identity(r);
      if (!id) return;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(r);
    });
  const anomalies = [];
  groups.forEach((rs) => {
    if (rs.length > 1) rs.forEach((r) => anomalies.push({ key: `dup:${r.serial}`, label: `${r.owner} — ${r.serial} (mükerrer, ${rs.length} notebook)` }));
  });
  return anomalies;
}

// ---- SCCM × Lokasyon Mail Listesi: Hostname/IP Uyuşmazlığı (locationIpService.js ile AYNI) ----
function findLocationIpMismatches(sccmRawRows, lokasyonRawRows) {
  const nameByCode = new Map();
  const prefixesByName = new Map();
  const displayNameByNorm = new Map();
  lokasyonRawRows.forEach((raw) => {
    const kod = col(raw, "Lokasyon Kodu");
    const name = col(raw, "Açık Lokasyon Adı");
    const ip = col(raw, "IP_Address");
    if (!name) return;
    const nkey = norm(name);
    if (!displayNameByNorm.has(nkey)) displayNameByNorm.set(nkey, name);
    const code = extractLocationCode(kod);
    if (code && !nameByCode.has(code)) nameByCode.set(code, nkey);
    const pfx = ipPrefix(ip);
    if (pfx) {
      if (!prefixesByName.has(nkey)) prefixesByName.set(nkey, new Set());
      prefixesByName.get(nkey).add(pfx);
    }
  });

  const anomalies = [];
  sccmRawRows.forEach((raw) => {
    const hostname = col(raw, "Hostname");
    const serial = col(raw, "Serial Number") || hostname;
    const code = extractLocationCode(hostname);
    if (!code) return;
    const nkey = nameByCode.get(code);
    if (!nkey) return;
    const devicePrefixes = Array.from(
      new Set(
        col(raw, "IPAddresses")
          .split(",")
          .map((x) => x.trim())
          .filter((x) => x.startsWith("172."))
          .map(ipPrefix)
          .filter(Boolean)
      )
    );
    if (devicePrefixes.length === 0) return;
    const expectedPrefixes = Array.from(prefixesByName.get(nkey) || []);
    const matched = devicePrefixes.some((p) => expectedPrefixes.includes(p));
    if (!matched) {
      anomalies.push({ key: `ip:${serial}`, label: `${hostname} (${code}) — "${displayNameByNorm.get(nkey)}" ile eşleşmiyor (gerçek IP: ${devicePrefixes.join(", ")})` });
    }
  });
  return anomalies;
}

async function sendDigestMail(cfg, newAnomalies) {
  const smtpCfg = readSection("smtp");
  if (!smtpCfg || !smtpCfg.host) throw new Error("SMTP ayarları tanımlı değil");
  const transporter = buildTransport(smtpCfg);
  const rows = newAnomalies.map((a) => `<li>${a.label}</li>`).join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6;">
    <p>Merhabalar,</p>
    <p>Otomatik taramada <strong>${newAnomalies.length} yeni uyuşmazlık</strong> tespit edildi:</p>
    <ul>${rows}</ul>
    <p>Detaylar için Varlık Takip uygulamasındaki Zimmet Uyuşmazlığı ve Lokasyon Hostname ve IP Uyuşmazlığı raporlarını inceleyebilirsiniz.</p>
  </div>`;
  const info = await transporter.sendMail({
    from: smtpCfg.fromAddress || smtpCfg.username,
    to: cfg.recipients.join(", "),
    subject: `Otomatik Tarama — ${newAnomalies.length} Yeni Uyuşmazlık`,
    text: `${newAnomalies.length} yeni uyuşmazlık tespit edildi:\n\n${newAnomalies.map((a) => `- ${a.label}`).join("\n")}`,
    html,
  });
  return { messageId: info.messageId, previewUrl: nodemailer.getTestMessageUrl(info) || undefined };
}

async function runScan({ force = false } = {}) {
  const cfg = currentConfig();
  const fileSourceCfg = readSection("fileSource") || {};
  if (!fileSourceCfg.folderPath) throw new Error("Dosya kaynağı klasörü tanımlı değil");

  const th = loadLatestReport(fileSourceCfg.folderPath, "TH", { sheetIndex: 0, headerRow: 0 }).rows;
  const sccm = loadLatestReport(fileSourceCfg.folderPath, "SCCM Inventory Report", { sheetIndex: 0, headerRow: 3 }).rows;
  let lokasyon = [];
  try {
    lokasyon = loadLatestReport(fileSourceCfg.folderPath, "LokasyonMailListesi", { sheetIndex: 0, headerRow: 0 }).rows;
  } catch {
    // Lokasyon Mail Listesi henüz yüklenmemişse sadece Mükerrer Çift Zimmet kontrolü çalışır.
  }

  const anomalies = [...findDuplicateNotebooks(th), ...findLocationIpMismatches(sccm, lokasyon)];
  const currentKeys = anomalies.map((a) => a.key);
  const knownKeys = new Set(cfg.knownKeys || []);
  const isFirstRun = !cfg.lastRunAt;
  const newAnomalies = isFirstRun ? [] : anomalies.filter((a) => !knownKeys.has(a.key));

  let mailResult = null;
  if (newAnomalies.length > 0 && cfg.recipients.length > 0) {
    mailResult = await sendDigestMail(cfg, newAnomalies);
  }

  writeSection(SECTION, { ...cfg, lastRunAt: new Date().toISOString(), knownKeys: currentKeys });
  return { isFirstRun, totalAnomalies: anomalies.length, newCount: newAnomalies.length, newAnomalies, mailResult };
}

let intervalHandle = null;

function tick() {
  const cfg = currentConfig();
  if (!cfg.enabled || cfg.recipients.length === 0) return;
  const last = cfg.lastRunAt ? new Date(cfg.lastRunAt) : new Date();
  const nextRun = computeNextRun(cfg, last);
  if (new Date() >= nextRun) {
    runScan().catch((err) => console.error("[anomalyScheduler] Tarama başarısız:", err.message));
  }
}

function start() {
  if (intervalHandle) return;
  intervalHandle = setInterval(tick, TICK_MS);
  // Sunucu her açıldığında bir kere de hemen kontrol et (zamanı gelmişse beklemeden çalışsın).
  tick();
}

module.exports = { start, runScan, currentConfig, SECTION };
