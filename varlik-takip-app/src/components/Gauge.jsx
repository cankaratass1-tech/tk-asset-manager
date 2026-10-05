// Yarım daire ibreli gösterge (Bold BI referansındaki gibi — bkz. konuşma). Renk bantları
// kırmızı → sarı → turkuaz; ibre değeri gösterir. min/max ve orta değer yazısı özelleştirilebilir.
export default function Gauge({
  value,
  min = 0,
  max = 100,
  bands = [
    { upTo: 40, color: "#F0654A" },
    { upTo: 70, color: "#F2C037" },
    { upTo: 100, color: "#2EC4B6" },
  ],
  centerLabel,
  centerSub,
  ticks = [0, 20, 40, 60, 80, 100],
  size = 190,
  pal,
}) {
  const w = size;
  const h = Math.round(size * 0.66);
  const cx = w / 2;
  const cy = h - 10;
  const r = w / 2 - 16;
  const track = 13;

  const v = value == null || Number.isNaN(value) ? min : Math.max(min, Math.min(max, value));
  const frac = (v - min) / (max - min || 1);

  // f: 0..1  →  açı π..0 (soldan sağa, üstten geçerek)
  const ang = (f) => Math.PI - f * Math.PI;
  const pt = (f, rad) => [cx + rad * Math.cos(ang(f)), cy - rad * Math.sin(ang(f))];
  const arc = (f0, f1, rad) => {
    const [x0, y0] = pt(f0, rad);
    const [x1, y1] = pt(f1, rad);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${rad} ${rad} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };

  const segs = [];
  let prev = 0;
  bands.forEach((b) => {
    const f0 = (prev - min) / (max - min || 1);
    const f1 = (b.upTo - min) / (max - min || 1);
    segs.push({ f0: Math.max(0, f0), f1: Math.min(1, f1), color: b.color });
    prev = b.upTo;
  });

  const [nx, ny] = pt(frac, r - 6);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={w} height={h + 6} viewBox={`0 0 ${w} ${h + 6}`}>
        <path d={arc(0, 1, r)} fill="none" stroke={pal ? pal.fieldBg : "#eee"} strokeWidth={track} strokeLinecap="round" />
        {segs.map((s, i) => (
          <path key={i} d={arc(s.f0, s.f1, r)} fill="none" stroke={s.color} strokeWidth={track} strokeLinecap="butt" />
        ))}
        {ticks.map((t) => {
          const f = (t - min) / (max - min || 1);
          const [tx, ty] = pt(f, r - track - 9);
          return (
            <text key={t} x={tx} y={ty} fontSize="8.5" fill={pal ? pal.inkSoft : "#888"} textAnchor="middle" dominantBaseline="middle">
              {t}
            </text>
          );
        })}
        <line x1={cx} y1={cy} x2={nx.toFixed(2)} y2={ny.toFixed(2)} stroke={pal ? pal.ink : "#333"} strokeWidth="3.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill={pal ? pal.ink : "#333"} />
      </svg>
      {centerLabel != null && (
        <span style={{ fontSize: 19, fontWeight: 800, fontFamily: "monospace", marginTop: -4, color: pal ? pal.ink : "#222" }}>{centerLabel}</span>
      )}
      {centerSub && <span style={{ fontSize: 11, color: pal ? pal.inkSoft : "#888" }}>{centerSub}</span>}
    </div>
  );
}
