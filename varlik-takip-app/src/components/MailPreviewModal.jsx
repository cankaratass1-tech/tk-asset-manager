// Ortak e-posta önizleme penceresi (Bant, Lokasyon/IP…): konu, alıcı ve gönderilecek HTML'in aynısı.
export default function MailPreviewModal({ preview, onClose, styles, noRecipientText = "— (alıcı adresi bulunamadı)" }) {
  if (!preview) return null;
  return (
    <div style={styles.modalOverlay} onClick={onClose} data-mail-preview>
      <div style={{ ...styles.modalCard, width: "min(820px, 100%)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <p style={styles.modalTitle}>E-posta önizleme</p>
          <span style={styles.modalClose} onClick={onClose}>✕</span>
        </div>
        <p style={{ ...styles.modalSub, margin: "0 0 4px" }}><strong>Konu:</strong> {preview.subject}</p>
        <p style={{ ...styles.modalSub, margin: "0 0 12px" }}><strong>Alıcı:</strong> {preview.to || noRecipientText}</p>
        <div style={{ background: "#fff", color: "#1a1a1a", borderRadius: 8, padding: 12 }} dangerouslySetInnerHTML={{ __html: preview.html }} />
      </div>
    </div>
  );
}
