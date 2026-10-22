import { useMemo, useState } from "react";
import { rowsToCsv } from "../../services/executiveMetrics.js";
import { Card, CardHead, nf, pf, sn, toneColor, toneOf } from "./execUi.jsx";

// Teknik ekipler için detay: dönem × şirket × konu. Sıralama, şirket/konu filtresi ve CSV dışa aktarma.
const COLS = [
  { key: "donem", label: "Dönem", sort: "tarih" },
  { key: "sirket", label: "Şirket" },
  { key: "konu", label: "Konu kategorisi" },
  { key: "acik", label: "Açık cihaz", num: true },
  { key: "cozulen", label: "Çözülen", num: true },
  { key: "yeni", label: "Yeni açılan", num: true },
  { key: "net", label: "Net iş akışı", num: true, fmt: sn },
  { key: "degisimPct", label: "Değişim %", num: true, fmt: (v) => (v == null ? "—" : pf(v, true)) },
];

export default function ExecDetailTable({ pal, rows, sample = false }) {
  const [co, setCo] = useState("all");
  const [topic, setTopic] = useState("all");
  const [sort, setSort] = useState({ key: "donem", dir: "desc" });
  const companies = useMemo(() => [...new Set(rows.map((r) => r.sirket))], [rows]);
  const topics = useMemo(() => [...new Set(rows.map((r) => r.konu))], [rows]);
  const shown = useMemo(() => {
    const f = rows.filter((r) => (co === "all" || r.sirket === co) && (topic === "all" || r.konu === topic));
    const col = COLS.find((c) => c.key === sort.key);
    const sk = col?.sort || sort.key;
    return [...f].sort((a, b) => {
      const x = a[sk], y = b[sk];
      const cmp = x == null ? (y == null ? 0 : -1) : y == null ? 1 : typeof x === "number" ? x - y : String(x).localeCompare(String(y), "tr");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, co, topic, sort]);

  const exportCsv = () => {
    const csv = rowsToCsv(shown, COLS.map((c) => ({ key: c.key, label: c.label, csv: c.key === "degisimPct" ? (r) => (r.degisimPct == null ? "" : String(r.degisimPct).replace(".", ",")) : undefined })));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${sample ? "ornek-veri-" : ""}operasyonel-durum-detay-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const sel = { background: pal.fieldBg, color: pal.ink, border: `1px solid ${pal.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 12.5, fontFamily: "inherit" };
  return (
    <Card pal={pal} data-exec-detail>
      <CardHead pal={pal} title="Detaylı veri tablosu" sub="Seçilen dönemdeki her kayıt aralığı için şirket ve konu bazında değerler. Başlığa tıklayarak sıralayın."
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select aria-label="Şirket" value={co} onChange={(e) => setCo(e.target.value)} style={sel} data-detail-company><option value="all">Tüm şirketler</option>{companies.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select aria-label="Konu" value={topic} onChange={(e) => setTopic(e.target.value)} style={sel} data-detail-topic><option value="all">Tüm konular</option>{topics.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <button type="button" data-detail-export onClick={exportCsv} disabled={!shown.length} style={{ ...sel, cursor: shown.length ? "pointer" : "not-allowed", fontWeight: 700 }}>CSV indir</button>
          </div>
        } />
      {!rows.length ? <p style={{ color: pal.inkSoft, fontSize: 13, margin: 0 }}>Bu dönem için tablo oluşturacak yeterli veri yok.</p> : (
        <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
          <table data-detail-table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} data-sort={c.key} onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === "asc" ? "desc" : "asc" }))} aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    style={{ position: "sticky", top: 0, background: pal.panelSolid, textAlign: c.num ? "right" : "left", padding: "8px 10px", fontSize: 12, color: pal.inkSoft, borderBottom: `1px solid ${pal.line}`, cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
                    {c.label}{sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={`${r.tarih}-${r.sirket}-${r.konu}-${i}`} data-detail-row>
                  {COLS.map((c) => {
                    const v = r[c.key];
                    const tone = c.key === "net" ? toneOf(v, "down") : c.key === "degisimPct" ? toneOf(v, "down") : null;
                    return <td key={c.key} style={{ padding: "7px 10px", borderBottom: `1px solid ${pal.line}`, textAlign: c.num ? "right" : "left", color: tone ? toneColor(tone, pal) : pal.ink, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{c.fmt ? c.fmt(v) : c.num ? nf(v) : v}</td>;
                  })}
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={COLS.length} style={{ padding: 14, color: pal.inkSoft }}>Filtreye uyan kayıt yok.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
