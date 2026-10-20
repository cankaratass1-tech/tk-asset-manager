import { ownerTitleOf } from "../../services/ownerName";

// Durum kutusu (ItemizedAlert) için satır verisi üreticileri — saf fonksiyonlar. Aksiyon gerektirmeyen durumlarda null döner (eski paragraf kutusu kullanılır).
// İnaktif Cihazlar — "Kullanılıyor — Zimmet Aktarımı Gerekli"
export function inaktifActionItems(row) {
  if (!row.actualUser) return null;
  return [
    { label: "Seri no", value: row.serial },
    ...(row.hostname ? [{ label: "Hostname", value: row.hostname, lines: ["SCCM"] }] : []),
    { label: "Kayıtlı sahibi", value: row.owner && row.owner !== "—" ? row.owner : "—", lines: [ownerTitleOf(row.ownerFull), "İnaktif listesi"] },
    { label: "Cihazı kullanan", value: row.actualUser, lines: [row.actualUserMail, "SCCM · son oturum açan"] },
    { label: "Yapılacak", value: `Zimmet ${row.actualUser} adına aktarılmalı`, action: true },
  ];
}

// Zimmet Uyuşmazlığı — yalnız aksiyon gerektiren iki durum (Zimmet Hatalı, Mükerrer Çift Zimmet)
export function zimmetAlertItems(row) {
  const tag = String(row.personStatusTag ?? row.statusTag ?? "");
  const user = row.userLabel && row.userLabel !== "Tespit Edilemedi" ? row.userLabel : "";
  const base = [
    { label: "Seri no", value: row.serial },
    ...(row.hostname ? [{ label: "Hostname", value: row.hostname, lines: ["SCCM"] }] : []),
    { label: "Zimmetli kişi", value: row.owner && row.owner !== "—" ? row.owner : "—", lines: [ownerTitleOf(row.ownerFull), "TuruncuHat"] },
  ];
  if (/^Zimmet Hatalı/.test(tag) && user) {
    return [
      ...base,
      { label: "Cihazı kullanan", value: row.userFullName || user, lines: [row.userFullTitle, user !== (row.userFullName || user) ? user : "", row.mail, "SCCM · son oturum açan"] },
      { label: "Yapılacak", value: `Zimmet ${user} adına aktarılmalı ya da kullanım düzeltilmeli`, action: true },
    ];
  }
  if (/^Mükerrer Çift Zimmet/.test(tag)) {
    return [
      ...base,
      { label: "Durum", value: `Aynı kişiye ${(row.duplicateDevices || []).length || "birden fazla"} notebook zimmetli` },
      ...(row.duplicateDevices && row.duplicateDevices.length
        ? [{
            label: "Mükerrer olabilecek cihazlar",
            list: row.duplicateDevices.map((d) => ({
              serial: d.serial,
              isThis: d.isThis,
              rows: [["Model", d.model || "—"], ["Hostname", d.hostname || "—"], ["Kullanan", d.userName || d.user || "Tespit edilemedi"], ["Son giriş", d.lastLogonTime || "—"]],
            })),
          }]
        : []),
      { label: "Yapılacak", value: "Kullanılmayan cihaz iade edilmeli ya da neden gerektiği belirtilmeli", action: true },
    ];
  }
  return null;
}

// Zimmet satırının açıklaması (row.model), kişi uyuşmazlığında itemize olmayan yedek uyarı kutusunda zaten gösteriliyorsa ayrıca gösterilmez
export const descriptionShownInAlert = (row) => !(row.personMatched ?? row.matched) && !zimmetAlertItems(row);
