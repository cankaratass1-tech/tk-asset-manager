# Hata Kodları

Ekranda bir hata çıktığında mesajın sonunda `[MODÜL-DURUM · #kimlik]` biçiminde bir kod görünür.
Örnek: `Alıcı (to) zorunlu [MAIL-400 · #1b687a]`

- **MODÜL-DURUM**: hatanın hangi bölümde ve hangi türde olduğunu söyler.
- **#kimlik**: o hataya özel 6 karakterlik numara. Backend log'unda aynı numarayla bir satır vardır:
  `[HATA] MAIL-400 #1b687a POST /api/mail/send -> 400 kullanici=master mesaj="..."`
  Log'da istek içeriği ya da kayıt verisi tutulmaz.

Bana iletirken şunları yaz: **kod + #kimlik**, hangi sayfada ne yaptığın, ekran görüntüsü.

## Durum kısmı (sondaki sayı)

| Sayı | Anlamı | Genel çözüm |
|---|---|---|
| 400 | Eksik/geçersiz bilgi gönderildi | Mesajda hangi alanın eksik olduğu yazar, doldurup tekrar dene |
| 401 | Giriş yok ya da oturum bitti | Yeniden giriş yap (oturum 12 saat) |
| 403 | Bu işlem için yetkin yok | Master (Supervisor) kullanıcıyla dene |
| 404 | Kayıt/dosya/adres bulunamadı | Dosyanın yüklendiğini, yolun doğru olduğunu kontrol et |
| 409 | Çakışma (zaten var) | Mevcut kaydı kontrol et |
| 500 | Beklenmeyen sunucu hatası | Log'daki #kimlik satırını ve stack trace'i ilet |
| 502 | Dış kaynak başarısız (dosya, SMTP, URL) | Aşağıdaki modül tablosuna bak |

## Modül kısmı (baştaki harfler)

| Kod | Bölüm | İlk bakılacak yer |
|---|---|---|
| `AUTH` | Giriş / yetki | Domain (`MHY`), kullanıcı adı/şifre, rol. 403 ise Master gerekir |
| `AUTHCFG` | Kimlik doğrulama ayarları (LDAP/RADIUS/TACACS+) | Ayarlar → Kimlik Doğrulama, sunucu adresi ve portlar |
| `MAIL` | Mail gönderme | SMTP ayarı kayıtlı mı, alıcı dolu mu, Mail Geçmişi'nde kayıt var mı |
| `MHST` | Mail geçmişi | Kayıt kimliği (id) gönderilmiş mi |
| `SMTP` | SMTP ayarı/testi | Ayarlar → SMTP → Test: sunucu, port, TLS, şifre |
| `RPT` | Raporlar (Disk, Zimmet, Kullanılmayan vb.) | Dosya kaynağı klasörü tanımlı mı, dosyalar klasörde mi, dosya adı/başlıklar değişmiş mi |
| `FSRC` | Dosya kaynağı ayarı | Klasör yolu doğru ve erişilebilir mi |
| `DSRC` | Veri kaynağı (URL) ayarı | URL doğru mu, sunucuya erişim var mı |
| `UPL` | Manuel dosya yükleme (Bant Genişliği, Battery Health) | Master mısın, dosya boş mu, biçim doğru mu |
| `MGRP` | Mail grupları | Gönderilen liste biçimi geçerli mi |
| `DEV` | Cihaz notları/aksiyon geçmişi | Cihaz anahtarı (deviceKey) ve tür gönderilmiş mi |
| `SNAP` | Dönemsel istatistik kayıtları | Rapor kimliği ve cihaz listesi gönderilmiş mi |
| `NEW` | Yeni Kurulum Kaydı | Kayıt silinmiş olabilir, yol alanı boş olmamalı |
| `SET` | Genel ayarlar | Girilen değer izin verilen aralıkta mı |
| `SYS` | Genel sistem (bilinmeyen adres, beklenmeyen hata) | Log'daki #kimlik satırı |
| `NET` | Backend'e hiç ulaşılamadı | Backend çalışıyor mu, internet/ağ erişimi, Render uyanık mı |
| `UI` | Arayüzde beklenmeyen hata (beyaz ekran yerine çıkar) | F12 → Console'daki aynı #kimlikli kırmızı satır |

Örnekler: `RPT-502` = rapor dosyası okunamadı, `MAIL-502` = mail sunucusu mesajı kabul etmedi,
`AUTH-403` = Master yetkisi yok, `UPL-400` = yüklenen dosya boş.
