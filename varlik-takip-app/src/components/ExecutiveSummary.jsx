import { useEffect, useMemo, useState } from "react";
import { backendClient } from "../services/backendClient";
import TrendChart from "./TrendChart";
import TrendDetailModal from "./TrendDetailModal";
import { FINDING_META } from "../services/dashboardNav";
import { combinedPeriodSummary } from "../services/dashboardOverviewService";

// DEMO — Yönetici için tek sayfalık özet (Power BI rapor görünümü), 2. sürüm: tek büyük gösterge (sağlık skoru) + destek metrikleri,
// çok serili yığılı alan trendi, gruplu sütun (şirket) ve sapmalı çubuk (çözülen/yeni) grafikleri. Operasyon Panosu ile aynı canlı veri.
// Tema bağımsız, yazdırılabilir (A4 yatay). Henüz commit edilmedi.

const P = {
  canvas: "#F3F2F1", card: "#FFFFFF", line: "#E1DFDD", grid: "#EDEBE9", ink: "#252423", sub: "#605E5C", mute: "#8A8886",
  navy: "#243A5E", blue: "#118DFF", navy2: "#12239E", orange: "#E66C37", purple: "#744EC2", teal: "#197278",
  red: "#D64550", green: "#2BA84A", yellow: "#D9B300", track: "#EDEBE9",
};
const CAT = {
  zimmet: { k: "Hatalı zimmet", c: P.red },
  inaktif: { k: "İnaktif cihaz", c: P.orange },
  kullanilmayan: { k: "Kullanılmayan", c: P.purple },
  disk: { k: "Kritik disk", c: P.blue },
};
const fmt = (n) => (n == null || Number.isNaN(n) ? "—" : Number(n).toLocaleString("tr-TR"));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const niceMax = (v) => { const p = 10 ** Math.floor(Math.log10(Math.max(1, v))); const m = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => x * p >= v) || 10; return m * p; };

function Card({ title, sub, children, span = 4, right }) {
  return (
    <div className="exec-card" style={{ gridColumn: `span ${span}`, background: P.card, border: `1px solid ${P.line}`, borderRadius: 6, boxShadow: "0 1px 2px rgba(0,0,0,.05)", padding: "14px 18px 16px", minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: P.ink }}>{title}</div>
          {sub && <div style={{ fontSize: 11.5, color: P.mute, marginTop: 2 }}>{sub}</div>}
        </div>
        {right}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

function Spark({ values, color, w = 96, h = 26 }) {
  if (!values || values.length < 2) return null;
  const mx = Math.max(...values), mn = Math.min(...values), r = mx - mn || 1;
  const pts = values.map((v, i) => `${(i * (w - 4)) / (values.length - 1) + 2},${h - 3 - ((v - mn) / r) * (h - 8)}`);
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polygon points={`2,${h - 2} ${pts.join(" ")} ${w - 2},${h - 2}`} fill={`${color}1f`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Yarım daire gösterge: eşik bölgeleri (kırmızı <60, sarı 60-80, yeşil ≥80) arka planda, değer iğnesi ve büyük sayı
function HeroGauge({ value }) {
  const v = Math.max(0, Math.min(100, value));
  const cx = 130, cy = 120, R = 96, sw = 20;
  const pt = (p, rad = R) => { const a = Math.PI * (1 - p / 100); return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)]; };
  const arc = (p0, p1, color) => {
    const [x0, y0] = pt(p0), [x1, y1] = pt(p1);
    return <path d={`M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`} fill="none" stroke={color} strokeWidth={sw} />;
  };
  const [nx, ny] = pt(v, R - 4);
  const tone = v >= 80 ? P.green : v >= 60 ? P.yellow : P.red;
  return (
    <svg viewBox="0 0 260 150" width="100%" style={{ maxWidth: 300 }}>
      {arc(0, 60, `${P.red}55`)}
      {arc(60, 80, `${P.yellow}66`)}
      {arc(80, 100, `${P.green}55`)}
      {arc(0, v, tone)}
      {[0, 60, 80, 100].map((t) => { const [x, y] = pt(t, R + 18); return <text key={t} x={x} y={y + 3} textAnchor="middle" style={{ fontSize: 10, fill: P.mute }}>{t}</text>; })}
      <circle cx={nx} cy={ny} r="5" fill="#fff" stroke={tone} strokeWidth="3" />
      <text x={cx} y={cy - 8} textAnchor="middle" style={{ fontSize: 46, fontWeight: 700, fill: P.ink, fontFamily: "var(--font-mono)" }}>%{v}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 11, fill: P.sub, fontWeight: 700, letterSpacing: "0.08em" }}>CİHAZ SAĞLIĞI</text>
    </svg>
  );
}

function Ring({ segments, size = 150, thick = 20, center, sub, onSegmentClick }) {
  const total = segments.reduce((s, x) => s + x.v, 0);
  const r = (size - thick) / 2, C = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={P.track} strokeWidth={thick} />
      {total > 0 &&
        segments.filter((x) => x.v > 0).map((x, i) => {
          const d = (x.v / total) * C;
          const el = <circle key={i} data-ring-seg={x.id} role={onSegmentClick ? "button" : undefined} tabIndex={onSegmentClick ? 0 : undefined} aria-label={onSegmentClick ? `${x.k}: ${fmt(x.v)} kayıt, raporu aç` : undefined} onClick={onSegmentClick ? () => onSegmentClick(x.id) : undefined} onKeyDown={onSegmentClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSegmentClick(x.id); } } : undefined} style={onSegmentClick ? { cursor: "pointer" } : undefined} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={x.c} strokeWidth={thick} strokeDasharray={`${Math.max(0, d - 1.5)} ${C - Math.max(0, d - 1.5)}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`}><title>{`${x.k}: ${fmt(x.v)}`}</title></circle>;
          off += d;
          return el;
        })}
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" style={{ fontSize: 28, fontWeight: 700, fill: P.ink, fontFamily: "var(--font-mono)" }}>{center}</text>
      <text x={size / 2} y={size / 2 + 21} textAnchor="middle" style={{ fontSize: 10.5, fill: P.mute, fontWeight: 600, letterSpacing: "0.06em" }}>{sub}</text>
    </svg>
  );
}

export default function ExecutiveSummary({ data, snapshots, company, summaryToggle, onBack, onNavigate, styles, pal }) {
  const [recs, setRecs] = useState([]);
  // Açık bulgu trendi: lejanttan bir kategoriye tıklayınca grafik yalnız o kategoriyi gösterir (tekrar tıklayınca hepsi)
  const [focus, setFocus] = useState(null);
  useEffect(() => {
    backendClient.getNewInstalls().then((r) => setRecs(Array.isArray(r?.records) ? r.records : [])).catch(() => {});
  }, []);

  const { cards, totals } = data;
  const [trendMode, setTrendMode] = useState("month"); // day | week | month | raw
  const [detailIdx, setDetailIdx] = useState(null);
  const trend = useMemo(() => combinedPeriodSummary(snapshots, trendMode, { company }), [snapshots, company, trendMode]);
  const series = trend.series;
  const last = series[series.length - 1], prev = series[series.length - 2];

  const closure = useMemo(() => {
    const pending = recs.filter((r) => r.mailSentAt && String(r.status || "").toUpperCase() !== "TESLİM EDİLDİ");
    return { pending: pending.length, overdue: pending.filter((r) => (Date.now() - Date.parse(r.mailSentAt)) / 86400000 > 7).length };
  }, [recs]);

  const catKeys = ["zimmet", "inaktif", "kullanilmayan", ...(cards.disk.value != null ? ["disk"] : [])];
  const catVal = { zimmet: cards.zimmet.value, inaktif: cards.inaktif.value, kullanilmayan: cards.unused.value, disk: cards.disk.value };
  const catSum = { zimmet: cards.zimmet.summary, inaktif: cards.inaktif.summary, kullanilmayan: cards.unused.summary, disk: cards.disk.summary };
  const withSum = catKeys.filter((k) => catSum[k]);
  const solved = withSum.reduce((s, k) => s + catSum[k].cozulen, 0);
  const added = withSum.reduce((s, k) => s + catSum[k].yeniTespit, 0);
  const openTotal = catKeys.reduce((s, k) => s + catVal[k], 0);
  const healthPct = totals.healthPct;
  const status = healthPct >= 80 ? { t: "İyi", c: P.green } : healthPct >= 60 ? { t: "İzlenmeli", c: P.yellow } : { t: "Kritik", c: P.red };
  const delta = last && prev ? last.acikBulgu - prev.acikBulgu : null;

  const attention = [
    { t: "Hatalı zimmet", n: cards.zimmet.value, s: "Yüksek" },
    cards.disk.value != null && { t: "Kritik disk alanı (≤10 GB)", n: cards.disk.value, s: "Yüksek" },
    closure.overdue > 0 && { t: "7 günü geçen kapatma onayı", n: closure.overdue, s: "Yüksek" },
    { t: "Monitör uyuşmazlığı", n: cards.zimmet.monitor, s: "Orta" },
    { t: "Bilgi dışı kullanılan monitör", n: cards.atil.bilgiDisi, s: "Orta" },
    { t: "İnaktif cihaz sahibi", n: cards.inaktif.value, s: "Orta" },
    { t: "Lokasyon / IP uyuşmazlığı", n: data.extra.lokasyonIp, s: "Orta" },
  ].filter((x) => x && x.n > 0).slice(0, 5);
  const sevColor = { Yüksek: P.red, Orta: P.orange };

  const generated = new Date().toLocaleString("tr-TR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // Trend grafiği ortak TrendChart bileşeniyle çizilir (dönem seçici, hover, tıklayınca ayrıntı); odak seçimi legend ile yapılır.
  const trendKeys = focus && catKeys.includes(focus) ? [focus] : catKeys;
  const TREND_META = Object.fromEntries(Object.entries(CAT).map(([k, v]) => [k, { label: v.k, color: v.c }]));
  const openReport = (id) => { const m = FINDING_META[id]; if (m && onNavigate) onNavigate(m.to, m.opts); };

  // ---- Şirket karşılaştırması: kategori başına gruplu sütunlar ----
  const companyChart = (() => {
    const cs = data.companies;
    if (cs.length === 0) return <div style={{ fontSize: 12.5, color: P.mute }}>Şirket bilgisi yok.</div>;
    const W = 400, H = 210, L = 30, T = 14, B = 34;
    const groups = [["zimmet", "Hatalı zimmet"], ["inaktif", "İnaktif"], ["unused", "Kullanılmayan"]];
    const shades = [P.navy2, P.blue, P.teal, P.purple];
    const ymax = niceMax(Math.max(1, ...cs.flatMap((c) => groups.map(([k]) => c[k]))) * 1.1);
    const gw = (W - L - 8) / groups.length, bw = Math.min(30, (gw - 18) / cs.length);
    const y = (v) => T + (1 - v / ymax) * (H - T - B);
    return (
      <>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
          {[0, 0.5, 1].map((t) => (
            <g key={t}><line x1={L} x2={W - 8} y1={y(t * ymax)} y2={y(t * ymax)} stroke={P.grid} /><text x={L - 5} y={y(t * ymax) + 3.5} textAnchor="end" style={{ fontSize: 10, fill: P.mute }}>{fmt(Math.round(t * ymax))}</text></g>
          ))}
          {groups.map(([k, label], gi) => (
            <g key={k}>
              {cs.map((c, ci) => {
                const bx = L + gi * gw + (gw - bw * cs.length - 4 * (cs.length - 1)) / 2 + ci * (bw + 4);
                return (
                  <g key={c.key}>
                    <rect x={bx} y={y(c[k])} width={bw} height={Math.max(0, H - B - y(c[k]))} fill={shades[ci % shades.length]} rx="1.5"><title>{`${c.label} — ${label}: ${fmt(c[k])}`}</title></rect>
                    <text x={bx + bw / 2} y={y(c[k]) - 4} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: P.ink }}>{fmt(c[k])}</text>
                  </g>
                );
              })}
              <text x={L + gi * gw + gw / 2} y={H - 16} textAnchor="middle" style={{ fontSize: 10.5, fill: P.sub }}>{label}</text>
            </g>
          ))}
        </svg>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", fontSize: 11.5, color: P.sub, flexWrap: "wrap" }}>
          {cs.map((c, i) => <span key={c.key}><b style={{ color: shades[i % shades.length] }}>■</b> {c.label} · %{c.healthPct} sağlık</span>)}
        </div>
      </>
    );
  })();

  // ---- Çözülen / yeni: sapmalı (diverging) çubuklar ----
  const divMax = Math.max(1, ...withSum.flatMap((k) => [catSum[k].cozulen, catSum[k].yeniTespit]));
  const maxLoc = Math.max(1, ...data.topLoc.map((l) => l.zimmet + l.inaktif));

  const Metric = ({ label, value, sub, color, spark }) => (
    <div style={{ background: P.card, border: `1px solid ${P.line}`, borderLeft: `3px solid ${color}`, borderRadius: 6, padding: "11px 14px", minWidth: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }} className="exec-card">
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: P.sub, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-mono)", lineHeight: 1.15, color: P.ink }}>{value}</div>
        <div style={{ fontSize: 11.5, color: P.sub }}>{sub}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{spark}</div>
    </div>
  );

  return (
    <div id="exec-root" style={{ background: P.canvas, borderRadius: 8, padding: 16, color: P.ink, fontFamily: "inherit" }}>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body * { visibility: hidden !important; }
          #exec-root, #exec-root * { visibility: visible !important; }
          #exec-root { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .exec-noprint { display: none !important; }
          .exec-card { break-inside: avoid; box-shadow: none !important; }
        }
      `}</style>

      {/* Başlık bandı */}
      <div style={{ background: P.navy, color: "#fff", borderRadius: 6, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11.5, letterSpacing: "0.1em", opacity: 0.75, fontWeight: 600 }}>VARLIK YÖNETİMİ · YÖNETİCİ ÖZETİ</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>IT Cihaz Envanteri — Durum Raporu</div>
          <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 3 }}>{data.scope} · {generated} · <span style={{ background: "rgba(255,255,255,.18)", borderRadius: 10, padding: "1px 8px" }}>DEMO TASARIM</span></div>
        </div>
        <div className="exec-noprint" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, opacity: 0.8 }}>Kıyas dönemi:</span>
          <span style={{ background: "#fff", borderRadius: 8 }}>{summaryToggle}</span>
          <button onClick={() => window.print()} style={{ border: "1px solid rgba(255,255,255,.5)", background: "transparent", color: "#fff", borderRadius: 6, padding: "7px 13px", cursor: "pointer", fontWeight: 600 }}>🖨 Yazdır / PDF</button>
          <button onClick={onBack} style={{ border: "none", background: "#fff", color: P.navy, borderRadius: 6, padding: "7px 13px", cursor: "pointer", fontWeight: 700 }}>← Operasyon panosu</button>
        </div>
      </div>

      {/* Hero: tek büyük gösterge + destek metrikleri */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 7fr)", gap: 12, marginTop: 12 }}>
        <div className="exec-card" style={{ background: P.card, border: `1px solid ${P.line}`, borderRadius: 6, boxShadow: "0 1px 2px rgba(0,0,0,.05)", padding: "16px 18px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <HeroGauge value={healthPct} />
          <div style={{ marginTop: 2, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: status.c, background: `${status.c}22`, borderRadius: 12, padding: "3px 12px" }}>{status.t}</span>
            <span style={{ fontSize: 12.5, color: P.sub }}>{fmt(totals.devices - totals.open)} / {fmt(totals.devices)} cihaz sorunsuz</span>
          </div>
          <div style={{ fontSize: 11, color: P.mute, marginTop: 6 }}>Eşikler: ≥80 iyi · 60-80 izlenmeli · &lt;60 kritik</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          <Metric label="Açık bulgu" value={fmt(totals.open)} color={P.orange}
            sub={delta == null ? "kıyas dönemi bekleniyor" : `${delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "▬ "}${fmt(delta)} önceki döneme göre`}
            spark={<Spark values={series.map((s) => s.acikBulgu)} color={P.orange} />} />
          <Metric label="Toplam cihaz" value={fmt(totals.devices)} color={P.navy2} sub={data.scope} />
          <Metric label="Çözüm oranı" value={last && last.cozumOrani != null ? `%${last.cozumOrani}` : "—"} color={P.green}
            sub={withSum.length ? `${fmt(solved)} çözüldü · ${fmt(added)} yeni` : "dönem verisi birikiyor"}
            spark={<Spark values={series.map((s) => s.cozumOrani).filter((v) => v != null)} color={P.green} />} />
          <Metric label="Geciken onay" value={fmt(closure.overdue)} color={closure.overdue ? P.red : P.green} sub={`${fmt(closure.pending)} kapatma onayı bekliyor`} />
        </div>
      </div>

      {/* Trend + dağılım */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
        <Card title="Açık bulgu trendi" sub={focus ? `Dönem dönem — yalnız ${CAT[focus].k} (tekrar tıklayınca tümü)` : "Dönem dönem, kategori bazında (yığılı) — bir kategoriye tıklayarak tek başına görün"} span={8}
          right={<span style={{ fontSize: 11, color: P.sub, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>{catKeys.map((k) => (
            <span key={k} role="button" tabIndex={0} data-trend-legend={k} aria-pressed={focus === k}
              onClick={() => setFocus(focus === k ? null : k)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setFocus(focus === k ? null : k)}
              style={{ cursor: "pointer", userSelect: "none", opacity: focus && focus !== k ? 0.4 : 1, fontWeight: focus === k ? 700 : 400, borderBottom: focus === k ? `2px solid ${CAT[k].c}` : "2px solid transparent" }}>
              <b style={{ color: CAT[k].c }}>■</b> {CAT[k].k}
            </span>
          ))}</span>}>
          <TrendChart series={series} keys={trendKeys} meta={TREND_META} stacked mode={trendMode} onModeChange={(m) => { setTrendMode(m); setDetailIdx(null); }} onPointClick={setDetailIdx} accent={P.blue}
            tone={{ ink: P.ink, sub: P.sub, mute: P.mute, grid: P.grid, tipBg: P.ink, tipFg: "#fff" }} />
          {detailIdx != null && series[detailIdx] && (
            <TrendDetailModal item={series[detailIdx]} prev={series[detailIdx - 1]} keys={catKeys} meta={TREND_META} company={company} onClose={() => setDetailIdx(null)}
              onOpenReport={(id) => { setDetailIdx(null); openReport(id); }} styles={styles} pal={pal} />
          )}
        </Card>
        <Card title="Açık bulgu dağılımı" sub={onNavigate ? "Güncel durum — bir kategoriye tıklayınca raporu açılır" : "Güncel durum"} span={4}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Ring segments={catKeys.map((k) => ({ id: k, k: CAT[k].k, v: catVal[k], c: CAT[k].c }))} center={fmt(openTotal)} sub="BULGU" size={160} onSegmentClick={onNavigate ? openReport : undefined} />
            <div style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
              {catKeys.map((k) => (
                <div key={k} data-dist-row={k} role={onNavigate ? "button" : undefined} tabIndex={onNavigate ? 0 : undefined} aria-label={`${CAT[k].k}: ${fmt(catVal[k])} kayıt, raporu aç`} title={onNavigate ? "Raporu aç" : undefined}
                  onClick={onNavigate ? () => openReport(k) : undefined} onKeyDown={onNavigate ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openReport(k); } } : undefined}
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: onNavigate ? "pointer" : "default", padding: "4px 6px", borderRadius: 6 }}>
                  <b style={{ color: CAT[k].c }}>■</b><span style={{ flex: 1 }}>{CAT[k].k}</span>
                  <b style={{ fontFamily: "var(--font-mono)" }}>{fmt(catVal[k])}</b><span style={{ color: P.mute, width: 38, textAlign: "right" }}>%{pct(catVal[k], openTotal)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Çözüm, şirket, dikkat */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
        <Card title="Dönemsel çözüm performansı" sub="◀ çözülen · yeni tespit ▶ (kıyas dönemine göre)" span={4}>
          {withSum.length === 0 ? (
            <div style={{ fontSize: 12.5, color: P.mute }}>Dönemsel karşılaştırma için en az iki veri yüklemesi gerekli.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {withSum.map((k) => {
                const s = catSum[k];
                const net = s.yeniTespit - s.cozulen;
                return (
                  <div key={k}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <b>{CAT[k].k}</b>
                      <span style={{ color: net > 0 ? P.red : net < 0 ? P.green : P.sub, fontWeight: 700 }}>{net > 0 ? "▲ +" : net < 0 ? "▼ " : "▬ "}{fmt(net)} net</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", alignItems: "center", gap: 0, height: 16 }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{fmt(s.cozulen)}</span>
                        <div style={{ height: 12, width: `${(s.cozulen / divMax) * 78}%`, background: P.green, borderRadius: "2px 0 0 2px" }} />
                      </div>
                      <div style={{ height: 20, background: P.mute }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ height: 12, width: `${(s.yeniTespit / divMax) * 78}%`, background: P.red, borderRadius: "0 2px 2px 0" }} />
                        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{fmt(s.yeniTespit)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card title="Şirket karşılaştırması" sub="Açık bulgu (Disk şirkete göre ayrılamadığından hariç)" span={4}>{companyChart}</Card>
        <Card title="Dikkat gerektirenler" sub="Önem sırasına göre ilk 5" span={4}>
          {attention.length === 0 ? (
            <div style={{ fontSize: 12.5, color: P.green, fontWeight: 600 }}>Şu an dikkat gerektiren bulgu yok.</div>
          ) : (
            attention.map((a, i) => (
              <div key={a.t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i ? `1px solid ${P.line}` : "none" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor[a.s], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{a.t}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: sevColor[a.s], background: `${sevColor[a.s]}18`, borderRadius: 10, padding: "2px 8px" }}>{a.s}</span>
                <span style={{ width: 46, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15 }}>{fmt(a.n)}</span>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* Lokasyon */}
      <div style={{ marginTop: 12 }}>
        <Card title="Lokasyon bazlı yoğunluk" sub="En çok bulgu olan lokasyonlar (hatalı zimmet + inaktif)" span={12}
          right={<span style={{ fontSize: 11, color: P.sub }}><b style={{ color: P.red }}>■</b> Zimmet <b style={{ color: P.orange }}>■</b> İnaktif</span>}>
          {data.topLoc.length === 0 ? (
            <div style={{ fontSize: 12.5, color: P.mute }}>Lokasyon verisi yok.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "7px 32px" }}>
              {data.topLoc.map((l) => (
                <div key={l.location} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 130, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={l.location}>{l.location}</span>
                  <div style={{ flex: 1, height: 14, background: P.track, borderRadius: 2 }}>
                    <div style={{ display: "flex", height: "100%", width: `${((l.zimmet + l.inaktif) / maxLoc) * 100}%` }}>
                      <div title={`Zimmet ${l.zimmet}`} style={{ width: `${pct(l.zimmet, l.zimmet + l.inaktif)}%`, background: P.red, borderRadius: "2px 0 0 2px" }} />
                      <div title={`İnaktif ${l.inaktif}`} style={{ flex: 1, background: P.orange, borderRadius: "0 2px 2px 0" }} />
                    </div>
                  </div>
                  <span style={{ width: 40, textAlign: "right", fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(l.zimmet + l.inaktif)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: P.mute, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span>Cihaz sağlığı = (toplam cihaz − açık bulgu) ÷ toplam cihaz; bir cihaz birden fazla kategoride sayılabilir. Çözülen/yeni, seçili kıyas dönemindeki cihaz eşleştirmesinden gelir.</span>
        <span>Veri: {data.freshness.filter((f) => f.at).map((f) => `${f.label} ${new Date(f.at).toLocaleDateString("tr-TR")}`).join(" · ")}</span>
      </div>
    </div>
  );
}
