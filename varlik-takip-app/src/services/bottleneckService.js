// Bottleneck (LAKESIDE): cihaz bazında performans/dayanıklılık sinyallerini tek tabloda birleştirir.
// Sinyaller (hangi kaynak mevcutsa o hesaplanır; olmayan "Veri Yok" kalır, uydurulmaz):
//   disk       : Disk Alanı raporu (en kötü birimin serbest alan seviyesi, dashboard eşikleriyle aynı)
//   bsod       : Weekly BSOD (toplam çökme adedi)
//   battery    : Battery Health (pil sağlığı %)
//   age        : SCCM BIOS Date'ten cihaz yaşı
// SAĞLIK SKORU (0-100, yüksek = sağlıklı; düşük skor aksiyon gerektirir): 100'den her sinyalin ağırlıklı cezası düşülür, 0'ın altına inmez.
//   Ceza (uyarı / kritik):  Disk 20 / 40 · BSOD 20 / 40 · Pil 15 / 30 · Cihaz yaşı 8 / 15
//   Veri olmayan sinyal ceza almaz (uydurulmaz) ama "kaç sinyal ölçüldü" bilgisiyle birlikte gösterilir; hiç sinyal ölçülmemişse skor yoktur.
// Bantlar: 90-100 İyi · 80-89 İzle (aksiyon gerekmez) · 50-79 Aksiyon gerekli · 0-49 Acil.
// Ağırlıklar öyle seçildi ki "bottleneck" tanımıyla birebir örtüşür: bottleneck ⇔ skor < 80 (birim testi tüm sinyal kombinasyonlarında doğrular).
// Cihaz "bottleneck" sayılır: performans/dayanıklılık sinyallerinde (disk, bsod, pil) en az 1 KRİTİK ya da en az 2 UYARI varsa;
// cihaz yaşı tek başına bottleneck nedeni DEĞİLDİR (eski ama sorunsuz cihaz bottleneck değil) — yalnızca tek bir uyarıyı tamamlayıcı destekler.
const shortHost = (h) => String(h || "").trim().split(".")[0];
function deviceAgeYears(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const yrs = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return yrs >= 0 ? Math.round(yrs * 10) / 10 : null;
}

export const BOTTLENECK_THRESHOLDS = {
  bsod: { warn: 1, crit: 3 }, // toplam BSOD adedi
  battery: { warn: 80, crit: 60 }, // sağlık % (altı)
  age: { warn: 4, crit: 5 }, // yıl (üstü)
};

export const HEALTH_PENALTY = {
  disk: { warn: 20, crit: 40 },
  bsod: { warn: 20, crit: 40 },
  battery: { warn: 15, crit: 30 },
  age: { warn: 8, crit: 15 },
};
export const HEALTH_BANDS = [
  { id: "good", label: "İyi", min: 90, hint: "Aksiyon gerekmez" },
  { id: "watch", label: "İzle", min: 80, hint: "Şimdilik aksiyon gerekmez, izlenmeli" },
  { id: "action", label: "Aksiyon gerekli", min: 50, hint: "Müdahale planlanmalı" },
  { id: "urgent", label: "Acil", min: 0, hint: "Öncelikli müdahale" },
];
const ACTION_TEXT = {
  disk: "Disk alanını boşalt ya da diski genişlet",
  bsod: "BSOD kayıtlarını incele (sürücü / donanım kontrolü)",
  battery: "Pil değişimi planla",
  age: "Cihaz yenileme planına al",
};
export const bandOf = (health) => (health == null ? "nodata" : (HEALTH_BANDS.find((b) => health >= b.min) || HEALTH_BANDS[HEALTH_BANDS.length - 1]).id);
export const BAND_LABELS = { ...Object.fromEntries(HEALTH_BANDS.map((b) => [b.id, b.label])), nodata: "Veri yok" };

// signals: { disk, bsod, battery, age } → { health, measured, band, actions[] } (actions: cezası en yüksek sinyalden başlayarak)
export function healthOf(signals) {
  const ids = Object.keys(HEALTH_PENALTY);
  const measured = ids.filter((id) => signals[id] && signals[id].level !== "none").length;
  if (measured === 0) return { health: null, measured: 0, band: "nodata", actions: [] };
  const issues = ids
    .map((id) => ({ id, pen: signals[id] && HEALTH_PENALTY[id][signals[id].level] ? HEALTH_PENALTY[id][signals[id].level] : 0 }))
    .filter((x) => x.pen > 0)
    .sort((a, b) => b.pen - a.pen);
  const health = Math.max(0, 100 - issues.reduce((a, x) => a + x.pen, 0));
  return { health, measured, band: bandOf(health), actions: issues.map((x) => ACTION_TEXT[x.id]) };
}

export const SIGNALS = [
  ["disk", "Disk"],
  ["bsod", "BSOD"],
  ["battery", "Pil"],
  ["age", "Cihaz yaşı"],
];

const key = (h) => shortHost(h).toLowerCase();
const up = (value, t) => (value >= t.crit ? "crit" : value >= t.warn ? "warn" : "ok");
const down = (value, t) => (value < t.crit ? "crit" : value < t.warn ? "warn" : "ok");
const sig = (level, value, text) => ({ level, value, text });
const none = { level: "none", value: null, text: "Veri Yok" };

export function computeBottlenecks({ sccmRows = [], diskRows = [], bsodRows = [], batteryRows = [] } = {}) {
  const T = BOTTLENECK_THRESHOLDS;
  const devices = new Map();
  const get = (host) => {
    const k = key(host);
    if (!k) return null;
    if (!devices.has(k)) devices.set(k, { key: k, hostname: shortHost(host), signals: {} });
    return devices.get(k);
  };

  sccmRows.forEach((r) => {
    const d = get(r.hostname);
    if (!d || d.sccm) return;
    d.sccm = r;
    const age = deviceAgeYears(r.biosDate);
    if (age != null) d.signals.age = sig(up(age, T.age), age, `${age} yıl`);
  });
  const rank = { critical: 3, warning: 2, normal: 1, unknown: 0 };
  const worstDisk = new Map();
  diskRows.forEach((r) => {
    const k = key(r.owner);
    if (!k || r.freeSpaceGb == null) return;
    const cur = worstDisk.get(k);
    const a = rank[r.diskLevel] ?? 0;
    const b = cur ? rank[cur.diskLevel] ?? 0 : -1;
    if (!cur || a > b || (a === b && r.freeSpaceGb < cur.freeSpaceGb)) worstDisk.set(k, r);
  });
  worstDisk.forEach((r) => {
    const d = get(r.owner);
    if (!d) return;
    const level = r.diskLevel === "critical" ? "crit" : r.diskLevel === "warning" ? "warn" : r.diskLevel === "normal" ? "ok" : "none";
    d.signals.disk = level === "none" ? none : sig(level, r.freeSpaceGb, `${r.serial ? r.serial + ": " : ""}${r.freeSpaceGb.toFixed(1)} GB boş`);
  });
  const bsodSum = new Map();
  bsodRows.forEach((r) => bsodSum.set(key(r.hostname), (bsodSum.get(key(r.hostname)) || 0) + (r.count || 1)));
  bsodSum.forEach((n, k) => {
    const d = get(k);
    if (d) d.signals.bsod = sig(up(n, T.bsod), n, `${n} çökme`);
  });
  batteryRows.forEach((r) => {
    const d = get(r.hostname);
    if (d && r.batteryHealth != null) d.signals.battery = sig(down(r.batteryHealth, T.battery), r.batteryHealth, `%${r.batteryHealth}${r.cycleCount != null ? ` · ${r.cycleCount} döngü` : ""}`);
  });

  const rows = [];
  devices.forEach((d) => {
    SIGNALS.forEach(([id]) => {
      if (!d.signals[id]) d.signals[id] = none;
    });
    const levels = SIGNALS.map(([id]) => d.signals[id].level);
    const crit = levels.filter((l) => l === "crit").length;
    const warn = levels.filter((l) => l === "warn").length;
    const perf = levels.slice(0, 3); // SIGNALS sırası: disk, bsod, battery, age → ilk 3 performans/dayanıklılık sinyali (yaş yalnız destekler)
    const perfCrit = perf.filter((l) => l === "crit").length;
    const perfWarn = perf.filter((l) => l === "warn").length;
    const primaryId = (SIGNALS.find(([id]) => d.signals[id].level === "crit") || SIGNALS.find(([id]) => d.signals[id].level === "warn") || [])[0] || "";
    const s = d.sccm || {};
    rows.push({
      key: d.key,
      hostname: d.hostname,
      serial: s.serial || "",
      user: s.userLabel && s.userLabel !== "Tespit Edilemedi" ? s.userLabel : "",
      location: s.location && s.location !== "—" ? s.location : "",
      company: s.company || "",
      model: s.deviceModel || "",
      signals: d.signals,
      crit,
      warn,
      ...healthOf(d.signals), // health (0-100), measured, band, actions
      primary: primaryId,
      isBottleneck: perfCrit >= 1 || perfWarn >= 2 || (perfWarn >= 1 && d.signals.age.level !== "ok" && d.signals.age.level !== "none"),
    });
  });
  // En düşük sağlık skoru (en acil) üstte; skoru olmayanlar sonda
  rows.sort((a, b) => (a.health ?? 101) - (b.health ?? 101) || b.crit - a.crit || a.hostname.localeCompare(b.hostname));

  const bn = rows.filter((r) => r.isBottleneck);
  const byCause = Object.fromEntries(SIGNALS.map(([id]) => [id, bn.filter((r) => r.signals[id].level === "crit" || r.signals[id].level === "warn").length]));
  const available = Object.fromEntries(SIGNALS.map(([id]) => [id, rows.some((r) => r.signals[id].level !== "none")]));
  const byBand = { good: 0, watch: 0, action: 0, urgent: 0, nodata: 0 };
  rows.forEach((r) => { byBand[r.band] += 1; });
  const scored = rows.filter((r) => r.health != null);
  const avgHealth = scored.length ? Math.round((scored.reduce((a, r) => a + r.health, 0) / scored.length) * 10) / 10 : null;
  return {
    rows,
    summary: { analyzed: rows.length, bottleneck: bn.length, critical: bn.filter((r) => r.crit > 0).length, multi: bn.filter((r) => r.crit + r.warn >= 2).length, byCause, available, byBand, avgHealth },
  };
}
