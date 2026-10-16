// Cihaz Aksiyon Geçmişi — snapshot geçmişinden TÜRETİLEN olaylar (kaydedilmez, sadece açılan cihaz için hesaplanır; böylece
// eskiden olduğu gibi her yenilemede gürültülü kayıt üretmez). Girdi: backend GET /snapshots/device/:key çıktısı
//   { [reportId]: [ { capturedAt, present, owner, location }, ... ] }
// Üretilen olaylar:
//   "Rapora girdi" / "Rapordan çıktı"  : cihazın bir raporda görünürlüğü değiştiğinde (ilk kayıtlı tespit ayrıca etiketlenir)
//   "Zimmet Devri"                     : ardışık iki snapshot'ta sahip değiştiyse (kimden → kime). Tarih: TuruncuHat'ın kendi
//                                        "Son Güncelleme Tarihi" iki snapshot arasındaysa o (kaynak tarih), değilse snapshot tarihi
//                                        ("fark edildiği tarih" — gerçek devir anı DEĞİL; açıkça etiketlenir).
// Sınır: snapshot'lar yalnız PROBLEMLİ cihazları içerir; cihaz sorunsuzken sahip değişimi snapshot'larda görünmez.

const t = (v) => {
  const n = Date.parse(v);
  return Number.isNaN(n) ? null : n;
};

export function deriveHistoryEvents(timeline, { ownerUpdatedAt = "", reportLabel = (id) => id } = {}) {
  const events = [];
  const transfers = new Map(); // "önce→sonra" -> olay (aynı devir birden çok raporda görünse tek olay)
  const upd = t(ownerUpdatedAt);

  Object.entries(timeline || {}).forEach(([reportId, list]) => {
    const snaps = [...(list || [])].filter((s) => t(s.capturedAt) != null).sort((a, b) => t(a.capturedAt) - t(b.capturedAt));
    let prev = null;
    let lastOwnerSnap = null; // sahibi bilinen son "present" snapshot
    snaps.forEach((s, i) => {
      if (s.present && (i === 0 || !prev?.present)) {
        events.push({
          ts: s.capturedAt, type: i === 0 ? "İlk Kayıtlı Tespit" : "Rapora Girdi", reportId,
          description: i === 0 ? `${reportLabel(reportId)} raporunda ilk kayıtlı tespit (öncesi bilinmiyor)` : `${reportLabel(reportId)} raporuna girdi`,
          source: "snapshot",
        });
      }
      if (!s.present && prev?.present) {
        events.push({ ts: s.capturedAt, type: "Rapordan Çıktı", reportId, description: `${reportLabel(reportId)} raporundan çıktı (sorun çözüldü / kapsam dışı kaldı)`, source: "snapshot" });
      }
      if (s.present && s.owner) {
        if (lastOwnerSnap && lastOwnerSnap.owner !== s.owner) {
          const from = lastOwnerSnap.owner, to = s.owner;
          const lo = t(lastOwnerSnap.capturedAt), hi = t(s.capturedAt);
          const exact = upd != null && upd > lo && upd <= hi;
          const key = `${from}→${to}`;
          if (!transfers.has(key)) {
            transfers.set(key, {
              ts: exact ? new Date(upd).toISOString() : s.capturedAt, type: "Zimmet Devri", reportId,
              description: `Zimmet ${from} → ${to}${exact ? " (TuruncuHat son güncelleme tarihi)" : " (fark edildiği tarih — gerçek devir tarihi bilinmiyor)"}`,
              source: "snapshot",
            });
          }
        }
        lastOwnerSnap = s;
      }
      prev = s;
    });
  });
  return [...events, ...transfers.values()];
}

// Kaynağın (TuruncuHat) kendi güncelleme tarihi: "zimmet kaydı en son şu tarihte güncellendi"
export function sourceUpdateEvent({ ownerUpdatedAt, owner }) {
  if (!ownerUpdatedAt || Number.isNaN(Date.parse(ownerUpdatedAt))) return null;
  return {
    ts: new Date(ownerUpdatedAt).toISOString(), type: "Zimmet Kaydı Güncellendi",
    description: `TuruncuHat'ta zimmet kaydı bu tarihte güncellendi${owner ? ` (güncel zimmetli: ${owner})` : ""}`,
    source: "TuruncuHat",
  };
}

export const HISTORY_CATEGORIES = [
  ["all", "Tümü"],
  ["mail", "Mail"],
  ["zimmet", "Zimmet"],
  ["rapor", "Rapor"],
  ["not", "Not / Durum"],
];

export function categoryOf(type) {
  const s = String(type || "");
  if (/mail/i.test(s)) return "mail";
  if (/zimmet/i.test(s)) return "zimmet";
  if (/rapor|tespit/i.test(s)) return "rapor";
  return "not";
}

export const CATEGORY_ICON = { mail: "✉️", zimmet: "🔁", rapor: "📋", not: "📝" };
