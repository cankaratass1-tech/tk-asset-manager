// Durum kutusunun maddeli (anahtar–değer) gösterimi: paragraf yerine "Seri no / Hostname / Zimmetli kişi / Cihazı kullanan / Yapılacak".
// Her bilginin KAYNAĞI ayrı bir rozet olarak görünür (SCCM, TuruncuHat…) — soluk yazı yerine net etiket.
// Paragraf metni (matchDetail) mailler ve Excel "Açıklama" için aynen durur; bu yalnız ekran görünümüdür.
// Aksiyon gerektirmeyen durumlarda items verilmez (çağıran eski paragraf kutusunu kullanır).

const SRC = (text) => ({ text, kind: "source" });

// İnaktif Cihazlar — "Kullanılıyor — Zimmet Aktarımı Gerekli"
export function inaktifActionItems(row) {
  if (!row.actualUser) return null;
  return [
    { label: "Seri no", value: row.serial, mono: true },
    ...(row.hostname ? [{ label: "Hostname", value: row.hostname, mono: true, chips: [SRC("SCCM")] }] : []),
    { label: "Kayıtlı sahibi", value: row.owner && row.owner !== "—" ? row.owner : "—", chips: [SRC("İnaktif listesinde")] },
    { label: "Cihazı kullanan", value: row.actualUser, line2: row.actualUserMail || "", chips: [SRC("SCCM · son oturum açan")] },
    { label: "Yapılacak", value: `Zimmet ${row.actualUser} adına aktarılmalı`, action: true },
  ];
}

// Zimmet Uyuşmazlığı — yalnız aksiyon gerektiren iki durum (Zimmet Hatalı, Mükerrer Çift Zimmet)
export function zimmetAlertItems(row) {
  const tag = String(row.personStatusTag ?? row.statusTag ?? "");
  const user = row.userLabel && row.userLabel !== "Tespit Edilemedi" ? row.userLabel : "";
  const base = [
    { label: "Seri no", value: row.serial, mono: true },
    ...(row.hostname ? [{ label: "Hostname", value: row.hostname, mono: true, chips: [SRC("SCCM")] }] : []),
    { label: "Zimmetli kişi", value: row.owner && row.owner !== "—" ? row.owner : "—", chips: [SRC("TuruncuHat")] },
  ];
  if (/^Zimmet Hatalı/.test(tag) && user) {
    return [
      ...base,
      { label: "Cihazı kullanan", value: user, line2: row.mail || "", chips: [SRC("SCCM · son oturum açan")] },
      { label: "Yapılacak", value: `Zimmet ${user} adına aktarılmalı ya da kullanım düzeltilmeli`, action: true },
    ];
  }
  if (/^Mükerrer Çift Zimmet/.test(tag)) {
    return [
      ...base,
      { label: "Durum", value: "Aynı kişiye birden fazla notebook zimmetli" },
      { label: "Yapılacak", value: "Kullanılmayan cihaz iade edilmeli ya da neden gerektiği belirtilmeli", action: true },
    ];
  }
  return null;
}

export default function ItemizedAlert({ title, items, tone = "bad", styles, pal }) {
  const warn = tone === "warn";
  const accent = warn ? pal.warnFg : pal.bad;
  // Tüm yazılar aynı boyut/renk/kalınlıkta; kaynak bilgisi parantez içinde aynı yazı stiliyle. Yalnız "Yapılacak" değeri kalın.
  const text = { fontSize: 14, lineHeight: 1.5, color: pal.ink, fontWeight: 500 };
  return (
    <div data-itemized-alert style={{ ...styles.detailAlert, ...(warn ? { background: pal.warnBg, border: `1px solid ${pal.warnFg}33` } : {}) }}>
      <div style={{ ...styles.detailAlertTitle, color: accent, fontSize: 16, marginBottom: 6 }}>{title}</div>
      <div>
        {items.map((it, i) => {
          const source = it.chips ? it.chips.map((c) => c.text).join(", ") : "";
          return (
            <div key={it.label} data-alert-row={it.label} style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 14, padding: "9px 0", borderTop: i === 0 ? "none" : `1px solid ${pal.ink}1f` }}>
              <span style={text}>{it.label}</span>
              <span style={{ ...text, fontWeight: it.action ? 700 : 500, minWidth: 0, overflowWrap: "anywhere" }}>
                {it.value}{it.line2 ? `, ${it.line2}` : ""}{source ? ` (${source})` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
