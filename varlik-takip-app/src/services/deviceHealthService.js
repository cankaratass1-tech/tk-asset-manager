// Cihaz sağlığı — Ana Sayfa / Yönetici Özeti için TEK hesap.
//
// Önceden "toplam cihazdan (SCCM) inaktif + zimmet hatalı + kritik disk + kullanılmayan çıkarılıyordu".
// Bu yanlıştı: (1) aynı cihaz birden çok kategoride sayılabiliyordu, (2) bulguların bir kısmı SCCM envanterindeki bir
// cihaz değil (kullanılmayan OBS cihazlar SCCM'de olmaz, monitörler SCCM cihazı değildir, inaktif listesindeki
// bazı seri no'lar SCCM'de yoktur) — yani paydada olmayan şey paydan çıkarılıyordu.
//
// Burada: payda = SCCM envanterindeki cihazlar. Sorunlu cihaz = en az bir bulgusu olan TEKİL SCCM cihazı (seri no ile).
// SCCM dışı bulgular (envanterde karşılığı olmayanlar) ayrıca sayılır ve sağlık oranına karışmaz.
import { norm } from "./comparisonService.js";

// rows: seri no'su r.serial olan satırlar; diskRows: r.owner = hostname
export function computeDeviceHealth({ sccmRows = [], inaktifRows = [], zimmetBadRows = [], diskCriticalRows = [], unusedRows = [] } = {}) {
  const serials = new Set();
  const hostToSerial = new Map();
  sccmRows.forEach((s) => {
    const sn = norm(s.serial);
    if (sn) serials.add(sn);
    const h = norm(s.hostname);
    if (h && sn) hostToSerial.set(h, sn);
  });

  const problem = new Set();
  const findings = { inaktif: inaktifRows.length, zimmet: zimmetBadRows.length, disk: diskCriticalRows.length, unused: unusedRows.length };
  const inScope = { inaktif: 0, zimmet: 0, disk: 0, unused: 0 };
  const mark = (key, sn) => {
    if (!sn || !serials.has(sn)) return;
    inScope[key]++;
    problem.add(sn);
  };
  inaktifRows.forEach((r) => mark("inaktif", norm(r.serial)));
  zimmetBadRows.forEach((r) => mark("zimmet", norm(r.serial)));
  diskCriticalRows.forEach((r) => mark("disk", hostToSerial.get(norm(r.owner)) || ""));
  unusedRows.forEach((r) => mark("unused", norm(r.serial)));

  const devices = sccmRows.length;
  const problemDevices = problem.size;
  const totalFindings = findings.inaktif + findings.zimmet + findings.disk + findings.unused;
  return {
    devices,
    problemDevices,
    healthyDevices: Math.max(0, devices - problemDevices),
    healthPct: devices ? Math.max(0, Math.round(((devices - problemDevices) / devices) * 100)) : 0,
    totalFindings,
    findings,
    inScope, // her kategorinin SCCM envanterindeki cihaza denk gelen kısmı
    outsideInventory: totalFindings - (inScope.inaktif + inScope.zimmet + inScope.disk + inScope.unused),
  };
}
