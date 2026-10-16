import { useMemo, useState } from "react";
import Donut from "./Donut";
import { backendClient } from "../services/backendClient";
import { buildBantMail, resolveBantRecipient, groupWarningOffices } from "../services/bantMailService";

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
  showToast,
  recordMailHistory,
}) {
  const [locationFilter, setLocationFilterState] = useState("all");
  const [mailTo, setMailTo] = useState(""); // boşsa Lokasyon Mail Listesi'ndeki adres kullanılır
  const [preview, setPreview] = useState(null); // { subject, html, to }
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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

  // ---- E-posta (bantMailService şablonu; gönderim mevcut SMTP altyapısıyla) ----
  // Hazırlık: ofis kodu -> { subject, html, text, to, officeName }. Alıcı: elle girilen adres, yoksa Lokasyon Mail Listesi.
  const prepare = (officeCode) => {
    const { mail, officeName } = resolveBantRecipient(lokasyonRows, officeCode);
    const built = buildBantMail({ officeCode, officeName, lines: rows.filter((r) => r.location === officeCode) });
    const manual = mailTo.split(/[;,\s]+/).map((s) => s.trim()).filter((s) => /@/.test(s)).join(", ");
    return { ...built, to: manual || mail, officeName, officeCode };
  };
  const warningOffices = useMemo(() => groupWarningOffices(rows), [rows]);
  const deliver = async (p) => {
    try {
      const res = await backendClient.sendMail({ to: p.to, subject: p.subject, text: p.text, html: p.html });
      return res.ok ? { ok: true } : { ok: false, message: res.message || "Gönderilemedi" };
    } catch (err) {
      return { ok: false, message: err.message || "Gönderilemedi" };
    }
  };
  const sendOffice = async (officeCode) => {
    const p = prepare(officeCode);
    if (!p.to) {
      showToast?.(`⚠️ ${p.officeName || officeCode} için Lokasyon Mail Listesi'nde mail adresi yok — üstteki kutuya alıcı adresi girin`);
      return;
    }
    setBusy(true);
    const r = await deliver(p);
    setBusy(false);
    recordMailHistory?.({
      id: Date.now(), date: new Date().toLocaleString("tr-TR"), dept: "Ofis Bant Genişliği", report: "Ofis Bant Genişliği",
      recipients: r.ok ? 1 : 0, status: r.ok ? "Başarılı" : "Gönderilemedi",
      details: [{ location: p.officeName || officeCode, to: p.to, count: p.warnCount, ok: r.ok, message: r.ok ? "Gönderildi" : r.message }],
    });
    showToast?.(r.ok ? `✅ Bant genişliği bilgilendirmesi gönderildi (${p.to})` : `❌ Gönderilemedi — ${r.message}`);
  };
  const sendBulk = async () => {
    setBulkOpen(false);
    setBusy(true);
    const prepared = warningOffices.map((o) => prepare(o.officeCode));
    const sendable = prepared.filter((p) => p.to);
    const details = prepared.filter((p) => !p.to).map((p) => ({ location: p.officeName || p.officeCode, to: null, count: p.warnCount, ok: false, message: "Lokasyon Mail Listesi'nde mail adresi bulunamadı" }));
    let sent = 0, failed = 0;
    for (const p of sendable) {
      const r = await deliver(p);
      if (r.ok) sent++; else failed++;
      details.push({ location: p.officeName || p.officeCode, to: p.to, count: p.warnCount, ok: r.ok, message: r.ok ? "Gönderildi" : r.message });
    }
    setBusy(false);
    const skipped = prepared.length - sendable.length;
    recordMailHistory?.({
      id: Date.now(), date: new Date().toLocaleString("tr-TR"), dept: "Ofis Bant Genişliği", report: "Ofis Bant Genişliği (toplu)",
      recipients: sent, status: failed || skipped ? (sent ? "Kısmen Başarısız" : "Gönderilemedi") : "Başarılı", details,
    });
    showToast?.(`${failed || skipped ? (sent ? "⚠️" : "❌") : "✅"} ${sent} ofise gönderildi${skipped ? `, ${skipped} ofis için mail adresi yok` : ""}${failed ? `, ${failed} gönderim başarısız` : ""}`);
  };
  const bulkPlan = useMemo(() => {
    if (!bulkOpen) return null;
    const prepared = warningOffices.map((o) => prepare(o.officeCode));
    return { total: prepared.length, withMail: prepared.filter((p) => p.to).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkOpen, warningOffices, mailTo, lokasyonRows]);

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
                <input
                  type="text"
                  placeholder="Mail alıcı — boşsa lokasyon mail listesi"
                  value={mailTo}
                  onChange={(e) => setMailTo(e.target.value)}
                  style={{ ...styles.formInput, flex: "0 1 280px" }}
                />
                <button style={styles.btnGhost} onClick={() => setBulkOpen(true)} disabled={busy || warningOffices.length === 0} title="Uyarıdaki hattı olan her ofise ayrı bilgilendirme maili">
                  ✉️ Uyarılı ofislere mail ({warningOffices.length})
                </button>
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
                  <th style={styles.th}>E-posta</th>
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
                    <td style={{ ...styles.td, fontSize: 13, whiteSpace: "nowrap" }}>{r.tarih}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, ...(r.isWarning ? styles.badgeBad : styles.badgeOk) }}>
                        <span style={{ ...styles.badgeDot, background: r.isWarning ? pal.bad : pal.ok }} />
                        {r.statusTag}
                      </span>
                    </td>
                    <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                      <button style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 12 }} data-bant-preview={r.location} onClick={() => { const p = prepare(r.location); setPreview({ subject: p.subject, html: p.html, to: p.to }); }}>Önizle</button>{" "}
                      <button style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 12 }} data-bant-send={r.location} disabled={busy} onClick={() => sendOffice(r.location)}>✉️ Gönder</button>
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

      {preview && (
        <div style={styles.modalOverlay} onClick={() => setPreview(null)}>
          <div style={{ ...styles.modalCard, width: "min(820px, 100%)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <p style={styles.modalTitle}>E-posta önizleme</p>
              <span style={styles.modalClose} onClick={() => setPreview(null)}>✕</span>
            </div>
            <p style={{ ...styles.modalSub, margin: "0 0 4px" }}><strong>Konu:</strong> {preview.subject}</p>
            <p style={{ ...styles.modalSub, margin: "0 0 12px" }}><strong>Alıcı:</strong> {preview.to || "— (Lokasyon Mail Listesi'nde adres yok; üstteki kutuya girin)"}</p>
            <div style={{ background: "#fff", color: "#1a1a1a", borderRadius: 8, padding: 12 }} dangerouslySetInnerHTML={{ __html: preview.html }} />
          </div>
        </div>
      )}

      {bulkOpen && bulkPlan && (
        <div style={styles.modalOverlay} onClick={() => setBulkOpen(false)}>
          <div style={{ ...styles.modalCard, width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <p style={styles.modalTitle}>Mail Gönderimini Onayla</p>
              <span style={styles.modalClose} onClick={() => setBulkOpen(false)}>✕</span>
            </div>
            <p style={styles.modalSub}>
              Uyarıdaki hattı olan {bulkPlan.total} ofisin {bulkPlan.withMail} tanesine ayrı bilgilendirme maili gönderilecek
              {bulkPlan.total - bulkPlan.withMail > 0 ? ` (${bulkPlan.total - bulkPlan.withMail} ofis için mail adresi bulunamadığından atlanacak)` : ""}.
            </p>
            <div style={styles.formActions}>
              <button style={styles.btnGhost} onClick={() => setBulkOpen(false)}>Vazgeç</button>
              <button style={styles.btnPrimary} onClick={sendBulk} disabled={bulkPlan.withMail === 0}>Onayla ve Gönder</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
