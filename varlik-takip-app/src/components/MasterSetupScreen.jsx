import { useMemo, useState } from "react";
import { ITSM_PALETTE } from "../theme/palette";
import { buildStyles } from "../theme/buildStyles";
import { backendClient } from "../services/backendClient";
import AuthShell, { CardLogo } from "./AuthShell";

// İlk çalıştırma ekranı — gereksinim #7: Master User oluşturma. Şifre plaintext hiçbir yerde
// saklanmaz/loglanmaz; backend bcrypt ile hash'ler (bkz. backend/src/authProviders/local.js).
export default function MasterSetupScreen({ onMasterCreated }) {
  const pal = ITSM_PALETTE; // kurumsal: mavi vurgu, soğuk gri/beyaz (çerçeve AuthShell ile uyumlu)
  const styles = useMemo(() => buildStyles(pal), []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!setupCode.trim()) return setError("Kurulum kodu zorunlu");
    if (!username.trim()) return setError("Kullanıcı adı zorunlu");
    if (password.length < 8) return setError("Şifre en az 8 karakter olmalı");
    if (password !== confirmPassword) return setError("Şifreler eşleşmiyor");

    setLoading(true);
    try {
      const res = await backendClient.setupMaster({ username: username.trim(), password, setupCode: setupCode.trim() });
      onMasterCreated(res);
    } catch (err) {
      setError(err.message || "Master User oluşturulamadı");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div style={{ ...styles.panel, padding: "40px 36px", width: "min(420px, 100%)", boxShadow: "0 18px 50px rgba(18,53,91,0.14)", border: "1px solid #E3E7EF" }}>
        <CardLogo />
        <p style={{ ...styles.pageTitle, fontSize: 22, textAlign: "center" }}>İlk Kurulum</p>
        <p style={{ ...styles.pageSub, textAlign: "center" }}>
          Uygulama ilk kez çalıştırılıyor — devam etmeden önce bir Master User (yerel yönetici hesabı) oluşturun.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={styles.formField}>
            <label style={styles.formLabel}>Kurulum Kodu</label>
            <input type="text" autoFocus autoComplete="off" value={setupCode} onChange={(e) => setSetupCode(e.target.value)} style={{ ...styles.formInput, fontFamily: "var(--font-mono, monospace)" }} />
            <p style={{ ...styles.formHelper, margin: 0 }}>
              Kod, sunucu başlatılırken konsola yazılır (ya da SETUP_CODE ortam değişkeninden alınır).
            </p>
          </div>
          <div style={styles.formField}>
            <label style={styles.formLabel}>Master User Kullanıcı Adı</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} style={styles.formInput} />
          </div>
          <div style={styles.formField}>
            <label style={styles.formLabel}>Şifre (en az 8 karakter)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={styles.formInput} />
          </div>
          <div style={styles.formField}>
            <label style={styles.formLabel}>Şifre (tekrar)</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={styles.formInput} />
          </div>
          {error && <p style={{ ...styles.formHelper, color: pal.bad, margin: 0 }}>{error}</p>}
          <button
            type="submit"
            style={{ ...styles.btnPrimary, justifyContent: "center", padding: "11px 16px", fontSize: 14, marginTop: 4 }}
            disabled={loading}
          >
            {loading ? "Oluşturuluyor..." : "Master User Oluştur"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
