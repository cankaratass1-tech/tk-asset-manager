// Bu popup birden fazla rapor türü (İnaktif Cihazlar, Disk Alanı, Zimmet Uyuşmazlığı, ...) için
// TableView'daki isim tıklamasıyla açılıyor — ama satırların alan şeması rapora göre TAMAMEN
// farklı: Zimmet satırlarında userLabel/statusTag/matched "zimmet doğru mu" anlamına gelir,
// diğer raporlarda (İnaktif Cihazlar vb.) bu alanlar hiç yok ya da bambaşka bir şey ifade eder
// (İnaktif'te "matched" sadece "lokasyon bilgisi var mı" demek — zimmet doğruluğuyla alakasız).
// Önceden isZimmet ayrımı yapılmadan hep Zimmet'e özgü alanlar gösteriliyordu; bu yüzden İnaktif
// Cihazlar'da "Kullanan kişi" hep boş, "Durum" rozeti anlamsız/boş çıkıyordu.
import { isZimmetUnverified } from "../../services/zimmetService";
import { isInaktifUnverified, needsInaktifAction, inaktifUsageTone } from "../../services/inaktifComparisonService";
import DeviceActionHistory from "./DeviceActionHistory";
import ItemizedAlert from "./ItemizedAlert";
import { inaktifActionItems, zimmetAlertItems, descriptionShownInAlert } from "./alertItems";
import DescriptionRow from "./DescriptionRow";
import { ownerTitleOf } from "../../services/ownerName";

export default function RecordPopup({ row, isZimmet, styles, pal, onClose, mailHistory }) {
  if (!row) return null;
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{ ...styles.modalCard, width: "min(580px, 100%)", fontSize: 14 }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <p style={{ ...styles.modalTitle, fontFamily: "var(--font-mono)" }}>{row.serial}</p>
          <span style={styles.modalClose} onClick={onClose}>✕</span>
        </div>
        <p style={styles.modalSub}>{row.sub}</p>

        {isZimmet ? (
          <>
            {(() => {
              // Kişinin kendi zimmeti mi hatalı, yoksa sadece bağlı monitöründe mi sorun var —
              // ikisi görsel olarak ayrışır.
              const personOk = row.personMatched ?? row.matched;
              if (!personOk) {
                const zItems = zimmetAlertItems(row);
                if (zItems) return <div style={{ marginTop: 4 }}><ItemizedAlert title={row.personStatusTag ?? row.statusTag} items={zItems} styles={styles} pal={pal} /></div>;
                return (
                  <div style={{ ...styles.detailAlert, marginTop: 4 }}>
                    <div style={styles.detailAlertTitle}>{row.personStatusTag ?? row.statusTag}</div>
                    <div style={styles.detailAlertBody}>{row.model}</div>
                  </div>
                );
              }
              if (row.monitorIssue) {
                return (
                  <div style={{ ...styles.detailAlert, marginTop: 4, background: pal.warnBg, border: `1px solid ${pal.warnFg}33` }}>
                    <div style={{ ...styles.detailAlertTitle, color: pal.warnFg }}>Kişinin zimmeti doğru — bağlı monitöründe uyuşmazlık var</div>
                    <div style={styles.detailAlertBody}>Aşağıdaki "Bağlı Monitörler" bölümüne bakın.</div>
                  </div>
                );
              }
              return null;
            })()}
            <div style={{ marginTop: 14 }}>
              <div style={styles.detailFieldRow}>
                <span style={{ color: pal.ink, fontWeight: 700 }}>Zimmetli kişi</span>
                <span style={{ textAlign: "left" }}>
                  {row.owner}
                  {ownerTitleOf(row.ownerFull) && <div style={{ fontSize: 12, color: pal.inkSoft }}>{ownerTitleOf(row.ownerFull)}</div>}
                </span>
              </div>
              <div style={styles.detailFieldRow}>
                <span style={{ color: pal.ink, fontWeight: 700 }}>Kullanan kişi</span>
                <span style={{ textAlign: "left" }}>
                  {row.userFullName || row.userLabel}
                  {row.userFullTitle && <div style={{ fontSize: 12, color: pal.inkSoft }}>{row.userFullTitle}</div>}
                </span>
              </div>
              <div style={styles.detailFieldRow}>
                <span style={{ color: pal.ink, fontWeight: 700 }}>Zimmet türü</span>
                <span>{row.assignmentType === "OBS" ? "OBS (Müdürlük)" : row.assignmentType === "User" ? "User (Kişi)" : "—"}</span>
              </div>
              <div style={styles.detailFieldRow}>
                <span style={{ color: pal.ink, fontWeight: 700 }}>Windows</span>
                <span title={row.windowsDetail || ""} style={{ textAlign: "left" }}>
                  {row.windowsLabel ? `${row.windowsLabel} · ${row.windowsSupportLabel || ""}` : <span style={{ color: pal.inkSoft }}>Veri Yok</span>}
                </span>
              </div>
              {!descriptionShownInAlert(row) && <DescriptionRow text={row.model} styles={styles} pal={pal} />}
              <div style={{ ...styles.detailFieldRow, ...(row.monitorDetails?.length > 0 ? {} : { borderBottom: "none" }) }}>
                <span style={{ color: pal.ink, fontWeight: 700 }}>Durum</span>
                <span style={{ ...styles.badge, ...(row.matched ? styles.badgeOk : isZimmetUnverified(row.statusTag) ? styles.badgeNeutral : styles.badgeBad) }}>
                  <span style={{ ...styles.badgeDot, background: row.matched ? pal.ok : isZimmetUnverified(row.statusTag) ? pal.inkSoft : pal.bad }} />
                  {row.statusTag}
                </span>
              </div>
            </div>

            {/* Gereksinim: "X kişisine ait monitörü Y kişisi kullanıyor mu" — TuruncuHat ve
                Monitör Raporu yüklüyse bu PC'ye bağlı her monitör burada tek satırlık, sade bir
                kart olarak gösterilir (kullanıcı geri bildirimi: önceki hal "çok karmaşık"tı —
                uzun paragraf yerine kısa, taranabilir bir liste). */}
            {row.monitorDetails?.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <p style={{ ...styles.formLabel, margin: "0 0 6px" }}>Bağlı Monitörler</p>
                {row.monitorDetails.map((m, i) => {
                  const badgeStyle = m.ok === true ? styles.badgeOk : m.ok === false ? styles.badgeBad : styles.badgeNeutral;
                  const dotColor = m.ok === true ? pal.ok : m.ok === false ? pal.bad : pal.inkSoft;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                        padding: "8px 12px", borderRadius: 8, background: pal.fieldBg, fontSize: 13,
                        marginBottom: i === row.monitorDetails.length - 1 ? 0 : 6,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{m.serial}{m.label ? ` · ${m.label}` : ""}</div>
                        <div style={{ color: pal.inkSoft, marginTop: 1 }}>
                          Zimmetli: {m.assignedTo || "—"} · Kullanan: {m.usedBy}
                        </div>
                      </div>
                      <span style={{ ...styles.badge, ...badgeStyle, flexShrink: 0 }} title={m.status}>
                        <span style={{ ...styles.badgeDot, background: dotColor }} />
                        {m.ok === true ? "Doğru" : m.ok === false ? "Hatalı" : "Doğrulanamadı"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          // Zimmet dışındaki raporlar (İnaktif Cihazlar, Disk Alanı, TH, yeni raporlar...) —
          // bu satırlarda "zimmet doğru/hatalı" kavramı yok, sadece cihaz/sahip bilgisi gösterilir.
          // İnaktif Cihazlar'da artık TH+SCCM çapraz doğrulaması var — matched:false
          // ise sebebi statusTag ile birlikte gösterilir, gerçekten aksiyon (zimmet devri)
          // gerektiren durumlar turuncu, kanıtsız/doğrulanamayan durumlar nötr renkte.
          <div style={{ marginTop: 14 }}>
            {row.statusTag && !row.matched && (() => {
              const actionNeeded = needsInaktifAction(row.statusTag);
              const items = actionNeeded ? inaktifActionItems(row) : null;
              if (items) return <div style={{ marginBottom: 10 }}><ItemizedAlert title={row.statusTag} items={items} tone="warn" styles={styles} pal={pal} /></div>;
              return (
                <div style={{ ...styles.detailAlert, marginBottom: 10, ...(actionNeeded ? { background: pal.warnBg, border: `1px solid ${pal.warnFg}33` } : {}) }}>
                  <div style={{ ...styles.detailAlertTitle, ...(actionNeeded ? { color: pal.warnFg } : {}) }}>{row.statusTag}</div>
                  <div style={styles.detailAlertBody}>{row.matchDetail}</div>
                  {row.actualUser && (
                    <div style={{ ...styles.detailAlertBody, marginTop: 4 }}>
                      Cihazı kullanan: <strong>{row.actualUser}</strong>{row.actualUserMail ? ` (${row.actualUserMail})` : ""}
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                        SCCM'de son oturum açan{row.hostname ? <> · Hostname: <span style={{ fontFamily: "var(--font-mono)" }}>{row.hostname}</span></> : ""}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={styles.detailFieldRow}>
              <span style={{ color: pal.ink, fontWeight: 700 }}>Sahibi</span>
              <span>{row.ownerFull || row.owner || "—"}</span>
            </div>
            {row.model && (
              <div style={styles.detailFieldRow}>
                <span style={{ color: pal.ink, fontWeight: 700 }}>Model</span>
                <span>{row.model}</span>
              </div>
            )}
            {row.company && (
              <div style={styles.detailFieldRow}>
                <span style={{ color: pal.ink, fontWeight: 700 }}>Şirket</span>
                <span>{row.company}</span>
              </div>
            )}
            {row.hostname && (
              <div style={styles.detailFieldRow}>
                <span style={{ color: pal.ink, fontWeight: 700 }}>Hostname / Son Giriş</span>
                <span style={{ textAlign: "left" }}>
                  <div style={{ fontFamily: "var(--font-mono)" }}>{row.hostname}</div>
                  {row.actualUser && <div style={{ color: pal.inkSoft, fontSize: 13 }}>{row.actualUser}</div>}
                </span>
              </div>
            )}
            <div style={{ ...styles.detailFieldRow, borderBottom: "none" }}>
              <span style={{ color: pal.ink, fontWeight: 700 }}>Lokasyon</span>
              <span>{row.location || "—"}</span>
            </div>
            {row.matched && row.matchDetail && <DescriptionRow text={row.matchDetail} styles={styles} pal={pal} />}
            {row.statusTag && (() => {
              const unverified = isInaktifUnverified(row.statusTag);
              const tone = inaktifUsageTone(row.statusTag); // İnaktif: kullanan varsa yeşil, kimse kullanmıyorsa kırmızı
              const ok = tone ? tone === "ok" : row.matched;
              return (
                <div style={{ ...styles.detailFieldRow, borderBottom: "none" }}>
                  <span style={{ color: pal.ink, fontWeight: 700 }}>Durum</span>
                  <span style={{ ...styles.badge, ...(ok ? styles.badgeOk : !tone && unverified ? styles.badgeNeutral : styles.badgeBad) }}>
                    <span style={{ ...styles.badgeDot, background: ok ? pal.ok : !tone && unverified ? pal.inkSoft : pal.bad }} />
                    {row.statusTag}
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        <DeviceActionHistory row={row} mailHistory={mailHistory} styles={styles} pal={pal} />
      </div>
    </div>
  );
}
