import { useMemo, useEffect, useRef } from "react";
import { Chart, BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from "chart.js";
import { comparePeriods, locationSolutionBreakdown, groupSnapshotsByPeriod, periodTrendSeries } from "../services/periodComparisonService";
import { REPORT_TYPES } from "../data/constants";
import MultiSelectFilter from "./MultiSelectFilter";

Chart.register(BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

// Rapor adları artık burada AYRICA hard-code edilmiyor (bkz. konuşma: "konu başlıkları hard-code
// edilmemeli") — tek kaynak REPORT_TYPES (constants.js), sol menüdeki isimlerle aynı. Bir reportId
// snapshot'ı olup REPORT_TYPES'ta yoksa (ör. ileride eklenen bir rapor) id'nin kendisi gösterilir,
// uygulama hata vermez.
const REPORT_LABEL_BY_ID = Object.fromEntries(REPORT_TYPES.map((r) => [r.id, r.name]));
const reportLabel = (id) => REPORT_LABEL_BY_ID[id] || id;
const PERIOD_LABELS = { month: "Aylık", week: "Haftalık", raw: "Her Yükleme" };

// Yönetim odaklı çözüm/müdahale istatistikleri (madde 2, 13). Snapshot geçmişi < 2 ise
// "veri bekleniyor" gösterir, uygulama hata vermez (madde 14).
export default function ManagementKpiPanel({
  snapshots, report, setReport, period, setPeriod,
  lbsFilter, setLbsFilter, styles, pal,
}) {
  const list = snapshots?.[report] || [];
  const periods = useMemo(() => groupSnapshotsByPeriod(list, period), [list, period]);

  const lbsOptions = useMemo(() => {
    const set = new Set();
    list.forEach((s) => (s.devices || []).forEach((d) => d.lbsParent && set.add(d.lbsParent)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [list]);

  const filterFn = useMemo(() => {
    if (!lbsFilter || lbsFilter.length === 0) return () => true;
    const set = new Set(lbsFilter);
    return (d) => set.has(d.lbsParent);
  }, [lbsFilter]);

  const enough = periods.length >= 2;
  const prevP = enough ? periods[periods.length - 2] : null;
  const currP = enough ? periods[periods.length - 1] : null;

  const cmp = useMemo(
    () => (enough ? comparePeriods(prevP.snapshot, currP.snapshot, filterFn) : null),
    [enough, prevP, currP, filterFn]
  );

  // Önceki döneme göre "Toplam Tespit" değişimi % — bir önceki dönem çiftiyle karşılaştırılır.
  const prevChangePct = useMemo(() => {
    if (periods.length < 3) return null;
    const before = comparePeriods(periods[periods.length - 3].snapshot, periods[periods.length - 2].snapshot, filterFn).counts.toplamTespit;
    const now = cmp.counts.toplamTespit;
    if (!before) return null;
    return Math.round(((now - before) / before) * 100);
  }, [periods, filterFn, cmp]);

  const locBreakdown = useMemo(
    () => (enough ? locationSolutionBreakdown(prevP.snapshot, currP.snapshot, { field: "location", filterFn }) : []),
    [enough, prevP, currP, filterFn]
  );

  const trend = useMemo(() => periodTrendSeries(periods, filterFn), [periods, filterFn]);

  // Konu başlığına (rapor türüne) göre kırılım — bkz. konuşma: "her konu başlığı için ilgili
  // çözüm performansı ayrı ayrı görülebilmeli". Üstteki "Rapor" seçicisi tek bir raporu detaylı
  // gösterirken, bu tablo `snapshots` içinde geçmişi olan TÜM rapor türlerini (dinamik — hard-code
  // yok, hangi rapor snapshot yazdıysa o çıkar) aynı `period`/`lbsFilter` ile yan yana özetler.
  const topicBreakdown = useMemo(() => {
    return Object.keys(snapshots || {})
      .map((id) => {
        const topicPeriods = groupSnapshotsByPeriod(snapshots[id] || [], period);
        if (topicPeriods.length < 2) return { id, label: reportLabel(id), enough: false };
        const prevT = topicPeriods[topicPeriods.length - 2];
        const currT = topicPeriods[topicPeriods.length - 1];
        const { counts } = comparePeriods(prevT.snapshot, currT.snapshot, filterFn);
        return { id, label: reportLabel(id), enough: true, periodLabel: currT.label, ...counts };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "tr"));
  }, [snapshots, period, filterFn]);

  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || trend.length < 2) {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      return;
    }
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      data: {
        labels: trend.map((t) => t.label),
        datasets: [
          { type: "bar", label: "Toplam Tespit", data: trend.map((t) => t.toplamTespit), backgroundColor: pal.bad, borderRadius: 4, yAxisID: "y" },
          { type: "bar", label: "Çözülen", data: trend.map((t) => t.cozulen), backgroundColor: pal.ok, borderRadius: 4, yAxisID: "y" },
          { type: "line", label: "Çözüm Oranı %", data: trend.map((t) => t.cozumOrani), borderColor: pal.accent, backgroundColor: pal.accent, tension: 0.35, pointRadius: 3, yAxisID: "y1" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top", labels: { color: pal.ink, boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: pal.inkSoft, font: { size: 10 } }, grid: { display: false } },
          y: { position: "left", beginAtZero: true, ticks: { color: pal.inkSoft, font: { size: 10 } }, grid: { color: pal.line } },
          y1: { position: "right", beginAtZero: true, max: 100, ticks: { color: pal.inkSoft, font: { size: 10 }, callback: (v) => `${v}%` }, grid: { display: false } },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [JSON.stringify(trend), pal]);

  const kpi = (label, value, color, sub) => (
    <div style={{ ...styles.kpiCard }}>
      <span style={styles.kpiLabel}>{label}</span>
      <span style={{ ...styles.kpiValue, color: color || pal.ink }}>{value}</span>
      {sub != null && <span style={{ ...styles.kpiSub, color: pal.inkSoft }}>{sub}</span>}
    </div>
  );

  return (
    <div style={{ ...styles.panel, padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <p style={styles.settingsSectionTitle}>Çözüm / Müdahale İstatistikleri</p>
          <p style={{ ...styles.pageSub, margin: 0 }}>
            Yapılan kontrol/müdahaleler sonucunda kaç problemli cihaz listeden çıktı — dönemsel cihaz eşleştirmesiyle (sadece toplam farkı değil)
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select style={styles.scheduleSelect} value={report} onChange={(e) => setReport(e.target.value)}>
            {/* Sadece snapshot geçmişi olan (yani gerçek veriyle çalışan) raporlar listelenir —
                dinamik, elle eklenmiş sabit bir liste değil (bkz. konuşma). */}
            {Object.keys(snapshots || {}).sort((a, b) => reportLabel(a).localeCompare(reportLabel(b), "tr")).map((id) => (
              <option key={id} value={id}>{reportLabel(id)}</option>
            ))}
          </select>
          <select style={styles.scheduleSelect} value={period} onChange={(e) => setPeriod(e.target.value)}>
            {Object.entries(PERIOD_LABELS).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
          {lbsOptions.length > 1 && (
            <MultiSelectFilter label="Üst Lokasyon" options={lbsOptions} selected={lbsFilter} onChange={setLbsFilter} styles={styles} pal={pal} />
          )}
        </div>
      </div>

      {/* Konu başlığına göre kırılım — panelin ana yeni bölümü (bkz. konuşma). Seçili tek raporun
          "yeterli veri" durumundan bağımsız her zaman gösterilir; her rapor türü kendi hazır olma
          durumunu ayrı ayrı taşır (aşağıda "veri bekleniyor" satırıyla). */}
      <div style={{ marginTop: 16 }}>
        <p style={{ ...styles.groupedBarDeptName, marginBottom: 8 }}>
          Konu Başlığına Göre Çözüm Performansı — {PERIOD_LABELS[period] || period}
        </p>
        {topicBreakdown.length === 0 ? (
          <p style={{ ...styles.pageSub, margin: 0 }}>Henüz hiçbir rapor için dönemsel veri kaydı yok.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Konu Başlığı</th>
                  <th style={styles.th}>Toplam Tespit</th>
                  <th style={styles.th}>Çözülen</th>
                  <th style={styles.th}>Devam Eden</th>
                  <th style={styles.th}>Yeni</th>
                  <th style={styles.th}>Çözüm Oranı</th>
                </tr>
              </thead>
              <tbody>
                {topicBreakdown.map((r) => (
                  <tr key={r.id} style={r.id === report ? { background: pal.accentSoft || pal.fieldBg } : undefined}>
                    <td style={{ ...styles.td, fontWeight: r.id === report ? 700 : 400, cursor: "pointer" }} onClick={() => setReport(r.id)} title="Bu raporun detayını yukarıda göster">
                      {r.label}
                    </td>
                    {!r.enough ? (
                      <td style={{ ...styles.td, color: pal.inkSoft }} colSpan={5}>Veri bekleniyor — en az 2 {PERIOD_LABELS[period]?.toLowerCase() || period} dönemi gerekli</td>
                    ) : (
                      <>
                        <td style={styles.td}>{r.toplamTespit}</td>
                        <td style={{ ...styles.td, color: pal.ok }}>{r.cozulen}</td>
                        <td style={{ ...styles.td, color: pal.warnFg }}>{r.devamEden}</td>
                        <td style={{ ...styles.td, color: pal.bad }}>{r.yeniTespit}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.badge, ...(r.cozumOrani >= 50 ? styles.badgeOk : styles.badgeBad) }}>
                            <span style={{ ...styles.badgeDot, background: r.cozumOrani >= 50 ? pal.ok : pal.bad }} />
                            %{r.cozumOrani}
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!enough ? (
        <p style={{ ...styles.pageSub, marginTop: 16 }}>
          Trend ve çözüm oranı için en az <strong>2 dönem</strong> verisi gerekli — şu an {periods.length} dönem var.
          Her gerçek veri yüklemesinde otomatik bir dönem kaydı oluşur; veri biriktikçe bu panel dolacak.
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginTop: 16 }}>
            {kpi("Toplam Tespit", cmp.counts.toplamTespit, pal.ink, `${currP.label} dönemi`)}
            {kpi("Çözülen", cmp.counts.cozulen, pal.ok, "listeden çıktı")}
            {kpi("Devam Eden", cmp.counts.devamEden, pal.warnFg, "önceki dönemden")}
            {kpi("Yeni Tespit", cmp.counts.yeniTespit, pal.bad, "bu dönem eklendi")}
            {kpi("Çözüm Oranı", `%${cmp.counts.cozumOrani}`, cmp.counts.cozumOrani >= 50 ? pal.ok : pal.bad, `${cmp.counts.oncekiToplam} problemli cihazdan`)}
            {kpi(
              "Önceki Döneme Göre",
              prevChangePct == null ? "—" : `${prevChangePct > 0 ? "+" : ""}%${prevChangePct}`,
              prevChangePct == null ? pal.inkSoft : prevChangePct > 0 ? pal.bad : pal.ok,
              "toplam tespit değişimi"
            )}
          </div>

          {trend.length >= 2 && (
            <div style={{ marginTop: 18 }}>
              <p style={{ ...styles.groupedBarDeptName, marginBottom: 8 }}>Dönemsel Trend</p>
              <div style={{ height: 240 }}><canvas ref={canvasRef} /></div>
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <p style={{ ...styles.groupedBarDeptName, marginBottom: 8 }}>Lokasyon Bazlı Çözüm Oranı (en düşükten)</p>
            {locBreakdown.length === 0 ? (
              <p style={{ ...styles.pageSub, margin: 0 }}>Bu kapsamda kayıt yok</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Lokasyon</th>
                      <th style={styles.th}>Toplam Tespit</th>
                      <th style={styles.th}>Çözülen</th>
                      <th style={styles.th}>Devam Eden</th>
                      <th style={styles.th}>Yeni</th>
                      <th style={styles.th}>Çözüm Oranı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locBreakdown.slice(0, 15).map((r) => (
                      <tr key={r.location}>
                        <td style={styles.td}>{r.location}</td>
                        <td style={styles.td}>{r.toplamTespit}</td>
                        <td style={{ ...styles.td, color: pal.ok }}>{r.cozulen}</td>
                        <td style={{ ...styles.td, color: pal.warnFg }}>{r.devamEden}</td>
                        <td style={{ ...styles.td, color: pal.bad }}>{r.yeniTespit}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.badge, ...(r.cozumOrani >= 50 ? styles.badgeOk : styles.badgeBad) }}>
                            <span style={{ ...styles.badgeDot, background: r.cozumOrani >= 50 ? pal.ok : pal.bad }} />
                            %{r.cozumOrani}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
