import { useMemo, useState } from "react";
import { BOTTLENECK_THRESHOLDS as T, SIGNALS } from "../services/bottleneckService";

// LAKESIDE > DARBOĞAZ — cihaz bazında CPU / RAM / Disk / BSOD / Pil / Cihaz yaşı sinyallerini tek tabloda gösterir.
// Veri olmayan sinyal "Veri Yok" kalır; CPU/RAM için Lakeside kaynak kullanımı dosyası yüklenmelidir.
const LIMIT = 200;
const SIGNAL_HELP = {
  cpu: `Ortalama CPU %: ≥${T.cpu.warn} uyarı, ≥${T.cpu.crit} kritik`,
  ram: `Ortalama RAM %: ≥${T.ram.warn} uyarı, ≥${T.ram.crit} kritik`,
  disk: "Disk Alanı raporundaki en kötü birim (dashboard eşikleriyle aynı)",
  bsod: `Toplam BSOD: ≥${T.bsod.warn} uyarı, ≥${T.bsod.crit} kritik`,
  battery: `Pil sağlığı: <${T.battery.warn} uyarı, <${T.battery.crit} kritik`,
  age: `Cihaz yaşı (BIOS tarihi): ≥${T.age.warn} yıl uyarı, ≥${T.age.crit} yıl kritik`,
};

export default function DarbogazScreen({ styles, pal, rows, summary, resourceMeta, onUploadResource, isMaster, loading }) {
  const [cause, setCause] = useState("all");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(LIMIT);

  const color = { crit: pal.bad, warn: pal.warnFg, ok: pal.ok, none: pal.inkSoft };
  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showAll && !r.isBottleneck) return false;
      if (onlyCritical && r.crit === 0) return false;
      if (cause !== "all" && !["crit", "warn"].includes(r.signals[cause].level)) return false;
      if (t && !`${r.hostname} ${r.serial} ${r.user} ${r.location} ${r.model}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [rows, cause, onlyCritical, showAll, q]);

  const missing = SIGNALS.filter(([id]) => !summary.available[id]).map(([, label]) => label);
  const tile = (label, value, c) => (
    <div style={{ border: `1px solid ${pal.line}`, borderRadius: 10, padding: "10px 14px", minWidth: 120 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: c || pal.ink }}>{value}</div>
      <div style={{ fontSize: 12, color: pal.inkSoft }}>{label}</div>
    </div>
  );
  const chip = (s) => (
    <span title={s.text} style={{ display: "inline-block", fontSize: 12, fontWeight: 600, color: color[s.level], background: s.level === "none" ? "transparent" : `${color[s.level]}1a`, borderRadius: 8, padding: "2px 8px", whiteSpace: "nowrap" }}>
      {s.level === "none" ? "—" : s.text}
    </span>
  );
  const maxCause = Math.max(1, ...SIGNALS.map(([id]) => summary.byCause[id] || 0));

  return (
    <>
      <div style={{ ...styles.panel, padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={styles.pageTitle}>Bottleneck</p>
            <p style={styles.pageSub}>
              Performansı ve dayanıklılığı sınırlayan cihazlar. Cihaz, en az bir <strong>kritik</strong> ya da en az iki <strong>uyarı</strong> sinyali taşıyorsa bottleneck sayılır. Eşikler sinyal başlığının üzerine gelince görünür.
            </p>
          </div>
          {isMaster && (
            <label style={{ ...styles.btnGhost, alignSelf: "flex-start", cursor: "pointer" }} data-darbogaz-upload>
              Lakeside CPU/RAM dosyası yükle
              <input type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={onUploadResource} />
            </label>
          )}
        </div>
        {rows.length === 0 ? (
          <p style={{ ...styles.pageSub, marginTop: 14 }}>{loading ? "Kaynak veriler yükleniyor…" : "Veri bekleniyor — SCCM / Disk / BSOD / Battery dosyaları yüklenmedi."}</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }} data-darbogaz-summary>
              {tile("Analiz edilen cihaz", summary.analyzed.toLocaleString("tr-TR"))}
              {tile("Bottleneck cihaz", summary.bottleneck.toLocaleString("tr-TR"), summary.bottleneck ? pal.bad : pal.ok)}
              {tile("Kritik sinyalli", summary.critical.toLocaleString("tr-TR"), summary.critical ? pal.bad : undefined)}
              {tile("Birden çok sinyalli", summary.multi.toLocaleString("tr-TR"))}
            </div>
            {missing.length > 0 && (
              <p style={{ margin: "12px 0 0", fontSize: 13, color: pal.warnFg }} data-darbogaz-missing>
                Veri bulunamayan sinyaller: <strong>{missing.join(", ")}</strong>.
                {!summary.available.cpu || !summary.available.ram
                  ? " CPU/RAM için Lakeside kaynak kullanımı dosyası (Machine Name, Avg CPU %, Avg RAM %) yüklenmedi; yüklenince bu sütunlar otomatik dolar."
                  : ""}
                {resourceMeta ? "" : ""}
              </p>
            )}
            {resourceMeta && <p style={{ margin: "6px 0 0", fontSize: 12, color: pal.inkSoft }}>CPU/RAM kaynağı: {resourceMeta.fileName}</p>}
          </>
        )}
      </div>

      {rows.length > 0 && (
        <div style={{ ...styles.panel, padding: "16px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 14 }} data-darbogaz-causes>
            {SIGNALS.map(([id, label]) => {
              const n = summary.byCause[id] || 0;
              const active = cause === id;
              return (
                <div key={id} onClick={() => setCause(active ? "all" : id)} title={SIGNAL_HELP[id]} data-darbogaz-cause={id}
                  style={{ cursor: "pointer", border: `1px solid ${active ? pal.accent : pal.line}`, borderRadius: 10, padding: "8px 12px", opacity: summary.available[id] ? 1 : 0.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span>{label}</span><strong>{summary.available[id] ? n : "Veri Yok"}</strong>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: pal.fieldBg, marginTop: 6 }}>
                    <div style={{ height: 5, borderRadius: 3, width: `${(n / maxCause) * 100}%`, background: pal.bad }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <input type="text" placeholder="Hostname / seri no / kullanıcı / lokasyon ara" value={q} onChange={(e) => { setQ(e.target.value); setLimit(LIMIT); }} style={{ ...styles.searchInput, border: `1px solid ${pal.line}`, borderRadius: 8, padding: "8px 12px", flex: "1 1 240px", background: pal.fieldBg }} />
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={onlyCritical} onChange={(e) => setOnlyCritical(e.target.checked)} /> Sadece kritik
            </label>
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Bottleneck olmayanları da göster
            </label>
            {cause !== "all" && <span onClick={() => setCause("all")} style={{ cursor: "pointer", fontSize: 13, color: pal.accent, fontWeight: 600 }}>Neden filtresini temizle</span>}
            <span style={{ fontSize: 13, color: pal.inkSoft }} data-darbogaz-count>{visible.length.toLocaleString("tr-TR")} cihaz</span>
          </div>

          {visible.length === 0 ? (
            <p style={styles.pageSub} data-darbogaz-empty>Bu filtreyle cihaz yok.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={styles.table} data-darbogaz-table>
                <thead>
                  <tr>
                    <th style={styles.th}>Hostname</th>
                    <th style={styles.th}>Kullanıcı</th>
                    <th style={styles.th}>Lokasyon</th>
                    {SIGNALS.map(([id, label]) => <th key={id} style={styles.th} title={SIGNAL_HELP[id]}>{label}</th>)}
                    <th style={styles.th}>Skor</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, limit).map((r) => (
                    <tr key={r.key} data-darbogaz-row>
                      <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }} title={r.model}>{r.hostname}</td>
                      <td style={styles.td}>{r.user || "—"}</td>
                      <td style={styles.td}>{r.location || "—"}</td>
                      {SIGNALS.map(([id]) => <td key={id} style={styles.td}>{chip(r.signals[id])}</td>)}
                      <td style={{ ...styles.td, fontWeight: 700, color: r.crit ? pal.bad : r.isBottleneck ? pal.warnFg : pal.inkSoft }}>{r.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visible.length > limit && (
                <p style={{ margin: "8px 2px" }}>
                  <span onClick={() => setLimit(limit + LIMIT)} style={{ cursor: "pointer", color: pal.accent, fontWeight: 600, fontSize: 13 }}>Daha fazla göster ({visible.length - limit} cihaz daha)</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
