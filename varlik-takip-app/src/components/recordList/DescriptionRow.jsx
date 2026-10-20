// Zimmet Uyuşmazlığı satırının "Açıklama" alanı (tablodaki Açıklama sütunuyla aynı kaynak: row.model).
// Tabloda her satır için gösterilirken popup/yan panelde yalnızca uyuşmazlık uyarı kutusunun yedek metninde (itemize edilmemiş durumda)
// görünüyordu; doğru kayıtlarda, monitör uyuşmazlığında ve itemize uyarı olan satırlarda hiç görünmüyordu. Bu satır açıklamayı her durumda gösterir.
export default function DescriptionRow({ text, styles, pal }) {
  const value = String(text ?? "").trim();
  return (
    <div data-record-description style={{ ...styles.detailFieldRow, flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <span style={{ color: pal.inkSoft }}>Açıklama</span>
      {value ? (
        <span style={{ overflowWrap: "anywhere", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{value}</span>
      ) : (
        <span style={{ color: pal.inkSoft, fontStyle: "italic" }}>Açıklama yok</span>
      )}
    </div>
  );
}
