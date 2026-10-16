// Ofis Bant Genişliği — bilgilendirme e-postası şablonu (saf fonksiyonlar, backend/React yok).
// Girdi: bir ofise (Lokasyon Kodu) ait hatlar (bantGenisligiService.mapBantRow çıktısı). Çıktı: { subject, html, text, notes }.
//
// Veride OLANLAR: Lokasyon (kod), Hat, Bant Genişliği, Averaj Bant Genişliği, Seviye, Tarih, Uyarı Durumu.
// Veride OLMAYANLAR: "kapasite" ve "kullanım oranı". Bunlar uydurulmaz; satırda opsiyonel `capacityMbps` / `usagePct` alanları
// VARSA tabloya ek sütun olarak eklenir, yoksa sütun hiç çıkmaz ve `notes` içinde belirtilir. "Averaja göre fark" ise mevcut
// iki değerden (bant genişliği ve averaj) hesaplanır. Eksik değerler "—" gösterilir, hiçbir alan "undefined/NaN" olarak basılmaz.
// Gerçek gönderim altyapısı (SMTP) kurulu değilse çağıran taraf bunu kullanıcıya bildirmelidir; bu modül göndermez.

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dash = (v) => (v == null || String(v).trim() === "" || Number.isNaN(v) ? "—" : String(v));
const mbps = (v) => (v == null || Number.isNaN(v) ? "—" : `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} Mb/s`);

const TEXT = {
  tr: {
    subjectOk: (o) => `Ofis Bant Genişliği Bilgilendirmesi — ${o}`,
    subjectWarn: (o, n) => `Ofis Bant Genişliği Uyarısı — ${o} (${n} hatta düşüş)`,
    greeting: "Merhabalar,",
    introOk: (o) => `<strong>${o}</strong> ofisine ait internet hatlarının güncel bant genişliği değerleri aşağıda paylaşılmıştır. Tüm hatlar ortalama değerler dahilindedir.`,
    introWarn: (o, n) => `<strong>${o}</strong> ofisine ait internet hatlarında <strong>${n} hatta</strong> bant genişliğinin ortalamanın belirgin altına düştüğü tespit edilmiştir. Güncel değerler aşağıda paylaşılmıştır.`,
    head: { hat: "Hat", bw: "Bant Genişliği", avg: "Averaj", level: "Seviye", diff: "Averaja Göre", capacity: "Kapasite", usage: "Kullanım Oranı", status: "Durum", date: "Rapor Tarihi" },
    ok: "Ortalama Dahilinde",
    warn: "Uyarı",
    action: "Uyarı durumundaki hatlar için servis sağlayıcınız ve ağ ekibiyle iletişime geçilerek hattın kontrol edilmesi önerilir. Düşüş devam ederse lütfen BT ekibine bildiriniz.",
    footer: "Bu bilgilendirme Varlık Yönetimi sistemindeki Ofis Bant Genişliği raporundan otomatik hazırlanmıştır.",
    unknownOffice: "İlgili ofis",
    noteNoCapacity: "Kapasite ve kullanım oranı veride bulunmadığı için gösterilmedi.",
    noteMissing: (n) => `${n} satırda bir ya da daha fazla değer eksik ("—").`,
  },
  en: {
    subjectOk: (o) => `Office Bandwidth Information — ${o}`,
    subjectWarn: (o, n) => `Office Bandwidth Alert — ${o} (${n} line(s) degraded)`,
    greeting: "Hello,",
    introOk: (o) => `The current bandwidth values of the internet lines for <strong>${o}</strong> are shared below. All lines are within the average range.`,
    introWarn: (o, n) => `<strong>${n} line(s)</strong> at <strong>${o}</strong> have dropped noticeably below their average bandwidth. Current values are shared below.`,
    head: { hat: "Line", bw: "Bandwidth", avg: "Average", level: "Level", diff: "vs. Average", capacity: "Capacity", usage: "Utilization", status: "Status", date: "Report Date" },
    ok: "Within average",
    warn: "Warning",
    action: "For lines in warning status, please contact your service provider and the network team to check the line. If the drop continues, please notify the IT team.",
    footer: "This message was prepared automatically from the Office Bandwidth report in the Asset Management system.",
    unknownOffice: "The office",
    noteNoCapacity: "Capacity and utilization are not present in the data and are therefore not shown.",
    noteMissing: (n) => `${n} row(s) have one or more missing values ("—").`,
  },
};

// Bant genişliğinin averajdan yüzde farkı: (bant − averaj) / averaj. Averaj yoksa/0 ise null.
export function diffVsAverage(bw, avg) {
  if (bw == null || avg == null || !Number.isFinite(bw) || !Number.isFinite(avg) || avg === 0) return null;
  return Math.round(((bw - avg) / avg) * 100);
}

// lines: [{ hat, bandwidthMbps, avgBandwidthMbps, seviye, seviyeMbps, tarih, isWarning, durum, capacityMbps?, usagePct? }]
export function buildBantMail({ officeCode = "", officeName = "", lines = [], lang = "tr" } = {}) {
  const T = TEXT[lang] || TEXT.tr;
  const office = esc(officeName || officeCode || T.unknownOffice);
  const officeLabel = officeName && officeCode ? `${officeName} (${officeCode})` : officeName || officeCode || T.unknownOffice;
  const rows = Array.isArray(lines) ? lines : [];
  const warnCount = rows.filter((r) => r.isWarning).length;
  const hasCapacity = rows.some((r) => r.capacityMbps != null);
  const hasUsage = rows.some((r) => r.usagePct != null);
  const notes = [];
  if (!hasCapacity && !hasUsage) notes.push(T.noteNoCapacity);
  const missing = rows.filter((r) => [r.hat, r.bandwidthMbps, r.avgBandwidthMbps, r.seviyeMbps, r.tarih].some((v) => v == null || v === "" || Number.isNaN(v))).length;
  if (missing > 0) notes.push(T.noteMissing(missing));

  const reportDate = rows.map((r) => r.tarih).filter(Boolean).sort().pop() || "";
  const head = [T.head.hat, T.head.bw, T.head.avg, T.head.level, T.head.diff, ...(hasCapacity ? [T.head.capacity] : []), ...(hasUsage ? [T.head.usage] : []), T.head.status, T.head.date];

  const th = (h) => `<th style="border:1px solid #d0d7de;padding:7px 10px;text-align:left;background:#243a5e;color:#fff;font-weight:600;white-space:nowrap;">${esc(h)}</th>`;
  const td = (c, extra = "") => `<td style="border:1px solid #d0d7de;padding:7px 10px;${extra}">${c}</td>`;
  const body = rows
    .map((r) => {
      const d = diffVsAverage(r.bandwidthMbps, r.avgBandwidthMbps);
      const chip = r.isWarning
        ? `<span style="background:#fde7e9;color:#b3261e;border-radius:10px;padding:2px 9px;font-weight:700;">${T.warn}${r.durum ? ` (${esc(r.durum)})` : ""}</span>`
        : `<span style="background:#e3f4e8;color:#1e7a38;border-radius:10px;padding:2px 9px;font-weight:700;">${T.ok}</span>`;
      const cells = [
        td(esc(dash(r.hat))),
        td(esc(r.bandwidthMbps != null ? mbps(r.bandwidthMbps) : dash(r.bandwidth))),
        td(esc(r.avgBandwidthMbps != null ? mbps(r.avgBandwidthMbps) : dash(r.avgBandwidth))),
        td(esc(r.seviyeMbps != null ? mbps(r.seviyeMbps) : dash(r.seviye))),
        td(d == null ? "—" : `<span style="color:${d < 0 ? "#b3261e" : "#1e7a38"};font-weight:600;">${d > 0 ? "+" : ""}${d}%</span>`),
        ...(hasCapacity ? [td(esc(mbps(r.capacityMbps)))] : []),
        ...(hasUsage ? [td(r.usagePct == null ? "—" : `%${esc(r.usagePct)}`)] : []),
        td(chip),
        td(esc(dash(r.tarih)), "white-space:nowrap;"),
      ];
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");

  const html = `<div style="font-family:Segoe UI,Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6;max-width:760px;">
    <div style="background:#243a5e;color:#fff;padding:14px 18px;border-radius:6px 6px 0 0;">
      <div style="font-size:11px;letter-spacing:.1em;opacity:.8;">OFİS BANT GENİŞLİĞİ</div>
      <div style="font-size:18px;font-weight:700;">${esc(officeLabel)}</div>
    </div>
    <div style="border:1px solid #d0d7de;border-top:none;padding:16px 18px;border-radius:0 0 6px 6px;">
      <p style="margin:0 0 10px;">${T.greeting}</p>
      <p style="margin:0 0 12px;">${warnCount > 0 ? T.introWarn(office, warnCount) : T.introOk(office)}</p>
      ${rows.length === 0
        ? `<p style="color:#8a8886;">—</p>`
        : `<table style="border-collapse:collapse;width:100%;font-size:13px;"><thead><tr>${head.map(th).join("")}</tr></thead><tbody>${body}</tbody></table>`}
      ${warnCount > 0 ? `<p style="margin:14px 0 0;">${T.action}</p>` : ""}
      ${notes.length ? `<p style="margin:12px 0 0;font-size:12px;color:#8a8886;">${notes.map(esc).join(" ")}</p>` : ""}
      <p style="margin:14px 0 0;font-size:12px;color:#8a8886;">${T.footer}${reportDate ? ` · ${esc(reportDate)}` : ""}</p>
    </div>
  </div>`;

  const text = [
    T.greeting,
    "",
    `${officeLabel}: ${warnCount > 0 ? `${warnCount} ${lang === "en" ? "line(s) in warning" : "hatta uyarı"}` : lang === "en" ? "all lines within average" : "tüm hatlar ortalama dahilinde"}`,
    "",
    ...rows.map((r) => `- ${dash(r.hat)}: ${r.bandwidthMbps != null ? mbps(r.bandwidthMbps) : dash(r.bandwidth)} (${lang === "en" ? "avg" : "averaj"} ${r.avgBandwidthMbps != null ? mbps(r.avgBandwidthMbps) : dash(r.avgBandwidth)}) — ${r.isWarning ? T.warn : T.ok}`),
    ...(notes.length ? ["", ...notes] : []),
  ].join("\n");

  return { subject: warnCount > 0 ? T.subjectWarn(officeLabel, warnCount) : T.subjectOk(officeLabel), html, text, notes, warnCount, reportDate };
}

// Lokasyon Kodu -> mail (Lokasyon Mail Listesi, "Lokasyon Kodu" birebir). Kod eşleşmezse aynı Açık Lokasyon Adı'na sahip kardeş
// satırların ilk dolu mail adresi denenir. Bulunamazsa "" döner (çağıran taraf "mail tanımlı değil" der).
export function resolveBantRecipient(lokasyonRows, officeCode) {
  const norm = (v) => String(v || "").trim().toLowerCase();
  const rows = lokasyonRows || [];
  const byCode = rows.find((r) => norm(r.kod) === norm(officeCode));
  if (!byCode) return { mail: "", officeName: "" };
  const name = byCode.locationName || "";
  const mail = byCode.mail || rows.find((r) => name && norm(r.locationName) === norm(name) && r.mail)?.mail || "";
  return { mail, officeName: name };
}

// Uyarıdaki hatları ofise (Lokasyon Kodu) göre gruplar: [{ officeCode, lines }] — yalnızca en az bir uyarılı hattı olan ofisler.
export function groupWarningOffices(rows) {
  const m = new Map();
  (rows || []).forEach((r) => {
    if (!r.location) return;
    if (!m.has(r.location)) m.set(r.location, []);
    m.get(r.location).push(r);
  });
  return [...m.entries()].filter(([, lines]) => lines.some((l) => l.isWarning)).map(([officeCode, lines]) => ({ officeCode, lines }));
}
