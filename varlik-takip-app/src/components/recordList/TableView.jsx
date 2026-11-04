import { Fragment } from "react";
import { assignmentLabel } from "./assignmentLabel";
import { isZimmetUnverified } from "../../services/zimmetService";
import { isInaktifUnverified, inaktifUsageTone } from "../../services/inaktifComparisonService";
import { ownerTitleOf } from "../../services/ownerName";

// Klasik tablo görünümü — Zimmet'te durum/not/ertele kontrolleri artık tabloda değil,
// satır seçilince sağda açılan DetailAside'da
export default function TableView({
  rows,
  isZimmet,
  companyLabelOf,
  ownerLabel,
  serialLabel,
  modelLabel,
  splitModel,
  locationLabel,
  styles,
  pal,
  rowKeyOf,
  selectedKeys,
  toggleSelect,
  allSelected,
  toggleSelectAll,
  canExpandPerson,
  showHostname,
  showLastLogon,
  showDeviceAge,
  expandedPerson,
  togglePersonExpand,
  allPersonRows,
  onOpenRecord,
  detailRowKey,
  setDetailRowKey,
}) {
  // showHostname açıkken (İnaktif Cihazlar/Zimmet Uyuşmazlığı — SCCM ile karşılaştırıldığında)
  // bir sütun daha eklendiği için colSpan'lar buna göre +1 olmalı. Zimmet'te
  // "Zimmet Türü" (User/OBS) sütunu eklendiği için +1 daha.
  const baseColSpan = isZimmet ? 7 : splitModel ? 6 : 5;
  const emptyColSpan = baseColSpan + (showHostname ? 1 : 0) + (showLastLogon ? 1 : 0) + (showDeviceAge ? 1 : 0);
  // Madde 6 — "Last Logon" sütunu. Değer yoksa "Veri Yok" (gri), uygulama hata vermez.
  const lastLogonText = (r) => r.lastLogonTime || r.lastLogon || "";
  // Madde 8 — "Cihaz Yaşı" sütunu (yalnızca Kullanılmayan Cihazlar). BIOS tarihinden hesaplanır;
  // yoksa "Veri Yok", >5 yıl kırmızı vurgulanır.
  const deviceAgeText = (r) => (r.deviceAge != null ? `${r.deviceAge} yıl` : "");
  const thS = isZimmet ? { ...styles.th, padding: "13px 10px", fontSize: 13 } : styles.th;
  const tdS = isZimmet ? { ...styles.td, padding: "14px 10px", fontSize: 14 } : styles.td;
  return (
    <table style={styles.table}>
      {/* thS/tdS: Zimmet tablosunda sütun fazla — yatay boşluk daraltılır, tablo kaydırma gerektirmeden sığsın */}
      <thead>
        <tr>
          <th style={{ ...thS, width: 32 }}>
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={styles.checkbox} />
          </th>
          <th style={thS}>{isZimmet ? "Zimmetli Kişi" : ownerLabel || "Cihaz Sahibi"}</th>
          {isZimmet ? (
            <>
              <th style={thS}>Cihaz (Seri No)</th>
              <th style={thS}>Kullanan Kişi</th>
              <th style={thS}>Zimmet Türü</th>
            </>
          ) : (
            <th style={thS}>{serialLabel || "Seri No / Model"}</th>
          )}
          {!isZimmet && splitModel && <th style={thS}>{modelLabel || "Model"}</th>}
          {showHostname && <th style={thS}>{isZimmet ? "Hostname" : "Hostname / Son Giriş"}</th>}
          {showLastLogon && <th style={thS}>Last Logon</th>}
          {showDeviceAge && <th style={thS}>Cihaz Yaşı</th>}
          <th style={thS}>{isZimmet ? "Açıklama" : locationLabel || "Lokasyon"}</th>
          <th style={thS}>Durum</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const rk = rowKeyOf(r);
          const isExpandedHere = expandedPerson && expandedPerson.rowKey === rk;
          return (
            <Fragment key={i}>
            <tr
              onClick={() => setDetailRowKey(rk)}
              style={{
                cursor: "pointer",
                ...(selectedKeys.has(rk) || rk === detailRowKey ? styles.rowSelected : {}),
              }}
            >
              <td style={tdS} onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedKeys.has(rk)}
                  onChange={() => toggleSelect(rk)}
                  style={styles.checkbox}
                />
              </td>
              <td style={tdS}>
                <div
                  style={{ ...styles.cellName, ...(canExpandPerson && r.owner !== "—" ? styles.clickableName : {}) }}
                  onClick={canExpandPerson && r.owner !== "—" ? (e) => { e.stopPropagation(); togglePersonExpand(rk, r.owner); } : undefined}
                  title={canExpandPerson && r.owner !== "—" ? `${r.owner}'e ait kayıtları göster/gizle` : r.ownerFull || undefined}
                >
                  {r.owner}
                </div>
                {ownerTitleOf(r.ownerFull) && <div style={styles.cellSub} title={r.ownerFull}>{ownerTitleOf(r.ownerFull)}</div>}
                {!isZimmet && <div style={styles.cellSub}>{r.sub}</div>}
              </td>
              {isZimmet ? (
                <>
                  <td style={tdS}>
                    <span style={{ ...styles.serial, ...styles.clickableName }} title="Detayını sağda göster">
                      {r.serial}
                    </span>
                    <div style={styles.cellSub}>{r.sub}</div>
                    {r.windowsLabel && (
                      <div style={styles.cellSub} title={r.windowsDetail || ""}>
                        <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginRight: 5, background: r.windowsStatus === "ended" ? pal.bad : r.windowsStatus === "ending" ? pal.warnFg : r.windowsStatus === "supported" ? pal.ok : pal.inkSoft }} />
                        {r.windowsLabel}
                      </div>
                    )}
                  </td>
                  <td style={tdS}>
                    <span
                      style={r.userLabel !== "—" && r.userLabel !== "Tespit Edilemedi" ? styles.clickableName : undefined}
                      onClick={r.userLabel !== "—" && r.userLabel !== "Tespit Edilemedi" ? (e) => { e.stopPropagation(); togglePersonExpand(rk, r.userLabel); } : undefined}
                      title={r.userLabel !== "—" && r.userLabel !== "Tespit Edilemedi" ? `${r.userLabel}'e ait kayıtları göster/gizle` : undefined}
                    >
                      {r.userFullName || r.userLabel}
                    </span>
                    {r.userFullTitle && <div style={styles.cellSub} title={r.userFullName}>{r.userFullTitle}</div>}
                  </td>
                  <td style={tdS}>
                    {r.assignmentType ? (
                      <span style={{ ...styles.badge, ...(r.assignmentType === "User" ? styles.badgeOk : styles.badgeNeutral) }}>
                        <span style={{ ...styles.badgeDot, background: r.assignmentType === "User" ? pal.ok : pal.inkSoft }} />
                        {assignmentLabel(r.assignmentType)}
                      </span>
                    ) : (
                      <span style={{ color: pal.inkSoft, fontSize: 13 }} title="TuruncuHat'ta bu cihazın kaydı olmadığı için belirlenemedi">—</span>
                    )}
                    {r.company && companyLabelOf ? <div data-company-tag style={{ ...styles.cellSub, marginTop: 4 }} title="Cihazın ait olduğu şirket (Sahibi Firma)">{companyLabelOf(r.company)}</div> : null}
                  </td>
                </>
              ) : (
                <td style={tdS}>
                  <span style={{ ...styles.serial, ...styles.clickableName }} title="Detayını sağda göster">
                    {r.serial}
                  </span>
                  {!splitModel && <div style={styles.cellSub}>{r.model}</div>}
                </td>
              )}
              {!isZimmet && splitModel && <td style={tdS}>{r.model}</td>}
              {showHostname && (
                <td style={{ ...tdS, fontSize: 13 }}>
                  <div style={{ fontFamily: "var(--font-mono)" }}>
                    {r.hostname || <span style={{ fontFamily: "var(--font-sans)", color: pal.inkSoft, fontStyle: "italic" }}>SCCM verisiyle eşleşmedi</span>}
                  </div>
                  {/* İnaktif Cihazlar'da hostname'in altında kimin fiilen kullandığı da gösterilsin
                      istendi.
                      Zimmet ekranında bu bilgi zaten ayrı "Kullanan Kişi" sütununda olduğu için tekrar edilmiyor. */}
                  {/* Zimmet: Lokasyon filtresi ofis (r.office) üzerinden çalıştığı için değer tabloda da görünsün —
                      ayrı sütun yerine hostname altında (tablo sıkışmasın diye) */}
                  {isZimmet && r.office && r.office !== "—" && (
                    <div style={{ color: pal.inkSoft, fontSize: 12, marginTop: 2, fontFamily: "var(--font-sans)" }} title="Lokasyon (ofis)">
                      {r.office}
                    </div>
                  )}
                  {!isZimmet && r.actualUser && (
                    <div style={{ color: pal.inkSoft, fontSize: 12, marginTop: 2 }} title={r.actualUserMail || undefined}>
                      Son giriş: {r.actualUser}
                    </div>
                  )}
                </td>
              )}
              {showLastLogon && (
                <td style={{ ...tdS, fontSize: 13, whiteSpace: "nowrap" }}>
                  {lastLogonText(r) || <span style={{ color: pal.inkSoft, fontStyle: "italic" }}>Veri Yok</span>}
                </td>
              )}
              {showDeviceAge && (
                <td
                  style={{ ...tdS, fontSize: 13, whiteSpace: "nowrap", ...(r.deviceAge != null && r.deviceAge > 5 ? { color: pal.bad, fontWeight: 600 } : {}) }}
                  title={r.deviceAgeSource ? `${r.deviceAgeSource}${r.deviceAgeDate ? ` (${r.deviceAgeDate})` : ""}` : undefined}
                >
                  {deviceAgeText(r) || <span style={{ color: pal.inkSoft, fontStyle: "italic" }}>Veri Yok</span>}
                </td>
              )}
              <td style={tdS}>
                {isZimmet ? (
                  <span
                    style={{ display: "block", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title="Tamamını görmek için satıra tıklayın"
                  >
                    {r.model}
                  </span>
                ) : (
                  r.location
                )}
              </td>
              <td style={tdS}>
                {isZimmet ? (
                  <span style={{ ...styles.badge, ...(r.statusTag === "Zimmet Doğru" || r.statusTag === "Müdürlük Zimmeti (OBS)" ? styles.badgeOk : isZimmetUnverified(r.statusTag) ? styles.badgeNeutral : styles.badgeBad) }}>
                    <span style={{ ...styles.badgeDot, background: r.statusTag === "Zimmet Doğru" || r.statusTag === "Müdürlük Zimmeti (OBS)" ? pal.ok : isZimmetUnverified(r.statusTag) ? pal.inkSoft : pal.bad }} />
                    {r.statusTag}
                  </span>
                ) : r.diskLevel ? (
                  // Disk Alanı — statusTag "Kritik/Uyarı/Normal" taşıyor ama r.matched hep true
                  // (bu raporda "eşleşme" kavramı yok, bkz. diskFileService.js); renk r.matched'e
                  // bakarsa hepsi yeşil ("Kritik" yazıp yeşil görünüyordu) — renk
                  // burada gerçek seviyeden (diskLevel) okunmalı.
                  <span
                    style={{
                      ...styles.badge,
                      ...(r.diskLevel === "critical" ? styles.badgeBad : r.diskLevel === "warning" ? { background: pal.warnBg, color: pal.warnFg } : styles.badgeOk),
                    }}
                  >
                    <span style={{ ...styles.badgeDot, background: r.diskLevel === "critical" ? pal.bad : r.diskLevel === "warning" ? pal.warnFg : pal.ok }} />
                    {r.statusTag}
                  </span>
                ) : r.statusTag ? (
                  // İnaktif Cihazlar artık TH+SCCM ile çapraz doğrulanan bir statusTag taşıyor
                  // — "Doğrulanamadı"/"TuruncuHat'ta
                  // Bulunamadı" kanıt değil, nötr (gri) gösterilir; diğer raporlar (Disk Alanı vb.)
                  // statusTag taşımadığı için aşağıdaki eski Eşleşti/Eşleşmedi rozetine düşer.
                  <span style={{ ...styles.badge, ...(inaktifUsageTone(r.statusTag) === "ok" ? styles.badgeOk : inaktifUsageTone(r.statusTag) === "bad" ? styles.badgeBad : r.matched ? styles.badgeOk : isInaktifUnverified(r.statusTag) ? styles.badgeNeutral : styles.badgeBad) }}>
                    <span style={{ ...styles.badgeDot, background: inaktifUsageTone(r.statusTag) === "ok" ? pal.ok : inaktifUsageTone(r.statusTag) === "bad" ? pal.bad : r.matched ? pal.ok : isInaktifUnverified(r.statusTag) ? pal.inkSoft : pal.bad }} />
                    {r.statusTag}
                  </span>
                ) : (
                  <span style={{ ...styles.badge, ...(r.matched ? styles.badgeOk : styles.badgeBad) }}>
                    <span style={{ ...styles.badgeDot, background: r.matched ? pal.ok : pal.bad }} />
                    {r.matched ? "Eşleşti" : "Eşleşmedi"}
                  </span>
                )}
              </td>
            </tr>
            {isExpandedHere && (
              <tr>
                <td style={{ ...tdS, background: pal.fieldBg, padding: 0 }} colSpan={emptyColSpan}>
                  <div style={{ padding: "12px 20px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: pal.inkSoft, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      {expandedPerson.person} — {isZimmet ? "tüm zimmet kayıtları" : `diğer ${ownerLabel === "Hostname" ? "cihazlar" : "kayıtlar"}`}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(allPersonRows || [])
                        .filter((pr) => pr.owner === expandedPerson.person || pr.userLabel === expandedPerson.person)
                        .map((pr, pi) => (
                          <div
                            key={pi}
                            style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 8, background: pal.panelSolid, fontSize: 14 }}
                          >
                            {isZimmet && (
                              <span style={{ ...styles.badge, ...(pr.owner === expandedPerson.person ? styles.badgeNeutral : {}), flexShrink: 0 }}>
                                {pr.owner === expandedPerson.person ? "Zimmetli" : "Kullanıyor"}
                              </span>
                            )}
                            <span
                              style={{ ...styles.serial, ...styles.clickableName, flexShrink: 0 }}
                              onClick={(e) => { e.stopPropagation(); onOpenRecord && onOpenRecord(pr); }}
                              title="Bu kaydın detayını gör"
                            >
                              {pr.serial}
                            </span>
                            <span style={{ flex: 1, color: pal.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {isZimmet ? pr.model : [pr.model, pr.location].filter(Boolean).join(" · ")}
                            </span>
                            {isZimmet ? (
                              <span style={{ ...styles.badge, ...(pr.statusTag === "Zimmet Doğru" || pr.statusTag === "Müdürlük Zimmeti (OBS)" ? styles.badgeOk : isZimmetUnverified(pr.statusTag) ? styles.badgeNeutral : styles.badgeBad), flexShrink: 0 }}>
                                <span style={{ ...styles.badgeDot, background: pr.statusTag === "Zimmet Doğru" || pr.statusTag === "Müdürlük Zimmeti (OBS)" ? pal.ok : isZimmetUnverified(pr.statusTag) ? pal.inkSoft : pal.bad }} />
                                {pr.statusTag}
                              </span>
                            ) : pr.statusTag ? (
                              <span style={{ ...styles.badge, ...(inaktifUsageTone(pr.statusTag) === "ok" ? styles.badgeOk : inaktifUsageTone(pr.statusTag) === "bad" ? styles.badgeBad : pr.matched ? styles.badgeOk : isInaktifUnverified(pr.statusTag) ? styles.badgeNeutral : styles.badgeBad), flexShrink: 0 }}>
                                <span style={{ ...styles.badgeDot, background: inaktifUsageTone(pr.statusTag) === "ok" ? pal.ok : inaktifUsageTone(pr.statusTag) === "bad" ? pal.bad : pr.matched ? pal.ok : isInaktifUnverified(pr.statusTag) ? pal.inkSoft : pal.bad }} />
                                {pr.statusTag}
                              </span>
                            ) : (
                              <span style={{ ...styles.badge, ...(pr.matched ? styles.badgeOk : styles.badgeBad), flexShrink: 0 }}>
                                <span style={{ ...styles.badgeDot, background: pr.matched ? pal.ok : pal.bad }} />
                                {pr.matched ? "Eşleşti" : "Eşleşmedi"}
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                </td>
              </tr>
            )}
            </Fragment>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td style={{ ...tdS, textAlign: "center", color: pal.inkSoft }} colSpan={emptyColSpan}>
              Sonuç bulunamadı
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
