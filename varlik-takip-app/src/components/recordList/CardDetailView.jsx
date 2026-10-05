// Detay görünümü kart listesi — kart tıklaması sağ panelde gösterir, checkbox toplu seçim içindir
export default function CardDetailView({
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
  detailRowKey,
  setDetailRowKey,
}) {
  if (rows.length === 0) {
    return <div style={styles.detailEmpty}>Sonuç bulunamadı</div>;
  }

  // splitModel'de (ör. Disk Alanı) Model için ekstra bir sütun açılıyor — grid şablonu ona göre genişler
  const gridCols = splitModel ? "20px 90px 1.3fr 90px 1fr 110px 16px" : "20px 110px 2fr 1fr 110px 16px";

  return (
    <div style={styles.cardList}>
      <div style={{ ...styles.cardListHeader, gridTemplateColumns: gridCols }}>
        <div />
        <div>{serialLabel || "Seri No"}</div>
        <div>{ownerLabel || "İsim Soyisim"}</div>
        {splitModel && <div>{modelLabel || "Model"}</div>}
        <div>{locationLabel || "Lokasyon"}</div>
        <div>Durum</div>
        <div />
      </div>
      {rows.map((r, i) => {
        const key = rowKeyOf(r);
        const checked = selectedKeys.has(key);
        const isFocused = detailRowKey === key;
        return (
          <div
            key={i}
            onClick={() => setDetailRowKey(key)}
            style={{
              ...styles.cardRow,
              gridTemplateColumns: gridCols,
              ...(checked ? { background: pal.accentSoftStrong } : {}),
              ...(!r.matched && !isFocused ? styles.cardRowUnmatched : {}),
              ...(isFocused ? styles.cardRowSelected : {}),
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleSelect(key)}
              style={styles.checkbox}
            />
            <div style={styles.cardRowSerial}>{r.serial}</div>
            <div style={styles.cardRowName} title={r.ownerFull || r.owner}>{r.owner}</div>
            {splitModel && <div style={styles.cardRowLocation}>{r.model}</div>}
            <div style={styles.cardRowLocation}>{isZimmet ? r.office : r.location}</div>
            <div>
              <span style={{ ...styles.badge, ...(r.matched ? styles.badgeOk : r.statusTag === "Kullanım Kaydı Yok" ? styles.badgeNeutral : styles.badgeBad) }}>
                <span style={{ ...styles.badgeDot, background: r.matched ? pal.ok : r.statusTag === "Kullanım Kaydı Yok" ? pal.inkSoft : pal.bad }} />
                {isZimmet ? r.statusTag : r.matched ? "Eşleşti" : "Eşleşmedi"}
              </span>
            </div>
            <div style={styles.cardChevron}>›</div>
          </div>
        );
      })}
    </div>
  );
}
