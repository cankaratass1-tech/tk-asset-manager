const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Tek kopya: ikinci kez açılırsa yeni süreç başlatmak yerine mevcut pencere öne gelir
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// Paketlenmiş exe'de resources/backend altına kopyalanır (bkz. package.json > build.extraResources)
function resolveBackendDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, "backend");
  return path.join(__dirname, "..", "..", "backend");
}

let backendServer = null;
let backendPort = null;
let mainWindow = null;

// Arayüz (varlik-takip-app/dist) ve API aynı backend sürecinden, aynı origin'den (http://127.0.0.1:PORT)
// sunulur: CORS/file:// sorunu olmaz, oturum bilgisi (localStorage) her açılışta aynı origin'de kalır.
// Veri (şifreli ayarlar, anahtarlar, yüklenen dosyalar) %APPDATA%\varlik-takip-app\backend-data altında tutulur;
// başka bir bilgisayarda ilk açılışta boş başlar.
async function startBackend() {
  const dataDir = path.join(app.getPath("userData"), "backend-data");
  process.env.DATA_DIR = dataDir;
  process.env.HOST = "127.0.0.1";
  // İlk kurulum (Master User) kodu: her açılışta rastgele üretilir, yalnızca bu uygulamanın penceresine iletilir
  if (!process.env.SETUP_CODE || process.env.SETUP_CODE.length < 16) {
    process.env.SETUP_CODE = crypto.randomBytes(16).toString("hex");
  }

  // Ayarlar ekranı girişi: konsol olmayan exe'de rastgele üretilen şifre görülemeyeceği için, daha önce
  // bir giriş dosyası oluşturulmadıysa bilinen demo girişi kullanılır (admin / can). Ortam değişkeni
  // (ADMIN_USERNAME/ADMIN_PASSWORD) ya da dataDir altındaki admin-credentials.json bunun önüne geçer.
  const credsFile = path.join(dataDir, "admin-credentials.json");
  if (!fs.existsSync(credsFile)) {
    process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
    process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "can";
  }

  const distIndex = path.join(resolveBackendDir(), "..", "varlik-takip-app", "dist", "index.html");
  if (!fs.existsSync(distIndex)) throw new Error(`Arayüz dosyaları bulunamadı: ${distIndex}`);

  const { startServer } = require(path.join(resolveBackendDir(), "server.js"));

  // Port seçimi: tarayıcı deposu (oturum bilgisi dahil) origin'e, yani port'a bağlı olduğu için her açılışta
  // AYNI portun kullanılması gerekir. Sırayla: en son kullanılan port, 5000, 5001-5020; hiçbiri boş değilse rastgele.
  const portFile = path.join(app.getPath("userData"), "backend-port.txt");
  let lastPort = null;
  try {
    lastPort = Number(fs.readFileSync(portFile, "utf8").trim());
  } catch {
    // ilk açılış
  }
  const candidates = [lastPort, 5000, ...Array.from({ length: 20 }, (_, i) => 5001 + i)].filter((p, i, a) => Number.isInteger(p) && p > 0 && a.indexOf(p) === i);
  for (const port of candidates) {
    try {
      backendServer = await startServer({ port, host: "127.0.0.1" });
      break;
    } catch (err) {
      if (!err || err.code !== "EADDRINUSE") throw err;
    }
  }
  if (!backendServer) backendServer = await startServer({ port: 0, host: "127.0.0.1" });
  backendPort = backendServer.address().port;
  try {
    fs.writeFileSync(portFile, String(backendPort));
  } catch {
    // yazılamazsa bir sonraki açılışta yine aday listesi denenir
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    title: "TK Asset Manager",
    autoHideMenuBar: true,
    icon: fs.existsSync(path.join(__dirname, "..", "build", "icon.png")) ? path.join(__dirname, "..", "build", "icon.png") : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${backendPort}/`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Dosya Kaynağı ayarındaki "Gözat" butonu — tarayıcı sandbox'ı gerçek OS klasör yolunu
// vermediği için (File System Access API sadece handle döner), native dialog gerekiyor.
ipcMain.handle("pick-folder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// İlk kurulum ekranı kurulum kodunu buradan alır; yalnızca uygulamanın kendi backend origin'indeki sayfaya yanıt verilir
ipcMain.handle("get-setup-code", (event) => {
  const url = (event.senderFrame && event.senderFrame.url) || "";
  if (!backendPort || !url.startsWith(`http://127.0.0.1:${backendPort}/`)) return null;
  return process.env.SETUP_CODE || null;
});

// Pencere içeriği kendi backend origin'i dışına gezinemez; yeni pencere/sekme açma denemeleri sistem tarayıcısına yönlendirilir
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (navEvent, url) => {
    if (!backendPort || !url.startsWith(`http://127.0.0.1:${backendPort}`)) navEvent.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
});

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    await startBackend();
  } catch (err) {
    dialog.showErrorBox(
      "Uygulama başlatılamadı",
      `Arka plan servisi başlatılamadı: ${err.message}\n\nUygulama kapatılacak. Sorun sürerse %APPDATA%\\varlik-takip-app klasörünü silip yeniden deneyin.`
    );
    app.quit();
    return;
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (backendServer) backendServer.close();
  if (process.platform !== "darwin") app.quit();
});
