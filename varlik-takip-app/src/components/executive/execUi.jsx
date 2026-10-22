// Üst yönetim ekranı ortak parçaları: renk anlamları, biçimleyiciler, kart ve rozet bileşenleri.
// Renk sistemi (tüm ekranda aynı): mavi = ana veri, yeşil = hedefe uygun/olumlu gelişme, mercan = olumsuz sapma/dikkat, gri = ikincil bilgi.
// Renk her metriğin KENDİ anlamına göre verilir: açık/yeni/net için düşüş olumludur, çözülen için artış olumludur (bkz. toneOf).
export const C = { blue: "#4C8DF6", good: "#25B891", bad: "#F06A5C", warn: "#E9A23B" };

export const nf = (n) => (n == null || Number.isNaN(n) ? "—" : Number(n).toLocaleString("tr-TR"));
export const pf = (p, signed = false) => {
  if (p == null || Number.isNaN(p)) return "—";
  const s = Math.abs(p).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
  return `${signed ? (p > 0 ? "+" : p < 0 ? "−" : "") : p < 0 ? "−" : ""}%${s}`;
};
export const sn = (n) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("tr-TR")}`);

const D2 = (n) => String(n).padStart(2, "0");
export const fmtDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : `${D2(d.getDate())}.${D2(d.getMonth() + 1)}.${d.getFullYear()}`; };
export const fmtDateTime = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : `${fmtDate(iso)} ${D2(d.getHours())}:${D2(d.getMinutes())}`; };

// goodWhen: "down" → azalış olumlu (açık, yeni, net), "up" → artış olumlu (çözülen). Fark 0 ise nötr.
export function toneOf(abs, goodWhen) {
  if (abs == null || abs === 0) return "flat";
  return (abs < 0) === (goodWhen === "down") ? "good" : "bad";
}
export const toneColor = (tone, pal) => (tone === "good" ? C.good : tone === "bad" ? C.bad : pal.inkSoft);

export function Arrow({ dir, color, size = 14 }) {
  const d = dir === "up" ? "M7 17L17 7M9 7h8v8" : dir === "down" ? "M7 7l10 10M17 9v8H9" : "M5 12h14";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

export function Card({ pal, children, style, ...rest }) {
  return (
    <section {...rest} style={{ background: pal.panelSolid, border: `1px solid ${pal.line}`, borderRadius: 16, padding: "18px 20px", boxShadow: pal.shadow, minWidth: 0, ...style }}>
      {children}
    </section>
  );
}

export function CardHead({ pal, title, sub, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: pal.ink, letterSpacing: "-0.01em" }}>{title}</h3>
        {sub && <p style={{ margin: "3px 0 0", fontSize: 12.5, color: pal.inkSoft, lineHeight: 1.45 }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// Değişim rozeti: sayısal değer + anlamı ("27 cihaz azaldı", "%8,4 artış").
export function DeltaLine({ pal, abs, pct, goodWhen, unit = "", prefix = "", words = ["arttı", "azaldı"], zeroText = "değişmedi" }) {
  const tone = toneOf(abs, goodWhen);
  const color = toneColor(tone, pal);
  if (abs == null) return <span style={{ fontSize: 12.5, color: pal.inkSoft }}>{prefix}karşılaştırma için veri yok</span>;
  const text = abs === 0 ? zeroText : `${nf(Math.abs(abs))}${unit} ${abs > 0 ? words[0] : words[1]}${pct != null ? ` (${pf(pct)})` : ""}`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color, fontWeight: 600 }}>
      <Arrow dir={abs > 0 ? "up" : abs < 0 ? "down" : "flat"} color={color} size={13} />
      <span>{prefix}{text}</span>
    </span>
  );
}

export function Pill({ pal, tone = "flat", children, style }) {
  const color = toneColor(tone, pal);
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, color, background: `${color}22`, whiteSpace: "nowrap", ...style }}>{children}</span>;
}

export function Spark({ values, color, width = 96, height = 30 }) {
  if (!values || values.length < 3) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 3 - ((v - lo) / span) * (height - 6)}`);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r="2.8" fill={color} />
    </svg>
  );
}

export function Segmented({ pal, value, onChange, options, label, testId }) {
  return (
    <div role="group" aria-label={label} data-seg={testId} style={{ display: "inline-flex", background: pal.fieldBg, borderRadius: 10, padding: 3, gap: 2, flexWrap: "wrap" }}>
      {options.map(([id, text]) => {
        const active = value === id;
        return (
          <button key={id} type="button" aria-pressed={active} data-seg-opt={id} onClick={() => onChange(id)}
            style={{ cursor: "pointer", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: active ? 700 : 500, background: active ? C.blue : "transparent", color: active ? "#fff" : pal.inkSoft, fontFamily: "inherit" }}>
            {text}
          </button>
        );
      })}
    </div>
  );
}

export const niceMax = (v) => { const p = 10 ** Math.floor(Math.log10(Math.max(1, v))); return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => x * p >= v) || 10) * p; };
