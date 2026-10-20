import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

// Trend grafiğinde bir döneme tıklayınca açılan ayrıntı penceresi: o dönemin GERÇEK kaydındaki (snapshot) bulgular.
// Ne gösterir: dönem/kayıt tarihi, toplam ve önceki döneme göre değişim (çözülen / yeni / devam eden), kategori sekmeleri ve o kategorideki cihaz listesi.
// Ne göstermez: güncel durum — bunun için "Güncel raporu aç" ilgili rapora (ana sayfadaki aynı filtreyle) götürür. Eksik geçmiş uydurulmaz.
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("tr-TR"));
const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const LIMIT = 200;

export default function TrendDetailModal({ item, prev, keys, meta, company, onClose, onOpenReport, styles, pal }) {
  const firstKey = keys.find((k) => (item.perReportOpen[k] || 0) > 0) || keys[0];
  const [cat, setCat] = useState(firstKey);
  const [q, setQ] = useState("");
  const total = keys.reduce((a, k) => a + (item.perReportOpen[k] || 0), 0);
  const prevTotal = prev ? keys.reduce((a, k) => a + (prev.perReportOpen[k] || 0), 0) : null;
  const diff = prevTotal != null ? total - prevTotal : null;
  const snap = item.snaps?.[cat];
  const devices = useMemo(() => {
    const list = (snap?.devices || []).filter((d) => company === "all" || !company || d.company === company);
    const t = q.trim().toLowerCase();
    return t ? list.filter((d) => `${d.hostname} ${d.serial} ${d.location} ${d.company}`.toLowerCase().includes(t)) : list;
  }, [snap, company, q]);
  const tile = (label, value, color) => (
    <div style={{ border: `1px solid ${pal.line}`, borderRadius: 10, padding: "8px 12px", minWidth: 110 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || pal.ink }}>{value}</div>
      <div style={{ fontSize: 12, color: pal.inkSoft }}>{label}</div>
    </div>
  );
  const capturedAt = Object.values(item.snaps || {}).map((s) => s.capturedAt).sort().pop();

  // Portal: kartların backdrop-filter/overflow'u fixed konumlu pencereyi kendi içine hapsetmesin (tüm ekranı kaplasın)
  return createPortal(
    <div style={styles.modalOverlay} onClick={onClose} data-trend-modal>
      <div style={{ ...styles.modalCard, width: "min(760px, 100%)", maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <p style={styles.modalTitle}>Açık bulgu ayrıntısı — {item.label}</p>
          <span style={styles.modalClose} onClick={onClose} role="button" aria-label="Kapat" data-trend-close>✕</span>
        </div>
        <p style={{ ...styles.modalSub, margin: "0 0 12px" }}>Kayıt tarihi: {capturedAt ? when(capturedAt) : "—"}{prev ? ` · önceki dönem: ${prev.label}` : ""}</p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {tile("Toplam açık bulgu", fmt(total))}
          {diff != null && tile("Önceki döneme göre", `${diff > 0 ? "+" : ""}${fmt(diff)}`, diff > 0 ? pal.bad : diff < 0 ? pal.ok : pal.inkSoft)}
          {prev && tile("Çözülen", fmt(item.cozulen), pal.ok)}
          {prev && tile("Yeni tespit", fmt(item.yeni), pal.bad)}
          {prev && tile("Devam eden", fmt(item.devam))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {keys.map((k) => (
            <span key={k} onClick={() => { setCat(k); setQ(""); }} data-trend-cat={k} role="button"
              style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "4px 12px", borderRadius: 16, border: `1px solid ${cat === k ? meta[k].color : pal.line}`, background: cat === k ? `${meta[k].color}22` : "transparent", color: pal.ink }}>
              <span style={{ color: meta[k].color }}>■</span> {meta[k].label} ({fmt(item.perReportOpen[k] || 0)})
            </span>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <input type="text" placeholder="Hostname / seri no / lokasyon ara" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...styles.searchInput, border: `1px solid ${pal.line}`, borderRadius: 8, padding: "7px 11px", flex: "1 1 220px", background: pal.fieldBg }} />
          <button type="button" style={styles.btnPrimary} onClick={() => onOpenReport(cat)} data-trend-open-report>Güncel raporu aç →</button>
        </div>

        {!snap ? (
          <p style={styles.pageSub} data-trend-nolist>Bu dönemde "{meta[cat].label}" için kayıt yok.</p>
        ) : devices.length === 0 ? (
          <p style={styles.pageSub} data-trend-nolist>Aramaya uyan cihaz yok.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table} data-trend-list>
              <thead><tr>{["Hostname", "Seri no", "Lokasyon", "Şirket"].map((h) => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {devices.slice(0, LIMIT).map((d, i) => (
                  <tr key={`${d.key}-${i}`}>
                    <td style={styles.td}>{d.hostname || "—"}</td>
                    <td style={styles.td}>{d.serial || "—"}</td>
                    <td style={styles.td}>{d.location || "—"}</td>
                    <td style={styles.td}>{d.company || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 12, color: pal.inkSoft, margin: "8px 2px 0" }}>
              {fmt(devices.length)} cihaz{devices.length > LIMIT ? ` (ilk ${LIMIT} gösteriliyor — aramayla daraltın)` : ""}. Liste o dönemin kaydındaki durumu gösterir; güncel durum için raporu açın.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
