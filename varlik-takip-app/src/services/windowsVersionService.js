// Windows sürümü ayrıştırma + destek (yaşam döngüsü) uyumluluğu — saf fonksiyonlar.
//
// KAYNAK: SCCM envanterindeki işletim sistemi sütunları (gerçek dosyadaki sütun adı doğrulanmadı; sccmFileService birkaç varyantı dener).
// "Uyumluluk" burada = bu Windows sürümünün Microsoft'un yayımladığı destek (servis) süresi içinde olup olmadığı. Donanımın
// Windows 11'e uygunluğu (TPM, işlemci) bu veride OLMADIĞI için değerlendirilmez.
//
// DİKKAT: Aşağıdaki destek bitiş tarihleri Microsoft yaşam döngüsü sayfalarına göre derlenmiştir ve zamanla değişebilir/eksik olabilir.
// `verified: false` olanlar tahminidir. Resmî tarihleri doğrulayıp bu tabloyu güncelleyin; arayüz tahmini olanları belirtir.

// Build numarası -> { family, release }
const BUILDS = {
  19041: ["Windows 10", "2004"], 19042: ["Windows 10", "20H2"], 19043: ["Windows 10", "21H1"], 19044: ["Windows 10", "21H2"], 19045: ["Windows 10", "22H2"],
  22000: ["Windows 11", "21H2"], 22621: ["Windows 11", "22H2"], 22631: ["Windows 11", "23H2"], 26100: ["Windows 11", "24H2"], 26200: ["Windows 11", "25H2"],
};

// "family release": { home: Home/Pro destek bitişi, ent: Enterprise/Education destek bitişi, verified }
export const WINDOWS_LIFECYCLE = {
  "Windows 10 2004": { home: "2021-12-14", ent: "2021-12-14", verified: true },
  "Windows 10 20H2": { home: "2022-05-10", ent: "2023-05-09", verified: true },
  "Windows 10 21H1": { home: "2022-12-13", ent: "2022-12-13", verified: true },
  "Windows 10 21H2": { home: "2023-06-13", ent: "2024-06-11", verified: true },
  "Windows 10 22H2": { home: "2025-10-14", ent: "2025-10-14", verified: true },
  "Windows 11 21H2": { home: "2023-10-10", ent: "2024-10-08", verified: true },
  "Windows 11 22H2": { home: "2024-10-08", ent: "2025-10-14", verified: true },
  "Windows 11 23H2": { home: "2025-11-11", ent: "2026-11-10", verified: true },
  "Windows 11 24H2": { home: "2026-10-13", ent: "2027-10-12", verified: true },
  "Windows 11 25H2": { home: "2027-10-12", ent: "2028-10-10", verified: false },
};

const SOON_DAYS = 90;
const DAY = 86400000;

// raw: sütundaki ham metin(ler) — örn. "Microsoft Windows 11 Enterprise", "10.0.22631", "Windows 10 Pro 22H2 (19045)".
// Dönen: null (Windows sürümü anlaşılamadı) ya da { family, release, build, edition, label, raw }
export function parseWindowsVersion(...parts) {
  const raw = parts.map((p) => String(p ?? "").trim()).filter(Boolean).join(" ");
  if (!raw) return null;

  // build numarası: "10.0.22631(.4890)" ya da tek başına "22631" ya da "(19045)"
  let build = null;
  const dotted = raw.match(/\b10\.0\.(\d{4,5})\b/);
  if (dotted) build = Number(dotted[1]);
  if (build == null) {
    const bare = raw.match(/\b(19\d{3}|2[0-9]{4})\b/);
    if (bare && BUILDS[Number(bare[1])]) build = Number(bare[1]);
  }

  let family = null, release = null;
  const fam = raw.match(/windows\s*(xp|vista|7|8(?:\.1)?|10|11)\b/i);
  if (fam) family = `Windows ${fam[1].toLowerCase() === "xp" ? "XP" : fam[1]}`;
  const server = raw.match(/windows\s+server\s*(20\d{2}(?:\s*r2)?)/i);
  if (server) family = `Windows Server ${server[1].toUpperCase().replace(/\s+/g, " ")}`;

  const rel = raw.match(/\b(2[0-5]H[12]|2004|1909|1903|1809)\b/i);
  if (rel) release = rel[1].toUpperCase();

  // build -> family/release (metin yoksa ya da metindeki sürümle çelişmiyorsa tamamlar)
  if (build != null && BUILDS[build]) {
    const [bf, br] = BUILDS[build];
    if (!family) family = bf;
    if (!release && family === bf) release = br;
  }
  if (!family && build != null) family = build >= 22000 ? "Windows 11" : build >= 10240 ? "Windows 10" : null;
  if (!family) return null;

  const ed = raw.match(/\b(enterprise|education|pro(?:fessional)?|home|ltsc|ltsb|iot)\b/i);
  const edition = ed ? ed[1].toLowerCase().replace("professional", "pro") : "";
  const label = [family, release].filter(Boolean).join(" ");
  return { family, release: release || "", build, edition, label, raw };
}

// Destek durumu: "supported" | "ending" (≤90 gün) | "ended" | "unknown". now: Date (test için verilebilir).
export function windowsSupport(info, now = new Date()) {
  if (!info) return { status: "unknown", label: "Bilinmiyor", detail: "Windows sürümü tespit edilemedi", end: "", verified: false };
  const cycle = WINDOWS_LIFECYCLE[info.label];
  if (!cycle) {
    // eski sürümler (7, 8, XP…) kesin sona ermiştir
    if (/windows (xp|vista|7|8)/i.test(info.family)) return { status: "ended", label: "Destek sona erdi", detail: `${info.family} — Microsoft desteği sona erdi`, end: "", verified: true };
    return { status: "unknown", label: "Bilinmiyor", detail: `${info.label} için destek tarihi tabloda yok (windowsVersionService.WINDOWS_LIFECYCLE)`, end: "", verified: false };
  }
  const ent = /enterprise|education|ltsc|ltsb|iot/.test(info.edition);
  const end = ent ? cycle.ent : cycle.home;
  const days = Math.round((new Date(end).getTime() - now.getTime()) / DAY);
  const note = `${ent ? "Enterprise/Education" : "Home/Pro"} destek bitişi: ${end}${cycle.verified ? "" : " (tahmini — doğrulayın)"}`;
  if (days < 0) return { status: "ended", label: "Destek sona erdi", detail: `${note}; ${-days} gün önce bitti`, end, verified: cycle.verified };
  if (days <= SOON_DAYS) return { status: "ending", label: `Destek bitiyor (${days} gün)`, detail: note, end, verified: cycle.verified };
  return { status: "supported", label: "Destekte", detail: note, end, verified: cycle.verified };
}

// Tek çağrıda: { info, support } + arama/filtre için düz metin
export function describeWindows(...parts) {
  const info = parseWindowsVersion(...parts);
  const support = windowsSupport(info);
  return { info, support, label: info ? info.label : "", searchText: info ? `${info.label} ${info.family} ${info.release} ${info.build ?? ""} ${info.edition} ${support.label}`.toLowerCase() : "" };
}

// Aramada "windows 10", "win11", "22h2", "19045", "destek sona erdi" gibi ifadeleri tanır.
export function matchesWindowsQuery(desc, query) {
  const q = String(query || "").trim().toLowerCase().replace(/^win(?=\s*\d)/, "windows ").replace(/\s+/g, " ");
  if (!q || !desc || !desc.info) return false;
  return desc.searchText.replace(/\s+/g, " ").includes(q);
}
