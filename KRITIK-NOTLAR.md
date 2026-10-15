# KRİTİK NOTLAR

Bu dosya, ileride geri alınması / yeniden değerlendirilmesi gerekebilecek **bilinçli davranış değişikliklerini** listeler.

---

## 1) ŞİRKET FİLTRESİ artık tüm raporlara uygulanıyor  `[ŞİRKET-FİLTRESİ]`

**Ne değişti:** Sol menüdeki şirket seçimi (Tüm Şirketler / AJET / TKAO) önceden yalnızca **İnaktif Cihazlar** ve **Kullanılmayan Cihazlar** ekranlarına ve Ana Sayfa'nın "inaktif" kartına uygulanıyordu. Diğer ekranlar seçimi **sessizce yok sayıyordu** (AJET seçili görünürken tüm şirketlerin verisi geliyordu).

Şimdi uygulanan yerler:

| Yer | Şirket bilgisi nereden |
|---|---|
| Zimmet Uyuşmazlığı | satırdaki `company` (SCCM "İştirak" / TH "Sahibi Firma") |
| Lokasyon Hostname ve IP | SCCM satırının `company`'si |
| BSOD, Battery Health | hostname ile eşleşen SCCM satırının `İştirak`'ı (SCCM'de eşleşmeyen cihazın şirketi belirsiz → hiçbir şirkete girmez) |
| Atıl Monitörler | TuruncuHat "Sahibi Firma" |
| Ana Sayfa kartları / Genel Durum | seçili şirkete göre: Toplam Cihaz, İnaktif, Zimmet, Kullanılmayan, Açık Bulgu |
| Sol menü sayıları | açık raporun kendi satırlarından (Ana Sayfa'da İnaktif tabanlı) |

**Bilinçli sınırlar:**
- **Disk Alanı:** dosyada şirket bilgisi yok. Ekranda filtre uygulanmaz; sol menüde sayılar "—" görünür. Ana Sayfa'da şirket seçiliyken disk kartı "—", disk paneli gizli ve **disk sayıları Açık Bulgu / Temiz Cihaz hesabına dahil edilmez** (açıklama notu ekranda).
- **Trend / çözüm oranı / dönemsel Açık Bulgu (Genel Durum) ve Çözüm / Müdahale İstatistikleri paneli** da şirkete göre hesaplanır: snapshot'lardaki cihazların `company` alanı (ham şirket adı, örn. "TKAJ-AJET A.Ş.") süzülür. Disk Alanı snapshot'larında şirket bilgisi olmadığı için şirket seçiliyken Genel Durum'a dahil edilmez, Çözüm/Müdahale panelinde "şirket bazında ayrılamaz" yazar. (`dashboardOverviewService.combinedPeriodSummary` `{ company }`, `ManagementKpiPanel` `company` prop'u.)
- Snapshot kaydı, mail gönderimi ve kişi bazlı birleşik mail hesabı **her zaman filtresizdir** (`zimmetRows` doğrudan kullanılır). Filtre sadece ekranda gösterilen satırlara ve dashboard sayılarına uygulanır.

**Nasıl bulunur:** kodda `[ŞİRKET-FİLTRESİ]` etiketi (App.jsx: `byCompany`, `rawRows`, `enrichWithSccm`, sol menü `countSource`, dashboard `dc` / `diskScoped`; OverviewPanel.jsx: `company`; dashboardOverviewService.js: `combinedPeriodSummary`; ManagementKpiPanel.jsx: `company` prop'u). Ayrı bir iyileştirme olarak Yeni Kurulum ekranında başarılı gönderimden sonra seçim temizlenir (şirket filtresiyle ilgisi yok, geri alınmasına gerek yok). Commit mesajında da aynı etiket geçer:

```bash
git log --grep="ŞİRKET-FİLTRESİ"
```

**Nasıl geri alınır:**
1. Tüm değişiklik tek commit'teyse: `git revert <commit-hash>`.
2. Elle: `byCompany(...)` çağrılarını kaldırıp ham dizileri (`zimmetRows`, `lokasyonIpRows`, `bsodRows`, `batteryRows`, `realThAll`) geri koyun; `rawRows` ve Atıl Monitör `thRows` prop'u eski haline; sol menü `countSource`'u `activeReport === "disk" ? realDiskAll : realInaktifAll`; dashboard'da `dc`/`diskScoped`/`zimmetScoped` kullanımlarını kaldırın; `OverviewPanel` ve `ManagementKpiPanel`'e `company` geçmeyin (servis/panel `company` parametresi varsayılan "all" olduğu için kendiliğinden eski davranışa döner).
3. `e2e/companycheck.mjs` (`npm run test:company`) eski davranışı doğrulamaz — geri alırsanız bu testi de kaldırın ya da eski davranışa göre güncelleyin.

**Doğrulama:** `npm run test:company` (65 kontrol; Çözüm/Müdahale paneli için bilinen sonuçlu yapay snapshot'lar kullanır), `npm run test:unit` (`dashboardOverviewService.test.js`).
