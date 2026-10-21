// Yeni Kurulum / Kapatma Onayı kayıtları şirket bilgisi taşımaz. Şirket sırasıyla şuradan bulunur:
//  1) "Kullanıcı Bilgisi" (kişi adı) → TuruncuHat'taki cihaz sahibinin "Sahibi Firma" değeri,
//  2) olmadı → kaydın lokasyonu → SCCM envanterinde o lokasyondaki cihazların çoğunluk şirketi ("İştirak").
// Bulunamazsa "" döner (kayıt yalnız "Tüm Şirketler"de görünür) — şirket uydurulmaz.
const key = (v) => String(v ?? "").trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");

export function buildRecordCompanyResolver({ thRows = [], sccmRows = [] } = {}) {
  const byUser = new Map();
  thRows.forEach((t) => {
    if (!t.company) return;
    [t.owner, t.ownerFull ? String(t.ownerFull).split(" (")[0] : ""].forEach((n) => {
      const k = key(n);
      if (k && k !== "—" && !byUser.has(k)) byUser.set(k, t.company);
    });
  });
  const counts = new Map(); // lokasyon → { şirket: adet }
  sccmRows.forEach((s) => {
    const loc = key(s.location);
    if (!loc || loc === "—" || !s.company) return;
    if (!counts.has(loc)) counts.set(loc, new Map());
    const m = counts.get(loc);
    m.set(s.company, (m.get(s.company) || 0) + 1);
  });
  const byLocation = new Map();
  counts.forEach((m, loc) => byLocation.set(loc, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]));
  return (rec) => byUser.get(key(rec && rec.userInfo)) || byLocation.get(key(rec && rec.location)) || "";
}
