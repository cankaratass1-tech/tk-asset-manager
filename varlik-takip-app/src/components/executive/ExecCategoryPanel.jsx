import { C, Card, CardHead, Pill, nf, pf, sn } from "./execUi.jsx";

// Konu bazında iyileşme. Dört kategoride de azalma olumludur (sorunlu cihaz sayısı). Veri yoksa kategori renklendirilmez.
const STATE = { improved: ["İyileşiyor", "good"], worse: ["Artıyor", "bad"], flat: ["Değişmedi", "flat"], nodata: ["Veri yok", "flat"] };

export default function ExecCategoryPanel({ pal, exec }) {
  const rows = [...exec.categories].sort((a, b) => {
    if (!a.metrics) return 1;
    if (!b.metrics) return -1;
    return (b.metrics.decreasePct ?? -Infinity) - (a.metrics.decreasePct ?? -Infinity) || a.metrics.delta - b.metrics.delta;
  });
  const withM = rows.filter((k) => k.metrics);
  const best = withM.filter((k) => k.state === "improved")[0] || null;
  const slowing = withM.filter((k) => k.state === "improved" && k.previous && k.previous.decreasePct != null && k.metrics.decreasePct != null && k.metrics.decreasePct < k.previous.decreasePct)[0] || null;
  const heaviest = [...withM].sort((a, b) => b.metrics.openEnd - a.metrics.openEnd)[0] || null;
  const review = withM.filter((k) => k.state === "worse" || (k.state === "flat" && k.metrics.openEnd > 0))[0] || null;
  const max = Math.max(1, ...withM.map((k) => Math.max(k.metrics.openStart, k.metrics.openEnd)));

  const chips = [
    ["En çok iyileşen alan", best, best && `${pf(best.metrics.decreasePct)} azaldı`, C.good],
    ["İyileşmesi yavaşlayan alan", slowing, slowing && `önceki dönem ${pf(slowing.previous.decreasePct)} → ${pf(slowing.metrics.decreasePct)}`, C.warn],
    ["Açık iş yükü en yüksek alan", heaviest, heaviest && `${nf(heaviest.metrics.openEnd)} açık bulgu`, C.blue],
    ["İlave inceleme gerektiren alan", review, review && (review.state === "worse" ? `+${nf(review.metrics.delta)} arttı` : `${nf(review.metrics.openEnd)} açık, değişmedi`), C.bad],
  ];

  return (
    <Card pal={pal} data-exec-categories>
      <CardHead pal={pal} title="Hangi konularda iyileşiyoruz?" sub="Dönem başı ve dönem sonu açık bulgu sayısı. Azalma olumludur." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 14 }}>
        {chips.map(([title, k, text, color]) => (
          <div key={title} data-cat-chip style={{ background: pal.fieldBg, borderRadius: 12, padding: "9px 11px", borderLeft: `3px solid ${k ? color : pal.line}` }}>
            <div style={{ fontSize: 11.5, color: pal.inkSoft, fontWeight: 600 }}>{title}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: pal.ink, marginTop: 2 }}>{k ? k.label : "Yok"}</div>
            {k && <div style={{ fontSize: 11.5, color: pal.inkSoft }}>{text}</div>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((k) => {
          const [text, tone] = STATE[k.state];
          const m = k.metrics;
          return (
            <div key={k.id} data-cat-row={k.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: pal.ink }}>{k.label}</span>
                <Pill pal={pal} tone={tone}>{text}{m && m.decreasePct != null && k.state !== "flat" ? ` · ${pf(m.decreasePct)}` : ""}</Pill>
              </div>
              {m ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "72px 1fr 44px", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 11.5, color: pal.inkSoft }}>Dönem başı</span>
                    <div style={{ height: 8, borderRadius: 4, background: pal.fieldBg }}><div style={{ width: `${(m.openStart / max) * 100}%`, height: 8, borderRadius: 4, background: pal.inkSoft, opacity: 0.55 }} /></div>
                    <span style={{ fontSize: 12.5, textAlign: "right", color: pal.ink, fontVariantNumeric: "tabular-nums" }}>{nf(m.openStart)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "72px 1fr 44px", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: pal.inkSoft }}>Dönem sonu</span>
                    <div style={{ height: 8, borderRadius: 4, background: pal.fieldBg }}><div style={{ width: `${(m.openEnd / max) * 100}%`, height: 8, borderRadius: 4, background: k.state === "worse" ? C.bad : k.state === "improved" ? C.good : C.blue }} /></div>
                    <span style={{ fontSize: 12.5, textAlign: "right", color: pal.ink, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{nf(m.openEnd)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: pal.inkSoft, marginTop: 4 }}>
                    Değişim {sn(m.delta)} · çözülen {nf(m.cozulen)} · yeni {nf(m.yeni)}
                    {k.previous ? ` · önceki dönem ${k.previous.decreasePct != null ? pf(k.previous.decreasePct, true) : "hesaplanamadı"}` : " · önceki dönem verisi yok"}
                  </div>
                </>
              ) : <p style={{ margin: 0, fontSize: 12.5, color: pal.inkSoft }}>Bu konu için yeterli geçmiş veri yok; sınıflandırma yapılmadı.</p>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
