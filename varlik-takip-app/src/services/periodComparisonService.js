// Dönemsel çözüm/müdahale analizi (madde 2, 13). İki snapshot arasında CİHAZ eşleştirmesi yaparak
// — yalnızca toplam sayı farkından DEĞİL — şu 3 kümeyi çıkarır:
//   Devam Eden   = önceki dönemde VAR  & sonraki dönemde VAR   (prev ∩ curr)
//   Çözülen      = önceki dönemde VAR  & sonraki dönemde YOK   (prev − curr)  → iyileşme
//   Yeni Tespit  = önceki dönemde YOK  & sonraki dönemde VAR   (curr − prev)
// Çözüm Oranı % = Çözülen / (Devam Eden + Çözülen)   (önceki dönemdeki problemli cihazların
// yüzde kaçı listeden çıktı — yanıltıcı "toplam fark" değil).
//
// Cihaz anahtarı: snapshot yazılırken belirlenen `key` (seri no öncelikli, yoksa hostname).

const norm = (v) => String(v || "").trim().toLowerCase();

// snapshot.devices → key -> device map
function indexByKey(snapshot) {
  const m = new Map();
  (snapshot?.devices || []).forEach((d) => {
    const k = norm(d.key || d.serial || d.hostname);
    if (k) m.set(k, d);
  });
  return m;
}

// prev/curr: birer snapshot objesi. filterFn: (device) => boolean — lokasyon/şirket kapsamı için.
export function comparePeriods(prev, curr, filterFn = () => true) {
  const prevMap = indexByKey(prev);
  const currMap = indexByKey(curr);

  const devamEden = [];
  const cozulen = [];
  const yeniTespit = [];

  prevMap.forEach((d, k) => {
    if (!filterFn(d)) return;
    if (currMap.has(k)) devamEden.push(currMap.get(k) || d);
    else cozulen.push(d);
  });
  currMap.forEach((d, k) => {
    if (!filterFn(d)) return;
    if (!prevMap.has(k)) yeniTespit.push(d);
  });

  const toplamTespit = devamEden.length + yeniTespit.length; // sonraki dönemdeki problemli cihaz
  const cozumTabani = devamEden.length + cozulen.length; // önceki dönemin problemli cihaz sayısı
  const cozumOrani = cozumTabani > 0 ? Math.round((cozulen.length / cozumTabani) * 100) : 0;

  return {
    devamEden,
    cozulen,
    yeniTespit,
    counts: {
      toplamTespit,
      devamEden: devamEden.length,
      cozulen: cozulen.length,
      yeniTespit: yeniTespit.length,
      cozumOrani,
      oncekiToplam: cozumTabani,
    },
  };
}

// Lokasyon (veya üst lokasyon) bazında çözüm oranı kırılımı.
export function locationSolutionBreakdown(prev, curr, { field = "location", filterFn = () => true } = {}) {
  const prevMap = indexByKey(prev);
  const currMap = indexByKey(curr);
  const rows = new Map(); // loc -> { devam, cozulen, yeni }

  const bump = (loc, kind) => {
    const key = loc || "—";
    if (!rows.has(key)) rows.set(key, { devam: 0, cozulen: 0, yeni: 0 });
    rows.get(key)[kind] += 1;
  };

  prevMap.forEach((d, k) => {
    if (!filterFn(d)) return;
    if (currMap.has(k)) bump((currMap.get(k) || d)[field], "devam");
    else bump(d[field], "cozulen");
  });
  currMap.forEach((d, k) => {
    if (!filterFn(d)) return;
    if (!prevMap.has(k)) bump(d[field], "yeni");
  });

  return Array.from(rows.entries())
    .map(([loc, c]) => {
      const taban = c.devam + c.cozulen;
      return {
        location: loc,
        devamEden: c.devam,
        cozulen: c.cozulen,
        yeniTespit: c.yeni,
        toplamTespit: c.devam + c.yeni,
        cozumOrani: taban > 0 ? Math.round((c.cozulen / taban) * 100) : 0,
      };
    })
    .sort((a, b) => a.cozumOrani - b.cozumOrani || b.toplamTespit - a.toplamTespit);
}

// Snapshot listesini dönemlere (aylık/haftalık) gruplar — her dönemin SON snapshot'ını temsilci alır.
// Az veri olduğunda (ör. günde birkaç yükleme) aylık kırılım tek noktaya düşebilir; o yüzden
// varsayılan olarak "her snapshot bir dönem" (raw) da desteklenir.
export function groupSnapshotsByPeriod(snapshots, mode = "month") {
  const sorted = [...(snapshots || [])].sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
  if (mode === "raw") return sorted.map((s) => ({ label: shortDate(s.capturedAt), snapshot: s }));

  const buckets = new Map();
  sorted.forEach((s) => {
    const d = new Date(s.capturedAt);
    if (Number.isNaN(d.getTime())) return;
    let label;
    if (mode === "week") {
      const onejan = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
      label = `${d.getFullYear()} H${String(week).padStart(2, "0")}`;
    } else {
      label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    buckets.set(label, s); // aynı dönemde birden çok snapshot varsa sonuncusu kalır
  });
  return Array.from(buckets.entries()).map(([label, snapshot]) => ({ label, snapshot }));
}

function shortDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso || "") : d.toLocaleDateString("tr-TR");
}

// Ardışık dönemler için trend serisi: her dönem için (prev→curr) çözüm oranı + toplam tespit.
export function periodTrendSeries(periods, filterFn = () => true) {
  const out = [];
  for (let i = 1; i < periods.length; i++) {
    const { counts } = comparePeriods(periods[i - 1].snapshot, periods[i].snapshot, filterFn);
    out.push({ label: periods[i].label, ...counts });
  }
  return out;
}

// TEK kanonik "son dönem özeti" hesaplaması — Dashboard'daki mini rapor-durumu kartları VE her
// rapor sayfasının üst kısmındaki özet AYNI fonksiyonu çağırır (bkz. konuşma: "haftalık/aylık
// filtrelenebilecek şekilde yapman lazım ve bütün raporlarda gözükmeli"). groupSnapshotsByPeriod
// ile AYNI dönem mantığını kullanır (ManagementKpiPanel'in "Aylık/Haftalık" filtresiyle birebir
// tutarlı) — başka hiçbir yerde ayrı bir "son dönem" hesabı YAPILMAMALI, hepsi buradan geçmeli.
//   bekleyen (devamEden) = önceki dönemde de sorunluydu, hâlâ sorunlu
//   çözülen              = önceki dönemde sorunluydu, bu dönem listede yok
//   yeni gelen            = önceki dönemde yoktu, bu dönem sorunlu listede
// Yetersiz veri (2 dönemden az) durumunda null döner — çağıran taraf "veri bekleniyor" gösterir,
// uygulama hata vermez (madde 14).
export function latestPeriodSummary(snapshots, mode = "week", filterFn = () => true) {
  const periods = groupSnapshotsByPeriod(snapshots, mode);
  if (periods.length < 2) return null;
  const prevP = periods[periods.length - 2];
  const currP = periods[periods.length - 1];
  const { counts } = comparePeriods(prevP.snapshot, currP.snapshot, filterFn);
  return { ...counts, periodLabel: currP.label, prevLabel: prevP.label };
}
