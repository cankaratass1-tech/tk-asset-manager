// Üst yönetim ekranı (Operasyonel Durum Özeti) hesapları. Saf fonksiyonlar: arayüzden bağımsız, testlerle doğrulanır.
//
// Veri: reportSnapshots = { [reportId]: [ { capturedAt, devices: [ { key, company, ... } ] } ] }. Her anlık kayıt (snapshot) o günkü
// SORUNLU cihazların listesidir; yani "açık" = o raporda sorunlu görünen cihaz. Aynı cihazın iki farklı konuda sorunlu olması iki
// ayrı açık bulgudur (cihaz listesi değil bulgu sayısı); bu, uygulamadaki diğer ekranlarla aynı tanımdır.
//
// Tanımlar (tüm bileşenler bunları kullanır):
//   Açık (stok)        = dönem sonundaki sorunlu cihaz sayısı
//   Dönem başı açık    = karşılaştırma tabanındaki anlık kaydın sorunlu cihaz sayısı
//   Çözülen            = tabanda sorunlu olup dönem sonunda listede olmayan cihaz
//   Yeni açılan        = tabanda yok, dönem sonunda sorunlu olan cihaz
//   Net iş akışı       = Yeni açılan − Çözülen   (pozitif: iş yükü arttı, negatif: çözülen fazla)
//   Açık değişimi      = Dönem sonu açık − Dönem başı açık  (= Net iş akışı; aynı şeyin iki yazılışı)
//   Azalma yüzdesi     = (Dönem başı − Dönem sonu) ÷ Dönem başı × 100  (başlangıç 0 ise hesaplanmaz)
//   Çözüm oranı        = Çözülen ÷ Dönem başı açık × 100   (mevcut rapor sayfalarındaki tanımla aynı)
// Dönem karşılaştırma tabanı, rapor sayfalarındaki latestPeriodSummary ile aynı kuralı izler: dönem sonundan en az `days` gün önceki
// en yeni kayıt; o kadar eski kayıt yoksa eldeki en eski kayıt (en az 1 gün önce) ve sonuç "kısa geçmiş" diye işaretlenir.
import { comparePeriods } from "./periodComparisonService.js";
import { OVERVIEW_REPORTS } from "./dashboardOverviewService.js";

const DAY = 86400000;
export const RANGE_DAYS = { week: 7, month: 30, quarter: 90 };
export const RANGE_LABELS = { week: "Haftalık", month: "Aylık", quarter: "Son 3 ay", custom: "Özel aralık" };
export const CATEGORY_LABELS = { inaktif: "İnaktif cihaz", zimmet: "Hatalı zimmet", disk: "Kritik disk", kullanilmayan: "Kullanılmayan cihaz" };

const ms = (s) => new Date(s.capturedAt).getTime();
const validSorted = (snaps) => [...(snaps || [])].filter((s) => Number.isFinite(ms(s))).sort((a, b) => ms(a) - ms(b));
export const round1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const iso = (t) => new Date(t).toISOString();

// Yüzde değişim (önceki → şimdiki); önceki 0 ya da yoksa null (sıfıra bölme yok).
export function pctDelta(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return round1(((curr - prev) / Math.abs(prev)) * 100);
}

// Tek rapor için bir pencere: uç kayıt (≤ endMs) ve karşılaştırma tabanı. Yeterli geçmiş yoksa null.
export function windowSummary(snapshots, { endMs = Infinity, days = 7, startMs = null, filterFn = () => true } = {}) {
  const ends = validSorted(snapshots).filter((s) => ms(s) <= endMs);
  if (!ends.length) return null;
  const curr = ends[ends.length - 1];
  const older = ends.slice(0, -1).filter((s) => ms(curr) - ms(s) >= DAY);
  if (!older.length) return null;
  const target = startMs != null ? startMs : ms(curr) - days * DAY; // özel aralıkta taban: aralığın başlangıcından önceki son kayıt
  const base = older.filter((s) => ms(s) <= target);
  const prev = base.length ? base[base.length - 1] : older[0];
  const c = comparePeriods(prev, curr, filterFn).counts;
  return {
    prev, curr,
    prevAt: iso(ms(prev)), currAt: iso(ms(curr)),
    spanDays: round1((ms(curr) - ms(prev)) / DAY),
    partial: base.length === 0,
    openStart: c.devamEden + c.cozulen,
    openEnd: c.devamEden + c.yeniTespit,
    devam: c.devamEden, cozulen: c.cozulen, yeni: c.yeniTespit,
  };
}

// Pencere özetlerini (rapor başına) tek metrik kümesine toplar.
export function metricsFrom(list) {
  if (!list.length) return null;
  const sum = (k) => list.reduce((a, w) => a + w[k], 0);
  const openStart = sum("openStart"), openEnd = sum("openEnd"), cozulen = sum("cozulen"), yeni = sum("yeni");
  return {
    openStart, openEnd, cozulen, yeni,
    delta: openEnd - openStart,
    net: yeni - cozulen,
    decreasePct: openStart > 0 ? round1(((openStart - openEnd) / openStart) * 100) : null,
    resolveRate: openStart > 0 ? round1((cozulen / openStart) * 100) : null,
  };
}

const startOfDay = (d) => new Date(`${d}T00:00:00`).getTime();
const endOfDay = (d) => new Date(`${d}T23:59:59.999`).getTime();

export function latestSnapshotMs(reportSnapshots, reports = OVERVIEW_REPORTS) {
  let m = -Infinity;
  reports.forEach((r) => validSorted(reportSnapshots[r]).forEach((s) => { m = Math.max(m, ms(s)); }));
  return Number.isFinite(m) ? m : null;
}

// Seçilen dönem için tüm göstergeler. company: "all" | şirket adı (snapshot cihazlarındaki `company`).
export function computeExecutive(reportSnapshots = {}, { range = "week", from = "", to = "", company = "all", reports = OVERVIEW_REPORTS } = {}) {
  const latest = latestSnapshotMs(reportSnapshots, reports);
  if (latest == null) return { status: "empty", range, company };
  const filterFn = company === "all" ? () => true : (d) => d.company === company;
  let endMs = latest;
  let startMs = null;
  let days = RANGE_DAYS[range] || 7;
  if (range === "custom") {
    const toMs = to ? endOfDay(to) : latest;
    const fromMs = from ? startOfDay(from) : toMs - 7 * DAY;
    if (!(fromMs < toMs)) return { status: "invalid-range", range, company };
    endMs = toMs;
    startMs = fromMs;
    days = Math.max(1, Math.round((toMs - fromMs) / DAY));
  }

  const per = {};
  reports.forEach((r) => {
    const cur = windowSummary(reportSnapshots[r], { endMs, days, startMs, filterFn });
    let prv = null;
    // Önceki eşdeğer dönem: mevcut dönemin tabanında biten, aynı uzunlukta pencere. Yeterli geçmiş yoksa (kısa) kullanılmaz.
    if (cur && !cur.partial) {
      prv = windowSummary(reportSnapshots[r], { endMs: ms(cur.prev), days, filterFn });
      if (prv && prv.partial) prv = null;
    }
    per[r] = { cur, prv };
  });

  const have = reports.filter((r) => per[r].cur);
  const missing = reports.filter((r) => !per[r].cur);
  if (!have.length) return { status: "insufficient", range, company, days, endAt: iso(endMs), latestAt: iso(latest), missing };

  const current = metricsFrom(have.map((r) => per[r].cur));
  const prvList = have.map((r) => per[r].prv);
  const previous = prvList.every(Boolean) ? metricsFrom(prvList) : null;
  const partial = have.some((r) => per[r].cur.partial);
  const startAt = iso(Math.min(...have.map((r) => ms(per[r].cur.prev))));
  const currAt = iso(Math.max(...have.map((r) => ms(per[r].cur.curr))));

  const change = (k) => (previous ? { abs: current[k] - previous[k], pct: pctDelta(current[k], previous[k]) } : null);
  const changes = previous ? { openEnd: change("openEnd"), cozulen: change("cozulen"), yeni: change("yeni"), net: change("net") } : null;

  const categories = reports.map((r) => {
    const cur = per[r].cur;
    const m = cur ? metricsFrom([cur]) : null;
    const pm = per[r].prv ? metricsFrom([per[r].prv]) : null;
    let state = "nodata";
    if (m) state = m.delta < 0 ? "improved" : m.delta > 0 ? "worse" : "flat";
    return { id: r, label: CATEGORY_LABELS[r] || r, metrics: m, previous: pm, state };
  });

  return {
    status: "ok", range, company, days, partial,
    startAt, currAt, spanDays: Math.max(...have.map((r) => per[r].cur.spanDays)),
    missing, current, previous, changes, categories,
    previousRange: previous ? { startAt: iso(Math.min(...have.map((r) => ms(per[r].prv.prev)))), endAt: iso(Math.max(...have.map((r) => ms(per[r].prv.curr)))) } : null,
    perReport: per,
  };
}

// Şirketler: snapshot cihazlarında görülen şirket adları (boş olanlar sayılmaz).
export function companiesIn(reportSnapshots = {}, reports = OVERVIEW_REPORTS) {
  const set = new Set();
  reports.forEach((r) => (reportSnapshots[r] || []).forEach((s) => (s.devices || []).forEach((d) => { if (d.company) set.add(d.company); })));
  return [...set].sort();
}

// Şirket karşılaştırması: aynı dönem ve aynı tanımlarla her şirket ayrı hesaplanır. Disk raporunda şirket bilgisi her zaman olmayabilir
// (şirket seçilince disk bulguları yalnızca şirketi bilinenlerden sayılır); bu yüzden toplam ≥ şirketlerin toplamı olabilir.
export function companyComparison(reportSnapshots, opts) {
  return companiesIn(reportSnapshots, opts?.reports || OVERVIEW_REPORTS).map((c) => ({ company: c, result: computeExecutive(reportSnapshots, { ...opts, company: c }) }));
}

// ----- Zaman serisi (grafik) -----
// Noktalar = seçilen pencere içindeki gerçek anlık kayıt zamanları. İlk nokta her raporun karşılaştırma tabanı, son nokta her raporun
// son kaydıdır (KPI ile aynı uçlar). Aradaki noktada her rapor "o ana kadarki son kaydı" ile temsil edilir; kaydı olmayan rapor varsa
// o nokta çizilmez (eksik veriyi tahmin etmeyiz).
export function buildSeries(reportSnapshots, exec, { reports = OVERVIEW_REPORTS, filterFn = () => true } = {}) {
  if (!exec || exec.status !== "ok") return [];
  const have = reports.filter((r) => exec.perReport[r]?.cur);
  const startMs = Math.min(...have.map((r) => ms(exec.perReport[r].cur.prev)));
  const endMs = Math.max(...have.map((r) => ms(exec.perReport[r].cur.curr)));
  const lists = {};
  have.forEach((r) => { lists[r] = validSorted(reportSnapshots[r]); });
  const times = new Set([startMs, endMs]);
  have.forEach((r) => lists[r].forEach((s) => { if (ms(s) >= startMs && ms(s) <= endMs) times.add(ms(s)); }));
  const sortedTimes = [...times].sort((a, b) => a - b);

  const stateAt = (r, t) => {
    if (t === startMs) return exec.perReport[r].cur.prev;
    if (t === endMs) return exec.perReport[r].cur.curr;
    let pick = null;
    lists[r].forEach((s) => { if (ms(s) <= t) pick = s; });
    return pick;
  };

  const points = [];
  let prevStates = null;
  sortedTimes.forEach((t) => {
    const states = {};
    for (const r of have) { const s = stateAt(r, t); if (!s) return; states[r] = s; }
    let open = 0, cozulen = 0, yeni = 0;
    const perOpen = {};
    have.forEach((r) => {
      const cnt = comparePeriods(states[r], states[r], filterFn).counts; // tekilleştirilmiş açık sayısı
      perOpen[r] = cnt.devamEden;
      open += cnt.devamEden;
      if (prevStates) {
        const c = comparePeriods(prevStates[r], states[r], filterFn).counts;
        cozulen += c.cozulen; yeni += c.yeniTespit;
      }
    });
    points.push({ t, at: iso(t), open, perOpen, cozulen: prevStates ? cozulen : null, yeni: prevStates ? yeni : null, net: prevStates ? yeni - cozulen : null });
    prevStates = states;
  });
  return points;
}

// Çok sık kayıt varsa gösterim için günlük / haftalık / aylık gruplar. Grup içindeki adımların çözülen/yeni toplamı alınır; açık değer
// grubun son noktasıdır. Böylece her grupta  açık(sonraki) − açık(önceki) = yeni − çözülen  eşitliği korunur.
export function bucketSeries(points, spanDays) {
  if (!points.length) return [];
  const mode = spanDays <= 45 ? "day" : spanDays <= 200 ? "week" : "month";
  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (t) => {
    const d = new Date(t);
    if (mode === "day") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (mode === "month") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - dow);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  };
  const labelOf = (t) => {
    const d = new Date(t);
    if (mode === "month") return d.toLocaleDateString("tr-TR", { month: "short", year: "2-digit" });
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
  };
  const groups = new Map();
  points.forEach((p, i) => {
    const k = i === 0 ? "__baslangic__" : keyOf(p.t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  });
  return [...groups.values()].map((g) => {
    const last = g[g.length - 1];
    const flows = g.filter((p) => p.cozulen != null);
    const cozulen = flows.length ? flows.reduce((a, p) => a + p.cozulen, 0) : null;
    const yeni = flows.length ? flows.reduce((a, p) => a + p.yeni, 0) : null;
    return { t: last.t, at: last.at, label: labelOf(last.t), open: last.open, perOpen: last.perOpen, cozulen, yeni, net: cozulen == null ? null : yeni - cozulen };
  });
}

// ----- Yönetici özeti (dinamik, veriye dayalı) -----
const nf = (n) => Number(n).toLocaleString("tr-TR");
const pf = (p) => `%${Number(p).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

export function buildNarrative(exec, companies = []) {
  if (!exec || exec.status !== "ok") {
    return { positive: "Yeterli veri yok.", attention: "Yeterli veri yok.", action: "Karşılaştırma için en az iki farklı günde veri yüklemesi gerekir.", notes: [] };
  }
  const { current: c, categories, previous } = exec;
  const notes = [];
  if (exec.partial) notes.push(`Geçmiş seçilen dönemden kısa: karşılaştırma ${nf(exec.spanDays)} günlük gerçek aralığa dayanıyor.`);
  if (!previous && !exec.partial) notes.push("Önceki eşdeğer dönem için yeterli geçmiş veri yok; dönemler arası karşılaştırma gösterilmiyor.");
  if (exec.missing.length) notes.push(`${exec.missing.map((r) => CATEGORY_LABELS[r] || r).join(", ")} için yeterli veri olmadığından toplama dahil edilmedi.`);

  const withM = categories.filter((k) => k.metrics);
  const improved = withM.filter((k) => k.state === "improved").sort((a, b) => (b.metrics.decreasePct ?? -1) - (a.metrics.decreasePct ?? -1) || a.metrics.delta - b.metrics.delta);
  const worse = withM.filter((k) => k.state === "worse").sort((a, b) => b.metrics.delta - a.metrics.delta);

  let positive;
  if (c.delta < 0) {
    positive = `Açık bulgu ${nf(c.openStart)} → ${nf(c.openEnd)}: ${nf(-c.delta)} azaldı${c.decreasePct != null ? ` (${pf(c.decreasePct)})` : ""}.`;
    if (improved.length) positive += ` En belirgin iyileşme ${improved[0].label} alanında (${nf(improved[0].metrics.openStart)} → ${nf(improved[0].metrics.openEnd)}).`;
  } else if (improved.length) {
    positive = `${improved[0].label} alanında açık bulgu ${nf(improved[0].metrics.openStart)} → ${nf(improved[0].metrics.openEnd)} düştü; toplamda ise iyileşme görülmedi.`;
  } else {
    positive = "Bu dönemde açık bulgu sayısında düşüş görülmedi.";
  }

  let attention;
  if (c.net > 0) {
    attention = `Yeni açılan iş (${nf(c.yeni)}) çözülenden (${nf(c.cozulen)}) ${nf(c.net)} fazla; açık iş yükü büyüyor.`;
    if (worse.length) attention += ` En çok artış ${worse[0].label} alanında (+${nf(worse[0].metrics.delta)}).`;
  } else if (worse.length) {
    attention = `${worse[0].label} alanında açık bulgu ${nf(worse[0].metrics.openStart)} → ${nf(worse[0].metrics.openEnd)} arttı (+${nf(worse[0].metrics.delta)}); toplam azalsa da bu alan ters yönde ilerliyor.`;
  } else if (c.openEnd > 0) {
    const top = [...withM].sort((a, b) => b.metrics.openEnd - a.metrics.openEnd)[0];
    attention = `Ters yönde ilerleyen alan yok; ancak ${nf(c.openEnd)} açık bulgu sürüyor ve en yüksek yük ${top.label} alanında (${nf(top.metrics.openEnd)}).`;
  } else {
    attention = "Dönem sonunda açık bulgu kalmadı.";
  }
  const withRate = companies.filter((x) => x.result.status === "ok" && x.result.current.resolveRate != null);
  if (withRate.length >= 2) {
    const sorted = [...withRate].sort((a, b) => b.result.current.resolveRate - a.result.current.resolveRate);
    const hi = sorted[0], lo = sorted[sorted.length - 1];
    if (hi.result.current.resolveRate - lo.result.current.resolveRate >= 5) {
      attention += ` Çözüm oranı ${hi.company} ${pf(hi.result.current.resolveRate)}, ${lo.company} ${pf(lo.result.current.resolveRate)}; iş hacimleri farklı olduğundan yalnızca oranlar karşılaştırılabilir.`;
    }
  }

  let action;
  const focus = worse[0] || [...withM].sort((a, b) => b.metrics.openEnd - a.metrics.openEnd)[0];
  if (c.openEnd === 0) action = "Açık bulgu kalmadığı için ek aksiyon gerekmiyor; mevcut durumun korunması izlenebilir.";
  else if (focus) {
    action = worse.length
      ? `${focus.label} alanında dönem içinde ${nf(focus.metrics.yeni)} yeni bulgu çıktı, ${nf(focus.metrics.cozulen)} bulgu çözüldü. Bu alan için öncelik ve sorumluluk atamasının gözden geçirilmesi değerlendirilebilir.`
      : `En yüksek açık yük ${focus.label} alanında (${nf(focus.metrics.openEnd)}). Bu alandaki bekleyen işlerin sahiplerine göre takip edilmesi değerlendirilebilir.`;
    action += " Veriler ilişkiyi gösterir; nedensellik bu verilerle doğrulanamaz.";
  } else action = "Aksiyon önermek için yeterli veri yok.";
  return { positive, attention, action, notes };
}

// Veriye dayalı uyarılar. Tanımlı eşik/hedef olmadığı için yalnızca ölçülen yönler (artış, çözülenden fazla yeni vb.) raporlanır.
export function buildRisks(exec) {
  if (!exec || exec.status !== "ok") return [];
  const out = [];
  const { current: c, categories } = exec;
  if (c.net > 0) out.push({ level: "high", text: `Net iş akışı +${nf(c.net)}: yeni açılan iş çözülenden fazla.` });
  categories.filter((k) => k.metrics && k.state === "worse").forEach((k) => out.push({ level: "high", text: `${k.label}: açık bulgu ${nf(k.metrics.openStart)} → ${nf(k.metrics.openEnd)} (+${nf(k.metrics.delta)}).` }));
  categories.filter((k) => k.metrics && k.state === "flat" && k.metrics.openEnd > 0).forEach((k) => out.push({ level: "mid", text: `${k.label}: ${nf(k.metrics.openEnd)} açık bulgu, dönemde değişmedi.` }));
  categories.filter((k) => k.metrics && k.previous && k.state === "improved" && k.previous.decreasePct != null && k.metrics.decreasePct != null && k.metrics.decreasePct < k.previous.decreasePct)
    .forEach((k) => out.push({ level: "mid", text: `${k.label}: iyileşme yavaşladı (önceki dönem ${pf(k.previous.decreasePct)}, bu dönem ${pf(k.metrics.decreasePct)}).` }));
  return out;
}

// ----- Detay tablosu -----
// Satır: dönem (gösterim grubu) × şirket × konu. Her satır tek bir (şirket, konu) serisinin aynı grubudur; açık değişim yüzdesi bir önceki gruba göre.
export function buildDetailRows(reportSnapshots, opts, { reports = OVERVIEW_REPORTS } = {}) {
  const companies = ["all", ...companiesIn(reportSnapshots, reports)];
  const rows = [];
  companies.forEach((co) => {
    const filterFn = co === "all" ? () => true : (d) => d.company === co;
    reports.forEach((rep) => {
      const ex = computeExecutive(reportSnapshots, { ...opts, company: co, reports: [rep] });
      if (ex.status !== "ok") return;
      const pts = bucketSeries(buildSeries(reportSnapshots, ex, { reports: [rep], filterFn }), ex.spanDays);
      pts.forEach((p, i) => {
        if (p.cozulen == null) return; // taban noktası akış taşımaz
        const prevOpen = pts[i - 1]?.open;
        rows.push({ donem: p.label, tarih: p.at, sirket: co === "all" ? "Tümü" : co, konu: CATEGORY_LABELS[rep] || rep, acik: p.open, cozulen: p.cozulen, yeni: p.yeni, net: p.net, degisimPct: pctDelta(p.open, prevOpen) });
      });
    });
  });
  return rows;
}

const csvCell = (v) => { const s = v == null ? "" : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function rowsToCsv(rows, columns) {
  const head = columns.map((c) => csvCell(c.label)).join(";");
  const body = rows.map((r) => columns.map((c) => csvCell(c.csv ? c.csv(r) : r[c.key])).join(";"));
  return `﻿${[head, ...body].join("\r\n")}`; // BOM: Excel'de Türkçe karakterler doğru açılsın
}
