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

export const RELEVANT_ASSIGNMENT_TYPES = new Set(["user", "obs"]);

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
  return {
    rowKey: `atil-monitor|${th.serial}`,
    monitorSerial: th.serial,
    model: th.model || "",
    assignmentType: th.assignmentType,
    owner: th.owner || "—",
    ownerUsername: th.ownerUsername || "",
    // aynı kişiye ait monitörleri gruplamak için (kullanıcı adı > sicil > isim — comparisonService ile aynı sıra)
    ownerKey: normKey(th.ownerUsername) || normKey(th.ownerSicil) || normKey(th.owner),
    company: th.company || "",
    location: th.location || "—",
    usedBy: usedBy.length ? usedBy.join(", ") : "—",
    usedByKeys,
    // zimmetli kişi dışında biri kullanıyor (kanıt: iki kullanıcı adı da var ve farklı); OBS'de aranmaz
    depot,
    usedByOther: !depot && normKey(th.assignmentType) === "user" && Boolean(ownerUserKey) && usedByKeys.length > 0 && !usedByKeys.includes(ownerUserKey),
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

  const allMonitors = thRows.filter((r) => normKey(r.deviceType) === "monitor");
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
