// "Kullanılmayan Cihazlar" raporu (madde 7). Amaç: OBS (müdürlük/ortak) zimmetinde görünen ama
// fiilen kullanılmayan cihazları tespit etmek.
//
// Kriter (kullanıcı onayı):
//   (a) TH'de Konum Kategorisi = "OBS" olan cihaz, seri no (yoksa hostname) ile SCCM envanterinde
//       BULUNAMIYORSA → "Kullanılmıyor (SCCM'de yok)", VEYA
//   (b) SCCM'de VAR ama Last Logon `staleDays` günden eski → "Kullanılmıyor (son giriş çok eski)".
//
// Eşleştirme güvenilir kimliklerle: serial → hostname.
import { norm, daysSince, DEFAULT_STALE_DAYS } from "./comparisonService";

// Geriye dönük uyumluluk — App.jsx ve deviceOverviewService.js bunları buradan import ediyor;
// kanonik tanım artık comparisonService.js'te (bkz. konuşma — Zimmet Uyuşmazlığı'nın da aynı
// eşiği kullanması gerekince döngüsel import'tan kaçınmak için oraya taşındı).
export { daysSince, DEFAULT_STALE_DAYS };

// BIOS/üretim tarihinden cihaz yaşını yıl olarak döndürür (yoksa null).
export function deviceAgeYears(biosDate) {
  if (!biosDate) return null;
  const d = new Date(biosDate);
  if (Number.isNaN(d.getTime())) return null;
  const yrs = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return yrs >= 0 ? Math.round(yrs * 10) / 10 : null;
}

export function computeUnusedDevices({ thRows = [], sccmRows = [], staleDays = DEFAULT_STALE_DAYS } = {}) {
  const sccmBySerial = new Map();
  const sccmByHost = new Map();
  sccmRows.forEach((s) => {
    if (norm(s.serial)) sccmBySerial.set(norm(s.serial), s);
    if (norm(s.hostname)) sccmByHost.set(norm(s.hostname), s);
  });

  const obsRows = thRows.filter((r) => r.assignmentType === "OBS");

  return obsRows
    .map((th) => {
      const s = sccmBySerial.get(norm(th.serial)) || sccmByHost.get(norm(th.serial)) || null;
      const lastLogon = s ? s.lastLogonTime : "";
      const staleD = daysSince(lastLogon);

      let statusTag, matched, usageStatus, reason;
      if (!s) {
        statusTag = "Kullanılmıyor — SCCM'de Yok";
        matched = false;
        usageStatus = "Kullanılmıyor";
        reason = `${th.serial} seri numaralı cihaz TuruncuHat'ta müdürlük (OBS) zimmetinde, ancak SCCM envanterinde hiç kaydı yok — muhtemelen aktif kullanımda değil.`;
      } else if (staleD != null && staleD > staleDays) {
        statusTag = "Kullanılmıyor — Son Giriş Çok Eski";
        matched = false;
        usageStatus = "Kullanılmıyor";
        reason = `${th.serial} seri numaralı cihaz SCCM'de var ama son giriş ${staleD} gün önce (eşik: ${staleDays} gün) — aktif kullanılmıyor.`;
      } else {
        statusTag = "Aktif";
        matched = true;
        usageStatus = "Kullanımda";
        reason = staleD != null ? `Son giriş ${staleD} gün önce.` : "Son giriş bilgisi yok.";
      }

      // Cihaz yaşı önce SCCM "BIOS Date"ten; o boşsa TuruncuHat "Garanti Başlangıç Tarihi"nden
      // hesaplanır (kullanıcı: TH'de bu tarih her kayıtta garanti dolu). İkisi de yoksa null.
      const biosAge = deviceAgeYears(s?.biosDate);
      const warrantyAge = biosAge == null ? deviceAgeYears(th.warrantyStartDate) : null;
      const age = biosAge != null ? biosAge : warrantyAge;
      const ageSource = biosAge != null ? "BIOS Date" : warrantyAge != null ? "TH Garanti Başlangıç" : "";
      const ageBasisDate = biosAge != null ? (s?.biosDate || "") : warrantyAge != null ? (th.warrantyStartDate || "") : "";

      return {
        rowKey: `unused|${th.serial}`,
        owner: th.owner || "Müdürlük (OBS)",
        ownerFull: th.ownerFull || th.owner || "Müdürlük (OBS)",
        sub: s ? s.sub : `${th.deviceType || ""} — ${th.model || ""}`.trim(),
        serial: th.serial,
        hostname: s ? s.hostname : "",
        model: reason, // TableView "Açıklama/Lokasyon" kolonu; asıl model deviceModel'de
        deviceModel: s ? s.deviceModel : th.model || th.marka || "",
        location: th.location || (s && s.location) || "—",
        lbsParent: th.lbsParent || (s && s.lbsParent) || "",
        company: th.company || (s && s.company) || "",
        office: th.location || (s && s.office) || "—",
        lastLogonTime: lastLogon || "",
        lastLogonDaysAgo: staleD,
        biosDate: s?.biosDate || "",
        warrantyStartDate: th.warrantyStartDate || "",
        deviceAge: age,
        deviceAgeSource: ageSource,
        deviceAgeDate: ageBasisDate,
        bitlocker: s?.bitlocker || "",
        obsStatus: "OBS Zimmetli",
        sccmStatus: s ? "SCCM'de Kayıtlı" : "SCCM'de Yok",
        usageStatus,
        matched,
        statusTag,
        mail: s?.mail || "",
        _raw: th._raw,
        _sccmRaw: s ? s._raw : null,
        _thRaw: th._raw,
      };
    })
    // Sadece kullanılmayanları listele — "Aktif" olanlar bu raporun konusu değil.
    .filter((r) => r.usageStatus === "Kullanılmıyor");
}
