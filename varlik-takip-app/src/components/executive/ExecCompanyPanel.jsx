import { C, Card, CardHead, DeltaLine, Pill, nf, pf, sn } from "./execUi.jsx";

// Şirket karşılaştırması. Her metrik KENDİ içinde aynı ölçekte çizilir (bir metriğin en büyük değeri çubuğun tamamıdır).
// Şirketlerin iş hacmi farklı olabileceğinden mutlak adetlerin yanında oran (çözüm oranı = çözülen ÷ dönem başı açık) ve
// dönem başına göre değişim gösterilir. Tek bir "kazanan" ilan edilmez; yalnızca her metrikte hangi şirketin daha iyi olduğu belirtilir.
const METRICS = [
  { key: "openEnd", label: "Açık cihaz (dönem sonu)", good: "down", fmt: nf, hint: "Azalması olumlu" },
  { key: "cozulen", label: "Çözülen iş", good: "up", fmt: nf, hint: "Artması olumlu" },
  { key: "yeni", label: "Yeni açılan iş", good: "down", fmt: nf, hint: "Azalması olumlu" },
  { key: "net", label: "Net iş akışı", good: "down", fmt: sn, hint: "Negatif = çözülen fazla (olumlu)", signed: true },
  { key: "resolveRate", label: "Çözüm oranı", good: "up", fmt: (v) => pf(v), hint: "Çözülen ÷ dönem başı açık" },
];

export default function ExecCompanyPanel({ pal, rows, active, labelOf }) {
  const ok = rows.filter((r) => r.result.status === "ok");
  if (rows.length < 2 || ok.length < 2) {
    return (
      <Card pal={pal} data-exec-company>
        <CardHead pal={pal} title="Şirket performansı karşılaştırması" />
        <p style={{ color: pal.inkSoft, fontSize: 13, margin: 0 }}>{rows.length < 2 ? "Karşılaştırma için kayıtlarda en az iki şirket görünmüyor." : "Şirketlerin en az ikisi için yeterli geçmiş veri yok."}</p>
      </Card>
    );
  }
  const colors = [C.blue, "#9B8CF2", "#4FB6C9", "#D68FD0"];
  const verdicts = [];

  return (
    <Card pal={pal} data-exec-company>
      <CardHead pal={pal} title="Şirket performansı karşılaştırması" sub="Aynı dönem ve aynı tanımlarla. Mutlak adetler iş hacmine bağlıdır; oranlar ve değişimler birlikte okunmalıdır." />
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
        {ok.map((r, i) => (
          <span key={r.company} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: pal.ink, fontWeight: active === r.company ? 800 : 600 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[i % colors.length] }} />{labelOf(r.company)}
            <span style={{ color: pal.inkSoft, fontWeight: 500 }}>· iş hacmi {nf(r.result.current.openStart + r.result.current.yeni)}</span>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {METRICS.map((m) => {
          const vals = ok.map((r) => r.result.current[m.key]);
          const max = Math.max(1, ...vals.map((v) => Math.abs(v ?? 0)));
          const withVal = ok.filter((r) => r.result.current[m.key] != null);
          let best = null;
          if (withVal.length >= 2) {
            const sorted = [...withVal].sort((a, b) => (m.good === "down" ? a.result.current[m.key] - b.result.current[m.key] : b.result.current[m.key] - a.result.current[m.key]));
            if (sorted[0].result.current[m.key] !== sorted[sorted.length - 1].result.current[m.key]) best = sorted[0];
          }
          if (best) verdicts.push(`${m.label}: ${labelOf(best.company)} daha iyi`);
          return (
            <div key={m.key} data-company-metric={m.key}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: pal.ink }}>{m.label}</span>
                <span style={{ fontSize: 11.5, color: pal.inkSoft }}>{m.hint}</span>
              </div>
              {ok.map((r, i) => {
                const v = r.result.current[m.key];
                const ch = r.result.changes && r.result.changes[m.key === "resolveRate" ? "openEnd" : m.key];
                const isBest = best && best.company === r.company;
                return (
                  <div key={r.company} style={{ display: "grid", gridTemplateColumns: "minmax(70px, 96px) 1fr minmax(64px, auto)", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, color: pal.inkSoft }}>{labelOf(r.company)}</span>
                    <div style={{ height: 10, borderRadius: 5, background: pal.fieldBg, position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 0, bottom: 0, left: m.signed ? (v < 0 ? `${50 - (Math.abs(v) / max) * 50}%` : "50%") : 0, width: v == null ? 0 : m.signed ? `${(Math.abs(v) / max) * 50}%` : `${(Math.abs(v) / max) * 100}%`, background: colors[i % colors.length], borderRadius: 5, opacity: isBest ? 1 : 0.75 }} />
                      {m.signed && <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: pal.inkSoft, opacity: 0.5 }} />}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: pal.ink, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v == null ? "—" : m.fmt(v)}{ch && m.key !== "resolveRate" && <span style={{ marginLeft: 6 }} />}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 14, borderTop: `1px solid ${pal.line}`, paddingTop: 10 }}>
        <p style={{ margin: "0 0 6px", fontSize: 12.5, fontWeight: 700, color: pal.ink }}>Önceki döneme göre açık cihaz değişimi</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {ok.map((r) => (
            <span key={r.company} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5, color: pal.inkSoft }}>
              {labelOf(r.company)}:
              {r.result.changes ? <DeltaLine pal={pal} abs={r.result.changes.openEnd.abs} pct={r.result.changes.openEnd.pct} goodWhen="down" unit=" cihaz" /> : <span>önceki dönem verisi yok</span>}
            </span>
          ))}
        </div>
        <div data-company-verdicts style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {verdicts.length ? verdicts.map((v) => <Pill key={v} pal={pal} tone="flat">{v}</Pill>) : <span style={{ fontSize: 12.5, color: pal.inkSoft }}>Şirketler arasında belirgin fark yok.</span>}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: pal.inkSoft }}>Genel bir sıralama yapılmadı: iş hacmi ve kapsam farklı olduğundan tek bir kazanan ilan edilmez.</p>
      </div>
    </Card>
  );
}
