import { useState } from "react";
import { buildDeviceOverview } from "../services/deviceOverviewService";

// "Cihaz Genel Görünüm" (madde 10, 11) — hostname/seri no/last logon ile arama, sonuçta cihazın
// tüm kaynaklardaki durumu OK / Warning / Critical / Veri Yok rozetli kartlarda.
const STATE_STYLE = (pal) => ({
  ok: { bg: `${pal.ok}18`, fg: pal.ok, label: "OK" },
  warn: { bg: `${pal.warnFg}1e`, fg: pal.warnFg, label: "Kontrol" },
  crit: { bg: `${pal.bad}1e`, fg: pal.bad, label: "Kritik" },
  none: { bg: pal.fieldBg, fg: pal.inkSoft, label: "Veri Yok" },
});

export default function DeviceOverviewCard({ sources, styles, pal }) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const S = STATE_STYLE(pal);

  const result = submitted ? buildDeviceOverview(submitted, sources) : null;

  return (
    <div style={{ ...styles.panel, padding: "20px 24px" }}>
      <p style={styles.settingsSectionTitle}>Cihaz Genel Görünüm</p>
      <p style={{ ...styles.pageSub, margin: "0 0 12px" }}>
        Hostname, seri no veya son giriş yapan kullanıcı ile arayın — cihazın tüm kaynaklardaki teknik ve operasyonel durumu tek ekranda
      </p>
      <div style={{ display: "flex", gap: 8, maxWidth: 420 }}>
        <input
          type="text"
          placeholder="Hostname / Seri No / Last Logon..."
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            // Arama kutusu tamamen silinince eski sonuç ekranda asılı kalmasın — bkz. konuşma
            // ("aradığımda X, bir şeyi sildiğimde sonuçta gitsin oradan").
            if (!v.trim()) setSubmitted("");
          }}
          onKeyDown={(e) => e.key === "Enter" && setSubmitted(query.trim())}
          style={{ ...styles.searchInput, border: `1px solid ${pal.line}`, borderRadius: 8, padding: "9px 12px", flex: 1, background: pal.fieldBg }}
        />
        <button style={styles.btnPrimary} onClick={() => setSubmitted(query.trim())}>Ara</button>
      </div>

      {submitted && !result && <p style={{ ...styles.pageSub, marginTop: 14 }}>Bir şey yazın ve Ara'ya basın.</p>}
      {result?.notFound && (
        <p style={{ ...styles.pageSub, marginTop: 14 }}>
          "{result.query}" için hiçbir kaynakta (SCCM / TuruncuHat / İnaktif / Disk) cihaz bulunamadı.
        </p>
      )}

      {result && !result.notFound && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginBottom: 14, fontSize: 13 }}>
            {Object.entries({
              Hostname: result.identity.hostname, "Seri No": result.identity.serial, Model: result.identity.model,
              "Üst Lokasyon": result.identity.lbsParent, Lokasyon: result.identity.location, Sahibi: result.identity.owner,
            }).map(([k, v]) => (
              <span key={k}><span style={{ color: pal.inkSoft }}>{k}:</span> <strong>{v}</strong></span>
            ))}
          </div>

          {/* Geniş ekranlarda auto-fill 6 kartı tek satıra sığdırıp etiketleri kırpıyordu
              (bkz. konuşma — kullanıcı ekran görüntüsü: "Last Lo...", "SYN..." gibi kesik metinler).
              minmax alt sınırı yükseltildi + grid genişliği sınırlandı, böylece geniş ekranda da
              en fazla 3 sütun (3+3 satır) oluşuyor, dar ekranda ise otomatik azalıp alt alta diziliyor. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, maxWidth: 920 }}>
            {result.cards.map((card) => (
              <div key={card.group} style={{ border: `1px solid ${pal.line}`, borderRadius: 10, padding: "12px 14px" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: pal.inkSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>{card.group}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {card.items.map((it, i) => {
                    const st = S[it.state] || S.none;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                        <span style={{ color: pal.inkSoft, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <span style={{ fontWeight: 600 }}>{it.value}</span>
                          {/* it.badgeLabel varsa (örn. monitör zimmet karşılaştırması "Doğru"/"Hatalı") genel
                              OK/Kritik yerine onu göster — bkz. konuşma */}
                          <span style={{ background: st.bg, color: st.fg, borderRadius: 6, padding: "1px 7px", fontSize: 10.5, fontWeight: 700 }} title={it.note || ""}>{it.badgeLabel || st.label}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
