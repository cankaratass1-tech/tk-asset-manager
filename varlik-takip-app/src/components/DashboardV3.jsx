import { useEffect, useMemo, useState } from "react";
import { backendClient } from "../services/backendClient";
import { combinedPeriodSummary } from "../services/dashboardOverviewService";
import { FINDING_META } from "../services/dashboardNav";
import TrendChart from "./TrendChart";
import TrendDetailModal from "./TrendDetailModal";

// TASLAK — Ana Sayfa "V3" (örnek görünümlerden esinlenen yerleşim: hero kart, ikonlu KPI kartları, sekmeli aksiyon listesi,
// halka/donut grafikler, "Yaklaşanlar"). DashboardV2 ile AYNI canlı veriyi ve aynı gezinme/filtre mekanizmasını kullanır; yalnız sunum farklıdır.
// Renkler tema paletinden (pal) gelir — 4 temada da uyumlu. Gerçek veri yoksa uydurma değer gösterilmez ("—" / "veri birikiyor").

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("tr-TR"));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const greet = () => { const h = new Date().getHours(); return h < 12 ? "Günaydın" : h < 18 ? "İyi günler" : "İyi akşamlar"; };
const daysSince = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? 0 : Math.floor((Date.now() - t) / 86400000); };

export default function DashboardV3({ styles, pal, data, snapshots, company, summaryToggle, searchSlot, userName, onNavigate, onBack, onExec }) {
  const [recs, setRecs] = useState([]);
  useEffect(() => {
    backendClient.getNewInstalls().then((r) => setRecs(Array.isArray(r?.records) ? r.records : [])).catch(() => {});
  }, []);

  const { cards, extra, totals } = data;
  const sev = { high: { c: pal.bad, l: "Yüksek" }, mid: { c: pal.warnFg, l: "Orta" }, low: { c: pal.inkSoft, l: "Bilgi" } };

  // Kapatma onayı / kurulum teslim takibi (gerçek kayıtlardan)
  const flow = useMemo(() => {
    const undelivered = recs.filter((r) => String(r.status || "").toLocaleUpperCase("tr-TR") !== "TESLİM EDİLDİ");
    const pending = undelivered.filter((r) => r.mailSentAt);
    return {
      pending: pending.length,
      overdue: pending.filter((r) => (Date.now() - Date.parse(r.mailSentAt)) / 86400000 > 7).length,
      waiting: undelivered.filter((r) => daysSince(r.date) > 7).length,
    };
  }, [recs]);

  const actions = useMemo(() => {
    const items = [
      cards.disk.value != null && { id: "disk", sev: "high", n: cards.disk.value, title: "Kritik disk alanı", desc: "Boş alanı ≤10 GB olan diskler", to: "disk", opts: { segment: "critical" } },
      { id: "zimmet", sev: "high", n: cards.zimmet.value, title: "Hatalı zimmet", desc: "Zimmetli kişi ile cihazı kullanan farklı / mükerrer", to: "zimmet", opts: { segment: "unmatched" } },
      { id: "closure", sev: flow.overdue > 0 ? "high" : "mid", n: flow.overdue || flow.pending, title: flow.overdue > 0 ? "Kapatma onayı geciken kayıtlar" : "Kapatma onayı bekleyen kayıtlar", desc: flow.overdue > 0 ? "E-posta gitmiş, 7 günü geçmiş" : "E-posta gitmiş, teslim edilmemiş", to: "kapatma-onayi" },
      { id: "monitor", sev: "mid", n: cards.zimmet.monitor, title: "Monitör uyuşmazlığı", desc: "Kişi başkasına zimmetli monitörü kullanıyor", to: "zimmet", opts: { segment: "monitorIssue" } },
      { id: "bilgidisi", sev: "mid", n: cards.atil.bilgiDisi, title: "Bilgi dışı kullanılan monitör", desc: "Zimmetli kişi dışında biri kullanıyor", to: "atil-monitor", opts: { atilStage: "outside" } },
      { id: "inaktif", sev: "mid", n: cards.inaktif.value, title: "İnaktif cihaz sahibi", desc: "Kayıtlı sahibi inaktif olan cihazlar", to: "inaktif" },
      { id: "lokip", sev: "mid", n: extra.lokasyonIp, title: "Lokasyon / IP uyuşmazlığı", desc: "Hostname'in ofisi ile gerçek IP farklı", to: "lokasyon-ip", opts: { segment: "unmatched" } },
      { id: "bsod", sev: "mid", n: extra.bsod, title: "BSOD olayları", desc: "Mavi ekran hatası alan cihazlar", to: "bsod" },
      { id: "bant", sev: "mid", n: extra.bantWarn, title: "Bant genişliği uyarısı", desc: "Ortalamanın altına düşen hatlar", to: "bant-genisligi" },
      { id: "unused", sev: "low", n: cards.unused.value, title: "Kullanılmayan cihaz", desc: "Zimmetli ama SCCM'de görünmüyor / uzun süredir giriş yok", to: "kullanilmayan" },
      { id: "atil", sev: "low", n: cards.atil.value, title: "Atıl monitör", desc: "Zimmetli ama kullanılmıyor", to: "atil-monitor", opts: { atilStage: "atil" } },
      { id: "battery", sev: "low", n: extra.batteryReplace, title: "Batarya değişimi", desc: "Sağlığı %60'ın altında", to: "battery-health", opts: { status: "Değişmeli" } },
    ].filter(Boolean).filter((a) => a.n > 0);
    const order = { high: 0, mid: 1, low: 2 };
    return items.sort((a, b) => order[a.sev] - order[b.sev] || b.n - a.n);
  }, [cards, extra, flow]);
  const [actTab, setActTab] = useState("all"); // all | high | mid | low
  const shownActions = actTab === "all" ? actions : actions.filter((a) => a.sev === actTab);

  const dist = [
    { id: "zimmet", v: cards.zimmet.value },
    { id: "inaktif", v: cards.inaktif.value },
    { id: "kullanilmayan", v: cards.unused.value },
    ...(cards.disk.value != null ? [{ id: "disk", v: cards.disk.value }] : []),
  ].map((d) => ({ ...d, k: FINDING_META[d.id].label, c: FINDING_META[d.id].color }));
  const distTotal = dist.reduce((s, d) => s + d.v, 0);
  const [hoverDist, setHoverDist] = useState(null);

  const [trendMode, setTrendMode] = useState("month");
  const [detailIdx, setDetailIdx] = useState(null);
  const trend = useMemo(() => combinedPeriodSummary(snapshots, trendMode, { company }), [snapshots, company, trendMode]);
  const trendKeys = dist.map((d) => d.id);
  const prevDelta = (() => {
    const s = trend.series;
    return s.length >= 2 ? s[s.length - 1].acikBulgu - s[s.length - 2].acikBulgu : null;
  })();

  // Hero'daki mini trend: gerçek dönem serisinden (en az 2 nokta yoksa gösterilmez)
  const spark = (() => {
    const v = trend.series.map((x) => x.acikBulgu);
    if (v.length < 2) return null;
    const max = Math.max(...v), min = Math.min(...v), span = Math.max(1, max - min);
    return { line: v.map((y, i) => `${(i / (v.length - 1)) * 300},${48 - ((y - min) / span) * 42}`).join(" ") };
  })();

  const sums = ["inaktif", "zimmet", "disk", "unused"].map((k) => cards[k].summary).filter(Boolean);
  const newSum = sums.reduce((s, x) => s + x.yeniTespit, 0);
  const solvedSum = sums.reduce((s, x) => s + x.cozulen, 0);
  const hasSums = sums.length > 0;

  const card = { ...styles.panel, padding: "20px 22px", margin: 0, borderRadius: 18 };
  const label = { fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: pal.inkSoft };
  const chip = (txt, color, bg) => <span style={{ fontSize: 12, fontWeight: 700, color, background: bg, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>{txt}</span>;
  const tab = (id, text, cur, set) => (
    <button key={id} type="button" data-v3-tab={id} aria-pressed={cur === id} onClick={() => set(id)}
      style={{ cursor: "pointer", border: "none", borderRadius: 16, padding: "5px 13px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: cur === id ? pal.accentSoft : "transparent", color: cur === id ? pal.accent : pal.inkSoft }}>
      {text}
    </button>
  );

  // ---- KPI kartı: ikon kutucuğu + değer + dönem farkı ----
  const Kpi = ({ icon, title, value, tone, sub, summary, to, opts, na }) => (
    <div data-v3-kpi={to} role={to ? "button" : undefined} tabIndex={to ? 0 : undefined}
      onClick={to ? () => onNavigate(to, opts) : undefined}
      onKeyDown={to ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(to, opts); } } : undefined}
      style={{ ...card, padding: "16px 18px", cursor: to ? "pointer" : "default", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}
      title={to ? "Rapora git" : undefined}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17, background: `${tone || pal.accent}1f`, flexShrink: 0 }} aria-hidden="true">{icon}</span>
        <span style={{ ...label, textTransform: "none", letterSpacing: 0, fontSize: 13 }}>{title}</span>
      </div>
      <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.05, fontFamily: "var(--font-mono)", color: na ? pal.inkSoft : tone || pal.ink }}>{na ? "—" : fmt(value)}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", minHeight: 24 }}>
        {summary ? (
          <>
            {chip(`+${fmt(summary.yeniTespit)} yeni`, pal.bad, `${pal.bad}1e`)}
            {chip(`−${fmt(summary.cozulen)} çözülen`, pal.ok, pal.okBg || `${pal.ok}1e`)}
          </>
        ) : (
          <span style={{ fontSize: 12, color: pal.inkSoft }}>{na ? "şirket bazında ayrılamaz" : sub}</span>
        )}
      </div>
    </div>
  );

  // ---- Halka (uyum oranı) ----
  const Ring = ({ value, color, title, sub }) => {
    const R = 34, C = 2 * Math.PI * R;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: "1 1 90px", minWidth: 90 }}>
        <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label={`${title}: %${value}`}>
          <circle cx="46" cy="46" r={R} fill="none" stroke={pal.fieldBg || pal.line} strokeWidth="9" />
          <circle cx="46" cy="46" r={R} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(value / 100) * C} ${C}`} transform="rotate(-90 46 46)" />
          <text x="46" y="51" textAnchor="middle" style={{ fontSize: 18, fontWeight: 700, fill: pal.ink, fontFamily: "var(--font-mono)" }}>%{value}</text>
        </svg>
        <div style={{ fontSize: 13, fontWeight: 700, textAlign: "center" }}>{title}</div>
        <div style={{ fontSize: 12, color: pal.inkSoft, textAlign: "center", marginTop: -4 }}>{sub}</div>
      </div>
    );
  };
  const devs = totals.devices;
  const rings = [
    { title: "Cihaz sağlığı", value: totals.healthPct, color: totals.healthPct >= 80 ? pal.ok : totals.healthPct >= 60 ? pal.warnFg : pal.bad, sub: "açık bulgusuz" },
    { title: "Zimmet uyumu", value: devs ? Math.max(0, 100 - pct(cards.zimmet.value, devs)) : 0, color: pal.ok, sub: `${fmt(cards.zimmet.value)} hatalı` },
    { title: "Aktif kullanım", value: devs ? Math.max(0, 100 - pct(cards.inaktif.value + cards.unused.value, devs)) : 0, color: pal.accent, sub: "inaktif/kullanılmayan dışı" },
  ];

  // ---- Donut (açık bulgu dağılımı) ----
  const DR = 62, DC = 2 * Math.PI * DR;
  let acc = 0;
  const arcs = dist.map((d) => {
    const frac = distTotal ? d.v / distTotal : 0;
    const a = { ...d, len: frac * DC, off: -acc * DC };
    acc += frac;
    return a;
  });

  const bars = (items, color, to, opts = {}) => {
    const m = Math.max(1, ...items.map((i) => i.count));
    return items.length === 0 ? (
      <span style={{ fontSize: 13, color: pal.inkSoft }}>Kayıt yok</span>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((it, i) => (
          <div key={it.key} onClick={() => onNavigate(to, { location: it.key, ...opts })} title={`${it.key} — ${fmt(it.count)} cihazı raporda göster`} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 22, fontSize: 12, color: pal.inkSoft, fontFamily: "var(--font-mono)" }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.key}</span>
                <span style={{ color: pal.inkSoft, fontFamily: "var(--font-mono)" }}>{fmt(it.count)}</span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: pal.fieldBg || pal.line }}>
                <div style={{ width: `${Math.round((it.count / m) * 100)}%`, height: "100%", borderRadius: 4, background: color }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };
  const [locTab, setLocTab] = useState("zimmet");

  const upcoming = [
    flow.overdue > 0 && { id: "overdue", tone: pal.bad, n: flow.overdue, title: "Kapatma onayı geciken", desc: "E-posta gitmiş, 7 günü geçmiş", to: "kapatma-onayi" },
    flow.pending > 0 && { id: "pending", tone: pal.warnFg, n: flow.pending, title: "Kapatma onayı bekleyen", desc: "E-posta gitmiş, teslim edilmemiş", to: "kapatma-onayi" },
    flow.waiting > 0 && { id: "waiting", tone: pal.warnFg, n: flow.waiting, title: "Teslim bekleyen kurulum", desc: "Kurulumdan 7 günden fazla geçmiş", to: "yeni-kurulum" },
  ].filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} data-dashboard-v3>
      {/* Karşılama + hızlı eylemler */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p style={{ ...styles.pageTitle, fontSize: 26, margin: 0 }}>{greet()}{userName ? `, ${userName}` : ""}</p>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: pal.inkSoft }}>
            {new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {data.scope}
            {hasSums ? ` · son dönemde ${fmt(solvedSum)} çözüldü, ${fmt(newSum)} yeni bulgu` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: pal.inkSoft }}>Kıyas dönemi:</span>
          {summaryToggle}
          <button style={styles.btnPrimary} onClick={onExec}>📊 Yönetici özeti</button>
          <button style={styles.btnGhost} onClick={onBack} title="Önceki Ana Sayfa görünümüne dön">← V2'ye dön</button>
        </div>
      </div>

      {searchSlot}

      {/* Hero + sekmeli aksiyon listesi */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16, alignItems: "stretch" }}>
        <div data-v3-hero style={{ ...card, background: `linear-gradient(135deg, ${pal.accent}, ${pal.accent}b0)`, color: "#fff", border: "none", display: "flex", flexDirection: "column", gap: 16, minHeight: 250 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "4px 12px" }}>GENEL DURUM</span>
            <span style={{ fontSize: 13, opacity: 0.9 }}>{fmt(devs)} cihaz üzerinden</span>
          </div>

          {/* Büyük sayı + sağlık halkası */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1, fontFamily: "var(--font-mono)", letterSpacing: "-0.03em" }}>{fmt(totals.open)}</div>
              <div style={{ fontSize: 16, marginTop: 4, opacity: 0.95 }}>açık bulgu{prevDelta != null ? ` · önceki döneme göre ${prevDelta > 0 ? "+" : ""}${fmt(prevDelta)}` : ""}</div>
              {hasSums && (
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "3px 10px" }}>+{fmt(newSum)} yeni</span>
                  <span style={{ fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "3px 10px" }}>−{fmt(solvedSum)} çözülen</span>
                </div>
              )}
            </div>
            <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`Cihaz sağlığı %${totals.healthPct}`} style={{ flexShrink: 0 }}>
              <circle cx="56" cy="56" r="46" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="11" />
              <circle cx="56" cy="56" r="46" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(totals.healthPct / 100) * 2 * Math.PI * 46} ${2 * Math.PI * 46}`} transform="rotate(-90 56 56)" />
              <text x="56" y="58" textAnchor="middle" style={{ fontSize: 24, fontWeight: 700, fill: "#fff", fontFamily: "var(--font-mono)" }}>%{totals.healthPct}</text>
              <text x="56" y="75" textAnchor="middle" style={{ fontSize: 10, fill: "#fff", opacity: 0.9, letterSpacing: "0.08em" }}>SAĞLIK</text>
            </svg>
          </div>

          {/* Mini trend (yalnız gerçek kayıt geçmişi varsa) */}
          {spark && (
            <div data-v3-spark>
              <svg viewBox="0 0 300 54" width="100%" height="54" preserveAspectRatio="none" role="img" aria-label="Açık bulgu eğilimi" style={{ display: "block" }}>
                <polygon points={`${spark.line} 300,54 0,54`} fill="rgba(255,255,255,0.16)" />
                <polyline points={spark.line} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                <span>{trend.series[0].label}</span><span>{trend.series[trend.series.length - 1].label}</span>
              </div>
            </div>
          )}

          {/* Kategori dağılımı: pay çubukları */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginTop: "auto" }}>
            {dist.map((d) => (
              <div key={d.id} data-v3-hero-cat={d.id} role="button" tabIndex={0} onClick={() => onNavigate(FINDING_META[d.id].to, FINDING_META[d.id].opts)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(FINDING_META[d.id].to, FINDING_META[d.id].opts); } }}
                title={`${d.k} — raporu aç`} style={{ background: "rgba(255,255,255,0.14)", borderRadius: 12, padding: "9px 11px", cursor: "pointer" }}>
                <div style={{ fontSize: 12, opacity: 0.92 }}>{d.k}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-mono)", lineHeight: 1.2 }}>{fmt(d.v)}</div>
                <div style={{ height: 4, borderRadius: 3, background: "rgba(255,255,255,0.25)", marginTop: 5 }}>
                  <div style={{ width: `${pct(d.v, distTotal)}%`, height: "100%", borderRadius: 3, background: "#fff" }} />
                </div>
              </div>
            ))}
          </div>
          {!data.diskScoped && <span style={{ fontSize: 12, opacity: 0.85 }}>Disk şirket bazında ayrılamadığı için dahil değil</span>}
        </div>

        <div style={{ ...card, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <p style={styles.settingsSectionTitle}>Bugün yapılacaklar</p>
            <span style={{ fontSize: 13, color: pal.inkSoft }}>{actions.length} başlık</span>
          </div>
          <div style={{ display: "flex", gap: 4, margin: "8px 0 4px", flexWrap: "wrap" }}>
            {[["all", `Tümü (${actions.length})`], ["high", `Yüksek (${actions.filter((a) => a.sev === "high").length})`], ["mid", `Orta (${actions.filter((a) => a.sev === "mid").length})`], ["low", `Bilgi (${actions.filter((a) => a.sev === "low").length})`]].map(([id, t]) => tab(id, t, actTab, setActTab))}
          </div>
          {shownActions.length === 0 ? (
            <p style={{ ...styles.pageSub, margin: "10px 0 0" }}>Bu başlıkta aksiyon gerektiren bulgu yok.</p>
          ) : (
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {shownActions.map((a) => (
                <div key={a.id} data-action={a.id} onClick={() => onNavigate(a.to, a.opts)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderTop: `1px solid ${pal.line}`, cursor: "pointer" }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${sev[a.sev].c}`, flexShrink: 0 }} title={`Önem: ${sev[a.sev].l}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: pal.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.desc}</div>
                  </div>
                  {chip(sev[a.sev].l, sev[a.sev].c, `${sev[a.sev].c}1a`)}
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 17, minWidth: 44, textAlign: "right" }}>{fmt(a.n)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Anahtar sayılar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
        <Kpi icon="👤" title="Hatalı zimmet" value={cards.zimmet.value} tone={cards.zimmet.value ? pal.bad : pal.ok} sub={`${fmt(cards.zimmet.unverified)} kayıt doğrulanamadı`} summary={cards.zimmet.summary} to="zimmet" opts={{ segment: "unmatched" }} />
        <Kpi icon="💤" title="İnaktif cihaz" value={cards.inaktif.value} tone={cards.inaktif.value ? pal.warnFg : pal.ok} sub="sahibi inaktif" summary={cards.inaktif.summary} to="inaktif" />
        <Kpi icon="💾" title="Kritik disk" value={cards.disk.value} tone={cards.disk.value ? pal.bad : pal.ok} sub={cards.disk.value == null ? "" : `${fmt(cards.disk.warning)} birim uyarıda`} summary={cards.disk.summary} to="disk" opts={{ segment: "critical" }} na={cards.disk.value == null} />
        <Kpi icon="📦" title="Kullanılmayan" value={cards.unused.value} tone={cards.unused.value ? pal.warnFg : pal.ok} sub="zimmetli, kullanılmıyor" summary={cards.unused.summary} to="kullanilmayan" />
        <Kpi icon="🖥️" title="Atıl monitör" value={cards.atil.value} tone={cards.atil.value ? pal.warnFg : pal.ok} sub={`${fmt(cards.atil.bilgiDisi)} bilgi dışı kullanım`} to="atil-monitor" opts={{ atilStage: "atil" }} />
      </div>

      {/* Trend + dağılım halkası */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ ...card, gridColumn: "span 2", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <p style={styles.settingsSectionTitle}>Açık bulgu trendi</p>
            {prevDelta != null && chip(`${prevDelta > 0 ? "▲ +" : prevDelta < 0 ? "▼ " : "▬ "}${fmt(prevDelta)} önceki döneme göre`, prevDelta > 0 ? pal.bad : prevDelta < 0 ? pal.ok : pal.inkSoft, `${prevDelta > 0 ? pal.bad : prevDelta < 0 ? pal.ok : pal.inkSoft}1a`)}
          </div>
          <TrendChart series={trend.series} keys={trendKeys} meta={FINDING_META} stacked={false} mode={trendMode} onModeChange={(m) => { setTrendMode(m); setDetailIdx(null); }}
            onPointClick={setDetailIdx} accent={pal.accent}
            tone={{ ink: pal.ink, sub: pal.inkSoft, mute: pal.inkSoft, grid: pal.line, tipBg: pal.toastBg, tipFg: pal.toastFg }} />
          {detailIdx != null && trend.series[detailIdx] && (
            <TrendDetailModal item={trend.series[detailIdx]} prev={trend.series[detailIdx - 1]} keys={trendKeys} meta={FINDING_META} company={company}
              onClose={() => setDetailIdx(null)} onOpenReport={(id) => { setDetailIdx(null); onNavigate(FINDING_META[id].to, FINDING_META[id].opts); }} styles={styles} pal={pal} />
          )}
        </div>

        <div style={{ ...card, minWidth: 0 }}>
          <p style={styles.settingsSectionTitle}>Açık bulgu dağılımı</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
            <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Açık bulgu dağılımı" style={{ flexShrink: 0 }}>
              <circle cx="80" cy="80" r={DR} fill="none" stroke={pal.fieldBg || pal.line} strokeWidth="22" />
              {distTotal > 0 && arcs.map((a) => (
                <circle key={a.id} data-dist-bar={a.id} cx="80" cy="80" r={DR} fill="none" stroke={a.c} strokeWidth={hoverDist === a.id ? 26 : 22}
                  strokeDasharray={`${Math.max(0, a.len - 2)} ${DC}`} strokeDashoffset={a.off} transform="rotate(-90 80 80)"
                  style={{ cursor: "pointer", opacity: hoverDist && hoverDist !== a.id ? 0.5 : 1, transition: "opacity .12s" }}
                  role="button" tabIndex={0} aria-label={`${a.k}: ${a.v} kayıt, raporu aç`}
                  onMouseEnter={() => setHoverDist(a.id)} onMouseLeave={() => setHoverDist(null)}
                  onClick={() => onNavigate(FINDING_META[a.id].to, FINDING_META[a.id].opts)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(FINDING_META[a.id].to, FINDING_META[a.id].opts); } }} />
              ))}
              <text x="80" y="82" textAnchor="middle" style={{ fontSize: 26, fontWeight: 700, fill: pal.ink, fontFamily: "var(--font-mono)" }}>{fmt(distTotal)}</text>
              <text x="80" y="100" textAnchor="middle" style={{ fontSize: 11, fill: pal.inkSoft, letterSpacing: "0.06em" }}>AÇIK BULGU</text>
            </svg>
            <div style={{ flex: "1 1 100%", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              {dist.map((d) => (
                <div key={d.id} data-dist-row={d.id} role="button" tabIndex={0} aria-label={`${d.k}: ${d.v} kayıt, raporu aç`} title="Raporu aç"
                  onClick={() => onNavigate(FINDING_META[d.id].to, FINDING_META[d.id].opts)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(FINDING_META[d.id].to, FINDING_META[d.id].opts); } }}
                  onMouseEnter={() => setHoverDist(d.id)} onMouseLeave={() => setHoverDist(null)}
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", padding: "6px 8px", borderRadius: 8, background: hoverDist === d.id ? pal.accentSoft : "transparent" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: d.c, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>{d.k}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{fmt(d.v)}</span>
                  <span style={{ color: pal.inkSoft, minWidth: 38, textAlign: "right" }}>%{pct(d.v, distTotal)}</span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 12, color: pal.inkSoft, margin: "12px 0 0" }}>Bir cihaz birden fazla kategoride yer alabilir. Dilime ya da satıra tıklayınca raporu açar.</p>
        </div>
      </div>

      {/* Alt sıra: uyum halkaları · yaklaşanlar · lokasyonlar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ ...card, minWidth: 0 }}>
          <p style={styles.settingsSectionTitle}>Uyum oranları</p>
          <p style={{ ...styles.pageSub, margin: "2px 0 12px" }}>{fmt(devs)} cihaz üzerinden</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
            {rings.map((r) => <Ring key={r.title} {...r} />)}
          </div>
        </div>

        <div style={{ ...card, minWidth: 0 }}>
          <p style={styles.settingsSectionTitle}>Yaklaşanlar</p>
          <p style={{ ...styles.pageSub, margin: "2px 0 6px" }}>Takip gerektiren süreçler</p>
          {upcoming.length === 0 ? (
            <p style={{ ...styles.pageSub, margin: "10px 0 0" }}>Şu an takip gerektiren gecikmiş iş yok.</p>
          ) : (
            upcoming.map((u) => (
              <div key={u.id} data-upcoming={u.id} onClick={() => onNavigate(u.to)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderTop: `1px solid ${pal.line}`, cursor: "pointer" }}>
                <span style={{ width: 8, alignSelf: "stretch", borderRadius: 4, background: u.tone, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{u.title}</div>
                  <div style={{ fontSize: 12, color: pal.inkSoft }}>{u.desc}</div>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18 }}>{fmt(u.n)}</span>
              </div>
            ))
          )}
        </div>

        <div style={{ ...card, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <p style={styles.settingsSectionTitle}>En çok bulgulu lokasyonlar</p>
            <div style={{ display: "flex", gap: 2 }}>{[["zimmet", "Zimmet"], ["inaktif", "İnaktif"]].map(([id, t]) => tab(id, t, locTab, setLocTab))}</div>
          </div>
          <div style={{ marginTop: 12 }}>
            {locTab === "zimmet"
              ? bars(data.locations.zimmet.slice(0, 5), pal.bad, "zimmet", { segment: "unmatched" })
              : bars(data.locations.inaktif.slice(0, 5), pal.warnFg, "inaktif")}
          </div>
        </div>
      </div>

      {/* Veri tazeliği */}
      <div style={{ ...card, padding: "12px 20px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={label}>Veri tazeliği</span>
        {data.freshness.map((f) => (
          <span key={f.label} title={f.file || ""} style={{ fontSize: 12, color: pal.inkSoft, background: pal.fieldBg || pal.line, borderRadius: 20, padding: "4px 11px" }}>
            {f.label}: <strong style={{ color: pal.ink }}>{f.at ? when(f.at) : "yüklenmedi"}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
