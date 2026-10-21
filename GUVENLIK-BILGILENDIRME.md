# TK Asset Manager (Varlık Takip) — Bilgi Güvenliği Bilgilendirme Notu

Sürüm: 2.1 — 21.10.2026 (BUL-01, BUL-02 ve BUL-03 giderildi, Bölüm 15)
Önceki sürüm: 1 (yalnızca tek kullanıcılı yerel masaüstü senaryosunu anlatıyordu)

Bu doküman, Bilgi Güvenliği ekibinin inceleme sürecinde soracağı soruları yanıtlamak için hazırlanmıştır.
Uygulamanın mimarisini, kimlik doğrulama ve yetkilendirme yapısını, veri saklamasını, dış bağlantılarını,
bağımlılık durumunu ve **tespit edilen açıkları** içerir.

> **Kapsam ve sınırlar:** Bu doküman kaynak kod incelemesine (backend, istemci, CI tanımı) ve
> `npm audit` çıktısına dayanır. Sızma testi, dinamik güvenlik taraması veya gerçek AD/RADIUS/TACACS+ ortamında
> doğrulama yapılmamıştır. Bulgular kodda görülen davranışı yansıtır; sömürülebilirlik, dağıtım biçimine göre
> değişir (Bölüm 3).

## 1. Önceki sürümden farklar

Sürüm 1'deki şu ifadeler **artık geçerli değildir**:

| Sürüm 1'deki ifade | Güncel durum |
|---|---|
| Uygulama içinde kullanıcı girişi/rol sistemi yoktur | Vardır: giriş ekranı, Master/User rolleri, oturum token'ı (Bölüm 5) |
| Tek kullanıcılı yerel araçtır | Çok kullanıcılı, sunucu modunda da çalışabilir (Bölüm 3) |
| Yalnızca `settings.enc.json` ve `secret.key` tutulur | Ek olarak oturum anahtarı, yönetici hesabı, yüklenen rapor dosyaları vardır (Bölüm 6) |
| Envanter verisi diske yazılmaz | Yüklenen Excel/CSV raporları ve anlık görüntüler (snapshot) diske yazılır (Bölüm 6) |
| Veri doğrudan API'den canlı çekilir | Raporlar ağırlıklı olarak yüklenen/senkronize edilen Excel dosyalarından okunur (Bölüm 4) |

## 2. Uygulama nedir

Şirket içinde Excel eki ve Power Automate ile yürütülen envanter/varlık raporlama süreçlerini tek bir uygulamada
toplar: inaktif ve kullanılmayan cihazlar, disk alanı, zimmet uyuşmazlığı, BSOD, batarya sağlığı, ofis bant
genişliği, yeni kurulum kaydı ve kapatma onayı. Raporlardan e-posta gönderebilir, değişiklikleri izler, belirlenen
sıklıkla otomatik tarama yapıp yeni uyuşmazlıkları e-postayla bildirir. Şirket seçimi (AJET / TKAO) ve Türkçe arayüz
vardır.

## 3. Mimari ve dağıtım modelleri

**Bileşenler**
- **İstemci:** React 19 + Vite tek sayfa uygulaması.
- **Backend:** Node.js + Express 4. Ayarları, kullanıcıları ve işlenen veriyi saklar, kimlik doğrulamayı yürütür,
  e-posta gönderir, dosya okur/yazar.
Masaüstü (exe) paketi kapsam dışıdır, geçici bir denemeydi ve koddan kaldırılmıştır.

**Dağıtım modelleri** (backend'in dinlediği adres `HOST` ortam değişkeniyle belirlenir, varsayılan `127.0.0.1`):

| Model | Dinleme | Kimler erişir | Not |
|---|---|---|---|
| Geliştirme (yerel) | `127.0.0.1` | Yalnızca aynı bilgisayar | Ağdan erişilemez |
| Şirket içi sunucu | `HOST=0.0.0.0` ile ağa açılır | Ağdaki kullanıcılar | Hedef model. Uygulama kendisi TLS sunmaz, HTTP üzerinden çalışır (BUL-09) |
| Bulut demo (`render.yaml`) | `HOST=0.0.0.0` | İnternet | Depoda tanımlıdır. **Fiilen yayında olup olmadığı Bölüm 16'da teyit edilecek.** |

Bulguların önemi dağıtım modeline bağlıdır: Yerel çalıştırmada birçok bulgu yalnızca aynı bilgisayardaki kullanıcıyı
ilgilendirir, ağa açık modda ise ağdaki her kullanıcıyı.

## 4. Veri kaynakları ve işlenen veri

- **Excel/CSV dosyaları:** Ayarlar'da tanımlı bir klasörden (ör. OneDrive/SharePoint senkron klasörü) ya da
  Master kullanıcının arayüzden yüklediği dosyalardan okunur. Türler: İnaktif Cihazlar, Disk Alanı, SCCM
  envanteri, TuruncuHat (TH) envanteri, Attached Monitors, Lokasyon Mail Listesi, Weekly BSOD, Battery Health,
  Ofis Bant Genişliği.
- **Kurumsal API:** Ayarlar'dan tanımlanabilir (NTLM, Basic, API Key veya kimlik doğrulamasız). Test ve bağlantı
  backend'den yapılır.
- **Yeni kurulum kayıtları:** Form üzerinden girilir, istenirse yapılandırılan yola Excel olarak yazılır.

**Kişisel veri:** Raporlar ad-soyad, sicil, kullanıcı adı, e-posta, hostname, IP ve seri numarası içerir. Bu veri
KVKK kapsamında kişisel veri sayılabilir. Uygulama **hiçbir veriyi üçüncü taraf servise göndermez**, telemetri
yoktur (Bölüm 8).

## 5. Kimlik doğrulama ve yetkilendirme

Uygulamada **iki ayrı yetki mekanizması** bir arada çalışır:

**A) Kullanıcı oturumu (genel giriş)**
- Giriş: etki alanı + kullanıcı adı + şifre. Kimlik doğrulama sırası: önce yerel kullanıcı deposuna, eşleşme yoksa
  Ayarlar'da seçili dış sağlayıcıya (LDAP/AD, RADIUS veya TACACS+) bakılır.
- Yerel hesaplar (Master dahil): şifre **bcrypt** (maliyet 12) ile özetlenir, en az 8 karakter. Şifre özeti
  arayüze döndürülmez.
- Dış sağlayıcı kullanıcıları ilk girişte `user` rolüyle yerel kayıt olarak oluşturulur, şifre saklanmaz.
- Oturum token'ı: HMAC-SHA256 ile imzalı opak token, **12 saat** geçerlidir. İmza anahtarı `session.key` ayrı
  dosyadır. Doğrulamada sabit zamanlı karşılaştırma kullanılır, rol her istekte kullanıcı deposundan okunur
  (token'daki rol esas alınmaz).
- Roller: `master` ve `user`.

**B) Paylaşımlı yönetici şifresi (Ayarlar)**
- Ayarlar uçları (veri kaynağı, SMTP, mail grupları, dosya kaynağı, uygulama ayarları, otomatik tarama, üst yönetim
  listesi) tek bir paylaşımlı kullanıcı adı/şifre ile korunur. Bilgiler her istekte `x-admin-username` ve
  `x-admin-password` başlıklarıyla gönderilir.
- Bilgiler ilk çalıştırmada üretilir (kullanıcı `admin`, 12 karakterlik rastgele şifre, konsola yazılır) ya da
  `ADMIN_USERNAME` / `ADMIN_PASSWORD` ortam değişkenlerinden alınır. Sabit varsayılan şifre yoktur.

**Deneme sınırı (BUL-03 düzeltmesi):** Giriş, yönetici girişi (ayarlar uçları dahil), ilk kurulum ve şifre değiştirme
uçlarında bellek içi sınırlayıcı çalışır. Aynı kullanıcı + IP için 5 ardışık hatadan sonra 30 saniye bekleme
uygulanır, her yeni hatada bekleme ikiye katlanır (en çok 15 dakika). Aynı kullanıcı adına tüm IP'lerden 20 ardışık
hata (dağıtık deneme) ve aynı IP'den 10 dakikada 40 hata da engellenir. Sınır aşılınca HTTP 429 ve `Retry-After`
başlığı döner. Bekleme süresince doğru şifre de reddedilir. Başarılı giriş ilgili sayacı sıfırlar. İstemci IP'si
soket adresinden alınır (proxy başlıklarına güvenilmez); bir ters vekil arkasında tüm istekler aynı IP görünür,
bu durumda kullanıcı bazlı katmanlar esas korumayı sağlar.

**İlk kurulum kodu (BUL-02 düzeltmesi):** Master User oluşturmak için kurulum kodu gerekir. Kod, Master yokken sunucu
açılışında konsola yazılır (ya da `SETUP_CODE` ortam değişkeninden, en az 16 karakter, alınır), diske kaydedilmez. Kod
sabit zamanlı karşılaştırılır, hatalı denemeler sınırlanır, Master oluştuktan sonra uç 409 döner.

**Uç koruma özeti**

| Uç grubu | Koruma |
|---|---|
| `/api/health`, `/api/auth/setup-status`, `/api/auth/domain` | Kimliksiz |
| `/api/auth/login`, `/api/settings/login` | Kimliksiz, deneme sınırlı |
| `/api/auth/setup-master` | Kurulum kodu gerekir, deneme sınırlı |
| `/api/mail`, `/api/mail/history`, `/api/reports`, `/api/devices`, `/api/snapshots`, `/api/newinstalls`, `GET /api/mailgroups`, `GET /api/ust-yonetim`, `GET /api/appconfig` | Oturum açmış herhangi bir kullanıcı |
| Kimlik doğrulama yapılandırması, bant genişliği/batarya/rapor dosyası yükleme | Yalnızca `master` rolü |
| Diğer `/api/settings/*` (veri kaynağı, SMTP, mail grupları, dosya kaynağı, uygulama ayarları, otomatik tarama, üst yönetim listesi) | Paylaşımlı yönetici şifresi |

**Grup/yetki ayrımı yoktur.** Oturum açmış her kullanıcı tüm raporlardaki tüm kayıtları görebilir. Sol menüdeki
şirket seçimi (AJET/TKAO) yalnızca arayüzde bir filtredir, backend tüm satırları döner; yetki sınırı değildir
(BUL-05). Grup/yetki sistemi planlanmaktadır.

## 6. Veri nerede saklanıyor

Veri klasörü: `backend/data/` (`DATA_DIR` ortam değişkeniyle değiştirilebilir).

| Dosya | Biçim | Koruma |
|---|---|---|
| `settings.enc.json` | Kullanıcılar (bcrypt özetleriyle), SMTP, kimlik doğrulama yapılandırması, kurumsal API ayarı, mail grupları, gönderim geçmişi ve detayları, anlık görüntüler, cihaz notları/aksiyonları, yeni kurulum kayıtları, üst yönetim listesi | **Bölüm bazında AES-256-GCM şifreli** (hepsi, yalnızca sırlar değil) |
| `secret.key` | Şifreleme anahtarı (hex) | Düz dosya, dosya izni `0600` (Windows'ta etkisi sınırlı) |
| `session.key` | Oturum imza anahtarı (hex) | Düz dosya |
| `admin-credentials.json` | Paylaşımlı yönetici şifresi | **Düz metin** (`ADMIN_PASSWORD` verilmezse) |
| `imports/*.xlsx`, `uploads/*` | Yüklenen rapor dosyaları (kişisel veri içerir) | **Şifresiz** düz dosya |
| Yeni kurulum Excel çıktısı | Yapılandırılan yola yazılır | Şifresiz |

Tüm bölümler tek bir anahtarla (`secret.key` ya da `BACKEND_SECRET_KEY`) şifrelenir. Anahtar şifreli verinin
yanındaki klasörde durur; bu nedenle klasöre erişen biri hem veriyi hem anahtarı alabilir.

## 7. Şifreleme ve sır yönetimi

- Algoritma: AES-256-GCM, her yazımda rastgele 12 baytlık IV, kimlik doğrulama etiketi saklanır.
- `BACKEND_SECRET_KEY` (64 hex karakter) verilirse o kullanılır, yoksa ilk çalıştırmada `secret.key` üretilir.
- Dış sağlayıcı gizleri (LDAP bind şifresi, RADIUS/TACACS+ paylaşımlı anahtarı), SMTP şifresi ve API anahtarı
  arayüze **hiç geri döndürülmez**, yalnızca "tanımlı mı" bilgisi döner.
- Şifreler ve gizler loglanmaz (başarısız girişte yalnızca kullanıcı adı ve zaman yazılır).
- Anahtar OS anahtar zincirine (DPAPI/Credential Manager) veya bir secret manager'a bağlı değildir.

## 8. Ağ maruziyeti ve dış bağlantılar

**Dinleme:** Varsayılan `127.0.0.1:5000`. `HOST=0.0.0.0` verilirse tüm arayüzlerde dinler.

**CORS:** Herhangi bir ana makinede `:5173` portundan gelen origin'e ve isteğin kendi ana makinesiyle aynı olan
origin'e izin verilir; origin başlığı olmayan istekler kabul edilir. Cookie kullanılmadığı için (kimlik `Authorization`
başlığıyla taşınır) CORS tek başına kimlik hırsızlığı aracı sayılmaz.

**İçerik Güvenlik Politikası (CSP):** `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`. `connect-src`
`http:`/`https:` içerir (kullanıcının girdiği API adresine bağlanabilmek için).

**Dışa giden bağlantılar** (hepsi yöneticinin yapılandırdığı hedefler, başka üçüncü taraf yok):
- Kurumsal veri kaynağı API'si (NTLM/Basic/API Key).
- SMTP sunucusu.
- LDAP/AD, RADIUS (UDP 1812), TACACS+ sunucuları (Kimlik Doğrulama ayarındaki adresler).

**TLS:** Uygulama kendisi TLS sunmaz. Sunucu modunda kullanıcı adı/şifre, oturum token'ı ve yönetici şifresi, TLS
sonlandıran bir ters vekil (reverse proxy) olmadan **HTTP üzerinden düz metin** gider (BUL-09).

## 9. E-posta gönderimi

- Nodemailer ile yapılandırılan SMTP sunucusu üzerinden gönderilir. Gövde HTML'dir, kullanıcıya gösterilen veriler
  ortak yardımcı (`esc`) ile HTML'e kaçırılarak yerleştirilir.
- Otomatik tarama (5 dakikada bir kontrol) yeni uyuşmazlık bulunca yapılandırılan alıcılara kendiliğinden e-posta
  atar.
- Gönderim geçmişi kaydedilir (şifreli bölüm).
- SMTP TLS: STARTTLS/TLS kullanılır, ancak **sertifika zinciri doğrulanmaz** (`rejectUnauthorized: false`),
  kurumsal/self-signed CA'lar nedeniyle bilinçli bir tercih olarak (BUL-06).

## 10. Dosya işleme

- Yüklenen dosyanın sunucudaki adı **sunucu tarafından üretilir** (`<önek>_<tarih>.xlsx`), kullanıcı girdisinden
  oluşmaz; dosya türü sabit bir listeden seçilir. Bu yolla yol manipülasyonu görülmedi.
- Yüklenen `.xlsx` dosyası "PK" imzası ve SheetJS ile okunabilirlik açısından kontrol edilir. Boyut sınırı: ham
  yükleme 100 MB, JSON gövde 5 MB.
- Excel işleme kütüphanesi SheetJS **0.20.3** olup yayıncının kendi dağıtım adresinden (`cdn.sheetjs.com`) sürüm
  kilitli çekilir (npm'deki eski sürümlerde bilinen açıklar vardır).
- **Yeni Kurulum Excel çıktısı (BUL-01 düzeltmesi):** Hedef yol yalnızca Master User tarafından kaydedilir, istekle
  gelen yol kullanılmaz. Yol mutlak olmalı, uzantısı `.xlsx` olmalı, uygulama kodu/veri/yüklenen rapor klasörlerinde
  olamaz, ayrılmış aygıt adı ve kontrol karakteri içeremez. Veri klasörü dışındaki yollarda klasör önceden var olmalıdır
  (keyfi klasör oluşturulmaz). Hedefte dosya varsa geçerli bir `.xlsx` (ZIP imzası) olmalıdır, aksi halde okunmaz ve
  üzerine yazılmaz.

## 11. İstemci güvenliği

- **Oturum token'ı `localStorage`'da** tutulur (BUL-07).
- **HTML önizleme:** Mail önizlemesi `dangerouslySetInnerHTML` kullanır. İçerik uygulamanın kendi şablonundan
  gelir ve veriler kaçırılarak yerleştirilir. Kaçırma, çağıran kodun sorumluluğundadır (şablon yardımcısı bunu
  belirtir), kaçırılmamış yeni bir alan eklenirse XSS oluşur.
- Uygulama yalnızca tarayıcıdan kullanılır, yürütülebilir dosya (exe) dağıtımı yoktur.

## 12. Loglama ve izlenebilirlik

- Backend konsola yazar, merkezi log toplama yoktur.
- Başarısız girişler (kullanıcı, yönetici, kurulum, şifre değiştirme) kullanıcı adı, **kaynak IP** ve zamanla kaydedilir.
  Başarılı girişler kaydedilmez.
- **Ayarlar değişiklikleri için denetim kaydı (audit trail) yoktur.** Paylaşımlı yönetici hesabı kullanıldığı için
  değişikliği kimin yaptığı ayırt edilemez (BUL-12).
- İstemciye hata ayrıntısı/stack trace sızdırılmaz (genel "İstek işlenemedi" mesajı).

## 13. Bağımlılık güvenliği (`npm audit`, 21.10.2026)

| Paket grubu | Toplam | Kritik | Yüksek | Orta | Düşük |
|---|---|---|---|---|---|
| Backend (tümü) | 6 | 1 | 1 | 4 | 0 |
| Backend (yalnızca üretim) | 5 | 1 | 1 | 3 | 0 |
| İstemci (tümü) | 3 | 0 | 2 | 0 | 1 |
| İstemci (yalnızca üretim) | 1 | 0 | 0 | 0 | 1 |

**Backend, üretimde etkili olanlar**
- **`proxy-addr` (kritik, dolaylı, `express` üzerinden):** "güvenilen alt ağ" ile IP sahteciliği. Uygulama
  `trust proxy` ayarını açmaz ve istemci IP'sini hiçbir yerde kullanmaz; bu nedenle mevcut yapılandırmada
  sömürülebilir değildir. Yine de paket güncellenmelidir.
- **`nodemailer` (yüksek, doğrudan):** eski imza ile `resolveContent()` çağrıldığında dosya/URL erişim kısıtını
  atlama. Uygulama bu çağrı biçimini kullanmaz, ancak güncelleme önerilir.

**İstemci:** Kalan iki yüksek bulgu geliştirme araçlarındadır (`vite` ve bağımlılığı `source-map-js`) ve çalışan
uygulamaya girmez, yalnızca üretim bağımlılıklarında tek bir düşük önemli bulgu kalır. Electron ve exe paketleme
araçları projeden kaldırıldığı için onlardan gelen bulgular (18'den 3'e düşüş) ortadan kalkmıştır.

Düzeltme: `npm audit fix` ile çoğu giderilebilir, breaking change gerektirenler ayrıca değerlendirilmelidir.

## 14. Kaynak kod yönetimi ve CI

- Kod, GitHub'da **private** bir depoda tutulur. GitHub kullanımı proje tamamlanana kadar geçicidir, sonrasında
  uygulama şirket ağında çalışacaktır.
- Depoda `backend/data/` içindeki dört dosya (`secret.key`, `session.key`, `admin-credentials.json`,
  `settings.enc.json`) **geçmişte git'e eklenmiştir** ve git geçmişinde durur. Güncel çalışma kopyalarında bu
  dosyalar yerelde `skip-worktree` ile korunur (yanlışlıkla commit edilmez), ancak depoda ve geçmişte kalan
  sürümler geçerlidir (BUL-10). Proje sahibi beyanına göre SMTP olarak Ethereal (test hesabı) kullanılır, yani
  SMTP bilgisi gerçek şirket şifresi değildir. Yönetici hesabı ve kullanıcı kayıtlarının test mi gerçek mi olduğu
  Bölüm 16'da teyit edilecektir.
- CI (GitHub Actions): her gönderimde birim, backend ve tarayıcı testlerini çalıştırır. Depo sırrı (`secrets.*`)
  kullanmaz. Eylemler sürüm etiketiyle (`@v4`) sabitlenmiştir, commit özetiyle değil.
- Üretim öncesi plan: gizli dosyaları git'ten çıkarmak, anahtarları yenilemek, yönetici hesabını değiştirmek,
  SMTP'yi şirket sunucusuna almak.

## 15. Bulgular

Önem derecesi, uygulamanın ağa açıldığı (sunucu modu) senaryoya göre verilmiştir.

| No | Önem | Bulgu | Etki | Öneri |
|---|---|---|---|---|
| BUL-01 | **Giderildi** (21.10.2026, eski önem: Yüksek) | `POST /api/newinstalls/sync-excel` ve `PUT /api/newinstalls/config/excel-path`, oturum açmış herhangi bir kullanıcıdan `excelPath` alıyordu. Yol doğrulanmıyor, klasör özyinelemeli oluşturuluyor, hedef dosya varsa okunup üzerine yazılıyordu. | Eski etki: sunucu bilgisayarında keyfi yola dosya yazma/üzerine yazma. | **Uygulanan:** yol yalnızca Master tarafından kaydedilir (`excel-path` ucu Master ister), `sync-excel` istek gövdesindeki yolu kullanmaz. Yol politikası: mutlak, `.xlsx`, uygulama/veri/yüklenen rapor klasörleri yasak, klasör keyfi oluşturulmaz, hedefteki dosya geçerli `.xlsx` değilse dokunulmaz. 6 otomatik test. |
| BUL-02 | **Giderildi** (21.10.2026, eski önem: Yüksek) | `POST /api/auth/setup-master` kimliksizdi, Master yokken uca erişen ilk kişi Master olabiliyordu. | Eski etki: yeni kurulumda yetki ele geçirme. | **Uygulanan:** kurulum kodu zorunlu (sunucu konsolu/`SETUP_CODE`), sabit zamanlı karşılaştırma, hatalı kod denemeleri sınırlı, eşzamanlı iki kurulum isteğine karşı yeniden kontrol. 3 otomatik test. |
| BUL-03 | **Giderildi** (21.10.2026, eski önem: Yüksek) | Giriş ve yönetici girişi uçlarında deneme sınırı ve hesap kilidi yoktu. | Eski etki: şifre deneme saldırısı. | **Uygulanan:** kullanıcı+IP, kullanıcı ve IP katmanlı sınırlayıcı, artan bekleme (30 sn'den 15 dk'ya), 429 + `Retry-After`. Giriş, yönetici girişi (tüm ayarlar uçları dahil), ilk kurulum ve şifre değiştirme kapsanır. Yönetici şifresi karşılaştırması sabit zamanlıya çevrildi. Metin olmayan kullanıcı adı/şifre 400 döner. 7 otomatik test. |
| BUL-04 | **Kısmen giderildi** (21.10.2026, eski önem: Orta) | `POST /api/mail/send` oturum açmış her kullanıcıya açıktır; alıcı, konu ve HTML gövde istemciden gelir. | Şirketin SMTP kimliğiyle serbest içerikle e-posta gönderme (oltalama, istenmeyen posta). | **Uygulanan:** alıcı adresi biçim doğrulaması (görünen ad, satır sonu, dizi reddedilir), tek istekte en fazla 50 alıcı, konu satır sonu ve uzunluk denetimi, metin 200 KB / HTML 500 KB sınırı, kullanıcı başına saatlik kota (1000 alıcı, 600 istek; 429 + `Retry-After`), gönderim günlüğü (kullanıcı, alıcı sayısı, konu). Alan adı izin listesi `MAIL_ALLOWED_DOMAINS` ortam değişkeniyle verilir; **tanımlı değilse alan adı kısıtı yoktur**, açılışta uyarı yazılır. **Kalan:** gövde hâlâ istemcide üretilir, izin verilen alan adı içinde serbest içerikli mail gönderilebilir. Gövdeyi sunucuda şablondan üretmek ayrı bir iştir. |
| BUL-05 | Orta | Şirket seçimi (AJET/TKAO) yalnızca arayüz filtresidir, rapor uçları tüm satırları döner. Grup/yetki yoktur. | Her oturum açmış kullanıcı tüm şirketlerin tüm verisini görebilir. | Sunucu tarafı şirket/grup bazlı yetkilendirme (planlı: İstanbul / Yurt İçi / Yurt Dışı). |
| BUL-06 | Orta | SMTP bağlantısında sertifika zinciri doğrulanmaz (`rejectUnauthorized: false`). | Ağ içi ortadaki adam saldırısıyla SMTP kimlik bilgisi/e-posta okunabilir. | Şirket kök CA'sını Node'a tanıt (`NODE_EXTRA_CA_CERTS`), doğrulamayı aç. |
| BUL-07 | Orta | Oturum token'ı `localStorage`'dadır, sunucu tarafında iptal (logout/blacklist) mekanizması yoktur, süre 12 saattir. | Bir XSS bulunursa token çalınabilir, çalınan token süre dolana kadar geçerlidir. | Token'ı `HttpOnly` çerezde taşı ya da süreyi kısalt ve sunucu tarafı iptal listesi ekle. |
| BUL-08 | Orta | Paylaşımlı yönetici şifresi düz metin dosyada tutulur, sabit zamanlı olmayan `===` ile karşılaştırılır, her istekte HTTP başlığıyla taşınır, ilk üretimde konsola yazılır. | Dosyaya/loga erişen veya trafiği dinleyen kişi yönetici yetkisini alır. Kimin değişiklik yaptığı bilinmez. | Ayarları Master oturumuna taşı (bcrypt + token), paylaşımlı şifreyi kaldır. |
| BUL-09 | Orta | Uygulama TLS sunmaz. | Sunucu modunda parolalar, token ve yönetici şifresi ağda düz metin gider. | TLS sonlandıran ters vekil (IIS/nginx) arkasında yayınla, HTTP'yi kapat. |
| BUL-10 | Orta | Dört gizli dosya git geçmişinde durur (private GitHub). Anahtar, şifreli verinin yanındadır. | Depo erişimi olan biri anahtarı ve şifreli ayarları alır. | SMTP test verisi (Ethereal) olduğundan proje sahibi şimdilik kabul etti. Yönetici hesabı ve kullanıcılar gerçekse hemen yenile. Üretim öncesi geçmişi temizle, anahtarları yenile. |
| BUL-11 | Orta | Bağımlılık açıkları (Bölüm 13), özellikle `nodemailer` ve `express` zinciri. | Doğrudan sömürü olasılığı düşük, ama güncel olmayan paket riski. | `npm audit fix`, Express/Nodemailer'ı güncelle, CI'da `npm audit` adımı ekle. |
| BUL-12 | Orta | Denetim kaydı yok, başarısız girişte IP yok, başarılı giriş kaydedilmiyor. | Olay incelemesi ve hesap verebilirlik zayıf. | Kimlik doğrulama ve ayar değişikliği olaylarını kullanıcı + IP ile ayrı log'a yaz. |
| BUL-13 | Düşük | Dosya klasörü bulunamazsa uygulama **sessizce depodaki demo verisine** düşer. | Üretimde yapılandırma hatası, kullanıcıya gerçek veri gibi demo veri gösterilmesine yol açabilir (veri bütünlüğü). | Üretim modunda yedek veriyi kapat, belirgin bir hata göster. |
| BUL-14 | Düşük | Dış sağlayıcıda `ldaps` kapalı seçilirse LDAP şifresi düz metin gider. RADIUS ve TACACS+ protokolleri kendi doğaları gereği MD5 tabanlı gizleme kullanır. | Ağ dinlemesiyle kimlik bilgisi ele geçirilebilir. | LDAPS zorunlu kıl, RADIUS/TACACS+ yalnızca yönetim ağında kullan. |
| BUL-15 | Düşük | Veri kaynağı test ucu, yöneticinin verdiği URL'ye sunucudan istek atar. | Yönetici yetkisiyle iç ağ adreslerine istek (SSRF). | Hedef adres listesi/alan adı kısıtı. |
| BUL-16 | Düşük | `/api/appconfig` her oturumlu kullanıcıya sunucudaki klasör yolunu döner. | Sunucu dizin yapısı bilgisi sızar. | Yolu yalnızca yöneticiye göster. |
| BUL-17 | Bilgi | `render.yaml` ile bulut demo dağıtım tanımı depoda durur (HOST=0.0.0.0, kullanıcı adı `admin`). | Yayındaysa internete açıktır. BUL-02 ve BUL-03 giderildi, ancak BUL-04, BUL-05, BUL-09 geçerliliğini korur. Render'da `SETUP_CODE` ortam değişkeni tanımlı değilse kurulum kodu yalnızca Render günlüğünde görünür. | Bölüm 16'daki teyit. Gerekmiyorsa dosyayı kaldır. |
## 16. Proje sahibinden teyit beklenen noktalar

- `render.yaml` ile tanımlı bulut demo ortamı **fiilen yayında mı?** Yayındaysa içinde gerçek veri var mı ve
  Master kullanıcı oluşturuldu mu? (BUL-02, BUL-03, BUL-17)
- `admin-credentials.json` içindeki yönetici hesabı ve kullanıcı kayıtları **test verisi mi, gerçek hesap mı?**
  Gerçekse bunlar git geçmişinde durduğu için hemen yenilenmelidir (BUL-10).
- Şirket sunucusunda TLS sonlandıran bir ters vekil (IIS/nginx) sağlanacak mı?
- Kimlik doğrulama için hangi sağlayıcı kullanılacak (LDAP/AD, RADIUS, TACACS+)? Bunlar gerçek ortamda henüz
  doğrulanmamıştır.
- Kişisel veri (KVKK) açısından saklama süresi ve yükleme dosyalarının silinme politikası.

## 17. Mevcut güçlü yönler

- Parolalar bcrypt (maliyet 12) ile saklanır, hiçbir yerde düz metin döndürülmez veya loglanmaz (yönetici şifresi
  dosyası hariç, BUL-08).
- Tüm ayar ve işlenen veri bölümleri AES-256-GCM ile şifreli saklanır, gizler arayüze geri döndürülmez.
- Oturum token'ı imzalı, süreli, sabit zamanlı doğrulanır, rol her istekte yeniden okunur.
- Rapor, mail, cihaz ve anlık görüntü uçları kimlik doğrulaması gerektirir (önceden açıktı).
- Giriş uçlarında deneme sınırı, ilk kurulumda kurulum kodu, Excel çıktı yolunda sıkı yol politikası vardır, bunlar
  otomatik güvenlik testleriyle (`backend/src/security.test.js`) sürekli doğrulanır.
- Yükleme dosya adları sunucu üretimidir, yol manipülasyonu görülmedi.
- Hata yanıtları ayrıntı sızdırmaz, `x-powered-by` kapalıdır.
- CSP etkin (`script-src 'self'`, `object-src 'none'`).
- Üçüncü taraf servise veri gönderilmez, telemetri yoktur.
- Tüm kod okunabilir düz JavaScript/JSX'tir, otomatik testler (birim, backend, tarayıcı) CI'da çalışır.

## 18. Hızlı cevaplar

- **"Şifreler nasıl saklanıyor?"** Kullanıcı şifreleri bcrypt özeti olarak, ayarlar ve veri AES-256-GCM ile
  şifreli. İstisna: paylaşımlı yönetici şifresi düz metin dosyada (BUL-08).
- **"Uygulama internete açık mı?"** Yerel çalıştırmada hayır (yalnızca `127.0.0.1`). Sunucu modunda ağdaki
  kullanıcılara açıktır. `render.yaml` ile bulut demo tanımı vardır, yayında olup olmadığı teyit edilecek.
- **"Kullanıcı girişi/yetkilendirme var mı?"** Var (yerel + LDAP/RADIUS/TACACS+, Master/User rolü). Grup bazlı veri
  yetkilendirmesi henüz yok.
- **"Dışarı hangi bağlantılar çıkıyor?"** Yalnızca yöneticinin tanımladığı veri API'si, SMTP ve kimlik doğrulama
  sunucuları.
- **"Veritabanı var mı?"** Yok. Şifreli bir JSON dosyası ve yüklenen Excel/CSV dosyaları var.
- **"Kişisel veri işleniyor mu?"** Evet: ad-soyad, sicil, kullanıcı adı, e-posta, hostname, IP. Yüklenen dosyalar
  diskte şifresizdir.
- **"En önemli açıklar neler?"** Yüksek önemdeki üç bulgu (BUL-01 keyfi yola dosya yazma, BUL-02 kimliksiz Master
  kurulumu, BUL-03 deneme sınırı yok) 21.10.2026'da giderildi ve otomatik testlerle doğrulandı. Kalan en önemli
  maddeler: BUL-04 (gövdenin istemciden gelmesi; alıcı ve kota sınırlandı), BUL-05 (grup/yetki yok), BUL-08 (paylaşımlı yönetici
  şifresi), BUL-09 (TLS yok).
