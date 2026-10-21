# Yapılacaklar

Bu dosya iki bilgisayarda da `senkronla.bat` ile eşitlenir. Yeni bir iş aklınıza gelince buraya ekletin, bitenleri `- [x]` yapın.
Son güncelleme: 21.10.2026

## Karar bekleyenler
- [ ] **Gönderim Geçmişi veri modeli:** mail içeriğinin saklanması, zamanlayıcı e-postaları, Cihaz Aksiyon Geçmişi ile birleştirme.
- [ ] **Test ortamı ve otomatik dağıtım:** canlı veriye erişmeden değişiklik deneme ve canlıya aktarım planı.
- [ ] **Grup/yetki sistemi** (İstanbul / Yurt İçi / Yurt Dışı): ayrım için TH `LBS Location Parent`, SCCM `EnvanterLocationParent` alanları kullanılabilir.
- [ ] **`main` dalına alma:** çalışma dalı `yedek-2026-10-21`, `main` ilk sürümde duruyor.
- [ ] **Hostname değişikliği kurgusu:** şimdilik mevcut sistem aynen kalacak, sunum sonrası tekrar ele alınacak (`hafiza-notlari/hostname-degisikligi-kurgu-beklemede.md`).
- [ ] **Cihaz Aksiyon Geçmişi / zimmet devri:** gerçek TH export'undaki "Son Güncelleme Tarihi" sütununun tam adı doğrulanacak (`hafiza-notlari/cihaz-aksiyon-gecmisi-plan.md`).

## Güvenlik bulguları (bkz. GUVENLIK-BILGILENDIRME.md, Bölüm 15)
- [ ] **BUL-01 (yüksek):** `newinstalls/sync-excel` ve `config/excel-path` keyfi yol kabul ediyor, yalnızca yönetici/master'a aç, klasörü ve `.xlsx` uzantısını sınırla.
- [ ] **BUL-02 (yüksek):** `setup-master` kimliksiz, yalnızca localhost'tan veya kurulum koduyla kabul et.
- [ ] **BUL-03 (yüksek):** login ve settings-login için deneme sınırı/kilit ekle.
- [ ] **BUL-04 (orta):** `/api/mail/send` alıcı ve gövdeyi sunucuda sınırla.
- [ ] **BUL-11 (orta):** `npm audit fix`, Electron/Express/Nodemailer güncelle.
- [ ] Bilgi Güvenliği ekibine göndermeden önce Bölüm 16'daki teyit sorularını yanıtla (render.yaml yayında mı? yönetici hesabı gerçek mi?).

## Verilen kararlar
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
