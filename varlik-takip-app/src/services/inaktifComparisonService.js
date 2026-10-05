// İnaktif Cihazlar — basitleştirildi (bkz. konuşma: "bence karışıklığa yol açar").
//
// ÖNEMLİ DÜZELTME: Önceki tasarım seri no'yu ayrıca TH'de arayıp "inaktif olduğunu TH ile teyit"
// etmeye çalışıyordu (TuruncuHat'ta Bulunamadı / İnaktif Doğrulandı / İnaktif Etiketi Hatalı gibi
// 4 ayrı durum). Kullanıcı bunun kafa karıştırdığını belirtti: "Bu liste zaten inaktif liste yani
// TH'den çekiliyordu... bunlar tamamen inaktif cihazlar" — yani bir satırın bu listede olması
// ZATEN sahibinin inaktif olduğunu gösterir, TH ile ayrıca teyide gerek yok.
//
// Gerçek amaç iki mail şablonu:
//   1) Cihaz gerçekten kullanılmıyorsa (SCCM'de aktif giriş kaydı yok) → inaktif kullanıcıya
//      mevcut şablonla mail (bkz. App.jsx buildInaktifMailHtml — bu servis değişmedi).
//   2) Cihazı başka biri kullanıyorsa (SCCM'de "LastLogon UserName" dolu) → SCCM'den Hostname +
//      giriş yapan kişi bilgisi çekilip o kişiye "bu cihazı sen kullanıyorsun, sana zimmetleyelim"
//      maili atılabilsin diye actualUser/actualUserMail/hostname bilgisi satıra eklenir.
// Tek karşılaştırma kaynağı SCCM — TH'ye hiç bakılmıyor.
import { norm } from "./comparisonService";

// Aksiyon (zimmet devri maili) gereken tek durum.
export const INAKTIF_ACTION_TAG = "Kullanılıyor — Zimmet Aktarımı Gerekli";
export const needsInaktifAction = (statusTag) => statusTag === INAKTIF_ACTION_TAG;

// Bu serviste artık "kanıtsız/doğrulanamayan" bir ara durum yok (TH'ye bakılmadığı için) — ama
// TableView/DetailAside/RecordPopup ortak isInaktifUnverified import ediyor, boş küme ile
// geriye dönük uyumlu kalsın diye burada da dışa aktarılıyor.
export const isInaktifUnverified = () => false;

export function computeInaktifComparisonRows({ inaktifRows = [], sccmRows = [] } = {}) {
  const sccmBySerial = new Map();
  sccmRows.forEach((s) => {
    const k = norm(s.serial);
    if (k) sccmBySerial.set(k, s);
  });

  return inaktifRows.map((r) => {
    const s = sccmBySerial.get(norm(r.serial));
    const sccmUser = s && s.userLabel && s.userLabel !== "Tespit Edilemedi" ? s.userLabel : "";

    if (!sccmUser) {
      return {
        ...r,
        hostname: s ? s.hostname : "",
        lastLogonTime: s ? s.lastLogonTime : "",
        actualUser: "",
        actualUserFull: "",
        actualUserMail: "",
        matched: true,
        statusTag: "İnaktif — Kullanılmıyor",
        matchDetail: `${r.serial} seri numaralı cihaz ${r.owner || "—"}'e zimmetli görünüyor, SCCM'de aktif kullanım kaydı yok.`,
      };
    }

    return {
      ...r,
      hostname: s.hostname || "",
      lastLogonTime: s.lastLogonTime || "",
      actualUser: sccmUser,
      actualUserFull: s.userFull || sccmUser,
      actualUserMail: s.mail || "",
      matched: false,
      statusTag: INAKTIF_ACTION_TAG,
      // Kullanıcı isteği: kuru/teknik cümle yerine durumu doğrudan anlatan bir metin — "bu
      // cihazın sahibi inaktif ama X kullanıyor, zimmetlerin doğru yönetilmesi için X adına
      // zimmet transferi yapılması gerekmektedir" (bkz. konuşma).
      matchDetail: `${r.serial} seri numaralı cihazın sahibi (${r.owner || "—"}) inaktif, ancak SCCM kayıtlarına göre bu cihazı ${sccmUser} kullanıyor (${s.hostname || "hostname yok"}). Zimmet hareketlerinin doğru yönetilebilmesi için cihazın ${sccmUser} adına zimmet transferinin yapılması gerekmektedir.`,
    };
  });
}
