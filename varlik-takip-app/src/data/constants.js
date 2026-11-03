export const DEPARTMENTS = [
  { id: "d1", name: "Departman 1" },
  { id: "d2", name: "Departman 2" },
  { id: "d3", name: "Departman 3" },
];

// Rapor Türü menüsü artık iki kategoriye ayrılıyor (gereksinim #2): "Genel Raporlar" ve
// "LAKESIDE". Mevcut 3 rapor (inaktif/disk/zimmet) gerçek veriyle çalışıyor; yeni eklenen 8+3
// rapor şimdilik veri kaynağı olmadığı için iskelet halinde (bkz. dataSourceAdapter.js) —
// kullanıcı manuel Excel yükleyene kadar "Veri kaynağı tanımlı değil" gösterilir.
export const REPORT_CATEGORIES = [
  {
    id: "genel",
    name: "Genel Raporlar",
    reports: [
      { id: "inaktif", name: "İnaktif Cihazlar" },
      { id: "disk", name: "Disk Alanı" },
      { id: "zimmet", name: "Zimmet Uyuşmazlığı" },
      { id: "lokasyon-ip", name: "Lokasyon Hostname ve IP Uyuşmazlığı" },
      { id: "kullanilmayan", name: "Kullanılmayan Cihazlar" },
      { id: "atil-monitor", name: "Atıl Monitörler" },
      { id: "kapatma-onayi", name: "Kapatma Onayı Bekleyen Kayıtlar" },
      { id: "yeni-kurulum", name: "Yeni Kurulum Kaydı" },
      { id: "sccm-ajan", name: "SCCM Ajan Raporu" },
    ],
  },
  {
    id: "lakeside",
    name: "LAKESIDE",
    reports: [
      { id: "battery-health", name: "Battery Health" },
      { id: "ajan-yuklu", name: "Ajan Yüklü Cihazlar" },
      { id: "bsod", name: "BSOD" },
      { id: "darbogaz", name: "Bottleneck" },
    ],
  },
];

// Geriye dönük uyumluluk: mail geçmişi filtre dropdown'u, Ayarlar bildirim matrisi ve export
// dosya adı lookup'ı düz bir listeye ihtiyaç duyuyor — bunlar hiç değiştirilmeden çalışmaya devam eder.
export const REPORT_TYPES = REPORT_CATEGORIES.flatMap((c) => c.reports);

// Rapor kayıtlarında hangi raporların gerçek veriye sahip olduğu / Model filtresi gösterip
// göstermeyeceği (gereksinim #3, #15) — bu üçü dışındakiler henüz veri kaynağı yok (F bloğu).
export const REPORTS_WITH_REAL_DATA = new Set(["inaktif", "disk", "zimmet", "kullanilmayan", "bsod", "darbogaz", "battery-health", "yeni-kurulum", "kapatma-onayi", "sccm-ajan", "atil-monitor"]);
export const REPORTS_WITHOUT_MODEL_FILTER = new Set(["disk", "bsod", "battery-health", "yeni-kurulum"]);

// Sol menü — Network (gereksinim #1). Kaynak şu an manuel yükleme; ileride SharePoint/API'ye
// geçilebilir (bkz. services/dataSourceAdapter.js).
export const NETWORK_ITEMS = [
  { id: "bant-genisligi", name: "Ofis Bant Genişliği" },
];

export const STATUS_FLOW = ["Yeni", "İnceleniyor", "Çözüldü"];

export const STATUS_COLORS = {
  "Yeni": { bg: "rgba(184,74,62,0.09)", fg: "#B84A3E" },
  "İnceleniyor": { bg: "rgba(180,120,10,0.10)", fg: "#B4780A" },
  "Çözüldü": { bg: "rgba(76,122,94,0.10)", fg: "#4C7A5E" },
};
