import { useMemo, useState } from "react";
import Donut from "./Donut";

const norm = (v) => String(v || "").trim().toLowerCase();
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const fmtMbps = (v) => (v == null ? "—" : `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} Mb/s`);

export default function BantGenisligiScreen({
  styles,
  pal,
  rows,
  meta,
  lokasyonRows = [],
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  onFileSelect,
  isMaster,
}) {
  const [locationFilter, setLocationFilterState] = useState("all");

  // Lokasyon Kodu -> Açık Lokasyon Adı (Lokasyon Mail Listesi zaten yüklüyse, bkz. konuşma —
  // aynı "Lokasyon Kodu" biçimi, ör. "ABJ1-SD1"). Yüklenmemişse kod aynen gösterilir.
  const nameByCode = useMemo(() => {
    const m = new Map();
    lokasyonRows.forEach((r) => {
      if (r.kod && r.locationName && !m.has(r.kod)) m.set(r.kod, r.locationName);
    });
    return m;
  }, [lokasyonRows]);

  const locations = useMemo(() => Array.from(new Set(rows.map((r) => r.location))).sort((a, b) => a.localeCompare(b, "tr")), [rows]);
  const warningCount = useMemo(() => rows.filter((r) => r.isWarning).length, [rows]);

  // Genel ortalama — tüm yüklü hatların Bant Genişliği/Averaj/Seviye değerlerinin aritmetik
  // ortalaması (bkz. konuşma: "yukarı bir küçük dashboard koyalım genel ortalamayı görmek için").
  const avgStats = useMemo(
    () => ({
      bandwidth: mean(rows.map((r) => r.bandwidthMbps).filter((v) => v != null)),
      avg: mean(rows.map((r) => r.avgBandwidthMbps).filter((v) => v != null)),
      level: mean(rows.map((r) => r.seviyeMbps).filter((v) => v != null)),
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter === "warning") list = list.filter((r) => r.isWarning);
    else if (statusFilter === "ok") list = list.filter((r) => !r.isWarning);
    if (locationFilter !== "all") list = list.filter((r) => r.location === locationFilter);
    const q = norm(search);
    if (q) {
      list = list.filter((r) => [r.location, r.hat, nameByCode.get(r.location)].map(norm).some((v) => v.includes(q)));
    }
    return list;
  }, [rows, statusFilter, locationFilter, search, nameByCode]);

  return (
    <>
      <div style={{ ...styles.panel, padding: "20px 24px" }}>
        <p style={styles.pageTitle}>Ofis Bant Genişliği</p>
        <p style={styles.pageSub}>
          {meta
            ? `${meta.fileName} — ${rows.length} kayıt · ${warningCount} uyarı (ortalama bant genişliğinin belirgin altında)`
            : "Henüz bant genişliği raporu yüklenmedi — aşağıdan seçin"}
        </p>
        {isMaster ? (
          <label style={{ ...styles.chipToggle, display: "inline-flex", cursor: "pointer", marginTop: 8 }}>
            📄 Bant Genişliği CSV Seç…
            <input type="file" accept=".csv" onChange={onFileSelect} style={{ display: "none" }} />
          </label>
        ) : (
          <p style={{ fontSize: 12, color: pal.inkSoft, marginTop: 8 }}>Dosya yükleme yalnızca Supervisor kullanıcılarına açıktır.</p>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div style={{ ...styles.panel, padding: "20px 24px" }}>
            <p style={styles.settingsSectionTitle}>Genel Durum</p>
            <p style={{ ...styles.pageSub, margin: "0 0 10px" }}>Yüklü tüm hatların ortalaması</p>
            <div style={styles.donutRow}>
              <Donut
                segments={[
                  { value: rows.length - warningCount, color: pal.ok, label: "Ortalama Dahilinde" },
                  { value: warningCount, color: pal.bad, label: "Uyarı" },
                ]}
                centerLabel={`%${Math.round(((rows.length - warningCount) / rows.length) * 100)}`}
                centerSub="sağlıklı hat"
                trackColor={pal.fieldBg}
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, flex: "1 1 auto" }}>
                <div style={styles.kpiCard}>
                  <span style={styles.kpiValue}>{fmtMbps(avgStats.bandwidth)}</span>
                  <span style={styles.kpiLabel}>genel ortalama bant genişliği</span>
                </div>
                <div style={styles.kpiCard}>
                  <span style={styles.kpiValue}>{fmtMbps(avgStats.avg)}</span>
                  <span style={styles.kpiLabel}>genel ortalama (averaj)</span>
                </div>
                <div style={styles.kpiCard}>
                  <span style={styles.kpiValue}>{fmtMbps(avgStats.level)}</span>
                  <span style={styles.kpiLabel}>genel ortalama seviye</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...styles.panel, padding: "20px 24px", ...styles.kpiGrid, gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div style={styles.kpiCard}>
              <span style={styles.kpiValue}>{rows.length}</span>
              <span style={styles.kpiLabel}>toplam hat</span>
              <span style={{ ...styles.kpiSub, color: pal.inkSoft }}>{locations.length} lokasyon</span>
            </div>
            <div style={styles.kpiCard}>
              <span style={{ ...styles.kpiValue, color: warningCount > 0 ? pal.bad : pal.ink }}>{warningCount}</span>
              <span style={styles.kpiLabel}>uyarı durumunda</span>
              <span style={{ ...styles.kpiSub, color: pal.inkSoft }}>ortalamanın belirgin altında</span>
            </div>
            <div style={styles.kpiCard}>
              <span style={{ ...styles.kpiValue, color: pal.ok }}>{rows.length - warningCount}</span>
              <span style={styles.kpiLabel}>ortalama dahilinde</span>
            </div>
          </div>

          <div style={{ ...styles.panel, padding: "20px 24px" }}>
            <div style={styles.toolbar} className="no-print">
              <div style={styles.toolbarFiltersRow}>
                <div style={styles.searchWrap}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Lokasyon, hat veya ofis adı ara..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={styles.searchInput}
                  />
                </div>
                <select style={styles.scheduleSelect} value={locationFilter} onChange={(e) => setLocationFilterState(e.target.value)}>
                  <option value="all">Tüm Lokasyonlar</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div style={styles.segmented}>
                {[
                  ["all", "Tümü", rows.length],
                  ["warning", "Uyarı", warningCount],
                  ["ok", "Ortalama Dahilinde", rows.length - warningCount],
                ].map(([id, label, n]) => (
                  <div key={id} onClick={() => setStatusFilter(id)} style={{ ...styles.seg, ...(statusFilter === id ? styles.segActive : {}) }}>
                    {label} ({n})
                  </div>
                ))}
              </div>
            </div>

            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Lokasyon</th>
                  <th style={styles.th}>Hat</th>
                  <th style={styles.th}>Bant Genişliği</th>
                  <th style={styles.th}>Averaj</th>
                  <th style={styles.th}>Seviye</th>
                  <th style={styles.th}>Tarih</th>
                  <th style={styles.th}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.rowKey}>
                    <td style={styles.td}>
                      <span style={styles.serial}>{r.location}</span>
                      {nameByCode.get(r.location) && <div style={styles.cellSub}>{nameByCode.get(r.location)}</div>}
                    </td>
                    <td style={styles.td}>{r.hat}</td>
                    <td style={styles.td}>{r.bandwidth}</td>
                    <td style={styles.td}>{r.avgBandwidth}</td>
                    <td style={styles.td}>{r.seviye}</td>
                    <td style={{ ...styles.td, fontSize: 12.5, whiteSpace: "nowrap" }}>{r.tarih}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, ...(r.isWarning ? styles.badgeBad : styles.badgeOk) }}>
                        <span style={{ ...styles.badgeDot, background: r.isWarning ? pal.bad : pal.ok }} />
                        {r.statusTag}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ ...styles.tableFooter, marginTop: 10 }}>
              <span>{filtered.length} kayıttan {filtered.length} tanesi gösteriliyor</span>
            </div>
          </div>
        </>
      )}
    </>
  );
}
