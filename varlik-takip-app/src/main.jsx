import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import MasterSetupScreen from './components/MasterSetupScreen.jsx'
import { backendClient, getSessionToken, setSessionToken, SESSION_EXPIRED_EVENT } from './services/backendClient.js'

// Gereksinim #6-#10: uygulama artık doğrudan dashboard'a açılmıyor. Sırasıyla:
// 1) Master User hiç oluşturulmamışsa -> MasterSetupScreen
// 2) Geçerli bir oturum yoksa -> LoginScreen
// 3) İkisi de geçtiyse -> App (giriş yapan kullanıcı `user` prop'uyla geçilir)
function AuthGate() {
  const [phase, setPhase] = useState("loading"); // loading | setup | login | ready
  const [user, setUser] = useState(null);
  const [notice, setNotice] = useState("");
  const [requiresSetupCode, setRequiresSetupCode] = useState(true); // sunucu SETUP_CODE_REQUIRED=0 ile çalışıyorsa false (kod alanı gizlenir)

  useEffect(() => {
    checkStatus();
  }, []);

  // Oturum ortada geçersiz olursa (süre doldu vb.) giriş ekranına dön
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setNotice("Oturumunuz sona erdi — lütfen tekrar giriş yapın.");
      setPhase("login");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  async function checkStatus() {
    try {
      const status = await backendClient.getSetupStatus();
      setRequiresSetupCode(status.requiresSetupCode !== false);
      if (status.needsSetup) {
        setPhase("setup");
        return;
      }
      const token = getSessionToken();
      if (token) {
        try {
          const me = await backendClient.getMe();
          if (me.ok) {
            setUser(me.user);
            setPhase("ready");
            return;
          }
        } catch {
          setSessionToken(null);
        }
      }
      setPhase("login");
    } catch {
      // Backend'e ulaşılamıyorsa da kullanıcıyı login ekranında bırak — App.jsx zaten her
      // istekte "Backend'e ulaşılamadı" mesajını gösteriyor, burada aynı davranışı taklit ederiz
      setPhase("login");
    }
  }

  if (phase === "loading") return <div style={{ minHeight: "100vh", background: "#F2EADD" }} />;

  if (phase === "setup") {
    return (
      <MasterSetupScreen
        requiresSetupCode={requiresSetupCode}
        onMasterCreated={(res) => {
          setSessionToken(res.token);
          setUser(res.user);
          setPhase("ready");
        }}
      />
    );
  }

  if (phase === "login") {
    return (
      <LoginScreen
        notice={notice}
        onLoginSuccess={(res) => {
          setNotice("");
          setUser(res.user);
          setPhase("ready");
        }}
      />
    );
  }

  return (
    <App
      user={user}
      onLogout={() => {
        backendClient.logout();
        setUser(null);
        setPhase("login");
      }}
    />
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthGate />
    </ErrorBoundary>
  </StrictMode>,
)
