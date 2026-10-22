import { useMemo, useState } from "react";
import { RANGE_LABELS, buildDetailRows, buildNarrative, buildRisks, buildSeries, bucketSeries, companiesIn, companyComparison, computeExecutive, latestSnapshotMs } from "../../services/executiveMetrics.js";
import { C, Card, CardHead, Pill, Segmented, fmtDate, fmtDateTime, nf } from "./execUi.jsx";
import ExecKpiCards from "./ExecKpiCards.jsx";
import ExecTrendChart from "./ExecTrendChart.jsx";
import ExecCompanyPanel from "./ExecCompanyPanel.jsx";
import ExecCategoryPanel from "./ExecCategoryPanel.jsx";
import ExecDetailTable from "./ExecDetailTable.jsx";

// Operasyonel Durum Özeti — üst yönetim ekranı. Tüm sayılar reportSnapshots'tan (gerçek veri yüklemeleri) hesaplanır; örnek/uydurma veri yoktur.
// Hesap tanımları: services/executiveMetrics.js (testli). Bu dosya yalnızca filtreleri tutar ve parçaları dizer.
const RANGE_KEY = "varlikTakip.execRange";
const readRange = () => { try { const v = localStorage.getItem(RANGE_KEY); return ["week", "month", "quarter", "custom"].includes(v) ? v : "week"; } catch { return "week"; } };
const isoDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const CSS = `
.exec-main{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:16px;align-items:start}
.exec-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}
@media (max-width:1100px){.exec-main{grid-template-columns:minmax(0,1fr)}}
@media (max-width:900px){.exec-two{grid-template-columns:minmax(0,1fr)}}
@media print{.exec-noprint{display:none!important}}
`;

function SummaryColumn({ pal, narrative }) {
  const blocks = [
    ["positive", "Olumlu gelişme", C.good, narrative.positive],
    ["attention", "Dikkat gerektiren konu", C.warn, narrative.attention],
    ["action", "Önerilen aksiyon", C.blue, narrative.action],
  ];
  return (
    <Card pal={pal} data-exec-summary>
      <CardHead pal={pal} title="Yönetici özeti" sub="Seçilen dönem ve filtrelere göre veriden üretilir." />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {blocks.map(([id, title, color, text]) => (
          <div key={id} data-summary-block={id} style={{ background: pal.fieldBg, borderRadius: 12, padding: "11px 13px", borderLeft: `3px solid ${color}` }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color }}>{title}</div>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, lineHeight: 1.55, color: pal.ink }}>{text}</p>
          </div>
        ))}
        {narrative.notes.map((n) => <p key={n} data-summary-note style={{ margin: 0, fontSize: 12, color: pal.inkSoft, lineHeight: 1.5 }}>ℹ {n}</p>)}
      </div>
    </Card>
  );
}

function TargetsRisks({ pal, exec }) {
  const risks = buildRisks(exec);
  const levelTone = { high: "bad", mid: "flat" };
  return (
    <Card pal={pal} data-exec-targets>
      <CardHead pal={pal} title="Hedefler ve riskler" />
      <div style={{ background: pal.fieldBg, borderRadius: 12, padding: "11px 13px", marginBottom: 12 }} data-targets-empty>
        <div style={{ fontSize: 13, fontWeight: 700, color: pal.ink }}>Hedef tanımlı değil</div>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, color: pal.inkSoft, lineHeight: 1.5 }}>
          Bu veri modelinde hedef bulunmuyor, bu yüzden hedefe kalan fark ve gerçekleşme yüzdesi gösterilmiyor. Hedef takibi için gerekli alanlar: hedef açık cihaz sayısı (üst sınır), dönemlik çözülen iş hedefi, hedef iyileşme yüzdesi ve geçerlilik dönemi.
        </p>
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: pal.ink, marginBottom: 6 }}>Veri eğilimine dayalı uyarılar</div>
      {risks.length ? (
        <ul data-risks style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {risks.map((r) => (
            <li key={r.text} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: pal.ink, lineHeight: 1.45 }}>
              <Pill pal={pal} tone={levelTone[r.level]} style={{ flex: "0 0 auto" }}>{r.level === "high" ? "Dikkat" : "İzle"}</Pill><span>{r.text}</span>
            </li>
          ))}
        </ul>
      ) : <p data-risks-none style={{ margin: 0, fontSize: 12.5, color: pal.inkSoft }}>Ölçülen verilerde olumsuz yönde bir değişim görülmedi.</p>}
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: pal.inkSoft }}>Tanımlı eşik olmadığından uyarılar yalnızca ölçülen yönlere (artış, çözülenden fazla yeni iş) dayanır.</p>
    </Card>
  );
}

export default function ExecutiveDashboard({ pal, reportSnapshots, loading = false, error = "", company = "all", onCompanyChange, companyLabel = (c) => c, onOpenOps }) {
  const [range, setRangeState] = useState(readRange);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  const snaps = useMemo(() => reportSnapshots || {}, [reportSnapshots]);
  const latest = latestSnapshotMs(snaps);
  const setRange = (r) => {
    setRangeState(r);
    try { localStorage.setItem(RANGE_KEY, r); } catch { /* sessiz geç */ }
    if (r === "custom" && !to && latest != null) { setTo(isoDay(latest)); setFrom(isoDay(latest - 7 * 86400000)); }
  };

  const opts = useMemo(() => ({ range, from, to }), [range, from, to]);
  const exec = useMemo(() => computeExecutive(snaps, { ...opts, company }), [snaps, opts, company]);
  const comps = useMemo(() => companyComparison(snaps, opts), [snaps, opts]);
  const companies = useMemo(() => companiesIn(snaps), [snaps]);
  const points = useMemo(() => {
    if (exec.status !== "ok") return [];
    const filterFn = company === "all" ? () => true : (d) => d.company === company;
    return bucketSeries(buildSeries(snaps, exec, { filterFn }), exec.spanDays);
  }, [snaps, exec, company]);
  const narrative = useMemo(() => buildNarrative(exec, comps), [exec, comps]);
  const detailRows = useMemo(() => (showDetail ? buildDetailRows(snaps, opts) : []), [showDetail, snaps, opts]);

  const ok = exec.status === "ok";
  const chip = ok ? (exec.partial ? ["warn", "Kısa geçmiş"] : ["good", "Veri hazır"]) : ["flat", "Veri yetersiz"];
  const chipColor = chip[0] === "good" ? C.good : chip[0] === "warn" ? C.warn : pal.inkSoft;

  return (
    <div data-exec-dashboard style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{CSS}</style>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: pal.ink, letterSpacing: "-0.02em" }}>Operasyonel Durum Özeti</h1>
          <p data-exec-period style={{ margin: "5px 0 0", fontSize: 13.5, color: pal.inkSoft, lineHeight: 1.5 }}>
            {ok ? <>Dönem: <b style={{ color: pal.ink }}>{fmtDate(exec.startAt)} – {fmtDate(exec.currAt)}</b> ({nf(exec.spanDays)} gün)
              {exec.previousRange ? <> · Karşılaştırma: {fmtDate(exec.previousRange.startAt)} – {fmtDate(exec.previousRange.endAt)}</> : null}</>
              : <>Dönem: {RANGE_LABELS[range]}</>}
            {" · "}Son veri güncellemesi: <b style={{ color: pal.ink }}>{latest != null ? fmtDateTime(new Date(latest).toISOString()) : "—"}</b>
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span data-exec-status style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${chipColor}66`, color: chipColor, borderRadius: 999, padding: "5px 13px", fontSize: 12.5, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: chipColor }} />{chip[1]}
          </span>
          {onOpenOps && <button type="button" data-open-ops onClick={onOpenOps} className="exec-noprint" style={{ cursor: "pointer", background: "transparent", border: `1px solid ${pal.line}`, color: pal.ink, borderRadius: 10, padding: "7px 14px", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Operasyon panosu →</button>}
        </div>
      </header>

      <Card pal={pal} data-exec-filters style={{ padding: "12px 16px" }} className="exec-noprint">
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: pal.inkSoft }}>Dönem</span>
          <Segmented pal={pal} value={range} onChange={setRange} label="Raporlama dönemi" testId="range" options={[["week", "Haftalık"], ["month", "Aylık"], ["quarter", "Son 3 ay"], ["custom", "Özel aralık"]]} />
          {range === "custom" && (
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12.5, color: pal.inkSoft }}>
              <input type="date" aria-label="Başlangıç tarihi" data-range-from value={from} onChange={(e) => setFrom(e.target.value)} style={{ background: pal.fieldBg, color: pal.ink, border: `1px solid ${pal.line}`, borderRadius: 8, padding: "5px 8px", fontFamily: "inherit" }} />
              –
              <input type="date" aria-label="Bitiş tarihi" data-range-to value={to} onChange={(e) => setTo(e.target.value)} style={{ background: pal.fieldBg, color: pal.ink, border: `1px solid ${pal.line}`, borderRadius: 8, padding: "5px 8px", fontFamily: "inherit" }} />
            </span>
          )}
          <span style={{ width: 1, height: 22, background: pal.line }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: pal.inkSoft }}>Şirket</span>
          <Segmented pal={pal} value={company} onChange={(v) => onCompanyChange && onCompanyChange(v)} label="Şirket" testId="company" options={[["all", "Tümü"], ...companies.map((c) => [c, companyLabel(c)])]} />
        </div>
      </Card>

      {error ? (
        <Card pal={pal} data-exec-error><p style={{ margin: 0, color: C.bad, fontSize: 14 }}>Veriler alınamadı: {error}</p></Card>
      ) : loading ? (
        <Card pal={pal} data-exec-loading><p style={{ margin: 0, color: pal.inkSoft, fontSize: 14 }}>Veriler yükleniyor…</p></Card>
      ) : exec.status === "invalid-range" ? (
        <Card pal={pal} data-exec-invalid><p style={{ margin: 0, color: C.warn, fontSize: 14 }}>Başlangıç tarihi bitiş tarihinden önce olmalı.</p></Card>
      ) : exec.status === "empty" ? (
        <Card pal={pal} data-exec-empty>
          <h3 style={{ margin: "0 0 6px", fontSize: 16, color: pal.ink }}>Henüz karşılaştırılacak veri yok</h3>
          <p style={{ margin: 0, fontSize: 13.5, color: pal.inkSoft, lineHeight: 1.55 }}>Bu ekran, her veri yüklemesinde otomatik alınan anlık kayıtlardan hesaplanır. Kayıt bulunmadığı için hiçbir değer gösterilmiyor; örnek veri kullanılmaz. Karşılaştırma için en az iki farklı günde veri yüklemesi gerekir.</p>
        </Card>
      ) : exec.status === "insufficient" ? (
        <Card pal={pal} data-exec-insufficient>
          <h3 style={{ margin: "0 0 6px", fontSize: 16, color: pal.ink }}>Seçili dönem için yeterli veri yok</h3>
          <p style={{ margin: 0, fontSize: 13.5, color: pal.inkSoft, lineHeight: 1.55 }}>
            Karşılaştırma için seçilen filtreye ait en az iki farklı günde kayıt gerekir. Son kayıt: {fmtDateTime(exec.latestAt)}. Başka bir dönem ya da şirket seçmeyi deneyebilirsiniz.
          </p>
        </Card>
      ) : (
        <>
          <ExecKpiCards pal={pal} exec={exec} spark={points.map((p) => p.open)} />
          <div className="exec-main">
            <ExecTrendChart pal={pal} exec={exec} points={points} />
            <SummaryColumn pal={pal} narrative={narrative} />
          </div>
          <div className="exec-two">
            <ExecCompanyPanel pal={pal} rows={comps} active={company} labelOf={companyLabel} />
            <ExecCategoryPanel pal={pal} exec={exec} />
          </div>
          <TargetsRisks pal={pal} exec={exec} />
          <div className="exec-noprint">
            <button type="button" data-detail-toggle onClick={() => setShowDetail((v) => !v)} style={{ cursor: "pointer", background: "transparent", border: `1px solid ${pal.line}`, color: pal.ink, borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", marginBottom: showDetail ? 12 : 0 }}>
              {showDetail ? "Detay tablosunu gizle" : "Detay tablosunu göster"}
            </button>
            {showDetail && <ExecDetailTable pal={pal} rows={detailRows} />}
          </div>
          <p style={{ margin: 0, fontSize: 11.5, color: pal.inkSoft, lineHeight: 1.5 }}>
            Açık bulgu = İnaktif, Hatalı zimmet, Kritik disk ve Kullanılmayan raporlarındaki sorunlu cihazların toplamı; bir cihaz birden çok konuda sorunluysa her konu ayrı sayılır. Çözülen = dönem başında sorunlu olup dönem sonunda listede olmayan, yeni = dönem başında olmayıp dönem sonunda sorunlu olan cihaz. Çözüm oranı = çözülen ÷ dönem başı açık.
            Tüm değerler gerçek veri yüklemelerinden hesaplanır; yetersiz veri durumunda gösterilmez.
          </p>
        </>
      )}
    </div>
  );
}
