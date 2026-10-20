// "Kullanılmayan Cihazlar" için dinamik mail taslağı (madde 8, 9). Cihaz yaşına göre içerik değişir:
//   > 5 yıl  → kullanılmıyor + eski → merkeze elden iade
//   ≤ 5 yıl  → kullanılmıyor + lokasyonda laptop ihtiyacı varsa bu değerlendirilsin, yeni talep etmeden önce
// Karışık listede iki bölüm birden gösterilir. Gönderim mevcut mail altyapısına (onay modalı +
// recordMailHistory + deviceAction event) entegre edilir; doğrudan gönderim zorunlu değil.
import { mailShell, dataTable, mailSection, MAIL_FOOTER } from "./mailLayout.js";

const deviceTable = (rows) =>
  dataTable(
    ["Hostname / Seri No", "Model", "Lokasyon", "Üretim / Garanti", "Cihaz Yaşı", "Last Logon"],
    rows.map((r) => [
      [r.hostname || "—", r.serial || "—"],
      r.deviceModel || "—",
      r.location || "—",
      r.deviceAgeDate || r.biosDate || "Veri Yok",
      r.deviceAge != null ? `${r.deviceAge} yıl` : "Veri Yok",
      r.lastLogonTime || "Veri Yok",
    ])
  );

export const OLD_DEVICE_YEARS = 5;

export function buildUnusedDeviceMailHtml(rows) {
  const old = rows.filter((r) => r.deviceAge != null && r.deviceAge > OLD_DEVICE_YEARS);
  const young = rows.filter((r) => !(r.deviceAge != null && r.deviceAge > OLD_DEVICE_YEARS));

  let body = "";
  if (old.length) {
    body += mailSection("5 yıldan eski, kullanılmayan cihazlar", `<p style="margin:0 0 6px;">Bu cihazlar hem kullanımda değil hem de 5 yıldan eski olduğu için, lütfen <strong>merkeze elden iade</strong> ediniz.</p>${deviceTable(old)}`);
  }
  if (young.length) {
    body += mailSection("5 yıldan yeni, kullanılmayan cihazlar", `<p style="margin:0 0 6px;">Bu cihazlar kullanımda değil. Lokasyonunuzda laptop/masaüstü ihtiyacı bulunuyorsa <strong>yeni cihaz talep etmeden önce bu mevcut cihaz(lar)ın değerlendirilmesi</strong> gerekmektedir.</p>${deviceTable(young)}`);
  }

  return mailShell({
    eyebrow: "KULLANILMAYAN CİHAZ",
    title: "İADE / DEĞERLENDİRME GEREKLİ",
    greeting: "Merhabalar,",
    intro: "Aşağıda listelenen cihaz(lar) müdürlük (OBS) zimmetinde görünüyor, ancak SCCM kayıtlarına göre uzun süredir aktif olarak kullanılmıyor.",
    bodyHtml: body,
    action: "Cihazların güncel durumu hakkında (kullanımda / iade edildi / farklı lokasyona taşındı) tarafımıza bilgi verilmesini rica ederiz.",
    footer: MAIL_FOOTER,
  });
}

export function unusedDeviceMailSubject(rows) {
  const anyOld = rows.some((r) => r.deviceAge != null && r.deviceAge > OLD_DEVICE_YEARS);
  return anyOld ? "Kullanılmayan Cihazlar — İade / Değerlendirme" : "Kullanılmayan Cihazlar — Lokasyonda Değerlendirme";
}
