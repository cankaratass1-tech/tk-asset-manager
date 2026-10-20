// Ana Sayfa grafiklerinden raporlara yönlendirme haritası — Açık Bulgu Dağılımı ve Trend ayrıntısı AYNI tablodan okur
// (Bugün aksiyon gerekenler ile aynı hedef/filtre: tıklanan sayı ile hedefteki liste tutarlı kalsın).
// id'ler dashboardOverviewService.OVERVIEW_REPORTS ile aynı: zimmet, inaktif, kullanilmayan, disk.
export const FINDING_META = {
  zimmet: { label: "Hatalı zimmet", color: "#E5484D", to: "zimmet", opts: { segment: "unmatched" } },
  inaktif: { label: "İnaktif cihaz", color: "#F5A524", to: "inaktif", opts: {} },
  kullanilmayan: { label: "Kullanılmayan", color: "#8E6CF0", to: "kullanilmayan", opts: {} },
  disk: { label: "Kritik disk", color: "#2F7DEB", to: "disk", opts: { segment: "critical" } },
};
