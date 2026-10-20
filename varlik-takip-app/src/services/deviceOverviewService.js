// "Cihaz Genel Görünüm" (madde 10, 11) — bir cihazın farklı veri kaynaklarındaki bilgilerini tek
// ekranda birleştirir. Hostname / Seri No / Last Logon ile arama yapılır. Eksik alanlar "Veri Yok"
// döner, uygulama hata vermez (madde 14). Aynı cihaz kaynaklar arasında seri no öncelikli
// eşleştirilir (madde 14 — tekrar tekrar oluşmasın).
import { norm, compareAssignment } from "./comparisonService";
import { classifyDisk } from "./dashboardService";
import { deviceAgeYears, daysSince } from "./unusedDeviceService";
import { findBattery } from "./batteryFileService";
import { matchesWindowsQuery } from "./windowsVersionService.js";

const OK = "ok", WARN = "warn", CRIT = "crit", NONE = "none";

// query bir string: hostname / seri no / kullanıcı adı (last logon). Eşleşen ilk cihazı döndürür.
export function buildDeviceOverview(query, { sccmRows = [], thRows = [], monitorRows = [], inaktifRows = [], diskRows = [], batteryRows = [], staleDays = 90 } = {}) {
  const q = norm(query);
  if (!q) return null;

  const sccm =
    sccmRows.find((s) => norm(s.serial) === q || norm(s.hostname) === q) ||
    sccmRows.find((s) => norm(s.userLabel) === q || norm(s.hostname).includes(q) || norm(s.serial).includes(q)) ||
    null;

  const serialKey = norm(sccm?.serial || query);
  const hostKey = norm(sccm?.hostname || query);

  const th =
    thRows.find((t) => norm(t.serial) === serialKey) ||
    thRows.find((t) => norm(t.serial) === q) ||
    null;

  const inaktif = inaktifRows.find((r) => norm(r.serial) === serialKey || norm(r.serial) === q) || null;

  const disksForHost = diskRows.filter((d) => norm(d.owner) === hostKey || norm(d.owner) === q);
  const cDrive = disksForHost.find((d) => /^c/i.test(String(d.serial || d._raw?.["Volume Name"] || ""))) || disksForHost[0] || null;

  const monitors = monitorRows.filter((m) => norm(m.hostname) === hostKey);

  // Monitörün TuruncuHat'taki kendi zimmet kaydını seri no ile bul (comparisonService.js'deki
  // buildMonitorDetails ile AYNI mantık — bkz. konuşma: "monitor zimmeti uyuşmuyor ama düzgün
  // belirtilmemiş, sağ tarafta data eksik diye mi" sorusu üzerine eklendi). Önceden bu karşılaştırma
  // HİÇ yapılmıyordu, her monitör satırı ne olursa olsun state:NONE ("Veri Yok") gösteriyordu —
  // gerçek bir zimmet uyuşmazlığı olsa bile.
  const monitorStatus = (m) => {
    const reg = thRows.find((t) => t.deviceType === "MONITOR" && norm(t.serial) === norm(m.monitorSerial));
    const monitorUser = m.username || "";
    if (!reg) return { state: NONE, status: "TuruncuHat'ta Kaydı Yok (doğrulanamadı)" };
    if (reg.assignmentType === "OBS") return { state: OK, badgeLabel: "Doğru", status: "Müdürlük Zimmeti (OBS)" };
    const cmp = compareAssignment({ actualUsername: monitorUser, actualSicil: "", thUsername: reg.ownerUsername, thSicil: reg.ownerSicil });
    if (!cmp.verifiable) return { state: NONE, status: "Bilgi Eksik (doğrulanamadı)" };
    // Kullanıcı isteği — genel OK/Kritik rozeti yerine bu karta özel net etiket: bkz. konuşma
    // ("Kritik yazmasın hatalı ise hatalı doğru ise doğru yazsın").
    if (cmp.isMatch) return { state: OK, badgeLabel: "Doğru", status: "Doğru — Kendi Monitörünü Kullanıyor" };
    return { state: CRIT, badgeLabel: "Hatalı", status: "Hatalı — Başkasının Monitörünü Kullanıyor" };
  };

  if (!sccm && !th && !inaktif && disksForHost.length === 0) return { notFound: true, query };

  // Cihaz yaşı: önce SCCM BIOS Date, o boşsa TuruncuHat "Garanti Başlangıç Tarihi".
  const biosAge = deviceAgeYears(sccm?.biosDate);
  const warrantyAge = biosAge == null ? deviceAgeYears(th?.warrantyStartDate) : null;
  const age = biosAge != null ? biosAge : warrantyAge;
  const ageSource = biosAge != null ? "BIOS Date" : warrantyAge != null ? "TH Garanti Başlangıç" : "";
  const llDays = daysSince(sccm?.lastLogonTime);
  const freeGb = cDrive?.freeSpaceGb;
  const diskClass = cDrive ? classifyDisk(freeGb) : "unknown";

  const val = (v, fallback = "Veri Yok") => (v != null && v !== "" ? v : fallback);
  const bitOn = /^(yes|true|1|evet|on)$/i.test(String(sccm?.bitlocker || ""));

  return {
    query,
    identity: {
      hostname: val(sccm?.hostname || inaktif?.hostname),
      serial: val(sccm?.serial || th?.serial || inaktif?.serial),
      model: val(sccm?.deviceModel || th?.model || inaktif?.model),
      lbsParent: val(th?.lbsParent || sccm?.lbsParent),
      location: val(th?.location || sccm?.location || inaktif?.location),
      owner: val(th?.owner || sccm?.owner),
    },
    cards: [
      {
        group: "Kullanım",
        items: [
          { label: "Last Logon", value: val(sccm?.lastLogonTime), state: llDays == null ? NONE : llDays > staleDays ? CRIT : llDays > 30 ? WARN : OK, note: llDays != null ? `${llDays} gün önce` : "" },
          { label: "SCCM'de mevcut", value: sccm ? "Evet" : "Hayır", state: sccm ? OK : CRIT },
          { label: "İnaktif listesinde", value: inaktif ? "Evet" : "Hayır", state: inaktif ? WARN : OK },
          { label: "SCCM agent", value: val(sccm?.clientActive || (sccm ? "Bilinmiyor" : "")), state: sccm ? (sccm.clientActive ? OK : NONE) : NONE },
          { label: "Son SCCM iletişimi", value: val(sccm?.lastClientContact), state: sccm?.lastClientContact ? OK : NONE },
        ],
      },
      {
        group: "Güvenlik",
        items: [
          { label: "BitLocker", value: val(sccm?.bitlocker), state: !sccm?.bitlocker ? NONE : bitOn ? OK : CRIT },
          // İşletim sistemi: güvenlik kartında BitLocker'ın altında (destek bitmiş sürüm = güvenlik riski)
          ...(() => {
            const st = sccm?.windowsStatus;
            const state = st === "supported" ? OK : st === "ending" ? WARN : st === "ended" ? CRIT : NONE;
            return [
              { label: "Windows sürümü", value: val(sccm?.windowsLabel), state: sccm?.windowsLabel ? OK : NONE, note: sccm?.windowsLabel ? "" : "SCCM envanterinde işletim sistemi sütunu yok/boş" },
              { label: "Build", value: val(sccm?.osBuild), state: NONE },
              { label: "Destek durumu", value: val(sccm?.windowsSupportLabel), state, note: sccm?.windowsDetail || "" },
              { label: "Destek bitiş tarihi", value: val(sccm?.windowsEnd, "Tabloda yok"), state: NONE, note: "Microsoft yaşam döngüsü tablosundan (sürüm + sürüm türüne göre), cihazın kendi tarihinden değil" },
            ];
          })(),
        ],
      },
      {
        group: "Disk (C:)",
        items: cDrive
          ? [
              { label: "Boş Alan", value: `${(freeGb ?? 0).toFixed(1)} GB`, state: diskClass === "critical" ? CRIT : diskClass === "warning" ? WARN : diskClass === "normal" ? OK : NONE, note: diskClass === "critical" ? "Yetersiz" : diskClass === "warning" ? "Düşük" : "Yeterli" },
              { label: "Toplam", value: cDrive.sizeGb != null ? `${cDrive.sizeGb.toFixed(0)} GB` : "Veri Yok", state: NONE },
            ]
          : [{ label: "Disk verisi", value: "Veri Yok", state: NONE }],
      },
      {
        group: "Zimmet",
        items: [
          { label: "OBS zimmet", value: th?.assignmentType === "OBS" ? "Evet" : th ? "Hayır (User)" : "Veri Yok", state: th?.assignmentType === "OBS" ? WARN : NONE },
          { label: "TuruncuHat kaydı", value: th ? "Var" : "TH Kaydı YOK", state: th ? OK : WARN },
          { label: "Zimmet durumu", value: val(sccm?.statusTag), state: sccm ? (sccm.matched ? OK : sccm.statusTag === "Zimmet Hatalı" ? CRIT : WARN) : NONE },
        ],
      },
      {
        group: "Donanım",
        items: [
          { label: "BIOS Date", value: val(sccm?.biosDate), state: sccm?.biosDate ? OK : NONE },
          ...(!sccm?.biosDate && th?.warrantyStartDate
            ? [{ label: "Garanti Başlangıç (TH)", value: th.warrantyStartDate, state: OK, note: "BIOS Date yok — yaş bu tarihten" }]
            : []),
          { label: "Cihaz Yaşı", value: age != null ? `${age} yıl` : "Veri Yok", state: age == null ? NONE : age > 5 ? CRIT : age > 3 ? WARN : OK, note: ageSource ? `Kaynak: ${ageSource}` : "" },
          ...(() => {
            const bat = findBattery(batteryRows, sccm?.hostname || th?.hostname || inaktif?.hostname || query);
            if (!bat || bat.batteryHealth == null) {
              const desktop = /desktop|masa/i.test(String(sccm?.sub || ""));
              return [{ label: "Batarya sağlığı", value: desktop ? "Masaüstü — batarya yok" : "Veri Yok", state: NONE, note: desktop ? "Cihaz tipi Desktop" : "LakeSide Battery Health dosyasında bu cihaz yok / dosya yüklenmedi" }];
            }
            const h = bat.batteryHealth;
            const state = h < 60 ? CRIT : h < 80 ? WARN : OK;
            const cap = bat.designCapacity && bat.fullChargeCapacity ? `${bat.fullChargeCapacity} / ${bat.designCapacity} mWh` : "";
            return [
              { label: "Batarya sağlığı", value: `%${h}`, state, badgeLabel: bat.durum, note: "Yeni pile göre kalan kapasite. ≥%80 iyi · %60-80 izlenmeli · <%60 değişmeli" },
              ...(bat.cycleCount != null ? [{ label: "Şarj döngüsü", value: `${bat.cycleCount}`, state: NONE, note: "Tamamlanan şarj/deşarj sayısı (yüksekse pil yıpranır)" }] : []),
              ...(cap ? [{ label: "Kapasite", value: cap, state: NONE, note: "Mevcut tam şarj kapasitesi / tasarım kapasitesi" }] : []),
            ];
          })(),
        ],
      },
      {
        group: "Bağlı Monitörler",
        items: monitors.length
          ? monitors.map((m) => {
              const { state, badgeLabel, status } = monitorStatus(m);
              const note = m.username ? `Kullanan: ${m.username} — ${status}` : status;
              return { label: m.monitorSerial || "Monitör", value: `${m.monitorManufacturer || ""} ${m.monitorModel || ""}`.trim() || "—", state, badgeLabel, note };
            })
          : [{ label: "Bağlı monitör", value: "Yok / Veri Yok", state: NONE }],
      },
    ],
  };
}

// ---- Windows sürümüne göre arama / filtreleme (Genel Arama) ----
const STATUS_ORDER = { ended: 0, ending: 1, supported: 2, unknown: 3 };

// SCCM satırlarındaki Windows sürümleri ve adetleri (sürüm filtresi seçenekleri) + destek durumu sayıları
export function windowsFacets(sccmRows = []) {
  const versions = new Map();
  const statuses = { ended: 0, ending: 0, supported: 0, unknown: 0 };
  sccmRows.forEach((r) => {
    const label = r.windowsLabel || "";
    const key = label || "__bilinmiyor__";
    const cur = versions.get(key) || { label, count: 0, status: r.windowsStatus || "unknown" };
    cur.count += 1;
    versions.set(key, cur);
    statuses[r.windowsStatus || "unknown"] += 1;
  });
  const list = [...versions.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) || b.label.localeCompare(a.label, "tr"));
  return { versions: list, statuses, total: sccmRows.length, known: sccmRows.length - statuses.unknown };
}

// version: tam sürüm etiketi ("Windows 10 22H2") ya da "__bilinmiyor__"; status: ended|ending|supported|unknown; query: serbest metin
// (hostname / seri no / kullanıcı / "windows 10" / "22h2" / build / destek durumu). Sonuç: eşleşen SCCM satırları.
export function filterDevicesByWindows(sccmRows = [], { version = "", status = "", query = "" } = {}) {
  const q = norm(query);
  return sccmRows.filter((r) => {
    if (version) {
      if (version === "__bilinmiyor__" ? r.windowsLabel : r.windowsLabel !== version) return false;
    }
    if (status && (r.windowsStatus || "unknown") !== status) return false;
    if (!q) return true;
    const direct = [r.hostname, r.serial, r.userLabel, r.owner].some((v) => norm(v).includes(q));
    const desc = r.windowsLabel ? { info: {}, searchText: String(r.windowsSearch || "") } : null;
    return direct || matchesWindowsQuery(desc, query);
  });
}
