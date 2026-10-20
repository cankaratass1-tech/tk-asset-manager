import { useState } from "react";

// Ortak "Açık Bulgu Trendi" grafiği (Ana Sayfa yeni görünüm + Yönetici Özeti). Yalnız GERÇEK anlık kayıtlardan (snapshot) gelen serileri çizer;
// eksik dönemleri tahmin etmez/uydurmaz. Özellikler: dönem seçici (günlük / haftalık / aylık / her yükleme), hover bilgi kutusu (tarih, toplam, kategori
// sayıları, önceki döneme göre fark), noktaya/sütuna tıklayınca ayrıntı (onPointClick), eksen ve etiketler, dar ekranda ölçeklenen SVG.
const TREND_MODES = [["day", "Günlük"], ["week", "Haftalık"], ["month", "Aylık"], ["raw", "Her yükleme"]];
const MODE_NOUN = { day: "gün", week: "hafta", month: "ay", raw: "kayıt" };

const niceMax = (v) => { const p = 10 ** Math.floor(Math.log10(Math.max(1, v))); return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => x * p >= v) || 10) * p; };
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("tr-TR"));

// series: [{ label, perReportOpen: {id: n} }]; keys: görünür kategori id'leri; meta: { id: { label, color } }
export default function TrendChart({ series, keys, meta, stacked = false, mode, onModeChange, onPointClick, tone, accent }) {
  const [hover, setHover] = useState(null);
  const W = 640, H = 240, L = 46, Rg = 22, T = 26, B = 34;
  const n = series.length;
  const totals = series.map((s) => keys.reduce((a, k) => a + (s.perReportOpen[k] || 0), 0));
  const ymax = niceMax(Math.max(1, ...totals) * 1.08);
  const x = (i) => (n === 1 ? (L + W - Rg) / 2 : L + (i * (W - L - Rg)) / (n - 1));
  const y = (v) => T + (1 - v / ymax) * (H - T - B);
  const step = n > 1 ? (W - L - Rg) / (n - 1) : W - L - Rg;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * ymax);
  const every = Math.max(1, Math.ceil(n / 8)); // etiket sıklığı
  const showLabel = (i) => i % every === 0 || i === n - 1;

  const stacks = stacked
    ? keys.map((k, ki) => {
        const lower = series.map((s) => keys.slice(0, ki).reduce((a, kk) => a + (s.perReportOpen[kk] || 0), 0));
        const upper = series.map((s, i) => lower[i] + (s.perReportOpen[k] || 0));
        return { k, lower, upper };
      })
    : [];
  const linePts = totals.map((v, i) => [x(i), y(v)]);
  const delta = (i) => (i > 0 ? totals[i] - totals[i - 1] : null);

  const hi = hover != null ? hover : null;
  const tipLeft = hi != null ? Math.min(Math.max((x(hi) / W) * 100, 14), 86) : 0;

  return (
    <div data-trend-chart>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }} role="group" aria-label="Trend dönemi">
        <span style={{ fontSize: 12, color: tone.sub, marginRight: 2 }}>Dönem:</span>
        {TREND_MODES.map(([id, label]) => (
          <button key={id} type="button" data-trend-mode={id} aria-pressed={mode === id} onClick={() => onModeChange(id)}
            style={{ cursor: "pointer", border: `1px solid ${mode === id ? accent : tone.grid}`, background: mode === id ? `${accent}1f` : "transparent", color: mode === id ? accent : tone.sub, borderRadius: 14, padding: "3px 11px", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>

      {n < 2 ? (
        <div data-trend-empty style={{ fontSize: 13, color: tone.sub, padding: "26px 0" }}>
          Bu dönem seçiminde trend için en az 2 {MODE_NOUN[mode]} verisi gerekli ({n}/2). Her veri yüklemesinde otomatik kayıt oluşur; farklı bir dönem seçmeyi deneyin.
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label={`Açık bulgu trendi, ${n} ${MODE_NOUN[mode]}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={L} x2={W - Rg} y1={y(t)} y2={y(t)} stroke={tone.grid} strokeWidth="1" />
                <text x={L - 7} y={y(t) + 4} textAnchor="end" style={{ fontSize: 11, fill: tone.mute }}>{fmt(Math.round(t))}</text>
              </g>
            ))}
            {stacked
              ? stacks.map((st) => {
                  const top = st.upper.map((v, i) => `${x(i)},${y(v)}`);
                  const bot = st.lower.map((v, i) => `${x(i)},${y(v)}`).reverse();
                  return <polygon key={st.k} points={[...top, ...bot].join(" ")} fill={`${meta[st.k].color}CC`} stroke={meta[st.k].color} strokeWidth="1" />;
                })
              : (
                <>
                  <polygon points={`${linePts.map((p) => p.join(",")).join(" ")} ${x(n - 1)},${y(0)} ${x(0)},${y(0)}`} fill={`${accent}22`} />
                  <polyline points={linePts.map((p) => p.join(",")).join(" ")} fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" />
                </>
              )}
            {series.map((s, i) => (
              <g key={s.label}>
                <circle cx={x(i)} cy={y(totals[i])} r={hi === i ? 5.5 : 3.8} fill={stacked ? "#fff" : accent} stroke={stacked ? tone.ink : "#fff"} strokeWidth="1.8" />
                {(n <= 12 || hi === i || i === n - 1) && (
                  <text x={x(i)} y={y(totals[i]) - 9} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: tone.ink }}>{fmt(totals[i])}</text>
                )}
                {showLabel(i) && <text x={x(i)} y={H - 12} textAnchor="middle" style={{ fontSize: 11, fill: tone.mute }}>{s.label}</text>}
              </g>
            ))}
            {/* etkileşim alanları: sütun genişliğinde şeffaf dikdörtgenler (hover + tıklama + klavye) */}
            {series.map((s, i) => (
              <rect key={`hit-${s.label}`} data-trend-point={i} x={x(i) - step / 2} y={T - 6} width={step} height={H - T - B + 6} fill="transparent"
                role="button" tabIndex={0} aria-label={`${s.label}: ${fmt(totals[i])} açık bulgu, ayrıntıyı aç`}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                onClick={() => onPointClick(i)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPointClick(i); } }} />
            ))}
            {hi != null && <line x1={x(hi)} x2={x(hi)} y1={T - 6} y2={H - B} stroke={tone.mute} strokeDasharray="3 3" pointerEvents="none" />}
          </svg>
          {hi != null && (
            <div data-trend-tip style={{ position: "absolute", top: 0, left: `${tipLeft}%`, transform: "translateX(-50%)", background: tone.tipBg, color: tone.tipFg, borderRadius: 8, padding: "8px 11px", fontSize: 12, lineHeight: 1.5, pointerEvents: "none", boxShadow: "0 6px 18px rgba(0,0,0,0.25)", whiteSpace: "nowrap", zIndex: 5 }}>
              <div style={{ fontWeight: 700 }}>{series[hi].label}</div>
              <div>Toplam açık bulgu: <b>{fmt(totals[hi])}</b>{delta(hi) != null && <span> ({delta(hi) > 0 ? "+" : ""}{fmt(delta(hi))} önceki dönemden)</span>}</div>
              {keys.map((k) => <div key={k}><span style={{ color: meta[k].color }}>■</span> {meta[k].label}: {fmt(series[hi].perReportOpen[k] || 0)}</div>)}
              <div style={{ opacity: 0.75, marginTop: 2 }}>Tıkla: ayrıntı</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
