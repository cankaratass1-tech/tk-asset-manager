import { useMemo, useState } from "react";
import { C, Card, CardHead, DeltaLine, nf, pf, sn, fmtDate, fmtDateTime, niceMax } from "./execUi.jsx";

// Ana grafik: üstte açık cihaz stoku (çizgi), altında dönem içi iş akışı (çözülen / yeni sütunları). Stok ile akış ayrı eksenlerde,
// iki bağlı panel olarak çizilir; tek eksene sıkıştırılmaz. Seriler açılıp kapatılabilir. Hedef tanımlıysa targetValue ile çizgi eklenir.
const W = 760, L = 48, R = 16, PAD = 26; // PAD: ilk/son noktadaki sütunlar çerçeveden taşmasın

// Yuvarlak eksen değerleri: veri aralığına göre 1-2-5 adımı, alt/üst sınır adımın katı
function niceAxis(lo, hi) {
  const span = Math.max(1, hi - lo);
  const raw = span / 3;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * p >= raw) || 10) * p;
  const min = Math.max(0, Math.floor(lo / step) * step);
  let max = Math.ceil(hi / step) * step;
  if (max === min) max = min + step;
  const ticks = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(Math.round(v));
  return { min, max, ticks };
}

export default function ExecTrendChart({ pal, exec, points, targetValue = null }) {
  const [on, setOn] = useState({ open: true, solved: true, fresh: true });
  const [hi, setHi] = useState(null);
  const n = points.length;
  const toggle = (k) => setOn((s) => ({ ...s, [k]: !s[k] }));
  const anyOn = on.open || on.solved || on.fresh;

  const geo = useMemo(() => {
    const x = (i) => (n === 1 ? (L + W - R) / 2 : L + PAD + (i * (W - L - R - 2 * PAD)) / (n - 1));
    const step = n > 1 ? (W - L - R - 2 * PAD) / (n - 1) : W - L - R;
    const vals = [...points.map((p) => p.open), ...(targetValue != null ? [targetValue] : [])];
    const ax = niceAxis(Math.min(...vals), Math.max(...vals));
    const flowMax = niceMax(Math.max(1, ...points.map((p) => Math.max(p.cozulen || 0, p.yeni || 0))) * 1.15);
    return { x, step, openMax: ax.max, openMin: ax.min, openTicks: ax.ticks, flowMax };
  }, [points, n, targetValue]);

  const c = exec.current;
  const header = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Seriler">
      {[["open", "Açık cihaz", C.blue], ["solved", "Çözülen", C.good], ["fresh", "Yeni açılan", C.bad]].map(([k, label, color]) => (
        <button key={k} type="button" data-series-toggle={k} aria-pressed={on[k]} onClick={() => toggle(k)}
          style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${on[k] ? color : pal.line}`, background: on[k] ? `${color}1f` : "transparent", color: on[k] ? pal.ink : pal.inkSoft, borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: on[k] ? color : pal.inkSoft, opacity: on[k] ? 1 : 0.4 }} />{label}
        </button>
      ))}
    </div>
  );

  const summary = (
    <div data-trend-summary style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", margin: "2px 0 10px", fontSize: 13, color: pal.inkSoft }}>
      <span>Başlangıç <b style={{ color: pal.ink }}>{nf(c.openStart)}</b></span>
      <span>Bitiş <b style={{ color: pal.ink }}>{nf(c.openEnd)}</b></span>
      <span>Toplam değişim <b style={{ color: c.delta < 0 ? C.good : c.delta > 0 ? C.bad : pal.ink }}>{sn(c.delta)}{c.decreasePct != null ? ` (${pf(-c.decreasePct, true)})` : ""}</b></span>
      {exec.changes
        ? <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>Önceki dönem sonu <b style={{ color: pal.ink }}>{nf(exec.previous.openEnd)}</b> <DeltaLine pal={pal} abs={exec.changes.openEnd.abs} pct={exec.changes.openEnd.pct} goodWhen="down" /></span>
        : <span>Önceki dönem: yeterli geçmiş yok</span>}
    </div>
  );

  if (n < 2) {
    return (
      <Card pal={pal} data-exec-trend>
        <CardHead pal={pal} title="Açık cihaz ve iş yükü nasıl değişiyor?" />
        <p style={{ color: pal.inkSoft, fontSize: 13 }}>Grafik için bu dönemde en az iki anlık kayıt gerekir.</p>
      </Card>
    );
  }

  const { x, step, openMax, openMin, openTicks, flowMax } = geo;
  const H1 = 190, T1 = 14, B1 = 8;
  const H2 = 130, T2 = 10, B2 = 30;
  const yOpen = (v) => T1 + (1 - (v - openMin) / (openMax - openMin || 1)) * (H1 - T1 - B1);
  const yFlow = (v) => T2 + (1 - v / flowMax) * (H2 - T2 - B2);
  const linePts = points.map((p, i) => `${x(i)},${yOpen(p.open)}`);
  const every = Math.max(1, Math.ceil(n / 9));
  const tipLeft = hi != null ? Math.min(Math.max((x(hi) / W) * 100, 16), 84) : 0;
  const grid = pal.line;

  return (
    <Card pal={pal} data-exec-trend>
      <CardHead pal={pal} title="Açık cihaz ve iş yükü nasıl değişiyor?" sub="Üst panel: dönem sonundaki açık cihaz sayısı (stok). Alt panel: o dönemde çözülen ve yeni açılan işler (akış). İki panel ayrı ölçektedir." right={header} />
      {summary}
      {!anyOn ? <p style={{ color: pal.inkSoft, fontSize: 13, padding: "20px 0" }}>Gösterilecek seri seçilmedi.</p> : (
        <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${W} ${H1 + H2}`} width="100%" style={{ display: "block" }} role="img" aria-label={`Açık cihaz ${nf(c.openStart)} değerinden ${nf(c.openEnd)} değerine; çözülen ${nf(c.cozulen)}, yeni açılan ${nf(c.yeni)}`}>
            {on.open && (
              <g>
                {openTicks.map((v) => (
                  <g key={v}><line x1={L} x2={W - R} y1={yOpen(v)} y2={yOpen(v)} stroke={grid} /><text x={L - 8} y={yOpen(v) + 4} textAnchor="end" style={{ fontSize: 11, fill: pal.inkSoft }}>{nf(v)}</text></g>
                ))}
                <polygon points={`${linePts.join(" ")} ${x(n - 1)},${yOpen(openMin)} ${x(0)},${yOpen(openMin)}`} fill={`${C.blue}22`} />
                <polyline points={linePts.join(" ")} fill="none" stroke={C.blue} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
                {targetValue != null && <g><line x1={L} x2={W - R} y1={yOpen(targetValue)} y2={yOpen(targetValue)} stroke={C.good} strokeDasharray="5 4" /><text x={W - R} y={yOpen(targetValue) - 5} textAnchor="end" style={{ fontSize: 11, fill: C.good }}>Hedef {nf(targetValue)}</text></g>}
                {points.map((p, i) => (<circle key={p.t} cx={x(i)} cy={yOpen(p.open)} r={hi === i ? 5.5 : 3.6} fill={C.blue} stroke={pal.panelSolid} strokeWidth="2" />))}
                {[0, n - 1].map((i) => (<text key={i} x={x(i)} y={yOpen(points[i].open) - 10} textAnchor={i === 0 ? "start" : "end"} style={{ fontSize: 12, fontWeight: 700, fill: pal.ink }}>{nf(points[i].open)}</text>))}
              </g>
            )}
            {(on.solved || on.fresh) && (
              <g transform={`translate(0, ${H1})`}>
                {[0, 0.5, 1].map((t) => (<g key={t}><line x1={L} x2={W - R} y1={yFlow(t * flowMax)} y2={yFlow(t * flowMax)} stroke={grid} /><text x={L - 8} y={yFlow(t * flowMax) + 4} textAnchor="end" style={{ fontSize: 11, fill: pal.inkSoft }}>{nf(Math.round(t * flowMax))}</text></g>))}
                {points.map((p, i) => {
                  if (p.cozulen == null) return null;
                  const bw = Math.max(5, Math.min(22, step * 0.28));
                  return (
                    <g key={p.t}>
                      {on.solved && <rect x={x(i) - bw - 1} y={yFlow(p.cozulen)} width={bw} height={Math.max(0, yFlow(0) - yFlow(p.cozulen))} rx="3" fill={C.good} />}
                      {on.fresh && <rect x={x(i) + 1} y={yFlow(p.yeni)} width={bw} height={Math.max(0, yFlow(0) - yFlow(p.yeni))} rx="3" fill={C.bad} />}
                    </g>
                  );
                })}
                {points.map((p, i) => (i % every === 0 || i === n - 1) && <text key={`l${p.t}`} x={x(i)} y={H2 - 8} textAnchor="middle" style={{ fontSize: 11, fill: pal.inkSoft }}>{p.label}</text>)}
              </g>
            )}
            {!(on.solved || on.fresh) && points.map((p, i) => (i % every === 0 || i === n - 1) && <text key={`l${p.t}`} x={x(i)} y={H1 + 10} textAnchor="middle" style={{ fontSize: 11, fill: pal.inkSoft }}>{p.label}</text>)}
            {points.map((p, i) => (
              <rect key={`h${p.t}`} data-trend-hit={i} x={x(i) - step / 2} y={0} width={step} height={H1 + H2} fill="transparent" tabIndex={0} role="button" aria-label={`${fmtDate(p.at)}: açık ${nf(p.open)}`}
                onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onFocus={() => setHi(i)} onBlur={() => setHi(null)} />
            ))}
            {hi != null && <line x1={x(hi)} x2={x(hi)} y1={0} y2={H1 + H2 - B2} stroke={pal.inkSoft} strokeDasharray="3 3" pointerEvents="none" />}
          </svg>
          {hi != null && (
            <div data-trend-tip style={{ position: "absolute", top: 0, left: `${tipLeft}%`, transform: "translateX(-50%)", background: pal.toastBg, color: pal.toastFg, borderRadius: 10, padding: "8px 11px", fontSize: 12, lineHeight: 1.55, pointerEvents: "none", whiteSpace: "nowrap", boxShadow: pal.shadow, zIndex: 5 }}>
              <div style={{ fontWeight: 700 }}>{fmtDateTime(points[hi].at)}</div>
              <div>Açık cihaz: <b>{nf(points[hi].open)}</b>{hi > 0 && <span> ({sn(points[hi].open - points[hi - 1].open)} önceki noktaya göre)</span>}</div>
              {points[hi].cozulen != null && <div>Çözülen: <b>{nf(points[hi].cozulen)}</b> · Yeni açılan: <b>{nf(points[hi].yeni)}</b> · Net: <b>{sn(points[hi].net)}</b></div>}
            </div>
          )}
        </div>
      )}
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: pal.inkSoft }}>Noktalar gerçek veri yükleme anlarıdır; aralarındaki dönemler tahmin edilmez.</p>
    </Card>
  );
}
