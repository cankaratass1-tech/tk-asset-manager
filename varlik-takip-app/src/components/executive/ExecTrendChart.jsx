import { useId, useMemo, useState } from "react";
import { C, Card, CardHead, DeltaLine, nf, pf, sn, fmtDate, fmtDateTime, niceMax } from "./execUi.jsx";

// Ana grafik: üstte açık cihaz stoku (çizgi), altında dönem içi iş akışı (çözülen / yeni sütunları). Stok ile akış ayrı eksenlerde,
// iki bağlı panel olarak çizilir; tek eksene sıkıştırılmaz. Seriler açılıp kapatılabilir.
// Üst panelin iki görünümü var: "Sayı" (dönem sonu açık cihaz) ve "Başlangıca göre fark" (açık − dönem başı açık). Eksen verinin aralığına
// göre ölçeklenir (sıfırdan başlamaz), böylece küçük ama gerçek değişimler görünür. Başlangıç seviyesinin altı (iyileşme) yeşil, üstü (artış) mercan boyanır.
// Hedef çizgisi (varsa) veriye yakınsa eksene dahil edilir; çok uzaktaysa grafiği düzleştirmemek için kenarda bir not olarak gösterilir.
const W = 760, L = 52, R = 16, PAD = 26;

// Yuvarlak eksen değerleri: veri aralığına göre 1-2-5 adımı; allowNeg=false ise alt sınır 0'ın altına inmez
function niceAxis(lo, hi, allowNeg) {
  const span = Math.max(1, hi - lo);
  const raw = span / 3;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * p >= raw) || 10) * p;
  let min = Math.floor(lo / step) * step;
  if (!allowNeg) min = Math.max(0, min);
  let max = Math.ceil(hi / step) * step;
  if (max === min) max = min + step;
  const ticks = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(Math.round(v));
  return { min, max, ticks };
}

export default function ExecTrendChart({ pal, exec, points, targetValue = null }) {
  const uid = useId().replace(/:/g, "");
  const [on, setOn] = useState({ open: true, solved: true, fresh: true });
  const [mode, setMode] = useState("level"); // level | change
  const [hi, setHi] = useState(null);
  const n = points.length;
  const toggle = (k) => setOn((s) => ({ ...s, [k]: !s[k] }));
  const anyOn = on.open || on.solved || on.fresh;
  const c = exec.current;
  const base = c.openStart; // başlangıç seviyesi

  const geo = useMemo(() => {
    const x = (i) => (n === 1 ? (L + W - R) / 2 : L + PAD + (i * (W - L - R - 2 * PAD)) / (n - 1));
    const step = n > 1 ? (W - L - R - 2 * PAD) / (n - 1) : W - L - R;
    const val = (p) => (mode === "change" ? p.open - base : p.open);
    const vals = points.map(val);
    const lo = Math.min(...vals, mode === "change" ? 0 : Infinity), hiV = Math.max(...vals, mode === "change" ? 0 : -Infinity);
    const span = Math.max(1, hiV - lo);
    let aLo = lo - span * 0.25, aHi = hiV + span * 0.25;
    const t = targetValue == null ? null : mode === "change" ? targetValue - base : targetValue;
    let targetIn = false;
    if (t != null) {
      // hedef, veri aralığının birkaç katı uzaklıktaysa eksene katılmaz (grafik düzleşmesin)
      const near = t >= aLo - span * 2 && t <= aHi + span * 2;
      if (near) { aLo = Math.min(aLo, t - span * 0.1); aHi = Math.max(aHi, t + span * 0.1); targetIn = true; }
    }
    const ax = niceAxis(aLo, aHi, mode === "change");
    const flowMax = niceMax(Math.max(1, ...points.map((p) => Math.max(p.cozulen || 0, p.yeni || 0))) * 1.15);
    return { x, step, val, ax, flowMax, t, targetIn };
  }, [points, n, mode, base, targetValue]);

  const header = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} role="group" aria-label="Seriler">
      {[["open", "Açık cihaz", C.blue], ["solved", "Çözülen", C.good], ["fresh", "Yeni açılan", C.bad]].map(([k, label, color]) => (
        <button key={k} type="button" data-series-toggle={k} aria-pressed={on[k]} onClick={() => toggle(k)}
          style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${on[k] ? color : pal.line}`, background: on[k] ? `${color}1f` : "transparent", color: on[k] ? pal.ink : pal.inkSoft, borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: on[k] ? color : pal.inkSoft, opacity: on[k] ? 1 : 0.4 }} />{label}
        </button>
      ))}
      <span style={{ display: "inline-flex", background: pal.fieldBg, borderRadius: 999, padding: 2, marginLeft: 4 }} role="group" aria-label="Görünüm">
        {[["level", "Sayı"], ["change", "Başlangıca göre fark"]].map(([k, label]) => (
          <button key={k} type="button" data-trend-mode={k} aria-pressed={mode === k} onClick={() => setMode(k)}
            style={{ cursor: "pointer", border: "none", borderRadius: 999, padding: "3px 11px", fontSize: 12, fontWeight: mode === k ? 700 : 500, background: mode === k ? C.blue : "transparent", color: mode === k ? "#fff" : pal.inkSoft, fontFamily: "inherit" }}>{label}</button>
        ))}
      </span>
    </div>
  );

  const verdict = c.delta < 0
    ? { tone: C.good, text: `Açık cihaz ${nf(c.openStart)} → ${nf(c.openEnd)}: ${nf(-c.delta)} cihaz azaldı${c.decreasePct != null ? ` (${pf(c.decreasePct)})` : ""}. İyileşme var.` }
    : c.delta > 0
    ? { tone: C.bad, text: `Açık cihaz ${nf(c.openStart)} → ${nf(c.openEnd)}: ${nf(c.delta)} cihaz arttı. Dikkat gerekiyor.` }
    : { tone: pal.inkSoft, text: `Açık cihaz sayısı değişmedi (${nf(c.openEnd)}).` };
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

  const verdictBar = (
    <div data-trend-verdict style={{ borderLeft: `3px solid ${verdict.tone}`, background: pal.fieldBg, borderRadius: 10, padding: "8px 12px", margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: pal.ink }}>{verdict.text}</div>
  );

  if (n < 2) {
    return (
      <Card pal={pal} data-exec-trend>
        <CardHead pal={pal} title="Açık cihaz ve iş yükü nasıl değişiyor?" />
        <p style={{ color: pal.inkSoft, fontSize: 13 }}>Grafik için bu dönemde en az iki anlık kayıt gerekir.</p>
      </Card>
    );
  }

  const { x, step, val, ax, flowMax, t, targetIn } = geo;
  const H1 = 200, T1 = 18, B1 = 8;
  const H2 = 130, T2 = 10, B2 = 30;
  const yOpen = (v) => T1 + (1 - (v - ax.min) / (ax.max - ax.min || 1)) * (H1 - T1 - B1);
  const yFlow = (v) => T2 + (1 - v / flowMax) * (H2 - T2 - B2);
  const baseV = mode === "change" ? 0 : base;
  const yB = yOpen(baseV);
  const linePts = points.map((p, i) => `${x(i)},${yOpen(val(p))}`);
  const area = `${linePts.join(" ")} ${x(n - 1)},${yB} ${x(0)},${yB}`;
  const every = Math.max(1, Math.ceil(n / 9));
  const tipLeft = hi != null ? Math.min(Math.max((x(hi) / W) * 100, 16), 84) : 0;
  const grid = pal.line;
  const tickLabel = (v) => (mode === "change" ? sn(v) : nf(v));
  const showAll = n <= 8; // az nokta varsa her noktanın değeri yazılır

  return (
    <Card pal={pal} data-exec-trend>
      <CardHead pal={pal} title="Açık cihaz ve iş yükü nasıl değişiyor?" sub="Çizgi aşağı iniyorsa açık cihaz azalıyor (iyi), yukarı çıkıyorsa artıyor (dikkat). Sütunlar her kayıt aralığında çözülen (yeşil) ve yeni çıkan (kırmızı) işleri gösterir." right={header} />
      {verdictBar}
      {summary}
      {!anyOn ? <p style={{ color: pal.inkSoft, fontSize: 13, padding: "20px 0" }}>Gösterilecek seri seçilmedi.</p> : (
        <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${W} ${H1 + H2}`} width="100%" style={{ display: "block" }} role="img" aria-label={`Açık cihaz ${nf(c.openStart)} değerinden ${nf(c.openEnd)} değerine; çözülen ${nf(c.cozulen)}, yeni açılan ${nf(c.yeni)}`}>
            <defs>
              <clipPath id={`${uid}-up`}><rect x={0} y={0} width={W} height={Math.max(0, yB)} /></clipPath>
              <clipPath id={`${uid}-dn`}><rect x={0} y={yB} width={W} height={Math.max(0, H1 - yB)} /></clipPath>
            </defs>
            {on.open && (
              <g>
                <text x={L} y={11} style={{ fontSize: 11.5, fontWeight: 700, fill: pal.inkSoft }}>{mode === "change" ? "Başlangıca göre fark (cihaz)" : "Açık cihaz sayısı"}</text>
                {ax.ticks.map((v) => (
                  <g key={v}><line x1={L} x2={W - R} y1={yOpen(v)} y2={yOpen(v)} stroke={grid} /><text data-axis-tick x={L - 8} y={yOpen(v) + 4} textAnchor="end" style={{ fontSize: 11, fill: pal.inkSoft }}>{tickLabel(v)}</text></g>
                ))}
                <polygon points={area} fill={`${C.bad}30`} clipPath={`url(#${uid}-up)`} />
                <polygon points={area} fill={`${C.good}38`} clipPath={`url(#${uid}-dn)`} />
                <line x1={L} x2={W - R} y1={yB} y2={yB} stroke={pal.inkSoft} strokeDasharray="4 4" strokeWidth="1.2" />
                <text x={W - R} y={yB - 5} textAnchor="end" style={{ fontSize: 11, fill: pal.inkSoft }}>Başlangıç: {nf(base)}</text>
                <polyline points={linePts.join(" ")} fill="none" stroke={C.blue} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />
                {t != null && targetIn && <g><line x1={L} x2={W - R} y1={yOpen(t)} y2={yOpen(t)} stroke={C.good} strokeDasharray="6 4" strokeWidth="1.6" /><text x={L + 6} y={yOpen(t) - 5} style={{ fontSize: 11, fill: C.good, fontWeight: 700 }}>Hedef: en çok {nf(targetValue)} açık</text></g>}
                {points.map((p, i) => (<circle key={p.t} cx={x(i)} cy={yOpen(val(p))} r={hi === i ? 5.8 : 3.8} fill={C.blue} stroke={pal.panelSolid} strokeWidth="2" />))}
                {points.map((p, i) => (showAll || i === 0 || i === n - 1) && (
                  <text key={`v${p.t}`} x={x(i)} y={yOpen(val(p)) + (val(p) >= baseV ? -10 : 17)} textAnchor={i === 0 && !showAll ? "start" : i === n - 1 && !showAll ? "end" : "middle"} style={{ fontSize: 12, fontWeight: 700, fill: pal.ink }}>{mode === "change" ? sn(val(p)) : nf(p.open)}</text>
                ))}
              </g>
            )}
            {(on.solved || on.fresh) && (
              <g transform={`translate(0, ${H1})`}>
                <text x={L} y={8} style={{ fontSize: 11.5, fontWeight: 700, fill: pal.inkSoft }}>Çözülen ve yeni açılan iş (adet)</text>
                {[0, 0.5, 1].map((tt) => (<g key={tt}><line x1={L} x2={W - R} y1={yFlow(tt * flowMax)} y2={yFlow(tt * flowMax)} stroke={grid} /><text x={L - 8} y={yFlow(tt * flowMax) + 4} textAnchor="end" style={{ fontSize: 11, fill: pal.inkSoft }}>{nf(Math.round(tt * flowMax))}</text></g>))}
                {points.map((p, i) => {
                  if (p.cozulen == null) return null;
                  const bw = Math.max(5, Math.min(22, step * 0.28));
                  return (
                    <g key={p.t}>
                      {on.solved && <rect x={x(i) - bw - 1} y={yFlow(p.cozulen)} width={bw} height={Math.max(0, yFlow(0) - yFlow(p.cozulen))} rx="3" fill={C.good} />}
                      {on.fresh && <rect x={x(i) + 1} y={yFlow(p.yeni)} width={bw} height={Math.max(0, yFlow(0) - yFlow(p.yeni))} rx="3" fill={C.bad} />}
                      {showAll && on.solved && p.cozulen > 0 && <text x={x(i) - bw / 2 - 1} y={yFlow(p.cozulen) - 4} textAnchor="middle" style={{ fontSize: 10.5, fill: pal.inkSoft }}>{nf(p.cozulen)}</text>}
                      {showAll && on.fresh && p.yeni > 0 && <text x={x(i) + bw / 2 + 1} y={yFlow(p.yeni) - 4} textAnchor="middle" style={{ fontSize: 10.5, fill: pal.inkSoft }}>{nf(p.yeni)}</text>}
                    </g>
                  );
                })}
                {points.map((p, i) => (i % every === 0 || i === n - 1) && <text key={`l${p.t}`} x={x(i)} y={H2 - 8} textAnchor="middle" style={{ fontSize: 11, fill: pal.inkSoft }}>{p.label}</text>)}
              </g>
            )}
            {!(on.solved || on.fresh) && points.map((p, i) => (i % every === 0 || i === n - 1) && <text key={`l${p.t}`} x={x(i)} y={H1 + 10} textAnchor="middle" style={{ fontSize: 11, fill: pal.inkSoft }}>{p.label}</text>)}
            {points.map((p, i) => (
              <rect key={`h${p.t}`} data-trend-hit={i} x={x(i) - step / 2} y={0} width={step} height={H1 + H2} fill="transparent" tabIndex={0} role="button" style={{ outline: "none", cursor: "default" }} aria-label={`${fmtDate(p.at)}: açık ${nf(p.open)}`}
                onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onFocus={() => setHi(i)} onBlur={() => setHi(null)} />
            ))}
          </svg>
          {hi != null && (
            <div data-trend-tip style={{ position: "absolute", top: 0, left: `${tipLeft}%`, transform: "translateX(-50%)", background: pal.toastBg, color: pal.toastFg, borderRadius: 10, padding: "8px 11px", fontSize: 12, lineHeight: 1.55, pointerEvents: "none", whiteSpace: "nowrap", boxShadow: pal.shadow, zIndex: 5 }}>
              <div style={{ fontWeight: 700 }}>{fmtDateTime(points[hi].at)}</div>
              <div>Açık cihaz: <b>{nf(points[hi].open)}</b>{hi > 0 && <span> ({sn(points[hi].open - points[hi - 1].open)} önceki noktaya göre)</span>}</div>
              <div>Başlangıca göre: <b>{sn(points[hi].open - base)}</b></div>
              {points[hi].cozulen != null && <div>Çözülen: <b>{nf(points[hi].cozulen)}</b> · Yeni açılan: <b>{nf(points[hi].yeni)}</b> · Net: <b>{sn(points[hi].net)}</b></div>}
            </div>
          )}
        </div>
      )}
      {t != null && !targetIn && <p data-target-offscale style={{ margin: "8px 0 0", fontSize: 12, color: C.good, fontWeight: 700 }}>▼ Hedef: en çok {nf(targetValue)} açık bulgu; grafiğin çok altında kaldığı için çizgi gösterilmedi (ayrıntı "Hedefler ve riskler" kartında).</p>}
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: pal.inkSoft }}>Noktalar gerçek veri yükleme anlarıdır; aralarındaki dönemler tahmin edilmez.</p>
    </Card>
  );
}
