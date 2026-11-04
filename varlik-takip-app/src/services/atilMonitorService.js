// "Atıl Monitörler" raporu — TuruncuHat'ta zimmetli görünen monitörlerin gerçek kullanım durumu.
// Saf fonksiyonlar (backend/React yok). Bu raporda bilgisayarla ilgilenilmez: yalnızca monitörün kendisi
// (TuruncuHat kaydı + Monitor Raporu'ndaki satırı) değerlendirilir.
//
// Kaynaklar ve eşleştirme:
//   - TuruncuHat (TH) monitör satırı: "Model" = MONITOR  (thFileService.mapThRow -> deviceType)
//   - Monitor Raporu (Attached Monitors Report, SCCM): monitörün şu an kullanıldığını gösteren kayıt ve
//     monitörü kullanan kişi (Username). TH.serial <-> Monitor Raporu.monitorSerial
//     (comparisonService.js ile aynı anahtar)
//
// Kapsam (kullanıcı kararı): SADECE Konum Kategorisi "User" ve "OBS" olan monitörler değerlendirilir;
// Warehouse (ve Site/Supplier/boş) kapsam dışıdır.
//
// Her kapsamdaki monitör üç gruptan birine girer:
//   ATIL    — Monitor Raporu'nda hiç satırı yok (ya da yalnızca sanal makinede görünüyor): kullanılmıyor
//   BİLGİ DIŞI KULLANIM — Raporda var ve zimmetli kişi dışında biri kullanıyor (iki kullanıcı adı da var ve
//             farklı). Yalnızca "User" zimmetler için: OBS (müdürlük) monitörünü herkes kullanabilir.
//   AKTİF   — Raporda var ve sorun yok
// Ek grup (kapsam dışı depo monitörleri için):
//   DEPODA GÖRÜNEN AMA KULLANILAN — TuruncuHat'ta "Zimmet Depoda" görünüyor (Warehouse ya da durum alanında
//             "Zimmet Depoda") ama Monitor Raporu'nda satırı var, yani kullanılıyor. Depoda olup raporda
//             olmayan monitörler normaldir, listelenmez.
// Raporun amacı: ATIL monitörleri, BİLGİ DIŞI kullanılanları ve DEPODA görünüp KULLANILANLARI bulmaktır.
import { isZimmetDepoda } from "./thDepotSccmService.js";

export const RELEVANT_ASSIGNMENT_TYPES = new Set(["user"]);
// OBS (müdürlük) ve Site (saha) monitörleri bu raporda hiç gösterilmez (yanlış anlaşılmasın diye): hiçbir gruba/sayıya girmez.
const HIDDEN_ASSIGNMENT_TYPES = new Set(["obs", "site"]);

export const REASON_NOT_ATTACHED = "Monitör raporunda görünmüyor — kullanılmıyor";
export const REASON_ACTIVE = "Aktif — raporda görünüyor ve kullanılıyor";
export const REASON_DEPOT_USED = "Zimmet Depoda görünüyor ama kullanılıyor";
export const REASON_DEPOT_IDLE = "Zimmet Depoda — depoda duruyor, kullanılmıyor (normal)";
export const REASON_USED_BY_OTHER = "Bilgi dışı kullanım — zimmetli kişi dışında biri kullanıyor";

const normKey = (v) => String(v ?? "").trim().toLowerCase();
const isVirtual = (m) => ["true", "1", "yes", "evet"].includes(normKey(m.virtualMachine));

function buildRow(th, attachments, reason, { depot = false } = {}) {
  // Monitor Raporu'ndaki Username = monitörü kullanan kişi
  const usedBy = Array.from(new Set(attachments.map((a) => String(a.username ?? "").trim()).filter(Boolean)));
  const usedByKeys = usedBy.map(normKey);
  const ownerUserKey = normKey(th.ownerUsername);
  // Yedek: TuruncuHat'ta kullanıcı adı yoksa ("Turuncuhat v2") zimmet sahibi ile monitörü kullanan, e-postanın @ öncesiyle karşılaştırılır
  // (alan adı farkı — thy.com / thyspor.com — yok sayılır). Kullanıcı adı karşılaştırılabiliyorsa o esas alınır.
  const mailLocal = (v) => normKey(v).split("@")[0];
  const ownerMailKey = mailLocal(th.ownerMail);
  const usedByMailKeys = attachments.map((a) => mailLocal(a.mail)).filter(Boolean);
  // Sicil: Monitör Raporu'nda Username bazı hesaplarda sicil numarasıdır (yalnız rakam); zimmet sahibinin siciliyle karşılaştırılır (baştaki sıfırlar yok sayılır)
  const sicilKey = (v) => { const s = String(v ?? "").trim(); return /^\d+$/.test(s) ? s.replace(/^0+/, "") : ""; };
  const ownerSicilKey = sicilKey(th.ownerSicil);
  const usedBySicilKeys = usedBy.map(sicilKey).filter(Boolean);
  const byUsername = Boolean(ownerUserKey) && usedByKeys.length > 0;
  const mailComparable = Boolean(ownerMailKey) && usedByMailKeys.length > 0;
  const sicilComparable = Boolean(ownerSicilKey) && usedBySicilKeys.length > 0;
  const sameByMail = mailComparable && usedByMailKeys.includes(ownerMailKey);
  const sameBySicil = sicilComparable && usedBySicilKeys.includes(ownerSicilKey);
  const differentPerson = byUsername
    ? !usedByKeys.includes(ownerUserKey)
    : (mailComparable || sicilComparable) && !sameByMail && !sameBySicil;
  return {
    rowKey: `atil-monitor|${th.serial}`,
    monitorSerial: th.serial,
    model: th.model || "",
    // mail tablosu alanları (Zimmet Uyuşmazlığı mailiyle aynı sütunlar): Barkod / Marka / Varlık Adı +
    // Monitor Raporu'ndaki hostname (monitörün bağlı göründüğü cihaz adı, yalnızca bilgi amaçlı)
    barkod: th.barkod || "",
    marka: th.marka || "",
    asset: th.asset || th.model || "",
    hostnames: Array.from(new Set(attachments.map((a) => String(a.hostname ?? "").trim()).filter(Boolean))).join(", "),
    assignmentType: th.assignmentType,
    owner: th.owner || "—",
    ownerFull: th.ownerFull || th.owner || "",
    ownerUsername: th.ownerUsername || "",
    // aynı kişiye ait monitörleri gruplamak için (kullanıcı adı > sicil > isim — comparisonService ile aynı sıra)
    ownerKey: normKey(th.ownerUsername) || normKey(th.ownerSicil) || normKey(th.owner),
    company: th.company || "",
    location: th.location || "—",
    usedBy: usedBy.length ? usedBy.join(", ") : "—",
    usedByKeys,
    // zimmetli kişi dışında biri kullanıyor (kanıt: iki kullanıcı adı da var ve farklı); OBS'de aranmaz
    depot,
    usedByOther: !depot && normKey(th.assignmentType) === "user" && differentPerson,
    reason,
  };
}

export function computeAtilMonitorRows({ thRows = [], monitorRows = [] } = {}) {
  // monitör seri no -> gerçek (sanal olmayan) satırlar
  const attachBySerial = new Map();
  monitorRows.forEach((m) => {
    const k = normKey(m.monitorSerial);
    if (!k || isVirtual(m)) return;
    if (!attachBySerial.has(k)) attachBySerial.set(k, []);
    attachBySerial.get(k).push(m);
  });

  // TuruncuHat'ta "İşlemdeki Malzeme Emri" (ATO emri) olan monitörlerde işlem zaten yapılmıştır; hiçbir gruba (atıl / bilgi dışı / aktif / depo) alınmaz.
  const hasMaterialOrder = (r) => { const v = String(r.materialOrder ?? "").trim(); return v !== "" && v !== "-"; };
  const thMonitors = thRows.filter((r) => normKey(r.deviceType) === "monitor" && !HIDDEN_ASSIGNMENT_TYPES.has(normKey(r.assignmentType)));
  const inProcess = thMonitors.filter(hasMaterialOrder);
  const allMonitors = thMonitors.filter((r) => !hasMaterialOrder(r) && !HIDDEN_ASSIGNMENT_TYPES.has(normKey(r.assignmentType)));
  const inScope = allMonitors.filter((r) => RELEVANT_ASSIGNMENT_TYPES.has(normKey(r.assignmentType)));

  // atil: raporda yok; outside: bilgi dışı kullanım; active: sorunsuz; depotUsed: depoda görünüp kullanılan
  // Bilgi listeleri: excludedScope = User/OBS dışındaki tüm monitörler, depotAll = depoda görünen tümü, all = tüm TuruncuHat monitörleri
  const stages = { inScope: [], active: [], outside: [], atil: [], depotUsed: [], depotAll: [], excludedScope: [], all: [] };

  inScope.forEach((th) => {
    const attachments = attachBySerial.get(normKey(th.serial)) || [];
    if (attachments.length === 0) {
      const row = buildRow(th, [], REASON_NOT_ATTACHED);
      stages.inScope.push(row);
      stages.atil.push(row);
      return;
    }
    const base = buildRow(th, attachments, "");
    const row = { ...base, reason: base.usedByOther ? REASON_USED_BY_OTHER : REASON_ACTIVE };
    stages.inScope.push(row);
    (base.usedByOther ? stages.outside : stages.active).push(row);
  });

  // Kapsam dışı (User/OBS olmayan) monitörler. Bunlardan TuruncuHat'ta "Zimmet Depoda" görünenler depodadır:
  // Monitor Raporu'nda satırı varsa kullanılıyor (listelenir), yoksa depoda duruyordur (normal).
  allMonitors
    .filter((r) => !RELEVANT_ASSIGNMENT_TYPES.has(normKey(r.assignmentType)))
    .forEach((th) => {
      const attachments = attachBySerial.get(normKey(th.serial)) || [];
      const isDepot = isZimmetDepoda(th);
      const used = attachments.length > 0;
      const reason = isDepot ? (used ? REASON_DEPOT_USED : REASON_DEPOT_IDLE) : `Kapsam dışı — ${th.assignmentType || "zimmet türü yok"}`;
      const row = buildRow(th, attachments, reason, { depot: isDepot });
      stages.excludedScope.push(row);
      if (isDepot) {
        stages.depotAll.push(row);
        if (used) stages.depotUsed.push(row);
      }
    });
  stages.all = [...stages.inScope, ...stages.excludedScope];

  const stats = {
    thMonitorTotal: allMonitors.length,
    materialOrderExcluded: inProcess.length, // "İşlemdeki Malzeme Emri" olduğu için kapsam dışı bırakılan monitör sayısı
    excludedScope: stages.excludedScope.length,
    inScope: stages.inScope.length,
    active: stages.active.length,
    outside: stages.outside.length,
    atil: stages.atil.length,
    depotTotal: stages.depotAll.length,
    depotUsed: stages.depotUsed.length,
  };
  return { rows: stages.atil, stages, stats };
}

// "Bilgi dışı kullanım" maili: monitörü fiilen kullanan kişiye (Monitor Raporu'ndaki Username) gider.
// Mail adresi, o kullanıcı adının TuruncuHat'taki kendi kaydından ("Owner Username" -> "Cihaz Sahibinin
// Maili") bulunur. Yalnızca bilgi dışı kullanım satırları dikkate alınır; zimmetli kişinin kendisi
// kullanan listesinden çıkarılır. Aynı kişi birden çok monitör kullanıyorsa tek mailde toplanır.
// Dönen: { recipients: [{ username, mail, items: [row] }], noMail: [{ username, items }] }
export function buildOtherUserMailPlan(rows = [], thRows = []) {
  const mailByUser = new Map();
  thRows.forEach((t) => {
    const k = normKey(t.ownerUsername);
    const m = String(t.ownerMail ?? "").trim();
    if (k && m && !mailByUser.has(k)) mailByUser.set(k, m);
  });

  const byUser = new Map(); // normKey(username) -> { username, items }
  rows
    .filter((r) => r.usedByOther)
    .forEach((r) => {
      const ownerKey = normKey(r.ownerUsername);
      r.usedBy
        .split(",")
        .map((u) => u.trim())
        .filter((u) => u && u !== "—" && normKey(u) !== ownerKey)
        .forEach((u) => {
          const k = normKey(u);
          if (!byUser.has(k)) byUser.set(k, { username: u, items: [] });
          byUser.get(k).items.push(r);
        });
    });

  const recipients = [];
  const noMail = [];
  byUser.forEach((entry, k) => {
    const mail = mailByUser.get(k);
    if (mail) recipients.push({ ...entry, mail });
    else noMail.push(entry);
  });
  return { recipients, noMail };
}
