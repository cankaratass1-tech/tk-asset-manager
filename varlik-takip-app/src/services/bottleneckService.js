// Bottleneck (LAKESIDE): cihaz bazında performans/dayanıklılık sinyallerini tek tabloda birleştirir.
// Sinyaller (hangi kaynak mevcutsa o hesaplanır; olmayan "Veri Yok" kalır, uydurulmaz):
//   cpu / ram  : Lakeside kaynak kullanımı dosyası (Avg CPU % / Avg RAM %)         — opsiyonel import
//   disk       : Disk Alanı raporu (en kötü birimin serbest alan seviyesi, dashboard eşikleriyle aynı)
//   bsod       : Weekly BSOD (toplam çökme adedi)
//   battery    : Battery Health (pil sağlığı %)
//   age        : SCCM BIOS Date'ten cihaz yaşı
// Cihaz "bottleneck" sayılır: performans/dayanıklılık sinyallerinde (cpu, ram, disk, bsod, pil) en az 1 KRİTİK ya da en az 2 UYARI varsa;
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
  cpu: { warn: 70, crit: 85 }, // ortalama CPU %
  ram: { warn: 80, crit: 90 }, // ortalama RAM %
  bsod: { warn: 1, crit: 3 }, // toplam BSOD adedi
  battery: { warn: 80, crit: 60 }, // sağlık % (altı)
  age: { warn: 4, crit: 5 }, // yıl (üstü)
};

export const SIGNALS = [
  ["cpu", "CPU"],
  ["ram", "RAM"],
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

export function computeBottlenecks({ sccmRows = [], resourceRows = [], diskRows = [], bsodRows = [], batteryRows = [] } = {}) {
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
  resourceRows.forEach((r) => {
    const d = get(r.hostname);
    if (!d) return;
    if (r.avgCpu != null) d.signals.cpu = sig(up(r.avgCpu, T.cpu), r.avgCpu, `%${r.avgCpu}${r.peakCpu != null ? ` (tepe %${r.peakCpu})` : ""}`);
    if (r.avgRam != null) d.signals.ram = sig(up(r.avgRam, T.ram), r.avgRam, `%${r.avgRam}${r.totalRamGb ? ` · ${r.totalRamGb} GB` : ""}`);
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
    const perf = levels.slice(0, 5); // SIGNALS sırası: cpu, ram, disk, bsod, battery, age → ilk 5 performans sinyali
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
      score: crit * 2 + warn,
      primary: primaryId,
      isBottleneck: perfCrit >= 1 || perfWarn >= 2 || (perfWarn >= 1 && d.signals.age.level !== "ok" && d.signals.age.level !== "none"),
    });
  });
  rows.sort((a, b) => b.score - a.score || b.crit - a.crit || a.hostname.localeCompare(b.hostname));

  const bn = rows.filter((r) => r.isBottleneck);
  const byCause = Object.fromEntries(SIGNALS.map(([id]) => [id, bn.filter((r) => r.signals[id].level === "crit" || r.signals[id].level === "warn").length]));
  const available = Object.fromEntries(SIGNALS.map(([id]) => [id, rows.some((r) => r.signals[id].level !== "none")]));
  return {
    rows,
    summary: { analyzed: rows.length, bottleneck: bn.length, critical: bn.filter((r) => r.crit > 0).length, multi: bn.filter((r) => r.crit + r.warn >= 2).length, byCause, available },
  };
}
