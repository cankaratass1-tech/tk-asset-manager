// Durum kutusunun maddeli (anahtar–değer) gösterimi: paragraf yerine "Seri no / Hostname / Zimmetli kişi / Cihazı kullanan / Yapılacak".
// Değerler tablodaki kişi hücresiyle AYNI biçimde: üstte ad (kalın), altında ayrıntı satırları (takım, e-posta, kaynak) daha küçük/gri.
// Paragraf metni (matchDetail) mailler ve Excel "Açıklama" için aynen durur; bu yalnız ekran görünümüdür.
// Aksiyon gerektirmeyen durumlarda items verilmez (çağıran eski paragraf kutusunu kullanır).

export default function ItemizedAlert({ title, items, tone = "bad", styles, pal }) {
  const warn = tone === "warn";
  const accent = warn ? pal.warnFg : pal.bad;
  const text = { fontSize: 14, lineHeight: 1.5, color: pal.ink, fontWeight: 500 };
  const sub = { fontSize: 13, lineHeight: 1.45, color: pal.ink, opacity: 0.68, fontWeight: 400 }; // tablodaki ikinci satır gibi
  const rowBorder = (i) => (i === 0 ? "none" : `1px solid ${pal.ink}1f`);
  return (
    <div data-itemized-alert style={{ ...styles.detailAlert, ...(warn ? { background: pal.warnBg, border: `1px solid ${pal.warnFg}33` } : {}) }}>
      <div style={{ ...styles.detailAlertTitle, color: accent, fontSize: 16, marginBottom: 6 }}>{title}</div>
      <div>
        {items.map((it, i) => {
          if (it.list) {
            return (
              <div key={it.label} data-alert-row={it.label} style={{ padding: "9px 0", borderTop: rowBorder(i) }}>
                <div style={text}>{it.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {it.list.map((d) => (
                    <div key={d.serial} data-dup-device={d.serial} style={{ border: `1px solid ${pal.ink}22`, borderLeft: `3px solid ${d.isThis ? accent : `${pal.ink}44`}`, borderRadius: 8, padding: "8px 12px", background: `${pal.ink}08` }}>
                      <div style={{ ...text, fontWeight: 700, marginBottom: 4 }}>{d.serial}{d.isThis ? " — bu kayıt" : ""}</div>
                      {d.rows.map(([k, v]) => (
                        <div key={k} style={{ display: "grid", gridTemplateColumns: "129px 1fr", gap: 0, ...text }}>
                          <span>{k}</span><span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          return (
            <div key={it.label} data-alert-row={it.label} style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 14, padding: "9px 0", borderTop: rowBorder(i) }}>
              <span style={text}>{it.label}</span>
              <span style={{ ...text, minWidth: 0, overflowWrap: "anywhere" }}>
                <span style={{ fontWeight: it.action ? 700 : 600 }}>{it.value}</span>
                {(it.lines || []).filter(Boolean).map((l) => <span key={l} style={{ display: "block", ...sub }}>{l}</span>)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
