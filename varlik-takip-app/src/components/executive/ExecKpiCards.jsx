import { C, Card, DeltaLine, Spark, nf, pf, sn, fmtDate, toneColor, toneOf } from "./execUi.jsx";

// Beş KPI kartı. Aynı hesaplar (computeExecutive) tüm ekranda kullanılır; burada yalnızca gösterim var.
const Icon = ({ d, color }) => (
  <span style={{ width: 34, height: 34, borderRadius: 10, background: `${color}22`, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  </span>
);
const ICONS = {
  open: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 21h8M12 19v2",
  solved: "M5 13l4 4L19 7",
  fresh: "M12 5v14M5 12h14",
  net: "M4 17l5-5 4 4 7-8M15 8h5v5",
  better: "M3 17l6-6 4 4 8-8M17 7h4v4",
};

function KpiCard({ pal, id, icon, color, label, value, valueColor, lines, spark, note }) {
  return (
    <Card pal={pal} data-kpi={id} style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon d={ICONS[icon]} color={color} />
        <span style={{ fontSize: 13, color: pal.inkSoft, fontWeight: 600, lineHeight: 1.3 }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <span data-kpi-value style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05, color: valueColor || pal.ink, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {spark}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{lines}</div>
      {note && <p style={{ margin: 0, fontSize: 12, color: pal.inkSoft, lineHeight: 1.45 }}>{note}</p>}
    </Card>
  );
}

export default function ExecKpiCards({ pal, exec, spark, health = null, target = null }) {
  const c = exec.current;
  const ch = exec.changes;
  const vs = "Önceki döneme göre ";
  const noPrev = <span style={{ fontSize: 12, color: pal.inkSoft }}>Önceki dönem için yeterli geçmiş yok</span>;
  const range = `${fmtDate(exec.startAt)} – ${fmtDate(exec.currAt)}`;

  const netTone = toneOf(c.net, "down");
  const netText = c.net === 0 ? "Yeni açılan iş ve çözülen iş eşit." : c.net > 0 ? `Yeni açılan iş çözülenden ${nf(c.net)} fazla; iş yükü artıyor.` : `Çözülen iş yeni açılandan ${nf(-c.net)} fazla; iş yükü azalıyor.`;

  const improvementColor = c.decreasePct == null ? pal.inkSoft : c.decreasePct > 0 ? C.good : c.decreasePct < 0 ? C.bad : pal.inkSoft;
  const improvementValue = c.decreasePct == null ? "—" : pf(c.decreasePct);

  return (
    <div data-exec-kpis style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
      <KpiCard pal={pal} id="open" icon="open" color={C.blue} label="Açık bulgu (cihaz)" value={nf(c.openEnd)}
        spark={<Spark values={spark} color={C.blue} />}
        lines={[
          <DeltaLine key="a" pal={pal} abs={c.delta} pct={c.decreasePct != null ? -c.decreasePct : null} goodWhen="down" unit=" cihaz" prefix="Dönem başına göre " words={["arttı", "azaldı"]} />,
          ch ? <DeltaLine key="b" pal={pal} abs={ch.openEnd.abs} pct={ch.openEnd.pct} goodWhen="down" prefix={vs} unit=" cihaz" /> : <span key="b">{noPrev}</span>,
        ]} />
      <KpiCard pal={pal} id="solved" icon="solved" color={C.good} label="Çözülen iş" value={nf(c.cozulen)}
        lines={[
          ch ? <DeltaLine key="a" pal={pal} abs={ch.cozulen.abs} pct={ch.cozulen.pct} goodWhen="up" prefix={vs} /> : <span key="a">{noPrev}</span>,
          <span key="t" style={{ fontSize: 12, color: pal.inkSoft }}>Hedef tanımlı değil</span>,
        ]} />
      <KpiCard pal={pal} id="new" icon="fresh" color={C.warn} label="Yeni açılan iş" value={nf(c.yeni)}
        lines={[ch ? <DeltaLine key="a" pal={pal} abs={ch.yeni.abs} pct={ch.yeni.pct} goodWhen="down" prefix={vs} /> : <span key="a">{noPrev}</span>]} />
      <KpiCard pal={pal} id="net" icon="net" color={toneColor(netTone, pal)} label="Net iş akışı" value={sn(c.net)} valueColor={toneColor(netTone, pal)}
        lines={[<span key="a" style={{ fontSize: 12.5, fontWeight: 600, color: toneColor(netTone, pal) }}>{netText}</span>]}
        note="Net iş akışı = yeni açılan − çözülen" />
      <KpiCard pal={pal} id="improve" icon="better" color={improvementColor} label="Genel iyileşme" value={improvementValue} valueColor={improvementColor}
        lines={[
          <span key="a" style={{ fontSize: 12.5, fontWeight: 600, color: improvementColor }}>
            {c.decreasePct == null ? "Dönem başı 0: yüzde hesaplanamaz" : c.decreasePct > 0 ? `Açık bulgu ${nf(c.openStart)} → ${nf(c.openEnd)}` : c.decreasePct < 0 ? `Açık bulgu arttı: ${nf(c.openStart)} → ${nf(c.openEnd)}` : `Açık bulgu değişmedi (${nf(c.openEnd)})`}
          </span>,
          <span key="b" style={{ fontSize: 12, color: pal.inkSoft }}>{range} · {nf(exec.spanDays)} gün</span>,
        ]}
        note={health ? `Hedef: cihaz sağlığı %${health.target.toLocaleString("tr-TR")} · güncel ${pf(health.healthPct)} · ${health.reached ? "hedefe ulaşıldı" : `${health.gapPoints.toLocaleString("tr-TR")} puan eksik`}` : target == null ? "Hedef tanımlı değil." : "Hedef tanımlı; sağlık oranı için toplam cihaz sayısı gerekli."} />
    </div>
  );
}
