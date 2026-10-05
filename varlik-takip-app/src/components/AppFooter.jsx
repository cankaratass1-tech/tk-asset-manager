// Global footer (madde 1) — tüm ana ekranlarda tutarlı. "Son Veri Güncelleme" bilgisi sağ üstten
// buraya taşındı. Yazdırmada gizlenir (buildStyles @media print).
export default function AppFooter({ styles, pal, lastUpdated }) {
  return (
    <footer style={styles.appFooter} className="no-print">
      <span style={{ color: pal.inkSoft }}>© Can Karataş · Ali Akın</span>
      <span style={{ color: pal.inkSoft }}>
        Son veri güncelleme: <strong style={{ color: pal.ink }}>{lastUpdated || "—"}</strong>
      </span>
    </footer>
  );
}
