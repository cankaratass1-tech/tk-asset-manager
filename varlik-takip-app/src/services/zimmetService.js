// Zimmet Uyuşmazlığı artık sahte MOCK_ZIMMET verisi yerine gerçek SCCM envanter export'undan
// besleniyor (bkz. konuşma). mapSccmRow (sccmFileService.js) her satırı zaten owner/userLabel/
// matched/statusTag ile birlikte üretiyor — burada departman bazlı sahte "assigned"/"active"
// eşleştirmesi yok, doğrudan hazır satırlar üzerinde filtreleme/istatistik/zincir hesabı yapılıyor.
const NOT_A_PERSON = new Set(["—", "Tespit Edilemedi"]);
const isPerson = (name) => name && !NOT_A_PERSON.has(name);

// "Doğru" değil ama "Hatalı" da değil — karşılaştırma için gereken veri eksik/bulunamadı demek
// (KANIT DEĞİL). Zimmet rozetlerinin (TableView/RecordPopup/DetailAside/App.jsx Gönderim
// Geçmişi) hepsinde aynı nötr (gri) renkle gösterilsin diye tek yerden dışa aktarılıyor —
// dağınık kopyalar aynı listeyi ayrı ayrı tutunca biri unutulup diğeri güncellenirse tutarsızlık
// çıkar (bkz. konuşma — geçmişte mail.js/smtp.js'te yaşanan aynı sınıf hata).
export const ZIMMET_UNVERIFIED_TAGS = new Set([
  "Kullanım Kaydı Yok",
  "SCCM'de Bulunamadı",
  "Monitor Raporunda Bulunamadı",
  "Doğrulanamadı",
  // Madde 3 — SCCM'de var ama TH Excel'inde seri no yok: karşılaştırma yapılamıyor, "hatalı" değil.
  "TH Kaydı YOK",
  // Envanter kaydı yok + SCCM'de eski/tazeliği belirsiz bir kullanıcı görünüyor — son giriş çok
  // eskiyse (veya hiç yoksa) bu "kesin kullanım kanıtı" sayılmaz, cihaz depoya dönmüş olabilir
  // (bkz. konuşma — sccmFileService.js DEFAULT_STALE_DAYS eşiği).
  "Zimmetsiz Kullanım (Doğrulanamadı)",
]);
export const isZimmetUnverified = (statusTag) => ZIMMET_UNVERIFIED_TAGS.has(statusTag);

// company verilirse ("all" ya da boş hariç) sadece o İştirak koduna ait satırlar döner
export function getZimmetRows(sccmRows, { company } = {}) {
  if (!sccmRows) return [];
  if (!company || company === "all") return sccmRows;
  return sccmRows.filter((r) => r.company === company);
}

export function computeOverallZimmetStats(sccmRows) {
  const rows = sccmRows || [];
  let ok = 0, bad = 0, noRecord = 0, monitorIssueCount = 0;
  rows.forEach((r) => {
    // "Müdürlük Zimmeti (OBS)" — comparisonService.js (TH+Monitor Raporu yüklüyse) matched:true
    // döner ama statusTag "Zimmet Doğru" değildir; ok'a sayılmazsa istatistik yanlış "hatalı"
    // görünür (bkz. konuşma — monitör karşılaştırması bağlandığında ortaya çıkan yeni statusTag).
    if (r.statusTag === "Zimmet Doğru" || r.statusTag === "Müdürlük Zimmeti (OBS)") ok++;
    // Doğrulanamayan (kanıt olmayan) durumlar "hatalı" değil, ayrı bir "kayıt yok" kovasında —
    // bkz. konuşma: TH bazlı tasarımda bir cihaz SCCM'de/Monitor Raporu'nda henüz görünmüyor
    // olabilir, bu "yanlış kullanılıyor" anlamına gelmez.
    else if (isZimmetUnverified(r.statusTag)) noRecord++;
    else bad++; // "Zimmet Hatalı" + "Zimmetsiz Kullanım" + "... + Monitör Uyuşmazlığı"
    // Kişinin kendi zimmeti doğru olsa bile bağlı monitöründe kesin bir uyuşmazlık varsa bu ayrı
    // sayılır — dashboard'da "Zimmet Uyuşmazlığı" ile "Monitör Uyuşmazlığı" birbirine karışmasın
    // diye (bkz. konuşma: "dashboard'da ayrımı olacak mı").
    if (r.monitorIssue) monitorIssueCount++;
  });
  return { total: rows.length, ok, bad, noRecord, monitorIssueCount };
}

// Sadece KESİN uyuşmazlıkları döner — doğrulanamayan (isZimmetUnverified) kayıtlar hariç, aksi
// halde "En fazla uyuşmazlık bulunan lokasyon" gibi listeler binlerce "SCCM'de/Monitor'da
// bulunamadı" kaydıyla boğulur, gerçek sorunlu lokasyonlar görünmez olur (bkz. konuşma).
export function getAllMismatchRows(sccmRows) {
  return (sccmRows || []).filter((r) => !r.matched && !isZimmetUnverified(r.statusTag));
}

// Zimmetli/kullanan kişi ilişkilerini graf olarak ele alıp (union-find) birbirine
// bağlı kayıtları aynı zincire atar. Excel exportunda büyük zincirler öne sıralanır.
export function computeZimmetChains(sccmRows) {
  const rows = sccmRows || [];
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const ensure = (x) => {
    if (!parent.has(x)) parent.set(x, x);
  };

  rows.forEach((r) => {
    if (isPerson(r.owner)) ensure(r.owner);
    if (isPerson(r.userLabel)) ensure(r.userLabel);
    if (isPerson(r.owner) && isPerson(r.userLabel)) union(r.owner, r.userLabel);
  });

  const rootToRows = new Map();
  rows.forEach((r) => {
    const anchor = isPerson(r.owner) ? r.owner : isPerson(r.userLabel) ? r.userLabel : null;
    const root = anchor ? find(anchor) : `_tekil_${r.rowKey}`;
    if (!rootToRows.has(root)) rootToRows.set(root, []);
    rootToRows.get(root).push(r);
  });

  const components = Array.from(rootToRows.values()).sort((a, b) => b.length - a.length);
  const chainInfo = new Map(); // rowKey -> { chainId, chainSize }
  components.forEach((comp, idx) => {
    comp.forEach((r) => chainInfo.set(r.rowKey, { chainId: idx + 1, chainSize: comp.length }));
  });
  return chainInfo;
}
