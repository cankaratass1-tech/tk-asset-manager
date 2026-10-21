# Varlık Takip — Backend

Frontend'in Ayarlar ekranındaki "Mail (SMTP) Sunucu Ayarları" ve "Veri Kaynağı (API)
Bağlantısı" panellerinin sunucu tarafı karşılığı. Görevi:

1. Kimlik bilgilerini (SMTP şifresi, API anahtarı, veri kaynağı şifresi) tarayıcıya hiç
   göstermeden AES-256-GCM ile şifreleyip diske yazmak
2. Windows/NTLM dahil kimlik doğrulama yöntemleriyle bağlantı testi yapmak
   (NTLM/CORS kısıtlaması nedeniyle tarayıcıdan yapılamaz)
3. SMTP sunucusuna bağlanıp doğrulamak ve mail göndermek (`nodemailer`)

## Çalışma şekilleri

Backend ayrı bir Node süreci olarak çalışır. Frontend `npm run dev` ile ayrı çalıştırılıyorsa
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

Frontend `varlik-takip-app/src/services/backendClient.js` üzerinden `localhost:5000`'i kullanır.

**İlk kurulum:** Veri klasöründe Master User yoksa, Master oluşturmak için kurulum kodu gerekir. Kod
sunucu açılışında konsola yazılır ya da `SETUP_CODE` ortam değişkeniyle (en az 16 karakter) verilir.

**Güvenlik notu**: otomatik üretilen anahtar dosyası (`data/secret.key`) OS anahtar zincirine
(Windows Credential Manager/DPAPI) entegre olmaktan daha zayıf bir korumadır. Kurumsal/çok
kullanıcılı dağıtımda bir secret manager'a taşınmalıdır.

## Mail gönderim politikası

`POST /api/mail/send` oturum gerektirir ve sunucuda şunları uygular: alıcı adres biçimi, tek istekte en fazla
50 alıcı (`MAIL_MAX_RECIPIENTS`), konu/gövde boyut sınırı, kullanıcı başına saatlik kota (`MAIL_HOURLY_RECIPIENTS`,
`MAIL_HOURLY_REQUESTS`). `MAIL_ALLOWED_DOMAINS` (virgülle ayrılmış, ör. `sirket.com,alt.com`) tanımlıysa yalnızca
bu alan adlarına ve alt alan adlarına gönderilir; tanımlı değilse alan adı kısıtı uygulanmaz.

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
