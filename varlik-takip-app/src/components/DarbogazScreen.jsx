import { useMemo, useState } from "react";
import { BOTTLENECK_THRESHOLDS as T, SIGNALS, HEALTH_BANDS, HEALTH_PENALTY, BAND_LABELS } from "../services/bottleneckService";

// LAKESIDE > BOTTLENECK — cihaz bazında Disk / BSOD / Pil / Cihaz yaşı sinyallerini tek tabloda gösterir ve 0-100 SAĞLIK SKORU verir:
// 100 = sorunsuz, skor ne kadar düşükse o cihaz için o kadar acil aksiyon gerekir. Veri olmayan sinyal "Veri Yok" kalır ve skora ceza yazmaz.
const BAND_RANGE = { good: "90–100", watch: "80–89", action: "50–79", urgent: "0–49" };
const LIMIT = 200;
const SIGNAL_HELP = {
  disk: "Disk Alanı raporundaki en kötü birim (dashboard eşikleriyle aynı)",
  bsod: `Toplam BSOD: ≥${T.bsod.warn} uyarı, ≥${T.bsod.crit} kritik`,
  battery: `Pil sağlığı: <${T.battery.warn} uyarı, <${T.battery.crit} kritik`,
  age: `Cihaz yaşı (BIOS tarihi): ≥${T.age.warn} yıl uyarı, ≥${T.age.crit} yıl kritik`,
};

export default function DarbogazScreen({ styles, pal, rows, summary, loading }) {
  const [cause, setCause] = useState("all");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(LIMIT);
  const [band, setBand] = useState("all"); // sağlık bandı filtresi (özet kutularına tıklayarak)

  const color = { crit: pal.bad, warn: pal.warnFg, ok: pal.ok, none: pal.inkSoft };
  const bandColor = { good: pal.ok, watch: pal.accent, action: pal.warnFg, urgent: pal.bad, nodata: pal.inkSoft };
  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (band !== "all") { if (r.band !== band) return false; } else if (!showAll && !r.isBottleneck) return false;
      if (onlyCritical && r.crit === 0) return false;
      if (cause !== "all" && !["crit", "warn"].includes(r.signals[cause].level)) return false;
      if (t && !`${r.hostname} ${r.serial} ${r.user} ${r.location} ${r.model}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [rows, cause, onlyCritical, showAll, q, band]);

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
            <p style={styles.pageSub} data-darbogaz-intro>
              Her cihaz için <strong>0-100 sağlık skoru</strong> hesaplanır: <strong>100 sorunsuz</strong> demektir, <strong>skor düştükçe aksiyon gerekir</strong>. Skor 80'in altındaki cihazlar <strong>bottleneck</strong> sayılır ve listenin üstünde en düşük skor önce gelir. Her satırda önerilen aksiyon yazar.
            </p>
          </div>
        </div>
        {rows.length === 0 ? (
          <p style={{ ...styles.pageSub, marginTop: 14 }}>{loading ? "Kaynak veriler yükleniyor…" : "Veri bekleniyor — SCCM / Disk / BSOD / Battery dosyaları yüklenmedi."}</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }} data-darbogaz-summary>
              {tile("Analiz edilen cihaz", summary.analyzed.toLocaleString("tr-TR"))}
              {tile("Ortalama sağlık skoru", summary.avgHealth == null ? "—" : summary.avgHealth.toLocaleString("tr-TR"), summary.avgHealth == null ? undefined : bandColor[HEALTH_BANDS.find((b) => summary.avgHealth >= b.min)?.id || "urgent"])}
              {tile("Bottleneck cihaz", summary.bottleneck.toLocaleString("tr-TR"), summary.bottleneck ? pal.bad : pal.ok)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 12 }} data-darbogaz-bands>
              {[...HEALTH_BANDS].reverse().map((b) => {
                const n = summary.byBand[b.id] || 0;
                const active = band === b.id;
                return (
                  <div key={b.id} data-darbogaz-band={b.id} role="button" tabIndex={0} aria-pressed={active} onClick={() => { setBand(active ? "all" : b.id); setLimit(LIMIT); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBand(active ? "all" : b.id); setLimit(LIMIT); } }}
                    title={`${b.hint}. Tıklayınca yalnız bu gruptaki cihazlar listelenir.`}
                    style={{ cursor: "pointer", border: `1px solid ${active ? bandColor[b.id] : pal.line}`, borderLeft: `4px solid ${bandColor[b.id]}`, borderRadius: 10, padding: "9px 12px", background: active ? `${bandColor[b.id]}14` : "transparent", outline: "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: bandColor[b.id] }}>{b.label}</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: pal.ink }}>{n.toLocaleString("tr-TR")}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: pal.inkSoft }}>Skor {BAND_RANGE[b.id]} · {b.hint}</div>
                  </div>
                );
              })}
            </div>
            <details data-darbogaz-howto style={{ marginTop: 12, fontSize: 13, color: pal.inkSoft }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, color: pal.ink }}>Skor nasıl hesaplanıyor?</summary>
              <p style={{ margin: "8px 0 6px", lineHeight: 1.55 }}>Skor 100'den başlar; her sinyaldeki sorun için aşağıdaki ceza düşülür (0'ın altına inmez). <strong>Veri olmayan sinyal ceza almaz</strong>, ancak satırda kaç sinyalin ölçüldüğü (örn. 3/4) yazar.</p>
              <table style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead><tr>{["Sinyal", "Uyarı cezası", "Kritik cezası", "Eşik"].map((h) => <th key={h} style={{ textAlign: "left", padding: "4px 14px 4px 0", color: pal.inkSoft, fontWeight: 600 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {SIGNALS.map(([id, label]) => (
                    <tr key={id}><td style={{ padding: "3px 14px 3px 0", color: pal.ink, fontWeight: 600 }}>{label}</td><td style={{ padding: "3px 14px 3px 0" }}>−{HEALTH_PENALTY[id].warn}</td><td style={{ padding: "3px 14px 3px 0" }}>−{HEALTH_PENALTY[id].crit}</td><td style={{ padding: "3px 0" }}>{SIGNAL_HELP[id]}</td></tr>
                  ))}
                </tbody>
              </table>
              <p style={{ margin: "8px 0 0", lineHeight: 1.55 }}>Örnek: kritik disk (−40) + pil uyarısı (−15) = 100 − 55 = <strong>45 → Acil</strong>. Skor 80'in altındaysa cihaz bottleneck sayılır; 80-89 arası (tek bir uyarı ya da yaş) izlenir, aksiyon gerekmez.</p>
            </details>
            {missing.length > 0 && (
              <p style={{ margin: "12px 0 0", fontSize: 13, color: pal.warnFg }} data-darbogaz-missing>
                Veri bulunamayan sinyaller: <strong>{missing.join(", ")}</strong>.
              </p>
            )}
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
            {band !== "all" && <span onClick={() => setBand("all")} style={{ cursor: "pointer", fontSize: 13, color: pal.accent, fontWeight: 600 }} data-darbogaz-band-clear>Grup filtresini temizle ({BAND_LABELS[band]})</span>}
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
                    <th style={styles.th} title="100 = sorunsuz; düşük skor = aksiyon gerekir">Sağlık skoru</th>
                    <th style={styles.th}>Önerilen aksiyon</th>
                    <th style={styles.th}>Hostname</th>
                    <th style={styles.th}>Kullanıcı</th>
                    <th style={styles.th}>Lokasyon</th>
                    {SIGNALS.map(([id, label]) => <th key={id} style={styles.th} title={SIGNAL_HELP[id]}>{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, limit).map((r) => (
                    <tr key={r.key} data-darbogaz-row data-band={r.band}>
                      <td style={styles.td} data-darbogaz-score title={r.measured < 4 ? `${r.measured}/4 sinyal ölçüldü; veri olmayan sinyaller skora dahil edilmedi` : "4/4 sinyal ölçüldü"}>
                        {r.health == null ? <span style={{ color: pal.inkSoft }}>—</span> : (
                          <div style={{ minWidth: 92 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                              <span style={{ fontSize: 18, fontWeight: 800, color: bandColor[r.band], fontVariantNumeric: "tabular-nums" }}>{r.health}</span>
                              <span style={{ fontSize: 11.5, fontWeight: 700, color: bandColor[r.band] }}>{BAND_LABELS[r.band]}</span>
                            </div>
                            <div style={{ height: 4, borderRadius: 2, background: pal.fieldBg, marginTop: 3 }}><div style={{ height: 4, borderRadius: 2, width: `${r.health}%`, background: bandColor[r.band] }} /></div>
                            <div style={{ fontSize: 10.5, color: pal.inkSoft, marginTop: 2 }}>{r.measured}/4 sinyal</div>
                          </div>
                        )}
                      </td>
                      <td style={{ ...styles.td, fontSize: 12.5, minWidth: 170, maxWidth: 230 }} data-darbogaz-action>
                        {r.actions.length === 0 ? <span style={{ color: pal.inkSoft }}>{r.health == null ? "Veri yok" : "Aksiyon gerekmez"}</span> : (
                          <>
                            <div style={{ color: pal.ink, fontWeight: 600 }}>{r.actions[0]}</div>
                            {r.actions.length > 1 && <div style={{ color: pal.inkSoft, fontSize: 11.5 }} title={r.actions.slice(1).join(" · ")}>+ {r.actions.length - 1} ek aksiyon</div>}
                          </>
                        )}
                      </td>
                      <td style={{ ...styles.td, fontFamily: "var(--font-mono)" }} title={r.model}>{r.hostname}</td>
                      <td style={styles.td}>{r.user || "—"}</td>
                      <td style={styles.td}>{r.location || "—"}</td>
                      {SIGNALS.map(([id]) => <td key={id} style={styles.td}>{chip(r.signals[id])}</td>)}
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
