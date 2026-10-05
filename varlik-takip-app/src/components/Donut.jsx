// Basit SVG donut grafik. segments: [{ value, color, label }]
export default function Donut({ segments, size = 128, thickness = 16, centerLabel, centerSub, trackColor }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={thickness} />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s, i) => {
              const frac = s.value / total;
              const dash = frac * circumference;
              const seg = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap={segments.filter((x) => x.value > 0).length > 1 ? "butt" : "round"}
                >
                  <title>{`${s.label}: ${s.value}`}</title>
                </circle>
              );
              offset += dash;
              return seg;
            })}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
        }}
      >
        <span style={{ fontSize: size * 0.19, fontWeight: 700, fontFamily: "monospace", lineHeight: 1 }}>{centerLabel}</span>
        {centerSub && <span style={{ fontSize: size * 0.08, opacity: 0.6 }}>{centerSub}</span>}
      </div>
    </div>
  );
}
