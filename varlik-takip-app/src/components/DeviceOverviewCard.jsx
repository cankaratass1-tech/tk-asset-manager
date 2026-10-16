import { useMemo, useState } from "react";
import { buildDeviceOverview, windowsFacets, filterDevicesByWindows } from "../services/deviceOverviewService";

// "Cihaz Genel Görünüm" (madde 10, 11) — hostname/seri no/last logon ile arama, sonuçta cihazın
// tüm kaynaklardaki durumu OK / Warning / Critical / Veri Yok rozetli kartlarda.
// Windows sürümü: arama kutusuna "windows 10", "22H2", build numarası ya da "destek sona erdi" yazılabilir; ayrıca sürüm ve destek
// durumuna göre filtreleme yapılabilir — eşleşen cihazlar liste olarak gelir, satıra tıklayınca cihazın tam görünümü açılır.
const STATE_STYLE = (pal) => ({
  ok: { bg: `${pal.ok}18`, fg: pal.ok, label: "OK" },
  warn: { bg: `${pal.warnFg}1e`, fg: pal.warnFg, label: "Kontrol" },
  crit: { bg: `${pal.bad}1e`, fg: pal.bad, label: "Kritik" },
  none: { bg: pal.fieldBg, fg: pal.inkSoft, label: "Veri Yok" },
});
const SUPPORT_LABEL = { ended: "Destek sona erdi", ending: "Destek bitiyor", supported: "Destekte", unknown: "Bilinmiyor" };
const LIST_LIMIT = 50;

export default function DeviceOverviewCard({ sources, styles, pal }) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [winFilter, setWinFilter] = useState("");
  const [winStatus, setWinStatus] = useState("");
  const S = STATE_STYLE(pal);

  const rows = sources?.sccmRows || [];
  const facets = useMemo(() => windowsFacets(rows), [rows]);
  const hasOs = facets.known > 0;
  const statusColor = { ended: pal.bad, ending: pal.warnFg, supported: pal.ok, unknown: pal.inkSoft };

  const listMode = Boolean(winFilter || winStatus);
  const overview = !listMode && submitted ? buildDeviceOverview(submitted, sources) : null;
  // cihaz bulunamadıysa metin Windows sürümü olabilir ("windows 10", "22h2" …): eşleşen cihazlar liste olarak gösterilir
  const osFallback = !listMode && submitted && overview?.notFound ? filterDevicesByWindows(rows, { query: submitted }) : [];
  const list = listMode ? filterDevicesByWindows(rows, { version: winFilter, status: winStatus, query: submitted }) : osFallback;
  const showList = listMode || osFallback.length > 0;
  const showOverview = overview && !overview.notFound;
  const showNotFound = overview?.notFound && osFallback.length === 0;

  const openDevice = (host) => {
    setWinFilter("");
    setWinStatus("");
    setQuery(host);
    setSubmitted(host);
  };
  const resetList = () => { setWinFilter(""); setWinStatus(""); };

  return (
    <div style={{ ...styles.panel, padding: "20px 24px" }}>
      <p style={styles.settingsSectionTitle}>Cihaz Genel Görünüm</p>
      <p style={{ ...styles.pageSub, margin: "0 0 12px" }}>
        Hostname, seri no, son giriş yapan kullanıcı veya Windows sürümü ile arayın — cihazın tüm kaynaklardaki teknik ve operasyonel durumu tek ekranda
      </p>
      <div style={{ display: "flex", gap: 8, maxWidth: 760, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Hostname / Seri No / Last Logon / Windows 10…"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            // Arama kutusu tamamen silinince eski sonuç ekranda asılı kalmasın — bkz. konuşma
            // ("aradığımda X, bir şeyi sildiğimde sonuçta gitsin oradan").
            if (!v.trim()) setSubmitted("");
          }}
          onKeyDown={(e) => e.key === "Enter" && setSubmitted(query.trim())}
          style={{ ...styles.searchInput, border: `1px solid ${pal.line}`, borderRadius: 8, padding: "9px 12px", flex: "1 1 300px", background: pal.fieldBg }}
        />
        <select
          value={winFilter}
          onChange={(e) => setWinFilter(e.target.value)}
          disabled={!hasOs}
          title={hasOs ? "Windows sürümüne göre filtrele" : "SCCM envanterinde Windows sürümü sütunu yok ya da veri yüklenmedi"}
          aria-label="Windows sürümü"
          style={{ ...styles.scheduleSelect, flex: "0 1 230px", opacity: hasOs ? 1 : 0.55 }}
        >
          <option value="">Windows sürümü: Tümü</option>
          {facets.versions.map((v) => (
            <option key={v.key} value={v.key}>{v.label || "Sürüm bilinmiyor"} ({v.count})</option>
          ))}
        </select>
        <button style={styles.btnPrimary} onClick={() => setSubmitted(query.trim())}>Ara</button>
      </div>
      {!hasOs && rows.length > 0 && (
        <p style={{ fontSize: 12, color: pal.inkSoft, margin: "6px 0 0" }}>Windows sürümü verisi bulunamadı — SCCM export'unda işletim sistemi sütunu olmayabilir (Ayarlar &gt; Veri Input yüklemesinde uyarı çıkar).</p>
      )}

      {submitted && !listMode && !overview && <p style={{ ...styles.pageSub, marginTop: 14 }}>Bir şey yazın ve Ara'ya basın.</p>}
      {showNotFound && (
        <p style={{ ...styles.pageSub, marginTop: 14 }}>
          "{overview.query}" için hiçbir kaynakta (SCCM / TuruncuHat / İnaktif / Disk) cihaz bulunamadı.
        </p>
      )}

      {showList && (
        <div style={{ marginTop: 16 }} data-win-list>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>{list.length} cihaz</strong>
            {!listMode && <span style={{ fontSize: 12.5, color: pal.inkSoft }}>"{submitted}" Windows sürümüyle eşleşti</span>}
            {["ended", "ending", "supported", "unknown"].map((k) => (
              <span
                key={k}
                onClick={() => setWinStatus(winStatus === k ? "" : k)}
                title="Destek durumuna göre filtrele"
                style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: statusColor[k], border: `1px solid ${winStatus === k ? statusColor[k] : pal.line}`, background: winStatus === k ? `${statusColor[k]}1e` : "transparent", borderRadius: 14, padding: "3px 10px" }}
              >
                {SUPPORT_LABEL[k]} ({facets.statuses[k]})
              </span>
            ))}
            {listMode && <span onClick={resetList} style={{ cursor: "pointer", fontSize: 12.5, color: pal.accent, fontWeight: 600 }}>Filtreyi temizle</span>}
          </div>
          {list.length === 0 ? (
            <p style={styles.pageSub}>Bu kriterlere uyan cihaz yok.</p>
          ) : (
            <div style={{ overflowX: "auto", maxWidth: 920 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {["Hostname", "Seri No", "Kullanıcı", "Windows", "Destek"].map((h) => (
                      <th key={h} style={{ ...styles.th, fontSize: 12.5, padding: "9px 14px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, LIST_LIMIT).map((r) => (
                    <tr key={r.rowKey} onClick={() => openDevice(r.hostname || r.serial)} style={{ cursor: "pointer" }} title="Cihazın tam görünümünü aç" data-win-row>
                      <td style={{ ...styles.td, padding: "9px 14px", fontFamily: "var(--font-mono)", fontSize: 13 }}>{r.hostname}</td>
                      <td style={{ ...styles.td, padding: "9px 14px", fontSize: 13 }}>{r.serial}</td>
                      <td style={{ ...styles.td, padding: "9px 14px", fontSize: 13 }}>{r.userLabel}</td>
                      <td style={{ ...styles.td, padding: "9px 14px", fontSize: 13 }}>{r.windowsLabel || <span style={{ color: pal.inkSoft }}>Veri Yok</span>}</td>
                      <td style={{ ...styles.td, padding: "9px 14px" }}>
                        <span title={r.windowsDetail || ""} style={{ fontSize: 11.5, fontWeight: 700, color: statusColor[r.windowsStatus || "unknown"], background: `${statusColor[r.windowsStatus || "unknown"]}1e`, borderRadius: 10, padding: "2px 9px", whiteSpace: "nowrap" }}>
                          {r.windowsSupportLabel || "Bilinmiyor"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {list.length > LIST_LIMIT && <p style={{ fontSize: 12, color: pal.inkSoft, margin: "6px 2px" }}>İlk {LIST_LIMIT} cihaz gösteriliyor — aramayı daraltın ya da filtre ekleyin.</p>}
            </div>
          )}
        </div>
      )}

      {showOverview && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginBottom: 14, fontSize: 13 }}>
            {Object.entries({
              Hostname: overview.identity.hostname, "Seri No": overview.identity.serial, Model: overview.identity.model,
              "Üst Lokasyon": overview.identity.lbsParent, Lokasyon: overview.identity.location, Sahibi: overview.identity.owner,
            }).map(([k, v]) => (
              <span key={k}><span style={{ color: pal.inkSoft }}>{k}:</span> <strong>{v}</strong></span>
            ))}
          </div>

          {/* Geniş ekranlarda auto-fill 6 kartı tek satıra sığdırıp etiketleri kırpıyordu
              (bkz. konuşma — kullanıcı ekran görüntüsü: "Last Lo...", "SYN..." gibi kesik metinler).
              minmax alt sınırı yükseltildi + grid genişliği sınırlandı, böylece geniş ekranda da
              en fazla 3 sütun (3+3 satır) oluşuyor, dar ekranda ise otomatik azalıp alt alta diziliyor. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, maxWidth: 920 }}>
            {overview.cards.map((card) => (
              <div key={card.group} style={{ border: `1px solid ${pal.line}`, borderRadius: 10, padding: "12px 14px" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: pal.inkSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>{card.group}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {card.items.map((it, i) => {
                    const st = S[it.state] || S.none;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                        <span style={{ color: pal.inkSoft, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <span style={{ fontWeight: 600 }}>{it.value}</span>
                          {/* it.badgeLabel varsa (örn. monitör zimmet karşılaştırması "Doğru"/"Hatalı") genel
                              OK/Kritik yerine onu göster — bkz. konuşma */}
                          <span style={{ background: st.bg, color: st.fg, borderRadius: 6, padding: "1px 7px", fontSize: 10.5, fontWeight: 700 }} title={it.note || ""}>{it.badgeLabel || st.label}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
