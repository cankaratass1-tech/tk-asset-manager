// Mock veri seti (bkz. src/services/reportService.js)
export const MOCK_DATA = {
  d1: {
    inaktif: [
      { owner: "A. Yılmaz", sub: "İstanbul Satış", serial: "SN-88213X", model: "Dell Latitude 5420", location: "İstanbul", matched: true },
      { owner: "M. Demir", sub: "Abidjan Satış", serial: "SN-77410A", model: "HP EliteBook 840", location: "Abidjan", matched: true },
      { owner: "S. Kaya", sub: "Genel Müdürlük", serial: "SN-91027M", model: "Lenovo ThinkPad T14", location: "—", matched: false },
      { owner: "T. Özkan", sub: "Toronto Satış", serial: "SN-65590T", model: "Dell Latitude 5420", location: "Toronto", matched: true },
      { owner: "E. Aydın", sub: "Genel Müdürlük", serial: "SN-30021B", model: "HP EliteBook 840", location: "—", matched: false },
      { owner: "B. Şahin", sub: "İzmir Satış", serial: "SN-40218C", model: "Lenovo ThinkPad T14", location: "İzmir", matched: true },
      { owner: "C. Arslan", sub: "Ankara Satış", serial: "SN-51092D", model: "Dell Latitude 5420", location: "Ankara", matched: true },
    ],
    disk: [
      { owner: "F. Koç", sub: "İstanbul Satış", serial: "PC-19233", model: "Boş: 2.1 GB / C:", location: "İstanbul", matched: true },
      { owner: "G. Er", sub: "Genel Müdürlük", serial: "PC-20411", model: "Boş: 0.8 GB / C:", location: "—", matched: false },
    ],
  },
  d2: {
    inaktif: [
      { owner: "H. Polat", sub: "Lagos Satış", serial: "SN-11029F", model: "Dell Latitude 5420", location: "Lagos", matched: true },
      { owner: "İ. Çelik", sub: "Genel Müdürlük", serial: "SN-22093G", model: "HP EliteBook 840", location: "—", matched: false },
      { owner: "J. Doğan", sub: "Nairobi Satış", serial: "SN-33871H", model: "Lenovo ThinkPad T14", location: "Nairobi", matched: true },
    ],
    disk: [
      { owner: "K. Aksoy", sub: "Lagos Satış", serial: "PC-30217", model: "Boş: 1.4 GB / C:", location: "Lagos", matched: true },
    ],
  },
  d3: {
    inaktif: [
      { owner: "L. Yıldız", sub: "Kahire Satış", serial: "SN-44127J", model: "Dell Latitude 5420", location: "Kahire", matched: true },
      { owner: "N. Kurt", sub: "Genel Müdürlük", serial: "SN-55890K", model: "HP EliteBook 840", location: "—", matched: false },
    ],
    disk: [],
  },
};
