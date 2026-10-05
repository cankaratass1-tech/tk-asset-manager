import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import MasterSetupScreen from './components/MasterSetupScreen.jsx'
import { backendClient, getSessionToken, setSessionToken } from './services/backendClient.js'

// Gereksinim #6-#10: uygulama artık doğrudan dashboard'a açılmıyor. Sırasıyla:
// 1) Master User hiç oluşturulmamışsa -> MasterSetupScreen
// 2) Geçerli bir oturum yoksa -> LoginScreen
// 3) İkisi de geçtiyse -> App (giriş yapan kullanıcı `user` prop'uyla geçilir)
function AuthGate() {
  const [phase, setPhase] = useState("loading"); // loading | setup | login | ready
  const [user, setUser] = useState(null);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const status = await backendClient.getSetupStatus();
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
        onLoginSuccess={(res) => {
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
    <AuthGate />
  </StrictMode>,
)
