import { useMemo, useState } from "react";
import { LIGHT_PALETTE } from "../theme/palette";
import { buildStyles } from "../theme/buildStyles";
import { backendClient } from "../services/backendClient";

// İlk çalıştırma ekranı — gereksinim #7: Master User oluşturma. Şifre plaintext hiçbir yerde
// saklanmaz/loglanmaz; backend bcrypt ile hash'ler (bkz. backend/src/authProviders/local.js).
export default function MasterSetupScreen({ onMasterCreated }) {
  const pal = LIGHT_PALETTE;
  const styles = useMemo(() => buildStyles(pal), []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!username.trim()) return setError("Kullanıcı adı zorunlu");
    if (password.length < 8) return setError("Şifre en az 8 karakter olmalı");
    if (password !== confirmPassword) return setError("Şifreler eşleşmiyor");

    setLoading(true);
    try {
      const res = await backendClient.setupMaster({ username: username.trim(), password });
      onMasterCreated(res);
    } catch (err) {
      setError(err.message || "Master User oluşturulamadı");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ ...styles.body, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...styles.panel, padding: "40px 36px", width: "min(420px, 100%)" }}>
        <p style={{ ...styles.pageTitle, fontSize: 21 }}>İlk Kurulum</p>
        <p style={styles.pageSub}>
          Uygulama ilk kez çalıştırılıyor — devam etmeden önce bir Master User (yerel yönetici hesabı) oluşturun.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={styles.formField}>
            <label style={styles.formLabel}>Master User Kullanıcı Adı</label>
            <input type="text" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} style={styles.formInput} />
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
            style={{ ...styles.btnPrimary, justifyContent: "center", padding: "11px 16px", fontSize: 14.5, marginTop: 4 }}
            disabled={loading}
          >
            {loading ? "Oluşturuluyor..." : "Master User Oluştur"}
          </button>
        </form>
      </div>
    </div>
  );
}
