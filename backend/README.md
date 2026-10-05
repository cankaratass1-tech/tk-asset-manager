# Varlık Takip — Backend

Frontend'in Ayarlar ekranındaki "Mail (SMTP) Sunucu Ayarları" ve "Veri Kaynağı (API)
Bağlantısı" panellerinin sunucu tarafı karşılığı. Görevi:

1. Kimlik bilgilerini (SMTP şifresi, API anahtarı, veri kaynağı şifresi) tarayıcıya hiç
   göstermeden AES-256-GCM ile şifreleyip diske yazmak
2. Windows/NTLM dahil kimlik doğrulama yöntemleriyle bağlantı testi yapmak
   (NTLM/CORS kısıtlaması nedeniyle tarayıcıdan yapılamaz)
3. SMTP sunucusuna bağlanıp doğrulamak ve mail göndermek (`nodemailer`)

## Çalışma şekilleri

**1. Paketlenmiş `.exe` içinde (varsayılan)** — `electron/main.cjs`, backend'i
`require()` ile kendi süreci içinde otomatik başlatır. Şifreleme anahtarı ilk açılışta
otomatik üretilip kullanıcının uygulama veri klasörüne
(`%APPDATA%\varlik-takip-app\backend-data\secret.key`) kalıcı olarak yazılır.

**2. Standalone (geliştirme) modu** — frontend `npm run dev` ile ayrı çalıştırılıyorsa
backend de ayrı başlatılmalı:

```bash
npm install
npm run dev
```

`http://localhost:5000` üzerinde çalışır, sadece `127.0.0.1`'e bağlanır. Bu modda da
`.env`/`BACKEND_SECRET_KEY` zorunlu değildir — verilmezse `data/secret.key` altında
otomatik üretilir. Elle bir anahtar belirlemek için (ör. birden fazla makinede aynı
anahtarı kullanmak amacıyla):

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# çıktıyı .env dosyasındaki BACKEND_SECRET_KEY= satırına yapıştır
```

Frontend her iki modda da `varlik-takip-app/src/services/backendClient.js` üzerinden
sabit olarak `localhost:5000`'i kullanır.

**Güvenlik notu**: otomatik üretilen anahtar dosyası `%APPDATA%` altında sadece ilgili
Windows kullanıcı hesabının erişebildiği bir yerde durur — OS anahtar zincirine (Windows
Credential Manager/DPAPI) entegre olmaktan daha zayıf bir korumadır. Kurumsal/çok
kullanıcılı dağıtımda bir secret manager'a taşınmalıdır.

## Uç noktalar

| Metod | Yol | Ne yapar |
|---|---|---|
| GET | `/api/health` | Canlılık kontrolü |
| GET | `/api/settings/datasource` | Kayıtlı ayarları döner (şifre/API anahtarı ham dönmez, sadece `hasPassword`/`hasApiKey`) |
| PUT | `/api/settings/datasource` | Ayarları şifreli kaydeder |
| POST | `/api/settings/datasource/test` | Bağlantı testi (NTLM/Basic/API Key/Yok) |
| GET/PUT | `/api/settings/smtp` | SMTP ayarları (aynı maskeleme mantığı) |
| POST | `/api/settings/smtp/test` | `transporter.verify()` ile SMTP kontrolü |
| POST | `/api/mail/send` | Kayıtlı SMTP ayarlarıyla mail gönderir — body: `{ to, subject, text }` |

## Paketleme notu

`varlik-takip-app/package.json`'daki `extraResources` konfigürasyonu bu backend'i
`from: ".."` (proje kökü) + `filter: ["backend/**/*", ...]` ile kopyalar,
`from: "../backend"` değil. Sebebi: electron-builder, kaynağın doğrudan altındaki bir
klasör tam olarak `node_modules` adındaysa onu filtre ne olursa olsun atlar
(`app-builder-lib/util/filter.js` — "root node_modules" için özel durum).
`backend/` doğrudan `from` olursa bu göreli yol tam eşleşip atlanır ve backend'in
bağımlılıkları paketlenmemiş olur. Bir üst dizinden alınca bu özel durum devreye girmez.

## Test etmek için

- **Veri kaynağı**: `../demo-api` mock envanter API'sini çalıştır (`node demo-api/server.js`),
  Ayarlar ekranında "⚡ Demo API ile doldur ve dene" çipine tıkla.
- **SMTP**: `node test-smtp-server.js` ile yerel bir test SMTP sunucusu aç
  (kullanıcı: `demo-smtp-user`, şifre: `demo-smtp-pass`, port `2525`, TLS kapalı).

## Bilinen kısıtlar

- NTLM implementasyonu gerçek bir Active Directory sunucusuna karşı doğrulanmadı.
  Standart NTLM type1/type2/type3 el sıkışmasını (`httpntlm`) yürütür ve NTLM
  desteklemeyen bir sunucuya karşı anlaşılır hata döner; kurumsal AD ortamında ayrıca
  doğrulanmalıdır.
- Tek kullanıcılı, yerel senaryo için tasarlandı — kimlik doğrulama/yetkilendirme
  katmanı yoktur (backend sadece `127.0.0.1` dinler). Çok kullanıcılı dağıtımda bir
  kullanıcı oturum/yetki sistemi eklenmelidir.
- `POST /api/mail/send` alıcıyı belirlemez, alıcı listesi çağıran taraftan gelir. Rapor
  ekranındaki "Mail Gönder" butonu demo düzeyindedir.
