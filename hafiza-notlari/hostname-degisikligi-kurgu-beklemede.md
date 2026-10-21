---
name: hostname-degisikligi-kurgu-beklemede
description: "Hostname değişince/yeniden kurulumda sorunların \"çözüldü\" sayılması kurgusu — kullanıcı kararı: şimdilik mevcut sistem aynen kalsın"
metadata:
  node_type: memory
  type: project
  originSessionId: 8c8ef8d3-b576-47b2-b2b7-ebb8b3e77424
  modified: 2026-10-16T15:01:43.571Z
---

Hostname değişikliği / cihaz yeniden kurulumu kurgusu üzerinde konuşuldu, **karar: şimdilik hiçbir şey değişmeyecek** (2026-10-16). Kullanıcı süreçten emin değil, ileride tekrar ele alacak.

Bilinen durum: Zimmet/İnaktif/Kullanılmayan seri no ile tanınıyor (hostname değişince sorun yok); Disk, Pil, BSOD, Lakeside CPU/RAM, Bottleneck hostname ile bağlanıyor (hostname değişince disk "çözüldü + yeni tespit" gibi görünür, pil/BSOD kartta "Veri Yok" olur — senaryo testinde doğrulandı).

Konuşulan seçenekler: A) hiçbir şey yapma, B) disk anlık kayıtlarını SCCM üzerinden seri no'ya bağla + kartta uyarı, C) tam kurgu (takma ad kaydı, eski adla gelen veriyi bağlama, "devam eden/yeniden adlandırıldı" sayımı, geçmişte "Hostname Değişti"). Ara öneri: davranışı değiştirmeden sessizce ölçüm (seri aynı/hostname değişti, hostname aynı/seri değişti, kayboldu/yeni).

**Why:** Yeniden kurulum aynı adla, farklı adla, geçici `MININT-` adıyla veya donanım değişimiyle olabilir; yazılım sorunları (BSOD, disk) yeniden kurulumla gerçekten çözülür ama donanım sorunları (pil, yaş) çözülmez — "çözüldü" kararı sorun türüne de bağlı.

**How to apply:** Kullanıcı açıkça istemeden hostname/kimlik kurgusunu değiştirme. Konu açılırsa bu seçenekleri ve senaryo tablosunu (aynı seri/farklı ad, yeni seri/aynı ad, ad takası, VM klonu) yeniden sun. Demo veride aylık klasörler (2026-07/08/09) eski sentetik dünya, güncel veriyle ortak cihaz yok — hostname değişim sıklığı ölçülemedi; gerçek ortamda iki tarihli SCCM dosyasıyla sayılabilir. İlgili: [[cihaz-aksiyon-gecmisi-plan]].
