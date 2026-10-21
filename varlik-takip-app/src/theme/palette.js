// Açık tema — önceki sürümde bg (#F5F5F3) ile panel (yarı saydam %70 beyaz)
// neredeyse aynı tonda olduğu için kartlar sayfadan hiç ayrışmıyor, gölgeler
// görünmeyecek kadar hafifti ("sönük" görünüm şikayeti). Aynı
// sıcak/turuncu kimlik korunarak: zemin biraz daha koyu/sıcak, kartlar tam
// opak beyaz (gerçekten "kalkıyor"), aksan daha doygun, gölgeler katmanlı ve
// belirgin hale getirildi.
export const LIGHT_PALETTE = {
  bg: "#F2EADD",
  bgGradient: "radial-gradient(1200px 600px at 15% -10%, #FBF3E6 0%, transparent 60%)",
  panel: "#FFFFFF",
  panelSolid: "#FFFFFF",
  line: "rgba(37,27,16,0.10)",
  ink: "#221A10",
  inkSoft: "#8C7C69",
  accent: "#D9631F",
  accentGrad: "linear-gradient(135deg, #D9631F, #F4A052)",
  accentSoft: "rgba(217,99,31,0.12)",
  accentSoftStrong: "rgba(217,99,31,0.09)",
  ok: "#2E8B57",
  okBg: "rgba(46,139,87,0.11)",
  bad: "#D6483C",
  badBg: "rgba(214,72,60,0.10)",
  neutralFg: "#8C7C69",
  neutralBg: "rgba(37,27,16,0.06)",
  neutralDot: "#DED2C1",
  fieldBg: "rgba(37,27,16,0.05)",
  white: "#FFFFFF",
  overlay: "rgba(30,21,12,0.45)",
  toastBg: "#221A10",
  toastFg: "#fff",
  shadow: "0 1px 2px rgba(37,27,16,0.05), 0 10px 26px rgba(37,27,16,0.09)",
  modalShadow: "0 24px 60px rgba(30,21,12,0.35)",
  fieldBorder: "1px solid rgba(37,27,16,0.13)",
  scrollbarThumb: "rgba(37,27,16,0.2)",
  warnFg: "#C67C0A",
  warnBg: "rgba(198,124,10,0.11)",
};

// Koyu tema — aynı "sönük" sorunu buradaydı: panel (%70 saydam, rgba(40,40,37,.7))
// zeminle (#1A1A18) neredeyse aynı tona karışıyor, gölge yok denecek kadar hafifti.
// Koyu temada derinlik gölgeden çok "kat açıklığından" gelir, o yüzden panel artık
// zeminden belirgin şekilde açık ve tam opak; aksan/durum renkleri de koyu zeminde
// daha iyi okunsun diye biraz daha doygun. Aksan tonu açık temayla aynı aile
// (turuncu) — marka kimliği iki temada da tutarlı.
export const DARK_PALETTE = {
  bg: "#181410",
  bgGradient: "radial-gradient(1200px 600px at 15% -10%, rgba(239,143,63,0.10) 0%, transparent 60%)",
  panel: "#26201A",
  panelSolid: "#26201A",
  line: "rgba(255,247,238,0.10)",
  ink: "#F5EFE6",
  inkSoft: "#B0A493",
  accent: "#EF8F3F",
  accentGrad: "linear-gradient(135deg, #EF8F3F, #D9631F)",
  accentSoft: "rgba(239,143,63,0.18)",
  accentSoftStrong: "rgba(239,143,63,0.14)",
  ok: "#4FD38A",
  okBg: "rgba(79,211,138,0.16)",
  bad: "#F0685C",
  badBg: "rgba(240,104,92,0.16)",
  neutralFg: "#B0A493",
  neutralBg: "rgba(255,247,238,0.08)",
  neutralDot: "#6B5F50",
  fieldBg: "rgba(255,247,238,0.07)",
  white: "#302A22",
  overlay: "rgba(10,7,4,0.65)",
  toastBg: "#F5EFE6",
  toastFg: "#181410",
  shadow: "0 1px 2px rgba(0,0,0,0.3), 0 12px 30px rgba(0,0,0,0.45)",
  modalShadow: "0 24px 70px rgba(0,0,0,0.65)",
  fieldBorder: "1px solid rgba(255,247,238,0.14)",
  scrollbarThumb: "rgba(255,247,238,0.22)",
  warnFg: "#F0AC4E",
  warnBg: "rgba(240,172,78,0.16)",
};

// "Aero" teması — kullanıcının verdiği havacılık/glassmorphism mockup'ından türetildi. Işık/koyu temanın YERİNE değil, EKLENTİ olarak: seçilebilir üçüncü bir tema.
// panel token'ı (panelSolid'den farklı olarak) burada BİLEREK yarı saydam (rgba) — sidebar/panel
// stillerinde zaten uygulanan backdropFilter:blur(18px) ancak zemin saydamsa görünür olur; ışık/
// koyu temada "sönük" görünmesin diye panel bilerek tam opaktı (bkz. yukarıdaki yorum), aero'da
// tam tersine gerçek buzlu cam efekti hedefleniyor. Vurgu rengi mockup'taki gibi mavi (#0EA5E9) —
// Kurumun turuncu/kırmızı marka rengiyle bilerek farklı, kullanıcı görüp karar verecek.
export const AERO_PALETTE = {
  bg: "#1E1F22",
  bgGradient: "linear-gradient(135deg, #3A3C41 0%, #1E1F22 70%)",
  panel: "rgba(255,255,255,0.04)",
  panelSolid: "#2A2C30",
  line: "rgba(255,255,255,0.12)",
  // ink/inkSoft mockup'takinden (E2E8F0/94A3B8) bilerek daha parlak — panel neredeyse tamamen
  // saydam (rgba(255,255,255,0.04)) olduğu için zemin koyu gri kalıyor, düşük kontrastlı metin
  // "sönük" duruyordu.
  // ink artık saf beyaz, inkSoft/neutralFg de belirgin şekilde açıldı.
  ink: "#FFFFFF",
  inkSoft: "#CBD5E1",
  accent: "#0EA5E9",
  accentGrad: "linear-gradient(135deg, #0EA5E9, #0284C7)",
  accentSoft: "rgba(14,165,233,0.16)",
  accentSoftStrong: "rgba(14,165,233,0.12)",
  ok: "#10B981",
  okBg: "rgba(16,185,129,0.16)",
  bad: "#FCA5A5",
  badBg: "rgba(239,68,68,0.20)",
  neutralFg: "#CBD5E1",
  neutralBg: "rgba(255,255,255,0.08)",
  neutralDot: "#64748B",
  fieldBg: "rgba(255,255,255,0.07)",
  white: "#2A2C30",
  overlay: "rgba(10,10,12,0.65)",
  toastBg: "#E2E8F0",
  toastFg: "#1E1F22",
  shadow: "0 1px 2px rgba(0,0,0,0.3), 0 10px 40px rgba(0,0,0,0.4)",
  modalShadow: "0 24px 70px rgba(0,0,0,0.6)",
  fieldBorder: "1px solid rgba(255,255,255,0.08)",
  scrollbarThumb: "rgba(255,255,255,0.22)",
  warnFg: "#FCD34D",
  warnBg: "rgba(245,158,11,0.20)",
};

// "ITSM" teması — Lakeside'ın herkese açık sitesinden (lakesidesoftware.com) alınan marka kimliği: birincil mavi
// #4162F4, sade beyaz yüzeyler, Inter/Manrope tipografisi (uygulama CSP font-src 'self' olduğu için sistem fontu
// kullanılır). SMAX/Lakeside ürün arayüzlerine erişim olmadığından ürün ekranları birebir taklit EDİLMEDİ; modern ITSM
// konsollarının ortak dili uygulandı: soğuk gri zemin, ince çizgili kartlar, kompakt tablo, sol menüde mavi aktif şerit,
// anlamsal durum renkleri (yeşil/amber/kırmızı). `itsm: true` bayrağı buildStyles'ta ek stil geçersiz kılmalarını açar.
export const ITSM_PALETTE = {
  itsm: true,
  bg: "#F3F5F9",
  bgGradient: "linear-gradient(#F3F5F9, #F3F5F9)",
  panel: "#FFFFFF",
  panelSolid: "#FFFFFF",
  line: "#E3E7EF",
  ink: "#172033",
  inkSoft: "#667085",
  accent: "#4162F4",
  accentGrad: "linear-gradient(135deg, #4162F4, #2F4AD6)",
  accentSoft: "rgba(65,98,244,0.10)",
  accentSoftStrong: "rgba(65,98,244,0.07)",
  ok: "#12B76A",
  okBg: "rgba(18,183,106,0.12)",
  bad: "#D92D20",
  badBg: "rgba(217,45,32,0.09)",
  neutralFg: "#667085",
  neutralBg: "rgba(23,32,51,0.06)",
  neutralDot: "#C5CCDA",
  fieldBg: "#F2F4F8",
  white: "#FFFFFF",
  overlay: "rgba(16,24,40,0.50)",
  toastBg: "#172033",
  toastFg: "#FFFFFF",
  shadow: "0 1px 2px rgba(16,24,40,0.06)",
  modalShadow: "0 20px 50px rgba(16,24,40,0.28)",
  fieldBorder: "1px solid #D5DBE7",
  scrollbarThumb: "rgba(23,32,51,0.22)",
  warnFg: "#B54708",
  warnBg: "rgba(247,144,9,0.14)",
};
