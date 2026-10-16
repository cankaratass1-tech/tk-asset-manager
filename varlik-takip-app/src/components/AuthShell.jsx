import companyLogo from "../assets/company-logo.svg";

// Giriş / ilk kurulum ekranlarının ortak çerçevesi: solda koyu lacivert marka paneli (logo, başlık, ağ görseli, özellikler),
// sağda beyaz form alanı. Dar ekranda (≤ 900px) marka paneli üstte kısa bir şeride iner. Renkler kurumsal (ITSM) paletle uyumludur.
const FEATURES = [
  ["◉", "Zimmet ve kullanım uyuşmazlıkları", "Kim kullanıyor, kime zimmetli — tek bakışta"],
  ["▤", "Disk, pil, BSOD ve Bottleneck", "Sorunlu cihazlar önceliklendirilmiş"],
  ["✉", "Rapor, mail ve cihaz geçmişi", "Önizle, gönder, izini sür"],
];
const NODES = [[70, 60], [190, 30], [300, 90], [120, 150], [250, 190], [360, 40], [40, 230], [330, 250]];
const LINKS = [[0, 1], [1, 2], [0, 3], [3, 4], [2, 4], [1, 5], [2, 5], [3, 6], [4, 7], [6, 3]];

function Network() {
  return (
    <svg className="auth-art" viewBox="0 0 420 290" aria-hidden="true" preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", left: 0, top: "41%", width: "100%", height: "28%", opacity: 0.5, pointerEvents: "none" }}>
      {LINKS.map(([a, b], i) => <line key={i} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} stroke="#9ec3e8" strokeWidth="1" opacity="0.5" />)}
      {NODES.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={i % 3 === 0 ? 9 : 6} fill={i % 3 === 0 ? "#4162F4" : "#9ec3e8"} opacity={i % 3 === 0 ? 0.95 : 0.8} />
          <circle cx={x} cy={y} r={i % 3 === 0 ? 17 : 12} fill="none" stroke="#9ec3e8" strokeWidth="0.8" opacity="0.35" />
        </g>
      ))}
    </svg>
  );
}

// Form kartının üstündeki logo (ortalı)
export function CardLogo() {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src={companyLogo} alt="" style={{ width: 52, height: 52 }} />
        <span style={{ fontWeight: 700, fontSize: 20, color: "#12355b", letterSpacing: "0.01em" }}>TK Asset Manager</span>
      </div>
    </div>
  );
}

const RESPONSIVE = `
  @media (max-height: 760px) { .auth-art { display: none !important; } }
  @media (max-width: 900px) {
    .auth-shell { grid-template-columns: 1fr !important; }
    .auth-brand { min-height: 0 !important; padding: 22px 24px !important; }
    .auth-brand .auth-art, .auth-brand .auth-features { display: none !important; }
    .auth-brand h2 { font-size: 20px !important; margin-top: 12px !important; }
    .auth-form { padding: 24px 16px 40px !important; }
  }
`;

export default function AuthShell({ children }) {
  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "#172033" }}>
      <style>{RESPONSIVE}</style>
      <div className="auth-shell" style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "minmax(320px, 46%) 1fr", background: "#fff" }}>
        <aside className="auth-brand" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(160deg, #0B2240 0%, #12355b 55%, #1B4A86 100%)", color: "#fff", padding: "48px 52px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "100vh" }}>
          <Network />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img src={companyLogo} alt="" style={{ width: 44, height: 44 }} />
              <span style={{ fontWeight: 700, fontSize: 19, letterSpacing: "0.01em" }}>TK Asset Manager</span>
            </div>
            <h2 style={{ margin: "56px 0 12px", fontSize: 34, lineHeight: 1.18, fontWeight: 800, letterSpacing: "-0.02em", maxWidth: 420 }}>
              Cihaz varlıklarınız<br />tek ekranda, kontrol altında
            </h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, opacity: 0.8, maxWidth: 400 }}>
              Envanter, zimmet ve sağlık verilerini birleştirir; sorunlu cihazları öne çıkarır, raporlar ve mailler üretir.
            </p>
          </div>
          <ul className="auth-features" style={{ position: "relative", zIndex: 1, listStyle: "none", padding: 0, margin: "36px 0 0", display: "flex", flexDirection: "column", gap: 16 }}>
            {FEATURES.map(([icon, title, sub]) => (
              <li key={title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{icon}</span>
                <span>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 14.5 }}>{title}</span>
                  <span style={{ display: "block", fontSize: 13, opacity: 0.72, marginTop: 2 }}>{sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </aside>
        <main className="auth-form" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", background: "#fff" }}>{children}</main>
      </div>
    </div>
  );
}
