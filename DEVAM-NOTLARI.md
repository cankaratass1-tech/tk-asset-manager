# Devam notları (başka bilgisayarda çalışmaya başlarken)

> Güncel iş listesi için YAPILACAKLAR.md dosyasına bakın.

Proje: TK Asset Manager / Varlık Takip (React + Vite `varlik-takip-app/`, Express `backend/`). Dil: Türkçe.
Çalışma dalı: `yedek-2026-10-21` (main'e alınmadı).

## Kurulum
`kur-ve-calistir.bat` dosyasına çift tıkla (Node.js 22 ve Git kurulu olmalı). Arayüz: http://localhost:5173, backend: http://127.0.0.1:5000

## İlk kurulum kodu (yeni veri klasörü)
Veri klasöründe Master User yoksa (ilk kurulum) Master oluşturmak için kurulum kodu gerekir. Backend konsolunda
"Kurulum kodu: ..." satırı yazılır, arayüzdeki ilk kurulum ekranına girilir. `SETUP_CODE` ortam değişkeniyle sabitlenebilir (en az 16 karakter). Mevcut veri klasöründe Master zaten
varsa bu adım gerekmez. Giriş denemeleri sınırlıdır: 5 hatadan sonra bekleme (429), bkz. `GUVENLIK-BILGILENDIRME.md`.

## Testler
- Hızlı: `cd varlik-takip-app && node --test src/services/*.test.js`
- Hepsi (Edge/Chrome ya da Playwright Chromium gerekir): `npm run test:all` (18 paket)
- GitHub Actions her gönderimde otomatik çalıştırır.

## Bilinen durum / açık konular
- Şirket seçimi (AJET/TKAO) tüm raporlara bağlı; geri alma adımları `KRITIK-NOTLAR.md`.
- Gönderim Geçmişi veri modeli (içerik saklama, zamanlayıcı e-postaları) sonra yapılacak.
- Ortam/dağıtım (test ortamı, canlıya aktarım) ve grup/yetki (LBS Location Parent ile ayrım) planı kullanıcı kararını bekliyor.
- Git'te izlenen gizli dosyalar (`backend/data/secret.key`, `session.key`, `admin-credentials.json`, `settings.enc.json`, `varlik-takip-app/.env.production`) izlemeden çıkarılıp anahtarlar yenilenmeli (kullanıcı kararı bekliyor).
- `backend/data` Git dışında kalan yerel ayarları içerir; başka bilgisayara elle taşınmalı.

## Sohbet özeti (21.10.2026'ya kadar)
Kullanıcı Türkçe konuşur; kısa, somut, test ile doğrulanmış sonuç ister. Commit ve push yalnızca istendiğinde yapılır.

Yapılanlar:
- **Mail:** ortak çerçeve `services/mailLayout.js`; Türk Hava Yolları logosu `cid:mail-logo` ile gömülü ek olarak gider (`backend/src/routes/mail.js`, `backend/assets/mail-logo.png`). Test maili artık HTML. Backend kodu değişince süreç yeniden başlatılmalı (hot-reload yok).
- **Dashboard V3** taslağı (`components/DashboardV3.jsx`), App.jsx'te `dashboardV3` anahtarıyla.
- **İnaktif cihazlar:** kullanan varsa yeşil ("Kullanımda"), hiç giriş yoksa kırmızı.
- **TDK yazım denetimi:** tüm arayüz metinleri düzeltildi; `src/services/spelling.test.js` yasak kalıpları ve `lang="tr"` değerini denetler. Zimmet Uyuşmazlığı açıklaması popup'ta görünür (`DescriptionRow.jsx`).
- **Detay popup/panel:** başlıklar kalın-koyu, değerler grid ile hizalı (`detailFieldRow`).
- **Gönderim Geçmişi:** tek satırlık filtre kartı, şirket çipi, kayıtlara `company` alanı. Veri modeli (içerik saklama, zamanlayıcı e-postaları, Cihaz Aksiyon Geçmişi ile birleştirme) sonra yapılacak.
- **Şirket ayrışması (AJET / TKAO):** Disk, SCCM Ajan, Yeni Kurulum, Kapatma Onayı ekranları ve sol menü sayıları şirkete göre ayrışır (`recordCompany.js`, `backend/scripts/rebalance-newinstalls-companies.js`).
- **Yedek ve CI:** private GitHub deposu, `yedek-2026-10-21` dalı, git etiketleri; GitHub Actions (`.github/workflows/test.yml`) her gönderimde birim + backend + 18 tarayıcı paketini çalıştırır (ilk koşu başarılı, ~19 dk).

Danışılan, karar bekleyen konular:
1. Canlıda değişiklik için test ortamı + otomatik dağıtım (canlı veriye erişim olmadan).
2. Grup/yetki sistemi (İstanbul / Yurt İçi / Yurt Dışı); ayrım için `LBS Location Parent` (TH), `EnvanterLocationParent` (SCCM) alanları kullanılabilir.
3. Gizli dosyaların Git'ten çıkarılması ve anahtar yenileme (yukarıda).
4. `main` dalına alma.

Test altyapısı: Playwright-core (Edge; yoksa Chromium, ya da `E2E_BROWSER_PATH`), `e2e/harness.mjs`, `npm run test:all`.

## Hafıza notları
Önceki oturumlardaki kalıcı notlar `hafiza-notlari/` klasöründe (Cihaz Aksiyon Geçmişi planı, hostname değişikliği kurgusu — beklemede, şirket filtresi kritik notu). Yeni bir Claude oturumu bunları okumalı; kullanıcı açıkça istemeden hostname/kimlik kurgusunu değiştirme.
