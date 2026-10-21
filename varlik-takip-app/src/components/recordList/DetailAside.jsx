import { useState } from "react";
import { isZimmetUnverified } from "../../services/zimmetService";
import { isInaktifUnverified, needsInaktifAction, inaktifUsageTone } from "../../services/inaktifComparisonService";
import { deviceKeyOf } from "../../services/deviceActionService";
import DeviceActionHistory from "./DeviceActionHistory";
import { useStickyTop } from "../../hooks/useStickyTop";
import ItemizedAlert from "./ItemizedAlert";
import { inaktifActionItems, zimmetAlertItems, descriptionShownInAlert } from "./alertItems";
import DescriptionRow from "./DescriptionRow";

const smallBtnStyle = (pal) => ({
  fontSize: 12,
  padding: "3px 9px",
  borderRadius: 6,
  border: `1px solid ${pal.line}`,
  background: "transparent",
  color: pal.inkSoft,
  cursor: "pointer",
});

// Tek bir not satırı — görüntüleme veya düzenleme modu, kendi düzenleme durumunu tutar
function NoteRow({ note, pal, styles, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ display: "flex", gap: 6, width: "100%", alignItems: "center" }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setText(note.text); setEditing(false); }
          }}
          style={{ ...styles.noteInput, flex: 1 }}
          autoFocus
        />
        <button style={smallBtnStyle(pal)} onClick={save}>Kaydet</button>
        <button style={smallBtnStyle(pal)} onClick={() => { setText(note.text); setEditing(false); }}>Vazgeç</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, width: "100%", alignItems: "flex-start", justifyContent: "space-between" }}>
      <span style={{ flex: 1, overflowWrap: "break-word", wordBreak: "break-word", fontSize: 14, lineHeight: 1.4 }}>{note.text}</span>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button style={smallBtnStyle(pal)} onClick={() => setEditing(true)}>Düzenle</button>
        <button style={{ ...smallBtnStyle(pal), color: pal.bad, borderColor: pal.bad }} onClick={onDelete}>Sil</button>
      </div>
    </div>
  );
}

// Zimmet not listesi — İşlem/durum alanı kaldırıldı, sadece notlar kaldı
// Satır değişince (key=rowKey) taslak metin sıfırlanır
function NotesBlock({ row, rowMeta, addNote, editNote, deleteNote, styles, pal }) {
  const [draft, setDraft] = useState("");
  const dk = deviceKeyOf(row);
  const meta = rowMeta[dk] || {};
  const notes = meta.notes || [];

  const submitDraft = () => {
    if (!draft.trim()) return;
    addNote(dk, draft);
    setDraft("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 10, width: "100%", padding: "13px 0" }}>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ color: pal.ink, fontSize: 14, fontWeight: 700 }}>Notlar</span>
        {notes.length === 0 && <span style={{ color: pal.inkSoft, fontSize: 13 }}>Henüz not eklenmedi</span>}
        {notes.map((n) => (
          <NoteRow
            key={n.id}
            note={n}
            pal={pal}
            styles={styles}
            onSave={(text) => editNote(dk, n.id, text)}
            onDelete={() => deleteNote(dk, n.id)}
          />
        ))}
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <input
            type="text"
            placeholder="Not ekle..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitDraft()}
            style={{ ...styles.noteInput, flex: 1 }}
          />
          <button style={smallBtnStyle(pal)} onClick={submitDraft}>Ekle</button>
        </div>
      </div>
    </div>
  );
}

// Detay görünümü sağ panel — Zimmet notları burada, satır seçilince görünür
export default function DetailAside({ row, isZimmet, ownerLabel, serialLabel, modelLabel, locationLabel, styles, pal, setSelectedPerson, rowMeta, addNote, editNote, deleteNote, mailHistory }) {
  // Panel ekrandan uzunsa (uzun geçmiş, çok not) sabit top içeriğin alt kısmını erişilemez bırakıyordu — bkz. hooks/useStickyTop.js
  const [asideRef, asideTop] = useStickyTop(20);
  if (!row) {
    return (
      <aside ref={asideRef} style={{ ...styles.detailAside, top: asideTop }}>
        <div style={styles.detailEmpty}>Detayını görmek için soldaki listeden bir kayıt seçin</div>
      </aside>
    );
  }

  const initials = row.owner !== "—" ? row.owner.split(" ").map((p) => p[0]).slice(0, 2).join("").toLocaleUpperCase("tr-TR") : "?";

  return (
    <aside ref={asideRef} style={{ ...styles.detailAside, top: asideTop }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={styles.detailAvatar}>{initials}</div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.25, ...(isZimmet && row.owner !== "—" ? styles.clickableName : {}) }}
            onClick={isZimmet && row.owner !== "—" ? () => setSelectedPerson(row.owner) : undefined}
          >
            {row.ownerFull || row.owner}
          </div>
          <div style={{ fontSize: 14, color: pal.inkSoft, marginTop: 2 }}>{row.sub}</div>
        </div>
      </div>

      {(() => {
        // Kişinin kendi zimmeti mi hatalı, yoksa sadece bağlı monitöründe mi sorun var —
        // ikisi görsel olarak ayrışmalı. personMatched sadece comparisonService satırlarında var; düz SCCM
        // satırlarında (TH yüklenmemişse) row.matched zaten kişi düzeyinde tek gerçek.
        const personOk = row.personMatched ?? row.matched;
        if (!isZimmet) {
          if (row.matched) return null;
          // İnaktif Cihazlar TH+SCCM ile çapraz doğrulanan bir statusTag taşıyor —
          // "Zimmet Aktarımı Gerekli"/"İnaktif Etiketi Hatalı" gerçek bir aksiyon gerektirdiği için
          // turuncu, "Doğrulanamadı"/"TuruncuHat'ta Bulunamadı" kanıt değil olduğu için nötr renkte.
          if (row.statusTag) {
            const actionNeeded = needsInaktifAction(row.statusTag);
            const unverified = isInaktifUnverified(row.statusTag);
            const items = actionNeeded ? inaktifActionItems(row) : null;
            if (items) return <ItemizedAlert title={row.statusTag} items={items} tone="warn" styles={styles} pal={pal} />;
            return (
              <div style={{ ...styles.detailAlert, ...(actionNeeded ? { background: pal.warnBg, border: `1px solid ${pal.warnFg}33` } : {}) }}>
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
          }
          return (
            <div style={styles.detailAlert}>
              <div style={styles.detailAlertTitle}>Eşleşmedi</div>
              <div style={styles.detailAlertBody}>Envanterde bu kayıt için bir eşleşme bulunamadı.</div>
            </div>
          );
        }
        if (!personOk) {
          const zItems = zimmetAlertItems(row);
          if (zItems) return <ItemizedAlert title={row.personStatusTag ?? row.statusTag} items={zItems} styles={styles} pal={pal} />;
          return (
            <div style={styles.detailAlert}>
              <div style={styles.detailAlertTitle}>{row.personStatusTag ?? row.statusTag}</div>
              <div style={styles.detailAlertBody}>{row.model}</div>
            </div>
          );
        }
        if (row.monitorIssue) {
          return (
            <div style={{ ...styles.detailAlert, background: pal.warnBg, border: `1px solid ${pal.warnFg}33` }}>
              <div style={{ ...styles.detailAlertTitle, color: pal.warnFg }}>Kişinin zimmeti doğru — bağlı monitöründe uyuşmazlık var</div>
              <div style={styles.detailAlertBody}>Aşağıdaki "Bağlı Monitörler" bölümüne bakın.</div>
            </div>
          );
        }
        return null;
      })()}

      <div>
        <div style={styles.detailFieldRow}>
          <span style={{ color: pal.ink, fontWeight: 700 }}>{serialLabel || "Seri No"}</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{row.serial}</span>
        </div>
        <div style={styles.detailFieldRow}>
          <span style={{ color: pal.ink, fontWeight: 700 }}>{isZimmet ? "Cihaz Türü" : modelLabel || "Model"}</span>
          <span>{isZimmet ? row.sub : row.model}</span>
        </div>
        <div style={styles.detailFieldRow}>
          <span style={{ color: pal.ink, fontWeight: 700 }}>{isZimmet ? "Kullanan Kişi" : locationLabel || "Lokasyon"}</span>
          <span
            style={isZimmet && row.userLabel !== "—" && row.userLabel !== "Tespit Edilemedi" ? styles.clickableName : undefined}
            onClick={isZimmet && row.userLabel !== "—" && row.userLabel !== "Tespit Edilemedi" ? () => setSelectedPerson(row.userLabel) : undefined}
          >
            {isZimmet ? (row.userFullName || row.userLabel) : row.location}
            {isZimmet && row.userFullTitle ? <div style={{ fontSize: 13, color: pal.inkSoft, fontWeight: 400 }}>{row.userFullTitle}</div> : null}
          </span>
        </div>
        {isZimmet && (
          <div style={styles.detailFieldRow}>
            <span style={{ color: pal.ink, fontWeight: 700 }}>Windows</span>
            <span title={row.windowsDetail || ""} style={{ textAlign: "left" }}>
              {row.windowsLabel || <span style={{ color: pal.inkSoft }}>Veri Yok</span>}
              {row.windowsSupportLabel && (
                <div style={{ fontSize: 12, fontWeight: 700, color: row.windowsStatus === "ended" ? pal.bad : row.windowsStatus === "ending" ? pal.warnFg : row.windowsStatus === "supported" ? pal.ok : pal.inkSoft }}>{row.windowsSupportLabel}</div>
              )}
            </span>
          </div>
        )}
        {isZimmet && (
          <div style={styles.detailFieldRow}>
            <span style={{ color: pal.ink, fontWeight: 700 }}>Zimmet Türü</span>
            <span>{row.assignmentType === "OBS" ? "OBS (Müdürlük)" : row.assignmentType === "User" ? "User (Kişi)" : "—"}</span>
          </div>
        )}
        {isZimmet && !descriptionShownInAlert(row) && <DescriptionRow text={row.model} styles={styles} pal={pal} />}
        {!isZimmet && row.matched && row.matchDetail && <DescriptionRow text={row.matchDetail} styles={styles} pal={pal} />}
        <div style={{ ...styles.detailFieldRow, borderBottom: "none" }}>
          <span style={{ color: pal.ink, fontWeight: 700 }}>Durum</span>
          {(() => {
            const unverified = isZimmet ? isZimmetUnverified(row.statusTag) : isInaktifUnverified(row.statusTag);
            return (
              <span style={{ ...styles.badge, ...(!isZimmet && inaktifUsageTone(row.statusTag) === "ok" ? styles.badgeOk : !isZimmet && inaktifUsageTone(row.statusTag) === "bad" ? styles.badgeBad : row.matched ? styles.badgeOk : unverified ? styles.badgeNeutral : styles.badgeBad) }}>
                <span style={{ ...styles.badgeDot, background: !isZimmet && inaktifUsageTone(row.statusTag) === "ok" ? pal.ok : !isZimmet && inaktifUsageTone(row.statusTag) === "bad" ? pal.bad : row.matched ? pal.ok : unverified ? pal.inkSoft : pal.bad }} />
                {row.statusTag ? row.statusTag : row.matched ? "Eşleşti" : "Eşleşmedi"}
              </span>
            );
          })()}
        </div>

        {/* Gereksinim: "X kişisine ait monitörü Y kişisi kullanıyor mu" — kısa, taranabilir kartlar
            (önceki hal tek bir uzun paragraftı, kullanıcı geri bildirimi: "çok karmaşık"). */}
        {isZimmet && row.monitorDetails?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8, width: "100%", paddingTop: 16 }}>
            <span style={{ color: pal.ink, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Bağlı Monitörler</span>
            {row.monitorDetails.map((m, i) => {
              const badgeStyle = m.ok === true ? styles.badgeOk : m.ok === false ? styles.badgeBad : styles.badgeNeutral;
              const dotColor = m.ok === true ? pal.ok : m.ok === false ? pal.bad : pal.inkSoft;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex", flexDirection: "column", gap: 6,
                    padding: "10px 12px", borderRadius: 10, background: pal.fieldBg, fontSize: 13, width: "100%",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.serial}
                    </span>
                    <span style={{ ...styles.badge, ...badgeStyle, flexShrink: 0 }} title={m.status}>
                      <span style={{ ...styles.badgeDot, background: dotColor }} />
                      {m.ok === true ? "Doğru" : m.ok === false ? "Hatalı" : "Doğrulanamadı"}
                    </span>
                  </div>
                  {m.label && <div style={{ color: pal.inkSoft, fontSize: 12 }}>{m.label}</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", color: pal.inkSoft, fontSize: 13 }}>
                    <span>Zimmetli: {m.assignedTo || "—"}</span>
                    <span>Kullanan: {m.usedBy}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Notlar artık tüm raporlarda ve tüm satırlarda (madde 5) — sadece zimmet-hatalıda değil */}
        <NotesBlock
          key={deviceKeyOf(row)}
          row={row}
          rowMeta={rowMeta}
          addNote={addNote}
          editNote={editNote}
          deleteNote={deleteNote}
          styles={styles}
          pal={pal}
        />

        <DeviceActionHistory row={row} mailHistory={mailHistory} styles={styles} pal={pal} />
      </div>

      {isZimmet && row.owner !== "—" && (
        <button style={styles.btnGhost} onClick={() => setSelectedPerson(row.owner)}>
          {row.owner}'a ait tüm kayıtları gör
        </button>
      )}
    </aside>
  );
}
