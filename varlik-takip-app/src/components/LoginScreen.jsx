import { useEffect, useMemo, useState } from "react";
import { ITSM_PALETTE } from "../theme/palette";
import { buildStyles } from "../theme/buildStyles";
import { backendClient } from "../services/backendClient";
import AuthShell, { CardLogo } from "./AuthShell";

// Kurumsal Login ekranı — gereksinim #6: Kurum logosu, Domain Name, Username, Password, Giriş Yap.
// Çerçeve (marka paneli + logo) AuthShell'de; burada yalnız form kartı var.
export default function LoginScreen({ onLoginSuccess }) {
  const pal = ITSM_PALETTE; // kurumsal: mavi vurgu, soğuk gri/beyaz (çerçeve AuthShell ile uyumlu)
  const styles = useMemo(() => buildStyles(pal), []);

  const [domain, setDomain] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Domain kaynak kodda hard-code edilmez — Ayarlar > Kimlik Doğrulama'da tanımlı varsayılan
  // domain buradan çekilir (gereksinim #6.1). Kullanıcı yine de alanı değiştirebilir.
  useEffect(() => {
    backendClient
      .getAuthDomain()
      .then((res) => setDomain((prev) => prev || res.defaultDomain || ""))
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      const res = await backendClient.login({ domain: domain.trim(), username: username.trim(), password });
      onLoginSuccess(res);
    } catch (err) {
      // Gereksinim #9: hata mesajı genel/anlaşılır olmalı, şifre asla bu mesaja dahil edilmez
      setError(err.message || "Kullanıcı adı, şifre veya domain hatalı");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div style={{ ...styles.panel, padding: "40px 36px", width: "min(420px, 100%)", boxShadow: "0 18px 50px rgba(18,53,91,0.14)", border: "1px solid #E3E7EF" }}>
        <CardLogo />
        <div style={{ marginBottom: 6, textAlign: "center" }}>
          <p style={{ ...styles.pageTitle, fontSize: 24, margin: "0 0 6px" }}>Giriş yap</p>
          <p style={{ ...styles.pageSub, margin: 0 }}>Devam etmek için kurumsal bilgilerinizle giriş yapın</p>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={styles.formField}>
            <label style={styles.formLabel}>Domain Name</label>
            <input
              type="text"
              placeholder="DOMAIN"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              style={styles.formInput}
            />
          </div>
          <div style={styles.formField}>
            <label style={styles.formLabel}>Username</label>
            <input
              type="text"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={styles.formInput}
            />
          </div>
          <div style={styles.formField}>
            <label style={styles.formLabel}>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.formInput}
            />
          </div>
          {error && <p style={{ ...styles.formHelper, color: pal.bad, margin: 0 }}>{error}</p>}
          <button
            type="submit"
            style={{ ...styles.btnPrimary, justifyContent: "center", padding: "11px 16px", fontSize: 14, marginTop: 4 }}
            disabled={loading || !username.trim() || !password}
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
