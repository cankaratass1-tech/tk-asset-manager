// Zimmet Uyuşmazlığı artık sahte MOCK_ZIMMET verisi yerine gerçek SCCM envanter export'undan
// besleniyor. mapSccmRow (sccmFileService.js) her satırı zaten owner/userLabel/
// matched/statusTag ile birlikte üretiyor — burada departman bazlı sahte "assigned"/"active"
// eşleştirmesi yok, doğrudan hazır satırlar üzerinde filtreleme/istatistik/zincir hesabı yapılıyor.
const NOT_A_PERSON = new Set(["—", "Tespit Edilemedi"]);
const isPerson = (name) => name && !NOT_A_PERSON.has(name);

// "Doğru" değil ama "Hatalı" da değil — karşılaştırma için gereken veri eksik/bulunamadı demek
// (KANIT DEĞİL). Zimmet rozetlerinin (TableView/RecordPopup/DetailAside/App.jsx Gönderim
// Geçmişi) hepsinde aynı nötr (gri) renkle gösterilsin diye tek yerden dışa aktarılıyor —
// dağınık kopyalar aynı listeyi ayrı ayrı tutunca biri unutulup diğeri güncellenirse tutarsızlık
// çıkar.
export const ZIMMET_UNVERIFIED_TAGS = new Set([
  "Kullanım Kaydı Yok",
  "SCCM'de Bulunamadı",
  "Monitör Raporu'nda Bulunamadı",
  "Doğrulanamadı",
  // Madde 3 — SCCM'de var ama TH Excel'inde seri no yok: karşılaştırma yapılamıyor, "hatalı" değil.
  "TH Kaydı YOK",
  // Envanter kaydı yok + SCCM'de eski/tazeliği belirsiz bir kullanıcı görünüyor — son giriş çok
  // eskiyse (veya hiç yoksa) bu "kesin kullanım kanıtı" sayılmaz, cihaz depoya dönmüş olabilir
  //.
  "Zimmetsiz Kullanım (Doğrulanamadı)",
]);
export const isZimmetUnverified = (statusTag) => ZIMMET_UNVERIFIED_TAGS.has(statusTag);

// company verilirse ("all" ya da boş hariç) sadece o İştirak koduna ait satırlar döner
export function getZimmetRows(sccmRows, { company } = {}) {
  if (!sccmRows) return [];
  if (!company || company === "all") return sccmRows;
  return sccmRows.filter((r) => r.company === company);
}

// Zimmet satırının TEK ve birbirini dışlayan kovası — dashboard, liste sayaçları ve segmentler hep bunu kullanır:
//   obs        : Müdürlük (OBS) zimmeti — kişiye zimmetli değil, hatalı sayılmaz, ayrı sayılır
//   ok         : Zimmet Doğru (kişi zimmeti)
//   unverified : doğrulanamadı (SCCM'de/TH'de/Monitör Raporu'nda kayıt yok vb.) — KANIT DEĞİL, hatalı değil
//   bad        : kesin uyuşmazlık (Zimmet Hatalı, Zimmetsiz Kullanım, Birden Fazla Zimmet, ... + Monitör Uyuşmazlığı)
// Her satır tam olarak BİR kovaya girer: toplam = obs + ok + unverified + bad.
export function zimmetBucket(r) {
  if (r.assignmentType === "OBS") return "obs";
  if (r.matched) return "ok";
  if (isZimmetUnverified(r.statusTag)) return "unverified";
  return "bad";
}

export function computeOverallZimmetStats(sccmRows) {
  // Zimmet sayımı kişi (User) zimmetleri üzerinden yapılır: depodaki (Warehouse) cihazlar toplama/hatalıya girmez — Ana Sayfa, sol panel ve liste aynı sayıyı verir
  const rows = (sccmRows || []).filter((r) => r.assignmentType !== "Warehouse");
  const out = { total: rows.length, ok: 0, bad: 0, noRecord: 0, obs: 0, monitorIssueCount: 0 };
  rows.forEach((r) => {
    const b = zimmetBucket(r);
    if (b === "obs") out.obs++;
    else if (b === "ok") out.ok++;
    else if (b === "unverified") out.noRecord++;
    else out.bad++;
    // Kişinin kendi zimmeti doğru olsa bile bağlı monitöründe kesin bir uyuşmazlık varsa bu ayrı
    // sayılır — dashboard'da "Zimmet Uyuşmazlığı" ile "Monitör Uyuşmazlığı" birbirine karışmasın diye.
    if (r.monitorIssue) out.monitorIssueCount++;
  });
  return out;
}

// Sadece KESİN uyuşmazlıkları döner — doğrulanamayan (isZimmetUnverified) kayıtlar hariç, aksi
// halde "En fazla uyuşmazlık bulunan lokasyon" gibi listeler binlerce "SCCM'de/Monitor'da
// bulunamadı" kaydıyla boğulur, gerçek sorunlu lokasyonlar görünmez olur.
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
