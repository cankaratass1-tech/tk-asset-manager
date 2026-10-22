# Yapılacaklar

Bu dosya iki bilgisayarda da `senkronla.bat` ile eşitlenir. Yeni bir iş aklınıza gelince buraya ekletin, bitenleri `- [x]` yapın.
Son güncelleme: 22.10.2026

## Karar bekleyenler
- [x] **Gönderim Geçmişi, 1. aşama (22.10.2026):** backend her gönderimi kendisi kaydeder (gönderen oturumdan), e-posta içeriği en yeni 300 gönderimde saklanır ("E-postayı gör"), zamanlayıcı e-postaları "Otomatik (sistem)" olarak yazılır, geçmiş sınırı 5000.
- [x] **Gönderim Geçmişi, 2. aşama (22.10.2026):** gönderim detaylarına bildirilen cihazlar (seri no / hostname) yazılır; geçmiş araması seri no, hostname, kişi ve e-posta ile backend'de yapılır. Cihaz kartındaki "E-posta gönderildi" olayları (Zimmet, Disk, Kullanılmayan, Lokasyon/IP, İnaktif, LakeSide) zaten vardı.
- [ ] **Gönderim Geçmişi, kalan (isteğe bağlı):** Bant, Atıl Monitör, Yeni Kurulum gönderimlerinin cihaz kartına yazılması; `location` alanının hem lokasyon hem kişi hem hostname için kullanılması (ekranlar çalışıyor, yalnızca adlandırma karışık).
- [ ] **Test ortamı ve otomatik dağıtım:** canlı veriye erişmeden değişiklik deneme ve canlıya aktarım planı.
- [ ] **Grup/yetki sistemi** (İstanbul / Yurt İçi / Yurt Dışı): ayrım için TH `LBS Location Parent`, SCCM `EnvanterLocationParent` alanları kullanılabilir.
- [ ] **`main` dalına alma:** çalışma dalı `yedek-2026-10-21`, `main` ilk sürümde duruyor.
- [ ] **Hostname değişikliği kurgusu:** şimdilik mevcut sistem aynen kalacak, sunum sonrası tekrar ele alınacak (`hafiza-notlari/hostname-degisikligi-kurgu-beklemede.md`).
- [ ] **Cihaz Aksiyon Geçmişi / zimmet devri:** gerçek TH export'undaki "Son Güncelleme Tarihi" sütununun tam adı doğrulanacak (`hafiza-notlari/cihaz-aksiyon-gecmisi-plan.md`).

## Üst yönetim ekranı (22.10.2026)
- [x] **Cihaz Ara:** Cihaz Genel Görünümü Ana Sayfa'dan kaldırıldı; sağ üstteki "Cihaz Ara" düğmesi (Ctrl+K) her ekrandan açar.
- [x] **Operasyonel Durum Özeti:** yeni Ana Sayfa (açık bulgu, çözülen, yeni açılan, net iş akışı, genel iyileşme; ana grafik; şirket ve konu karşılaştırması; detay tablosu + CSV). Mevcut pano "Operasyon panosu" düğmesiyle açılır. Hesaplar: `src/services/executiveMetrics.js`.
- [ ] **Hedef tanımı:** veri modelinde hedef yok; hedef açık cihaz sayısı, dönemlik çözülen hedefi, hedef iyileşme yüzdesi ve geçerlilik dönemi tanımlanırsa hedef takibi ve grafikte hedef çizgisi açılır (grafik `targetValue` desteği hazır).
- [ ] **Bölge kırılımı:** İstanbul / Yurt İçi / Yurt Dışı (LBS Location Parent) grup/yetki işiyle birlikte.

## Güvenlik bulguları (bkz. GUVENLIK-BILGILENDIRME.md, Bölüm 15)
- [x] **BUL-01 (yüksek):** `newinstalls` Excel yolu: yalnızca Master, yol politikası, istekle yol gelmez. Giderildi 21.10.2026.
- [x] **BUL-02 (yüksek):** `setup-master` kurulum koduyla korunuyor. Giderildi 21.10.2026.
- [x] **BUL-03 (yüksek):** giriş, yönetici girişi, kurulum, şifre değiştirme için deneme sınırı. Giderildi 21.10.2026.
- [x] **BUL-04 (orta), kısmen:** alıcı doğrulama, boyut sınırı, kullanıcı kotası, gönderim günlüğü eklendi (21.10.2026).
- [ ] **BUL-04 kalan:** şirket sunucusuna geçerken `MAIL_ALLOWED_DOMAINS` ortam değişkenini şirket alan adlarıyla tanımla; gövdeyi sunucuda şablondan üretme işi (karar bekliyor).
- [x] **BUL-11 (orta):** bağımlılıklar güncellendi, `npm audit` 0 açık, CI'ya audit adımı eklendi. Giderildi 22.10.2026.
- [ ] Bilgi Güvenliği ekibine göndermeden önce Bölüm 16'daki teyit sorularını yanıtla (render.yaml yayında mı? yönetici hesabı gerçek mi?).

## Verilen kararlar
- Masaüstü uygulaması (exe/Electron) plandan çıkarıldı: geçici bir denemeydi, kod ve bağımlılıkları kaldırıldı (21.10.2026). Uygulama yalnızca tarayıcıdan, şirket sunucusunda çalışacak.
- Gizli dosyaların (`backend/data`) git'ten çıkarılması ve anahtar yenileme: **şimdilik gerekmiyor** (21.10.2026). GitHub proje bitene kadar geçici, SMTP Ethereal test verisi. Dosyalar yerelde `skip-worktree` ile korunuyor.

## Her çalışmada
- [ ] Başlarken ve bitirirken `senkronla.bat` çalıştır.
- [ ] Aynı anda iki bilgisayarda çalışma.
- [ ] Ortak bilgisayarda iş bitince: `cmdkey /delete:LegacyGeneric:target=git:https://github.com` ile GitHub girişini sil, `backend\data` klasörünü sil.

## Temizlik
- [ ] Masaüstündeki boş eski `Proje` klasörünü sil (Gezgin'den).
- [ ] Laptop'taki eski `Downloads\varlik-takip-main` kopyasını gereksizse kaldır.

## Proje tamamlanınca
- [ ] Uygulamayı şirket içi sunucuya taşı, GitHub'ı bırak.
- [ ] GitHub repolarını sil ya da yalnızca arşiv olarak private tut (`cocle8777-cmd/tk-asset-manager`, `cankaratass1-tech/varlik-takip`).
- [ ] Eski `cankaratass1-tech/varlik-takip` repo geçmişinde `.claude/` klasörü izleri var: repo silinmiyorsa geçmişi temizle.
- [ ] Canlıya almadan önce: gizli dosyaları git'ten çıkar, anahtarları yenile, `admin-credentials.json` içindeki hesabı değiştir.
- [ ] SMTP'yi Ethereal'dan şirket SMTP'sine geçir ve test et.
