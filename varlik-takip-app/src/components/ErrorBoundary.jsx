import { Component } from "react";

// Beklenmeyen arayüz hatalarında beyaz ekran yerine kod + ID gösterir; ID konsol kaydıyla eşleşir.
export default class ErrorBoundary extends Component {
  state = { errorId: null };

  static getDerivedStateFromError() {
    return { errorId: Math.random().toString(16).slice(2, 8) };
  }

  componentDidCatch(error, info) {
    console.error(`[HATA] UI-001 #${this.state.errorId}`, error, info?.componentStack);
  }

  render() {
    if (!this.state.errorId) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F2EADD", fontFamily: "var(--font-sans)", color: "#2b2118" }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", maxWidth: 460, boxShadow: "0 8px 30px rgba(0,0,0,.12)" }}>
          <p style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Beklenmeyen bir hata oluştu</p>
          <p style={{ fontSize: 14, margin: "0 0 14px", lineHeight: 1.5 }}>
            Sayfayı yenileyin. Sorun devam ederse bu kodu ve yaptığınız işlemi iletin:
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, margin: "0 0 18px" }}>UI-001 · #{this.state.errorId}</p>
          <button onClick={() => window.location.reload()} style={{ border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 600, cursor: "pointer", background: "#D9631F", color: "#fff" }}>
            Sayfayı Yenile
          </button>
        </div>
      </div>
    );
  }
}
