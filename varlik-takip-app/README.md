# Varlık Takip

Vite + React ile geliştirilmiş varlık/zimmet takip uygulaması. Veri katmanı şu an mock veri kullanıyor.

## Çalıştırma

```bash
npm install
npm run dev
```

Tarayıcıda `http://localhost:5173` açılır.

## Backend (SMTP + Veri Kaynağı ayarları)

Ayarlar ekranındaki "Mail (SMTP)" ve "Veri Kaynağı (API)" panelleri `../backend`'deki
servise bağlıdır: kimlik bilgilerini şifreleyip saklar, Windows/NTLM dahil bağlantı testi
yapar, gerçek mail gönderir.

- Backend ayrıca başlatılmalıdır: `cd ../backend && npm install && npm run dev`
  (detaylar `backend/README.md`'de). Backend çalışmıyorsa panellerde "Backend Çalışmıyor"
  rozeti görünür, uygulamanın geri kalanı (raporlar, dashboard, export) etkilenmez.

## Klasör yapısı

```
src/
  App.jsx              Ana UI — sidebar, rapor tabloları, dashboard, ayarlar, modallar
  data/
    constants.js        Departman/rapor türü/durum sabitleri
    mockZimmet.js        Zimmet + aktif kullanım mock verisi
    mockData.js           İnaktif Cihazlar / Disk Alanı mock verisi
  services/
    zimmetService.js      getZimmetSource(), computeDeptZimmetStats()
    reportService.js      getReportRows(), getDeptAssetCount()
  utils/
    decodeModel.js         ASCII kod dizisi → okunaklı model adı çözümleyici
  theme/
    palette.js              Açık/koyu tema renk paletleri
    buildStyles.js           Inline style objeleri
```

## Gerçek API'ye geçiş

Tüm veri erişimi `src/services/*.js` dosyalarından geçer. API entegrasyonunda sadece bu
iki dosyanın gövdesi değişir (mock import yerine fetch/API istemcisi); fonksiyon imzaları
ve dönüş şekilleri sabit kalırsa `App.jsx` ve UI katmanı değişmeden çalışmaya devam eder:

- `getZimmetSource(deptId)` → `{ assigned: [...], active: [...] }`
- `getReportRows(deptId, reportType)` → satır dizisi
- `getDeptAssetCount(deptId)` → sayı

## Güvenlik

- **`xlsx` bağımlılığı** — npm'deki `0.18.5` sürümünde düzeltilmemiş prototype
  pollution/ReDoS zafiyetleri vardı. `package.json`'da SheetJS'in kendi yamalı
  dağıtımına (`https://cdn.sheetjs.com/xlsx-0.20.3/...`) geçirildi;
  `npm audit` **0 zafiyet** raporluyor. Export sadece `XLSX.writeFile` ile yapılır,
  güvenilmeyen dosyalar `XLSX.read` ile ayrıştırılmaz.
- **CSP** (`index.html`) — `script-src 'self'`, harici script/iframe çalışamaz.
  `connect-src` açık bırakıldı çünkü Ayarlar > Veri Kaynağı ekranı kullanıcının
  girdiği herhangi bir kurumsal API'ye test bağlantısı kurabilmeli.
- **Demo API** (`demo-api/server.js`) — sadece `127.0.0.1`'e bağlanır (yerel ağa
  açık değil), CORS belirli origin'lerle sınırlıdır.
- Formlardaki şifre alanları `type="password"` ve `autoComplete="new-password"`
  ile işaretli; SMTP/API kimlik bilgileri yalnızca React state'inde (bellekte)
  tutulur, localStorage/ağ isteği/log gibi yerlere yazılmaz.

## Bilinen kısıtlar

- Mail gönderme, otomatik zamanlanmış tarama ve gerçek zamanlı bildirim şu an demo
  düzeyinde — buton tıklanınca sahte "Gönderim Geçmişi" kaydı oluşturur, gerçek mail
  gönderilmez.
