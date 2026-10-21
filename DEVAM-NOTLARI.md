# Devam notları (başka bilgisayarda çalışmaya başlarken)

Proje: TK Asset Manager / Varlık Takip (React + Vite `varlik-takip-app/`, Express `backend/`). Dil: Türkçe.
Çalışma dalı: `yedek-2026-10-21` (main'e alınmadı).

## Kurulum
`kur-ve-calistir.bat` dosyasına çift tıkla (Node.js 22 ve Git kurulu olmalı). Arayüz: http://localhost:5173, backend: http://127.0.0.1:5000

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
