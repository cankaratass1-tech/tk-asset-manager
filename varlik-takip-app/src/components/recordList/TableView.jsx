import { Fragment } from "react";
import { isZimmetUnverified } from "../../services/zimmetService";
import { isInaktifUnverified } from "../../services/inaktifComparisonService";

// Klasik tablo görünümü — Zimmet'te durum/not/ertele kontrolleri artık tabloda değil,
// satır seçilince sağda açılan DetailAside'da (bkz. konuşma)
export default function TableView({
  rows,
  isZimmet,
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
  // bir sütun daha eklendiği için colSpan'lar buna göre +1 olmalı (bkz. konuşma). Zimmet'te
  // "Zimmet Türü" (User/OBS) sütunu eklendiği için +1 daha (kullanıcı isteği).
  const baseColSpan = isZimmet ? 7 : splitModel ? 6 : 5;
  const emptyColSpan = baseColSpan + (showHostname ? 1 : 0) + (showLastLogon ? 1 : 0) + (showDeviceAge ? 1 : 0);
  // Madde 6 — "Last Logon" sütunu. Değer yoksa "Veri Yok" (gri), uygulama hata vermez.
  const lastLogonText = (r) => r.lastLogonTime || r.lastLogon || "";
  // Madde 8 — "Cihaz Yaşı" sütunu (yalnızca Kullanılmayan Cihazlar). BIOS tarihinden hesaplanır;
  // yoksa "Veri Yok", >5 yıl kırmızı vurgulanır.
  const deviceAgeText = (r) => (r.deviceAge != null ? `${r.deviceAge} yıl` : "");
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={{ ...styles.th, width: 32 }}>
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={styles.checkbox} />
          </th>
          <th style={styles.th}>{isZimmet ? "Zimmetli Kişi" : ownerLabel || "Cihaz Sahibi"}</th>
          {isZimmet ? (
            <>
              <th style={styles.th}>Cihaz (Seri No)</th>
              <th style={styles.th}>Kullanan Kişi</th>
              <th style={styles.th}>Zimmet Türü</th>
            </>
          ) : (
            <th style={styles.th}>{serialLabel || "Seri No / Model"}</th>
          )}
          {!isZimmet && splitModel && <th style={styles.th}>{modelLabel || "Model"}</th>}
          {showHostname && <th style={styles.th}>{isZimmet ? "Hostname" : "Hostname / Son Giriş"}</th>}
          {showLastLogon && <th style={styles.th}>Last Logon</th>}
          {showDeviceAge && <th style={styles.th}>Cihaz Yaşı</th>}
          <th style={styles.th}>{isZimmet ? "Açıklama" : locationLabel || "Lokasyon"}</th>
          <th style={styles.th}>Durum</th>
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
              <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedKeys.has(rk)}
                  onChange={() => toggleSelect(rk)}
                  style={styles.checkbox}
                />
              </td>
              <td style={styles.td}>
                <div
                  style={{ ...styles.cellName, ...(canExpandPerson && r.owner !== "—" ? styles.clickableName : {}) }}
                  onClick={canExpandPerson && r.owner !== "—" ? (e) => { e.stopPropagation(); togglePersonExpand(rk, r.owner); } : undefined}
                  title={canExpandPerson && r.owner !== "—" ? `${r.owner}'e ait kayıtları göster/gizle` : r.ownerFull || undefined}
                >
                  {r.owner}
                </div>
                {!isZimmet && <div style={styles.cellSub}>{r.sub}</div>}
              </td>
              {isZimmet ? (
                <>
                  <td style={styles.td}>
                    <span style={{ ...styles.serial, ...styles.clickableName }} title="Detayını sağda göster">
                      {r.serial}
                    </span>
                    <div style={styles.cellSub}>{r.sub}</div>
                  </td>
                  <td style={styles.td}>
                    <span
                      style={r.userLabel !== "—" && r.userLabel !== "Tespit Edilemedi" ? styles.clickableName : undefined}
                      onClick={r.userLabel !== "—" && r.userLabel !== "Tespit Edilemedi" ? (e) => { e.stopPropagation(); togglePersonExpand(rk, r.userLabel); } : undefined}
                      title={r.userLabel !== "—" && r.userLabel !== "Tespit Edilemedi" ? `${r.userLabel}'e ait kayıtları göster/gizle` : undefined}
                    >
                      {r.userLabel}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {r.assignmentType ? (
                      <span style={{ ...styles.badge, ...(r.assignmentType === "OBS" ? styles.badgeNeutral : styles.badgeOk) }}>
                        <span style={{ ...styles.badgeDot, background: r.assignmentType === "OBS" ? pal.inkSoft : pal.ok }} />
                        {r.assignmentType === "OBS" ? "OBS (Müdürlük)" : "User (Kişi)"}
                      </span>
                    ) : (
                      <span style={{ color: pal.inkSoft, fontSize: 13 }} title="TuruncuHat'ta bu cihazın kaydı olmadığı için belirlenemedi">—</span>
                    )}
                  </td>
                </>
              ) : (
                <td style={styles.td}>
                  <span style={{ ...styles.serial, ...styles.clickableName }} title="Detayını sağda göster">
                    {r.serial}
                  </span>
                  {!splitModel && <div style={styles.cellSub}>{r.model}</div>}
                </td>
              )}
              {!isZimmet && splitModel && <td style={styles.td}>{r.model}</td>}
              {showHostname && (
                <td style={{ ...styles.td, fontSize: 13 }}>
                  <div style={{ fontFamily: "var(--font-mono)" }}>
                    {r.hostname || <span style={{ fontFamily: "var(--font-sans)", color: pal.inkSoft, fontStyle: "italic" }}>SCCM verisiyle eşleşmedi</span>}
                  </div>
                  {/* İnaktif Cihazlar'da hostname'in altında kimin fiilen kullandığı da gösterilsin
                      istendi (bkz. konuşma: "hem hostname hem kimin kullandığını gösterelim") —
                      Zimmet ekranında bu bilgi zaten ayrı "Kullanan Kişi" sütununda olduğu için tekrar edilmiyor. */}
                  {!isZimmet && r.actualUser && (
                    <div style={{ color: pal.inkSoft, fontSize: 12, marginTop: 2 }} title={r.actualUserMail || undefined}>
                      Son giriş: {r.actualUser}
                    </div>
                  )}
                </td>
              )}
              {showLastLogon && (
                <td style={{ ...styles.td, fontSize: 12.5, whiteSpace: "nowrap" }}>
                  {lastLogonText(r) || <span style={{ color: pal.inkSoft, fontStyle: "italic" }}>Veri Yok</span>}
                </td>
              )}
              {showDeviceAge && (
                <td
                  style={{ ...styles.td, fontSize: 12.5, whiteSpace: "nowrap", ...(r.deviceAge != null && r.deviceAge > 5 ? { color: pal.bad, fontWeight: 600 } : {}) }}
                  title={r.deviceAgeSource ? `${r.deviceAgeSource}${r.deviceAgeDate ? ` (${r.deviceAgeDate})` : ""}` : undefined}
                >
                  {deviceAgeText(r) || <span style={{ color: pal.inkSoft, fontStyle: "italic" }}>Veri Yok</span>}
                </td>
              )}
              <td style={styles.td}>
                {isZimmet ? (
                  <span
                    style={{ display: "block", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title="Tamamını görmek için satıra tıkla"
                  >
                    {r.model}
                  </span>
                ) : (
                  r.location
                )}
              </td>
              <td style={styles.td}>
                {isZimmet ? (
                  <span style={{ ...styles.badge, ...(r.statusTag === "Zimmet Doğru" || r.statusTag === "Müdürlük Zimmeti (OBS)" ? styles.badgeOk : isZimmetUnverified(r.statusTag) ? styles.badgeNeutral : styles.badgeBad) }}>
                    <span style={{ ...styles.badgeDot, background: r.statusTag === "Zimmet Doğru" || r.statusTag === "Müdürlük Zimmeti (OBS)" ? pal.ok : isZimmetUnverified(r.statusTag) ? pal.inkSoft : pal.bad }} />
                    {r.statusTag}
                  </span>
                ) : r.diskLevel ? (
                  // Disk Alanı — statusTag "Kritik/Uyarı/Normal" taşıyor ama r.matched hep true
                  // (bu raporda "eşleşme" kavramı yok, bkz. diskFileService.js); renk r.matched'e
                  // bakarsa hepsi yeşil ("Kritik" yazıp yeşil görünüyordu, bkz. konuşma) — renk
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
                  // (bkz. konuşma — inaktifComparisonService.js) — "Doğrulanamadı"/"TuruncuHat'ta
                  // Bulunamadı" kanıt değil, nötr (gri) gösterilir; diğer raporlar (Disk Alanı vb.)
                  // statusTag taşımadığı için aşağıdaki eski Eşleşti/Eşleşmedi rozetine düşer.
                  <span style={{ ...styles.badge, ...(r.matched ? styles.badgeOk : isInaktifUnverified(r.statusTag) ? styles.badgeNeutral : styles.badgeBad) }}>
                    <span style={{ ...styles.badgeDot, background: r.matched ? pal.ok : isInaktifUnverified(r.statusTag) ? pal.inkSoft : pal.bad }} />
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
                <td style={{ ...styles.td, background: pal.fieldBg, padding: 0 }} colSpan={emptyColSpan}>
                  <div style={{ padding: "12px 20px" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: pal.inkSoft, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      {expandedPerson.person} — {isZimmet ? "tüm zimmet kayıtları" : `diğer ${ownerLabel === "Hostname" ? "cihazlar" : "kayıtlar"}`}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(allPersonRows || [])
                        .filter((pr) => pr.owner === expandedPerson.person || pr.userLabel === expandedPerson.person)
                        .map((pr, pi) => (
                          <div
                            key={pi}
                            style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 8, background: pal.panelSolid, fontSize: 13.5 }}
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
                              <span style={{ ...styles.badge, ...(pr.matched ? styles.badgeOk : isInaktifUnverified(pr.statusTag) ? styles.badgeNeutral : styles.badgeBad), flexShrink: 0 }}>
                                <span style={{ ...styles.badgeDot, background: pr.matched ? pal.ok : isInaktifUnverified(pr.statusTag) ? pal.inkSoft : pal.bad }} />
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
            <td style={{ ...styles.td, textAlign: "center", color: pal.inkSoft }} colSpan={emptyColSpan}>
              Sonuç bulunamadı
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
