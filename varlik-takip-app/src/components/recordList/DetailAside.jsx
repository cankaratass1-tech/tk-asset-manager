import { useState } from "react";
import { isZimmetUnverified } from "../../services/zimmetService";
import { isInaktifUnverified, needsInaktifAction } from "../../services/inaktifComparisonService";
import { deviceKeyOf } from "../../services/deviceActionService";
import DeviceActionHistory from "./DeviceActionHistory";

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

// Zimmet not listesi — İşlem/durum alanı kaldırıldı, sadece notlar kaldı (bkz. konuşma)
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
    <div style={{ ...styles.detailFieldRow, borderBottom: "none", flexDirection: "column", alignItems: "flex-start", gap: 10, width: "100%" }}>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ color: pal.inkSoft, fontSize: 13 }}>Notlar</span>
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
  if (!row) {
    return (
      <aside style={styles.detailAside}>
        <div style={styles.detailEmpty}>Detayını görmek için soldaki listeden bir kayıt seç</div>
      </aside>
    );
  }

  const initials = row.owner !== "—" ? row.owner.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() : "?";

  return (
    <aside style={styles.detailAside}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={styles.detailAvatar}>{initials}</div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25, ...(isZimmet && row.owner !== "—" ? styles.clickableName : {}) }}
            onClick={isZimmet && row.owner !== "—" ? () => setSelectedPerson(row.owner) : undefined}
          >
            {row.ownerFull || row.owner}
          </div>
          <div style={{ fontSize: 14, color: pal.inkSoft, marginTop: 2 }}>{row.sub}</div>
        </div>
      </div>

      {(() => {
        // Kişinin kendi zimmeti mi hatalı, yoksa sadece bağlı monitöründe mi sorun var —
        // ikisi görsel olarak ayrışmalı (bkz. konuşma: aynı kırmızı kutuda "Zimmet Doğru" yazması
        // kafa karıştırıyordu). personMatched sadece comparisonService satırlarında var; düz SCCM
        // satırlarında (TH yüklenmemişse) row.matched zaten kişi düzeyinde tek gerçek.
        const personOk = row.personMatched ?? row.matched;
        if (!isZimmet) {
          if (row.matched) return null;
          // İnaktif Cihazlar TH+SCCM ile çapraz doğrulanan bir statusTag taşıyor (bkz. konuşma) —
          // "Zimmet Aktarımı Gerekli"/"İnaktif Etiketi Hatalı" gerçek bir aksiyon gerektirdiği için
          // turuncu, "Doğrulanamadı"/"TuruncuHat'ta Bulunamadı" kanıt değil olduğu için nötr renkte.
          if (row.statusTag) {
            const actionNeeded = needsInaktifAction(row.statusTag);
            const unverified = isInaktifUnverified(row.statusTag);
            return (
              <div style={{ ...styles.detailAlert, ...(actionNeeded ? { background: pal.warnBg, border: `1px solid ${pal.warnFg}33` } : {}) }}>
                <div style={{ ...styles.detailAlertTitle, ...(actionNeeded ? { color: pal.warnFg } : {}) }}>{row.statusTag}</div>
                <div style={styles.detailAlertBody}>{row.matchDetail}</div>
                {row.actualUser && (
                  <div style={{ ...styles.detailAlertBody, marginTop: 4 }}>
                    Fiilen kullanan: <strong>{row.actualUser}</strong>{row.actualUserMail ? ` (${row.actualUserMail})` : ""}
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
          <span style={{ color: pal.inkSoft }}>{serialLabel || "Seri No"}</span>
          <span style={{ fontFamily: "monospace" }}>{row.serial}</span>
        </div>
        <div style={styles.detailFieldRow}>
          <span style={{ color: pal.inkSoft }}>{isZimmet ? "Cihaz Türü" : modelLabel || "Model"}</span>
          <span>{isZimmet ? row.sub : row.model}</span>
        </div>
        <div style={styles.detailFieldRow}>
          <span style={{ color: pal.inkSoft }}>{isZimmet ? "Kullanan Kişi" : locationLabel || "Lokasyon"}</span>
          <span
            style={isZimmet && row.userLabel !== "—" && row.userLabel !== "Tespit Edilemedi" ? styles.clickableName : undefined}
            onClick={isZimmet && row.userLabel !== "—" && row.userLabel !== "Tespit Edilemedi" ? () => setSelectedPerson(row.userLabel) : undefined}
          >
            {isZimmet ? row.userLabel : row.location}
          </span>
        </div>
        {isZimmet && (
          <div style={styles.detailFieldRow}>
            <span style={{ color: pal.inkSoft }}>Zimmet Türü</span>
            <span>{row.assignmentType === "OBS" ? "OBS (Müdürlük)" : row.assignmentType === "User" ? "User (Kişi)" : "—"}</span>
          </div>
        )}
        <div style={{ ...styles.detailFieldRow, borderBottom: "none" }}>
          <span style={{ color: pal.inkSoft }}>Durum</span>
          {(() => {
            const unverified = isZimmet ? isZimmetUnverified(row.statusTag) : isInaktifUnverified(row.statusTag);
            return (
              <span style={{ ...styles.badge, ...(row.matched ? styles.badgeOk : unverified ? styles.badgeNeutral : styles.badgeBad) }}>
                <span style={{ ...styles.badgeDot, background: row.matched ? pal.ok : unverified ? pal.inkSoft : pal.bad }} />
                {row.statusTag ? row.statusTag : row.matched ? "Eşleşti" : "Eşleşmedi"}
              </span>
            );
          })()}
        </div>

        {/* Gereksinim: "X kişisine ait monitörü Y kişisi kullanıyor mu" — kısa, taranabilir kartlar
            (önceki hal tek bir uzun paragraftı, kullanıcı geri bildirimi: "çok karmaşık"). */}
        {isZimmet && row.monitorDetails?.length > 0 && (
          <div style={{ ...styles.detailFieldRow, borderBottom: "none", flexDirection: "column", alignItems: "flex-start", gap: 8, width: "100%", paddingTop: 16 }}>
            <span style={{ color: pal.inkSoft, fontSize: 12.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Bağlı Monitörler</span>
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
                    <span style={{ fontFamily: "monospace", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.serial}
                    </span>
                    <span style={{ ...styles.badge, ...badgeStyle, flexShrink: 0 }} title={m.status}>
                      <span style={{ ...styles.badgeDot, background: dotColor }} />
                      {m.ok === true ? "Doğru" : m.ok === false ? "Hatalı" : "Doğrulanamadı"}
                    </span>
                  </div>
                  {m.label && <div style={{ color: pal.inkSoft, fontSize: 12 }}>{m.label}</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", color: pal.inkSoft, fontSize: 12.5 }}>
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
