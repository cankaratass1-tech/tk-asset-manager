require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const datasourceRouter = require("./src/routes/datasource");
const smtpRouter = require("./src/routes/smtp");
const mailRouter = require("./src/routes/mail");
const mailGroupsRouter = require("./src/routes/mailgroups");
const mailHistoryRouter = require("./src/routes/mailhistory");
const fileSourceRouter = require("./src/routes/filesource");
const reportsRouter = require("./src/routes/reports");
const deviceActionsRouter = require("./src/routes/deviceactions");
const snapshotsRouter = require("./src/routes/snapshots");
const appConfigRouter = require("./src/routes/appconfig");
const newInstallsRouter = require("./src/routes/newinstalls");
const authRouter = require("./src/routes/auth");
const authSettingsRouter = require("./src/routes/authsettings");
const anomalyScheduleRouter = require("./src/routes/anomalyschedule");
const bantGenisligiUploadRouter = require("./src/routes/bantgenisligiupload");
const batteryHealthUploadRouter = require("./src/routes/batteryhealthupload");
const importFileRouter = require("./src/routes/importfile");
const ustYonetimRouter = require("./src/routes/ustyonetim");
const anomalyScheduler = require("./src/anomalyScheduler");
const { attemptAdminLogin, requireSettingsAuth } = require("./src/auth");
const { requireAuth, requireMasterAuth } = require("./src/authMiddleware");
const { blockedResponse } = require("./src/rateLimit");
const { announceSetupCode } = require("./src/setupCode");
const users = require("./src/users");
const { readSection } = require("./src/store");
const { errorCodeMiddleware } = require("./src/errorCodes");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  // Varsayılan 100kb — Ofis Bant Genişliği CSV'si base64 olarak gönderildiğinde bunu aşabiliyor
  // (bkz. konuşma: "bir kez yükleyeyim" — backend'e kalıcı kaydediliyor).
  app.use(express.json({ limit: "5mb" }));

  // CORS: Origin başlığı olmayan istekler kabul edilir. Geliştirme için :5173 portundaki herhangi bir
  // ana makineye izin verilir. Frontend ve backend tek servisten sunulduğunda tarayıcılar same-origin
  // POST/PUT/DELETE isteklerinde de Origin gönderdiği için, isteğin kendi ana makinesiyle aynı olan
  // origin her zaman kabul edilir.
  const ALLOWED_ORIGIN_PATTERN = /^https?:\/\/[^/]+:5173$/;
  app.use((req, res, next) => {
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGIN_PATTERN.test(origin)) return callback(null, true);
        try {
          if (new URL(origin).host === req.headers.host) return callback(null, true);
        } catch {
          // origin ayrıştırılamadıysa reddedilmeye devam eder
        }
        callback(new Error("CORS: izin verilmeyen origin"));
      },
    })(req, res, next);
  });

  app.use(errorCodeMiddleware);

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  // Ayarlar ekranının girişi — kullanıcı adı/şifre doğrularsa frontend bunları her Ayarlar
  // isteğinde header olarak gönderir (bkz. requireSettingsAuth)
  app.post("/api/settings/login", (req, res) => {
    const { username, password } = req.body || {};
    const result = attemptAdminLogin(req, username, password);
    if (result.status === "ok") return res.json({ ok: true });
    if (result.status === "blocked") return blockedResponse(res, result.retryAfterSec);
    res.status(401).json({ ok: false, message: "Kullanıcı adı veya şifre hatalı" });
  });

  // /api/auth: login/setup-master/domain public'tir (giriş akışının kendisi), /me requireAuth
  // ile kendi içinde korunur (bkz. routes/auth.js)
  app.use("/api/auth", authRouter);

  // Ayarlar altındaki uçlar (kimlik bilgisi/entegrasyon yönetimi) korumalı; datasource/smtp/
  // mailgroups/filesource mevcut paylaşımlı admin şifresi (requireSettingsAuth) ile korunmaya
  // devam eder — çalışan akış bozulmasın diye dokunulmadı. Kimlik doğrulama yapılandırması
  // (LDAP/RADIUS/TACACS+) ise yeni, gerçek Master User oturumu gerektirir (requireMasterAuth).
  app.use("/api/settings/datasource", requireSettingsAuth, datasourceRouter);
  app.use("/api/settings/smtp", requireSettingsAuth, smtpRouter);
  app.use("/api/settings/mailgroups", requireSettingsAuth, mailGroupsRouter);
  app.use("/api/settings/filesource", requireSettingsAuth, fileSourceRouter);
  app.use("/api/settings/authsettings", requireMasterAuth, authSettingsRouter);
  // Genel uygulama ayarları (Kullanılmayan Cihazlar eşiği, LakeSide batarya kaynağı) —
  // düzenleme admin şifresiyle korunur, okuma aşağıda requireAuth ile açıktır.
  app.use("/api/settings/appconfig", requireSettingsAuth, appConfigRouter);
  // Zamanlanmış Otomatik Tarama (bkz. konuşma: "yeni uyuşmazlıkları özetler" — artık gerçek
  // çalışıyor, Mükerrer Çift Zimmet + Lokasyon Hostname/IP Uyuşmazlığı için).
  app.use("/api/settings/anomaly-schedule", requireSettingsAuth, anomalyScheduleRouter);
  // Manuel dosya yükleme — kullanıcı isteği: "admin dışında kimse manuel dosya yüklemesi
  // yapamasın". Bu ikisi Ayarlar dışında (ilgili rapor sayfasının kendi üzerinde) da bir yükleme
  // butonu taşıdığı için requireSettingsAuth (paylaşılan Ayarlar şifresi) yerine requireMasterAuth
  // (oturum açan kullanıcının KENDİ rolü) kullanılıyor — frontend zaten her istekte Bearer token
  // gönderiyor, ek bir şey yapmaya gerek yok.
  app.use("/api/settings/bant-genisligi-upload", requireMasterAuth, bantGenisligiUploadRouter);
  app.use("/api/settings/battery-health-upload", requireMasterAuth, batteryHealthUploadRouter);
  // Elle seçilen rapor dosyalarının kalıcı saklanması (ham bayt gövde — JSON değil, bu yüzden express.raw)
  app.use("/api/settings/import-file", requireMasterAuth, express.raw({ type: "*/*", limit: "100mb" }), importFileRouter);
  app.use("/api/settings/ust-yonetim", requireSettingsAuth, ustYonetimRouter);

  // Lokasyon-mail eşleşmeleri (mailGroups) SADECE OKUMA için — Mail Gönder her oturum açmış
  // kullanıcı tarafından kullanılabilmeli, admin şifresi istemeden (bkz. konuşma: "başkası mail
  // atmak istediğinde admin girişi sormasın, herkes gönderebilmeli"). Düzenleme (PUT, yukarıdaki
  // /api/settings/mailgroups) hâlâ admin şifresiyle korunuyor — sadece kim/nereye gönderileceği
  // bilgisini okumak admin yetkisi gerektirmiyor, e-posta adresinden başka hassas bir şey içermiyor.
  app.get("/api/mailgroups", requireAuth, (req, res) => {
    res.json(readSection("mailGroups") || {});
  });

  // Üst Yönetim İstisna Listesi SADECE OKUMA için — mail gönderim ekranları (Kapatma Onayı vb.)
  // bu listeyi kontrol edip üst yönetime mail atmayı engellemeli; herkes okuyabilmeli, admin
  // şifresi istemeden (düzenleme yukarıdaki /api/settings/ust-yonetim ile hâlâ korumalı).
  app.get("/api/ust-yonetim", requireAuth, (req, res) => {
    res.json(ustYonetimRouter.loadWithSeed());
  });

  // Kullanılmayan Cihazlar raporu "son giriş çok eski" eşiğini (staleDays) okumak için —
  // rapor ekranı her oturum açmış kullanıcı için çalışır, admin şifresi gerektirmez.
  app.get("/api/appconfig", requireAuth, (req, res) => {
    const saved = readSection("appConfig") || {};
    res.json({
      unusedStaleDays: Number(saved.unusedStaleDays) > 0 ? Number(saved.unusedStaleDays) : 90,
      lakesideBatterySource: { folderPath: (saved.lakesideBatterySource && saved.lakesideBatterySource.folderPath) || "" },
    });
  });

  // Artık uygulama genelinde gerçek bir Login akışı olduğu için (bkz. konuşma — gereksinim #9,
  // "Session/token yönetimi güvenli şekilde gerçekleştirilmeli") mail gönderme/geçmişi ve rapor
  // uçları da requireAuth ile korunuyor — önceden tamamen açıktı.
  app.use("/api/mail/history", requireAuth, mailHistoryRouter);
  app.use("/api/mail", requireAuth, mailRouter);
  app.use("/api/reports", requireAuth, reportsRouter);
  // Cihaz bazlı not/durum/aksiyon geçmişi (madde 5) — oturum açmış her kullanıcı erişebilir.
  app.use("/api/devices", requireAuth, deviceActionsRouter);
  // Dönemsel çözüm istatistikleri için snapshot geçmişi (madde 2, 13).
  app.use("/api/snapshots", requireAuth, snapshotsRouter);
  // Yeni Kurulum Kaydı (form → sistem → Excel → mail)
  app.use("/api/newinstalls", requireAuth, newInstallsRouter);

  // Tek servis olarak deploy edilirken (ör. Render — bkz. konuşma: "arkadaşıma canlı gösterme")
  // frontend'in build çıktısı (varlik-takip-app/dist) aynı process'ten servis edilir; yerelde
  // ayrı bir Vite dev server (5173) kullanıldığından bu klasör yoksa hiçbir şey değişmez.
  const frontendDist = path.join(__dirname, "..", "varlik-takip-app", "dist");
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(frontendDist, "index.html")));
  }

  app.use((req, res) => res.status(404).json({ error: "Bulunamadı" }));

  // Stack trace veya dosya yolu istemciye sızdırılmaz
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.message?.startsWith("CORS") ? 403 : 500).json({ error: "İstek işlenemedi" });
  });

  return app;
}

function startServer({ port = process.env.PORT || 5000, host = process.env.HOST || "127.0.0.1" } = {}) {
  return new Promise((resolve, reject) => {
    const app = createApp();
    const server = app.listen(port, host, () => {
      console.log(`Varlık Takip backend http://${host}:${port} adresinde çalışıyor`);
      if (!users.hasMasterUser()) announceSetupCode();
      anomalyScheduler.start();
      resolve(server);
    });
    server.on("error", reject);
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error("Backend başlatılamadı:", err.message);
    process.exit(1);
  });
}

module.exports = { createApp, startServer };
