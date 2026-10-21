---
name: sirket-filtresi-kritik-not
description: "Sol menü şirket filtresi tüm raporlara bağlandı — ileride geri alınabilir, kritik not"
metadata:
  node_type: memory
  type: project
  originSessionId: 8c8ef8d3-b576-47b2-b2b7-ebb8b3e77424
  modified: 2026-10-15T14:13:09.200Z
---

Sol menüdeki şirket seçimi (AJET/TKAO) artık Zimmet, Lokasyon IP, BSOD, Battery, Atıl Monitör ekranlarına ve Ana Sayfa kartlarına da uygulanıyor (önceden sadece İnaktif/Kullanılmayan'a uygulanıyordu, diğerleri sessizce yok sayıyordu).

**Why:** Kullanıcı "1'i yap, filtreyi bağla ama bunu kritik not olarak ekle ileride geri alabiliriz" dedi; seçenek 2 (ekranlarda "filtre uygulanmaz" notu göstermek) alternatifti. Disk Alanı dosyasında şirket bilgisi olmadığı için orada uygulanamıyor.

**How to apply:** Kodda `[ŞİRKET-FİLTRESİ]` etiketi, repo kökünde `KRITIK-NOTLAR.md` (geri alma adımları dahil), `npm run test:company`. Kullanıcı "şirket filtresini geri al" derse önce KRITIK-NOTLAR.md'ye bak. Şirket filtresiyle ilgili bir ekran/sayı sorusunda bu bilinçli değişikliği hesaba kat. Disk ve snapshot/mail hesapları bilerek filtresiz. [[cihaz-aksiyon-gecmisi-plan]]

**GÜNCEL (21.10.2026):** Yukarıdaki "Disk filtresiz" bilgisi eskidi. Disk Alanı artık hostname → SCCM şirketi eşlemesiyle, SCCM Ajan "İştirak" ile, Yeni Kurulum ve Kapatma Onayı kişi (TuruncuHat) / lokasyon üzerinden şirkete göre ayrışıyor; Gönderim Geçmişi kayıtları `company` alanı taşıyor. Detay: `DEVAM-NOTLARI.md`.
