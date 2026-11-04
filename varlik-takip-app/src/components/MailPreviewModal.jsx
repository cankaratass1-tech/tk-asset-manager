import logoUrl from "../assets/mail-logo.png";

// Ortak e-posta önizleme penceresi (Bant, Lokasyon/IP…): konu, alıcı ve gönderilecek HTML'in aynısı.
export default function MailPreviewModal({ preview, onClose, styles, noRecipientText = "— (alıcı adresi bulunamadı)", index = 0, total = 1, onPrev, onNext, actions = null }) {
  if (!preview) return null;
  return (
    <div style={styles.modalOverlay} onClick={onClose} data-mail-preview>
      <div style={{ ...styles.modalCard, width: "min(820px, 100%)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <p style={styles.modalTitle}>E-posta önizleme{total > 1 ? ` (${index + 1} / ${total})` : ""}</p>
          <span style={styles.modalClose} onClick={onClose}>✕</span>
        </div>
        {total > 1 && (
          <div style={{ display: "flex", gap: 8, margin: "0 0 10px" }}>
            <button style={styles.btnGhost} onClick={onPrev} disabled={index <= 0} data-mail-prev>← Önceki</button>
            <button style={styles.btnGhost} onClick={onNext} disabled={index >= total - 1} data-mail-next>Sonraki →</button>
          </div>
        )}
        <p style={{ ...styles.modalSub, margin: "0 0 4px" }}><strong>Konu:</strong> {preview.subject}</p>
        <p style={{ ...styles.modalSub, margin: "0 0 12px" }}><strong>Alıcı:</strong> {preview.to || noRecipientText}</p>
        {actions && <div data-mail-actions style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 12px" }}>{actions}</div>}
        <div style={{ background: "#fff", color: "#1a1a1a", borderRadius: 8, padding: 12 }} dangerouslySetInnerHTML={{ __html: String(preview.html || "").replaceAll("cid:mail-logo", logoUrl) }} />
      </div>
    </div>
  );
}
