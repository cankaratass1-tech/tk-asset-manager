// "Kullanılmayan Cihazlar" için dinamik mail taslağı (madde 8, 9). Cihaz yaşına göre içerik değişir:
//   > 5 yıl  → kullanılmıyor + eski → merkeze elden iade
//   ≤ 5 yıl  → kullanılmıyor + lokasyonda laptop ihtiyacı varsa bu değerlendirilsin, yeni talep etmeden önce
// Karışık listede iki bölüm birden gösterilir. Gönderim mevcut mail altyapısına (onay modalı +
// recordMailHistory + deviceAction event) entegre edilir; doğrudan gönderim zorunlu değil.
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function deviceTable(rows) {
  const head = ["Lokasyon", "Hostname", "Seri No", "Model", "Üretim / Garanti Tarihi", "Cihaz Yaşı", "Last Logon"];
  const body = rows
    .map((r) => {
      const cells = [
        r.location || "—",
        r.hostname || "—",
        r.serial || "—",
        r.deviceModel || "—",
        r.deviceAgeDate || r.biosDate || "Veri Yok",
        r.deviceAge != null ? `${r.deviceAge} yıl` : "Veri Yok",
        r.lastLogonTime || "Veri Yok",
      ];
      return `<tr>${cells.map((c) => `<td style="border:1px solid #ccc;padding:6px 8px;">${esc(c)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-size:13px;margin:6px 0 14px;">
    <thead><tr style="background:#f0f0f0;">${head.map((h) => `<th style="border:1px solid #ccc;padding:6px 8px;text-align:left;">${h}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody></table>`;
}

export const OLD_DEVICE_YEARS = 5;

export function buildUnusedDeviceMailHtml(rows) {
  const old = rows.filter((r) => r.deviceAge != null && r.deviceAge > OLD_DEVICE_YEARS);
  const young = rows.filter((r) => !(r.deviceAge != null && r.deviceAge > OLD_DEVICE_YEARS));

  let body = `<p>Merhabalar,</p>
    <p>Aşağıda listelenen cihaz(lar) müdürlük (OBS) zimmetinde görünüyor, ancak SCCM kayıtlarına göre uzun süredir aktif olarak kullanılmıyor.</p>`;

  if (old.length) {
    body += `<p><strong>5 yıldan eski, kullanılmayan cihazlar:</strong> Bu cihazlar hem kullanımda değil hem de 5 yıldan eski olduğu için, lütfen <strong>merkeze elden iade</strong> ediniz.</p>${deviceTable(old)}`;
  }
  if (young.length) {
    body += `<p><strong>5 yıldan yeni, kullanılmayan cihazlar:</strong> Bu cihazlar kullanımda değil. Lokasyonunuzda laptop/masaüstü ihtiyacı bulunuyorsa <strong>yeni cihaz talep etmeden önce bu mevcut cihaz(lar)ın değerlendirilmesi</strong> gerekmektedir.</p>${deviceTable(young)}`;
  }

  body += `<p>Cihazların güncel durumu hakkında (kullanımda / iade edildi / farklı lokasyona taşındı) tarafımıza bilgi verilmesini rica ederiz.</p>`;

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6;">${body}</div>`;
}

export function unusedDeviceMailSubject(rows) {
  const anyOld = rows.some((r) => r.deviceAge != null && r.deviceAge > OLD_DEVICE_YEARS);
  return anyOld ? "Kullanılmayan Cihazlar — İade / Değerlendirme" : "Kullanılmayan Cihazlar — Lokasyonda Değerlendirme";
}
