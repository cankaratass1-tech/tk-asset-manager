// Yerel backend servisiyle konuşan istemci (bkz. ../../../backend). "localhost" yerine sayfayı
// servis eden host kullanılır — böylece başka bir bilgisayardan tarayıcı üzerinden erişildiğinde
// (ağ modu) istek kendi bilgisayarına değil, sunucunun IP'sine gider.
// Tek servis deploy'unda (ör. Render — bkz. konuşma: "canlı gösterme" için bulut deploy)
// frontend ve backend AYNI origin'den servis edilir; bu durumda VITE_API_BASE=/api build
// zamanında enjekte edilir ve backend port 5000 varsayımı devre dışı kalır. Yerel geliştirmede
// bu env değişkeni tanımlı olmadığından davranış hiç değişmez.
const BASE_URL = import.meta.env.VITE_API_BASE || `http://${window.location.hostname}:5000/api`;
const SESSION_TOKEN_KEY = "varlikTakip.sessionToken";

// Ayarlar ekranı girişinden sonra bellekte tutulan kimlik bilgileri — /settings/ altındaki her
// isteğe otomatik header olarak eklenir (bkz. backend/src/auth.js). Sayfa yenilenince kaybolur,
// bilerek kalıcı saklanmıyor. (datasource/smtp/mailgroups/filesource hâlâ bu deseni kullanır —
// çalışan akış bozulmasın diye dokunulmadı.)
let settingsAuth = null;
export function setSettingsAuth(username, password) {
  settingsAuth = username && password ? { username, password } : null;
}
export function clearSettingsAuth() {
  settingsAuth = null;
}

// Genel oturum token'ı (gereksinim #10 — "Session/token yönetimi güvenli şekilde
// gerçekleştirilmeli"). localStorage'da tutulur ki sayfa yenilenince kullanıcı tekrar login
// olmak zorunda kalmasın; backend token'ı imza+süre ile doğrular (bkz. backend/src/session.js).
export function getSessionToken() {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setSessionToken(token) {
  try {
    if (token) localStorage.setItem(SESSION_TOKEN_KEY, token);
    else localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // localStorage kullanılamıyorsa (gizli sekme vb.) sessizce yoksay — oturum bellekte kalmaz
  }
}

async function request(path, options) {
  let res;
  const isSettingsPath = path.startsWith("/settings/") && path !== "/settings/login";
  const isAuthPublicPath = path === "/auth/login" || path === "/auth/setup-master" || path === "/auth/setup-status" || path === "/auth/domain";
  const token = getSessionToken();
  const authHeaders = {
    ...(isSettingsPath && settingsAuth ? { "x-admin-username": settingsAuth.username, "x-admin-password": settingsAuth.password } : {}),
    ...(!isAuthPublicPath && token ? { Authorization: `Bearer ${token}` } : {}),
  };
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...authHeaders },
      ...options,
    });
  } catch {
    throw new Error("Backend'e ulaşılamadı — çalıştığından emin ol (bkz. backend/README ya da `npm run dev` backend klasöründe)");
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    if (!isSettingsPath && !isAuthPublicPath) setSessionToken(null); // oturum geçersiz — tekrar login gerekecek
    throw new Error(body.error || body.message || "Yetkisiz — tekrar giriş yapmalısın");
  }
  if (!res.ok && body.ok === undefined) {
    throw new Error(body.error || `Backend ${res.status} döndü`);
  }
  return body;
}

export const backendClient = {
  loginSettings: (username, password) => request("/settings/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  // Genel kimlik doğrulama (gereksinim #6-#9)
  getSetupStatus: () => request("/auth/setup-status"),
  setupMaster: ({ username, password }) => request("/auth/setup-master", { method: "POST", body: JSON.stringify({ username, password }) }),
  getAuthDomain: () => request("/auth/domain"),
  login: ({ domain, username, password }) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ domain, username, password }) }).then((res) => {
      if (res.ok && res.token) setSessionToken(res.token);
      return res;
    }),
  getMe: () => request("/auth/me"),
  logout: () => setSessionToken(null),
  changePassword: ({ currentPassword, newPassword }) =>
    request("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),

  // Ayarlar > Kimlik Doğrulama (LDAP/RADIUS/TACACS+) — Master User yetkisi gerekir
  getAuthSettings: () => request("/settings/authsettings"),
  saveAuthSettings: (cfg) => request("/settings/authsettings", { method: "PUT", body: JSON.stringify(cfg) }),
  testLdapConnection: (cfg = {}) => request("/settings/authsettings/test-ldap", { method: "POST", body: JSON.stringify(cfg) }),
  testRadiusConnection: (cfg = {}) => request("/settings/authsettings/test-radius", { method: "POST", body: JSON.stringify(cfg) }),
  testTacacsConnection: (cfg = {}) => request("/settings/authsettings/test-tacacs", { method: "POST", body: JSON.stringify(cfg) }),

  getDataSourceConfig: () => request("/settings/datasource"),
  saveDataSourceConfig: (cfg) => request("/settings/datasource", { method: "PUT", body: JSON.stringify(cfg) }),
  testDataSourceConnection: (overrides = {}) => request("/settings/datasource/test", { method: "POST", body: JSON.stringify(overrides) }),

  getSmtpConfig: () => request("/settings/smtp"),
  saveSmtpConfig: (cfg) => request("/settings/smtp", { method: "PUT", body: JSON.stringify(cfg) }),
  testSmtpConnection: (overrides = {}) => request("/settings/smtp/test", { method: "POST", body: JSON.stringify(overrides) }),

  sendMail: ({ to, subject, text, html }) => request("/mail/send", { method: "POST", body: JSON.stringify({ to, subject, text, html }) }),

  // /settings/mailgroups (admin şifreli) sadece Ayarlar ekranındaki düzenleme formu için;
  // "/mailgroups" (session token'ıyla, admin şifresi istemez) her oturum açmış kullanıcının Mail
  // Gönder akışında lokasyon eşleşmelerini okuyabilmesi için — bkz. konuşma: "herkes gönderebilmeli".
  getMailGroups: () => request("/settings/mailgroups"),
  getMailGroupsForSending: () => request("/mailgroups"),
  saveMailGroups: (groups) => request("/settings/mailgroups", { method: "PUT", body: JSON.stringify(groups) }),

  // query: { dateFrom, dateTo, senderUsername, reportType, status, person, device } — gereksinim #11
  getMailHistory: (query = {}) => {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString();
    return request(`/mail/history${qs ? `?${qs}` : ""}`);
  },
  addMailHistory: (entry) => request("/mail/history", { method: "POST", body: JSON.stringify(entry) }),
  getMailHistoryDetails: (id) => request(`/mail/history/${id}/details`),

  getFileSourceConfig: () => request("/settings/filesource"),
  saveFileSourceConfig: (cfg) => request("/settings/filesource", { method: "PUT", body: JSON.stringify(cfg) }),
  testFileSourceConnection: (overrides = {}) => request("/settings/filesource/test", { method: "POST", body: JSON.stringify(overrides) }),

  // Genel uygulama ayarları — Kullanılmayan Cihazlar eşiği (staleDays) + LakeSide batarya kaynağı.
  // Okuma admin şifresi istemez (rapor ekranı kullanır); yazma Ayarlar (admin) üzerinden.
  getAppConfig: () => request("/appconfig"),
  saveAppConfig: (cfg) => request("/settings/appconfig", { method: "PUT", body: JSON.stringify(cfg) }),
  getAnomalySchedule: () => request("/settings/anomaly-schedule"),
  saveAnomalySchedule: (cfg) => request("/settings/anomaly-schedule", { method: "PUT", body: JSON.stringify(cfg) }),
  runAnomalyScanNow: () => request("/settings/anomaly-schedule/run-now", { method: "POST" }),
  // Ofis Bant Genişliği — tek seferlik yükleme, backend'de kalıcı saklanır (bkz. konuşma).
  getBantGenisligiReport: () => request("/reports/bant-genisligi"),
  uploadBantGenisligi: (fileName, contentBase64) =>
    request("/settings/bant-genisligi-upload", { method: "POST", body: JSON.stringify({ fileName, contentBase64 }) }),
  // LakeSide Battery Health — Ofis Bant Genişliği ile aynı desen: tek seferlik yükleme, backend'de
  // kalıcı saklanır (bkz. konuşma: "gömülü olsun her seferinde yüklemeyelim").
  getBatteryHealthReport: () => request("/reports/battery-health"),
  uploadBatteryHealth: (fileName, contentBase64) =>
    request("/settings/battery-health-upload", { method: "POST", body: JSON.stringify({ fileName, contentBase64 }) }),

  // Üst Yönetim İstisna Listesi — kim üst yönetim sayılır artık Excel'den değil, admin'in elle
  // yönettiği bu sabit e-posta listesinden belirleniyor (bkz. konuşma: "excelden o verileri
  // çekme hiç"). Okuma herkese açık (mail gönderim ekranları kullanır), yazma admin şifreli.
  getUstYonetimList: () => request("/ust-yonetim"),
  getUstYonetimListForSettings: () => request("/settings/ust-yonetim"),
  saveUstYonetimList: (emails) => request("/settings/ust-yonetim", { method: "PUT", body: JSON.stringify({ emails }) }),

  // Cihaz bazlı not/durum/ertele + aksiyon geçmişi (madde 5) — kalıcı; oturum token'ıyla.
  getDeviceMeta: () => request("/devices/meta"),
  saveDeviceMeta: (deviceKey, meta) => request(`/devices/meta/${encodeURIComponent(deviceKey)}`, { method: "PUT", body: JSON.stringify(meta) }),
  getDeviceActions: (deviceKey) => request(`/devices/actions/${encodeURIComponent(deviceKey)}`),
  addDeviceAction: (deviceKey, event) => request(`/devices/actions/${encodeURIComponent(deviceKey)}`, { method: "POST", body: JSON.stringify(event) }),

  // Dönemsel çözüm istatistikleri — snapshot geçmişi (madde 2, 13).
  getSnapshots: (reportId) => request(`/snapshots${reportId ? `?reportId=${encodeURIComponent(reportId)}` : ""}`),
  postSnapshot: (payload) => request("/snapshots", { method: "POST", body: JSON.stringify(payload) }),

  // Yeni Kurulum Kaydı — form → sistem → Excel → mail
  getNewInstalls: () => request("/newinstalls"),
  addNewInstall: (rec) => request("/newinstalls", { method: "POST", body: JSON.stringify(rec) }),
  updateNewInstall: (id, rec) => request(`/newinstalls/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(rec) }),
  deleteNewInstall: (id) => request(`/newinstalls/${encodeURIComponent(id)}`, { method: "DELETE" }),
  setNewInstallExcelPath: (excelPath) => request("/newinstalls/config/excel-path", { method: "PUT", body: JSON.stringify({ excelPath }) }),
  syncNewInstallExcel: (excelPath) => request("/newinstalls/sync-excel", { method: "POST", body: JSON.stringify({ excelPath }) }),
  markNewInstallsMailed: (ids) => request("/newinstalls/mark-mailed", { method: "POST", body: JSON.stringify({ ids }) }),
  markClosureReminderSent: (ids) => request("/newinstalls/mark-closure-reminder-sent", { method: "POST", body: JSON.stringify({ ids }) }),

  getInaktifCihazlarReport: () => request("/reports/inaktif-cihazlar"),
  getDiskAlaniReport: () => request("/reports/disk-alani"),
  getSccmReport: () => request("/reports/sccm"),
  getThReport: () => request("/reports/th-envanteri"),
  getLokasyonMailReport: () => request("/reports/lokasyon-mail"),
  getMonitorReport: () => request("/reports/monitor-raporu"),
  getBsodReport: () => request("/reports/bsod"),
};
