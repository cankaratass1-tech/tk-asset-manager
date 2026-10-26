// "Örnek veriyle göster": üst yönetim ekranını gerçek geçmiş olmadan incelemek için bellekte üretilen ÖRNEK anlık kayıtlar.
// Gerçek veri değildir, backend'e yazılmaz, hiçbir gerçek rapora karışmaz; ekranda her zaman "ÖRNEK VERİ" etiketiyle gösterilir.
// Üretim deterministiktir (rastgele değil): aynı gün aynı sonucu verir; böylece inceleme ve test tekrarlanabilir.
export const DEMO_COMPANIES = ["TKAJ-AJET A.Ş.", "TKAO-MHY A.O."];
export const DEMO_TOTAL_DEVICES = 1200; // örnek modda güncel cihaz sayısı (şirket seçiliyse yarısı)
export const DEMO_WEEKS = 40; // 280 gün: üç aylık dönem ve önceki üç aylık dönem de karşılanır

// rapor → { N: başlangıç açık adedi, r: haftalık çözülen, n: haftalık yeni, drift: her 5 haftada bir ek çözülen (tempo artışı) }
const PLAN = {
  inaktif: { N: 214, r: 3, n: 1, boost: 1 },
  zimmet: { N: 120, r: 2, n: 3, boost: 0 },
  disk: { N: 64, r: 2, n: 1, boost: 1 },
  kullanilmayan: { N: 88, r: 1, n: 1, boost: 0 },
};

const companyOf = (key) => DEMO_COMPANIES[[...key].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 2];

// now: ms. Son kayıt "şimdi"dir, öncekiler haftalık geriye doğru.
export function buildDemoSnapshots(now = Date.now(), weeks = DEMO_WEEKS) {
  const day = 86400000;
  const out = {};
  Object.entries(PLAN).forEach(([rep, { N, r, n, boost }]) => {
    let cur = Array.from({ length: N }, (_, k) => `ornek-${rep}-${k}`);
    out[rep] = [];
    for (let w = 0; w < weeks; w++) {
      out[rep].push({
        capturedAt: new Date(now - (weeks - 1 - w) * 7 * day).toISOString(),
        deviceCount: cur.length,
        devices: cur.map((key) => ({ key, serial: key, hostname: key, company: companyOf(key) })),
      });
      const resolve = r + (boost && w % 5 === 4 ? boost : 0);
      cur = [...cur.slice(resolve), ...Array.from({ length: n }, (_, j) => `ornek-${rep}-n${w}-${j}`)];
    }
  });
  return out;
}
