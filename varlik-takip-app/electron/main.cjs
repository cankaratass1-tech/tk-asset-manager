const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("path");

// Paketlenmiş exe'de resources/backend altına kopyalanır (bkz. package.json > build.extraResources)
function resolveBackendDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, "backend");
  return path.join(__dirname, "..", "..", "backend");
}

let backendServer = null;

// Backend ayrı bir süreç başlatılmadan, Electron'un Node çalışma zamanı içinde require edilir.
// Sır şifreleme anahtarı/verisi %APPDATA%\varlik-takip-app\backend-data altına yazılır.
async function startBackend() {
  process.env.DATA_DIR = path.join(app.getPath("userData"), "backend-data");
  const backendDir = resolveBackendDir();
  const { startServer } = require(path.join(backendDir, "server.js"));
  backendServer = await startServer({ port: 5000 });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: "Varlık Takip",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

// Dosya Kaynağı ayarındaki "Gözat" butonu — tarayıcı sandbox'ı gerçek OS klasör yolunu
// vermediği için (File System Access API sadece handle döner), native dialog gerekiyor.
ipcMain.handle("pick-folder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Pencere içeriği dist/index.html dışına gezinemez; yeni pencere/sekme açma denemeleri sistem tarayıcısına yönlendirilir
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (navEvent, url) => {
    if (!url.startsWith("file://")) navEvent.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
});

app.whenReady().then(async () => {
  try {
    await startBackend();
  } catch (err) {
    dialog.showErrorBox(
      "Arka plan servisi başlatılamadı",
      `Mail/API ayarları servisi başlatılamadı: ${err.message}\n\nUygulamanın geri kalanı (raporlar, panolar, dışa aktarma) normal çalışmaya devam edecek.`
    );
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
