# Varlık Takip Uygulaması — Siber Güvenlik Bilgilendirme Notu

Bu doküman, Siber Güvenlik ekibinin test/inceleme sürecinde soracağı olası sorulara
cevap verebilmek için hazırlanmıştır. Uygulamanın mimarisini, veri akışını,
kimlik bilgisi/şifreleme yaklaşımını ve bilinen kısıtları özetler.

## 1. Uygulama nedir, ne amaçla yazıldı

Şirket içinde daha önce Excel eki + Power Automate mail tetikleyicisiyle yürütülen
iki raporlama süreci (inaktif cihaz bildirimi, disk alanı uyarısı) ile yeni eklenen
bir "zimmet uyuşmazlığı" karşılaştırma özelliğini tek bir masaüstü uygulamasında
toplayan, şirketin iç envanter/varlık API'sine bağlanan bir raporlama aracıdır.
Excel dosyası taşıma/mail eki mantığı tamamen kaldırılmıştır; veri doğrudan API'den
okunur.

Tek kullanıcılı, yerel (masaüstünde çalışan) bir araç olarak tasarlanmıştır — çok
kullanıcılı, sunucuda barındırılan bir web servisi değildir.

## 2. Genel mimari

Uygulama üç ayrı bileşenden oluşur:

- **Frontend**: React 19 + Vite ile yazılmış tek sayfa uygulama (SPA). Arayüz,
  raporları görüntüleme, filtreleme, Excel/PDF'e aktarma gibi işleri yapar.
- **Backend**: Node.js + Express ile yazılmış küçük bir yerel servis. Sadece
  `127.0.0.1` (localhost) üzerinden dinler, dışarıdan erişilemez. Görevi:
  - Kimlik bilgilerini (SMTP şifresi, API anahtarı, veri kaynağı şifresi) diske
    şifreli yazmak,
  - Kurumsal API'ye bağlanırken NTLM/Basic/API Key gibi kimlik doğrulama
    yöntemlerini yürütmek (tarayıcıdan CORS/güvenlik kısıtlamaları nedeniyle
    NTLM yapılamıyor, bu yüzden ayrı bir yerel servis gerekiyor),
  - Mail göndermek (nodemailer üzerinden SMTP).
- **Electron kabuğu**: Dağıtılan `.exe` içinde frontend ve backend, Electron ile
  tek bir masaüstü uygulaması olarak paketlenir. Backend, Electron'un kendi Node.js
  çalışma zamanı içinde `require()` ile başlatılır — ayrı bir process/servis kurulumu
  gerekmez, kullanıcı sadece `.exe`'yi çalıştırır.

Backend'e sadece frontend erişir; frontend dışarıya (internete) doğrudan sır/kimlik
bilgisi göndermez, her şey backend üzerinden yürür.

## 3. Kullanılan teknolojiler

| Katman | Teknoloji |
|---|---|
| Frontend | React 19, Vite 8 |
| Masaüstü paketleme | Electron 43 (electron-builder ile NSIS/portable .exe) |
| Backend | Node.js, Express 4 |
| Mail | Nodemailer (SMTP) |
| Windows kimlik doğrulama | `httpntlm` (NTLM type1/2/3 el sıkışması) |
| Excel export | SheetJS (`xlsx`) |
| Şifreleme | Node.js yerleşik `crypto` modülü (AES-256-GCM) |

Harici bir veritabanı yoktur. Kalıcı veri, düz JSON dosyaları halinde yerel diskte
tutulur (bkz. madde 4).

## 4. Veri nerede saklanıyor

- **Paketlenmiş `.exe` çalışırken**: `%APPDATA%\varlik-takip-app\backend-data\`
  klasörü altında.
- **Geliştirme modunda** (backend ayrı çalıştırıldığında): `backend/data/` klasörü
  altında.

Bu klasörde iki tür dosya olur:

1. `secret.key` — şifreleme anahtarı (aşağıda madde 5).
2. `settings.enc.json` — SMTP ayarları, veri kaynağı (API) bağlantı ayarları ve
   mail gönderim geçmişi. Bu dosyanın içindeki **şifre/API anahtarı alanları
   AES-256-GCM ile şifreli** tutulur (madde 5); host/URL/kullanıcı adı gibi
   hassas olmayan alanlar şifresiz durur.

Uygulama, işlediği envanter/zimmet verisini (cihaz, kişi, seri no vb.) diske
kalıcı yazmaz — bu veri API'den her seferinde canlı çekilir, sadece tarayıcı
belleğinde/oturumda tutulur.

## 5. Kimlik bilgileri ve şifreleme

- SMTP şifresi, veri kaynağı API şifresi/API anahtarı, backend tarafında
  **AES-256-GCM** ile şifrelenip diske öyle yazılır. Tarayıcıya (frontend'e) bu
  sırlar hiçbir zaman ham olarak geri gönderilmez — API sadece "kayıtlı mı"
  (`hasPassword`, `hasApiKey`) bilgisini döner, arayüzde alanlar maskeli görünür.
- Şifreleme anahtarı kaynağı:
  - `BACKEND_SECRET_KEY` ortam değişkeni tanımlıysa o kullanılır,
  - tanımlı değilse ilk çalıştırmada 32 byte rastgele anahtar üretilip
    `secret.key` dosyasına yazılır ve sonraki çalıştırmalarda oradan okunur.
- **Bilinen zayıflık**: `secret.key` dosyası işletim sistemi düzeyinde sadece o
  Windows kullanıcı hesabının erişebildiği bir klasörde durur; Windows Credential
  Manager/DPAPI gibi bir OS anahtar zincirine entegre değildir. Tek kullanıcılı
  masaüstü senaryosu için kabul edilebilir görülmüştür, ama kurumsal/çok kullanıcılı
  bir dağıtımda bir secret manager'a taşınması önerilir — bu, ekibe iletilecek en
  net iyileştirme maddesidir.

## 6. Ağ maruziyeti / dinlenen portlar

- Backend yalnızca **`127.0.0.1:5000`** üzerinde dinler; `0.0.0.0` değil — yani
  ağdaki başka bir makineden bu porta erişilemez, sadece aynı bilgisayardaki
  frontend erişebilir.
- Backend'in CORS ayarı, sadece `http://localhost:5173` ve
  `http://127.0.0.1:5173` origin'lerine (geliştirme modu) ve Electron'un
  `file://` kaynaklı isteklerine (origin header'ı olmayan istekler) izin verir.
- Dışarıya giden bağlantılar: (a) kurumsal envanter API'sine (kullanıcının
  Ayarlar'da girdiği URL), (b) SMTP sunucusuna (yine kullanıcının girdiği host).
  Uygulama başka hiçbir üçüncü parti sunucuya veri göndermez, telemetri/analitik
  yoktur.

## 7. Kimlik doğrulama / yetkilendirme (uygulama içi)

Uygulamanın kendi içinde bir kullanıcı girişi / rol sistemi **yoktur**. Bu bilinçli
bir tasarım kararıdır: uygulama tek kullanıcılı, yerel bir masaüstü aracı olarak
düşünülmüştür — çalıştığı Windows hesabına giren kişi uygulamayı kullanabilir.
Çok kullanıcılı / merkezi sunucuda barındırma senaryosuna geçilirse (şu an
planlanmıyor), bir oturum/yetkilendirme katmanının eklenmesi gerekir.

## 8. Kurumsal API'ye bağlanma yöntemleri

Ayarlar ekranından dört yöntem seçilebilir:
- **Windows/NTLM** — `httpntlm` ile NTLM type1/2/3 el sıkışması (tarayıcı değil,
  backend yürütür).
- **Temel Kimlik Doğrulama (Basic)** — `Authorization: Basic ...` header.
- **API Key** — `x-api-key` header.
- **Yok** — kimlik doğrulama olmadan.

NTLM implementasyonu henüz gerçek bir kurumsal Active Directory sunucusuna karşı
uçtan uca doğrulanmadı; standart el sıkışmayı yürütür ve desteklenmeyen bir
sunucuya karşı anlaşılır hata döner, ama IT ile birlikte gerçek ortamda test
edilmesi gerekiyor.

## 9. Loglama

Backend, hataları sunucu konsoluna (`console.error`) yazar; istemciye stack
trace veya dosya yolu sızdırılmaz (genel hata middleware'i sadece "İstek
işlenemedi" gibi genel bir mesaj döner). Ayrı bir log dosyası/merkezi log
toplama yoktur.

## 10. Bilinen kısıtlar / ekip ile paylaşılabilecek riskler

- Tek kullanıcılı senaryo için tasarlandı; kimlik doğrulama/yetkilendirme katmanı
  yok (madde 7).
- Şifreleme anahtarı OS anahtar zincirine değil, dosya sistemine yazılıyor
  (madde 5).
- NTLM entegrasyonu gerçek AD ortamında henüz doğrulanmadı.
- Uygulama kod imzasız (code signing sertifikası yok) — Windows SmartScreen
  "tanınmayan yayıncı" uyarısı verebilir; bu bir güvenlik açığı değil, imzasız
  dağıtımın beklenen bir sonucu.
- `xlsx` (SheetJS) paketi npm registry yerine doğrudan SheetJS'in kendi CDN'inden
  (`cdn.sheetjs.com`) sürüm kilitli olarak çekiliyor — npm'deki eski/ücretsiz
  olmayan sürüm yerine yayıncının resmi dağıtım kanalı tercih edilmiş; bağımlılık
  taramasında bu URL'nin neden npm registry dışı olduğu sorulabilir.

## 11. Özet — sık sorulabilecek sorulara hızlı cevaplar

- **"Şifreler nasıl saklanıyor?"** → AES-256-GCM ile şifreli, diskte; tarayıcıya
  hiç ham gönderilmiyor.
- **"Uygulama internete açık mı?"** → Hayır, backend sadece localhost'ta dinliyor.
- **"Hangi dışarıya bağlantılar var?"** → Sadece kullanıcının Ayarlar'da girdiği
  kurumsal API ve SMTP sunucusu; başka hiçbir üçüncü parti servis yok.
- **"Çoklu kullanıcı / yetkilendirme var mı?"** → Yok, tek kullanıcılı masaüstü
  aracı olarak tasarlandı.
- **"Veritabanı var mı?"** → Yok, sadece küçük şifreli bir ayar dosyası (JSON);
  envanter verisi diske yazılmıyor, her seferinde API'den canlı çekiliyor.
- **"Kaynak kodu incelenebilir mi?"** → Evet, kapalı kaynak/obfuscate edilmiş bir
  dağıtım değil, tüm kod (frontend + backend) proje deposunda düz JavaScript/JSX
  olarak duruyor.
