# Varlık Takip Tool — Proje Özeti (Claude Code için brief)

Bu dosya, Claude.ai sohbetinde bu projeyle ilgili konuşulan tüm kararların özetidir.
Claude Code'a bu dosyayı verirsen, kaldığımız yerden aynı bağlamla devam edebiliriz.

## Amaç

Şirket içinde iki ayrı Power Automate projesi (inaktif cihaz bildirimi, disk alanı
uyarısı) Excel eki + mail tetikleyici mantığıyla çalışıyordu. Bunun yerine, şirketin
iç sistemindeki veritabanına doğrudan **API ile bağlanan, kod tabanlı, merkezi bir
web uygulaması** kurulacak. Excel/mail eki aradan tamamen çıkacak.

- Üç departman/firma için bölümlere ayrılacak, her biri kendi verisini görecek
- Birden fazla kişi (ekip) kullanacak → web tabanlı olacak, tek kişilik script değil
- Zamanlanmış/otomatik çalışan bir servis olarak düşünülüyor (cron benzeri)
- API detayları (endpoint, auth, format) henüz netleşmedi — IT'den öğrenilecek

## Rapor Türleri

1. **İnaktif Cihazlar** — işten ayrılan personelin cihazları, lokasyon-mail eşleştirmesiyle bildirim (mevcut Power Automate mantığının kod karşılığı)
2. **Disk Alanı** — düşük disk alanı uyarısı (mevcut Power Automate mantığının kod karşılığı)
3. **Zimmet Uyuşmazlığı** — YENİ özellik, bu sohbette detaylıca tasarlandı (aşağıda)

## Zimmet Uyuşmazlığı — mantık (en çok geliştirilen kısım)

İki canlı veri kaynağı karşılaştırılıyor:
- **Zimmet listesi**: hangi cihaz (seri no) kime zimmetli
- **Aktif kullanım listesi**: hangi cihazı (seri no) şu an kim kullanıyor

Karşılaştırma **cihaz merkezli**: her zimmetli cihaz kendi satırında, kendi API
kaydıyla değerlendiriliyor (kişi merkezli yapı denenip terk edildi — bir kişiye
birden fazla cihaz zimmetliyken ikincisinin durumunu gizliyordu).

Durum etiketleri:
- **Zimmet Doğru** — zimmetli kişi = aktif kullanan
- **Zimmet Hatalı** — zimmetli kişi ≠ aktif kullanan (başkası kullanıyor)
- **Kullanım Kaydı Yok** — bu seri no aktif kullanım verisinde hiç yok (nötr/gri, "yanlış" değil "bilinmiyor")
- **Zimmetsiz Kullanım** — aktif kullanımda var ama hiçbir zimmet kaydında yok

Tablo sütunları: **Zimmetli Kişi | Cihaz (Seri No) | Kullanan Kişi | Açıklama | Durum**
Açıklama sütunu şablon cümle: *"MN-10021 seri numaralı cihazı A. Yılmaz kullanmalı, ama B. Şahin kullanıyor."*

Bir kişinin adına tıklayınca (Zimmetli Kişi veya Kullanan Kişi sütununda), o kişiyle
ilgili TÜM kayıtları (hem zimmetli olduğu hem kullandığı) tek bir modal/pencerede
"Rol" sütunuyla (Zimmetli/Kullanıyor) gösteren bir özet açılıyor.

## Gerçek veri yapısı (kullanıcı örnek dosya paylaştı, KVKK gereği anonimleştirilmiş)

Kaynak: "Attached Monitors Report" — sütunlar:
`Active Status, AD Site, Device Domain, Hostname, User Domain, Username,
ID Monitor Serial Number, Monitor Manufacturer, Monitor Model, Client Type, Virtual Machine`

**Önemli veri kalitesi sorunu**: `Monitor Model` alanı bazen düzgün metin yerine
virgülle ayrılmış ASCII kod dizisi olarak geliyor, örn:
`"76, 69, 78, 32, 76, 84, 50, 50, 50, 51, 112, 119, 67"` → çözümlenince `"LEN LT2223pwC"`.
Karar: bu otomatik tespit edilip okunaklı metne çevrilecek (prototipte
`decodeModelIfNeeded()` fonksiyonu bunu yapıyor — mantığı aynen taşı).

**Karar**: `Monitor Manufacturer` sütununa gerek yok, sadece `Monitor Model` yeterli.

## Diğer netleşen özellikler

- **Gönderim Geçmişi**: kim, ne zaman, hangi departman/rapor için mail attı, kaç kayıt, başarılı/başarısız
- **Durum akışı** (her uyuşmazlık kaydı için): Yeni → İnceleniyor → Çözüldü (tıklayınca döngüsel değişiyor)
- **Not ekleme**: her uyuşmazlık satırına serbest metin not
- **Erteleme (snooze)**: bir uyuşmazlığı listeden gizleme, "Ertelenenleri göster" ile geri getirme
- **Checkbox ile seçim**: satırlar seçilip sadece seçilenler Excel'e aktarılabiliyor
- **Excel export** (Zimmet Uyuşmazlığı için 2 sekmeli): "Cihaz Bazlı" (ana liste) + "Kişi Bazlı Özet" (isme göre alfabetik gruplu, Rol sütunuyla)
- **Genel Bakış (dashboard)**: üç departmanı karşılaştıran, Zimmet Doğru/Hatalı/Kayıt Yok oranlarını gösteren çubuk grafikler
- **Ayarlar ekranı**: departman × rapor türü bazlı bildirim tercihi checkbox matrisi + zamanlanmış tarama formu (sıklık/gün/saat) — şimdilik demo, gerçek otomasyon yok
- **Favori filtreler**: arama + segment kombinasyonunu isimlendirip kaydetme, çip olarak listeleme
- **Açık/Koyu tema**: sidebar'da ☀︎/☾ toggle, tüm renkler palet sistemine bağlı
- **PDF'e Aktar**: `window.print()` ile tarayıcı yazdırma penceresi (Claude.ai sandbox'ında popup engellenebiliyor — gerçek ortamda çalışması bekleniyor)

## Tasarım yönü

macOS'tan ilham alan ama birebir kopyası olmayan bir arayüz istendi (pencere
çerçevesi/trafik ışığı gibi doğrudan kopya öğeler olmadan). Kavrulmuş turuncu
(terracotta, `#C1662F`) accent rengi, yarı saydam/blur'lu yüzen paneller,
sistem fontu (-apple-system/Inter), ince kenarlıklar.

## Açık sorular / henüz netleşmeyenler

- API endpoint, auth yöntemi, veri formatı — IT'den alınacak
- Zimmet uyuşmazlığı için mail atılacak kişilerin (aktif çalışan) güncel kurumsal
  mail adresi zimmet/cihaz API'sinden mi, ayrı bir personel/AD API'sinden mi gelecek — belirsiz
- Barındırma: şirket sunucusu mu, Azure mu, önce lokal mi çalıştırılacak — henüz karar verilmedi
- Garanti süresi takibi İSTENMİYOR (bilerek kapsam dışı bırakıldı)

## Prototip dosyası

`varlik-takip-prototip.jsx` — React ile yazılmış, sahte (mock) veriyle çalışan
tam interaktif bir prototip. Yukarıdaki tüm özellikler bu dosyada uygulanmış
durumda. Gerçek API bağlanınca yapılması gereken temel değişiklik: `MOCK_ZIMMET`
ve `MOCK_DATA` sabitlerinin yerini gerçek API çağrıları alacak, geri kalan mantık
(eşleştirme, filtreleme, export, UI) büyük ölçüde aynı kalabilir.
