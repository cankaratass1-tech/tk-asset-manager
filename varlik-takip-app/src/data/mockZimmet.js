// Zimmet listesi ve aktif kullanım listesi — iki ayrı veri kaynağını temsil eden mock veri (bkz. src/services/zimmetService.js)
export const MOCK_ZIMMET = {
  d1: {
    assigned: [
      { serial: "MN-10021", owner: "A. Yılmaz", type: "Monitör — Dell 24\"", location: "İstanbul" },
      { serial: "MN-10300", owner: "A. Yılmaz", type: "Monitör — Dell 24\"", location: "İstanbul" },
      { serial: "MN-10088", owner: "S. Kaya", type: "Monitör — LG 27\"", location: "Genel Müdürlük" },
      { serial: "MN-10250", owner: "S. Kaya", type: "Monitör — LG 27\"", location: "Genel Müdürlük" }, // mükerrer: S. Kaya'ya aynı tür 2. monitör
      { serial: "LP-20044", owner: "T. Özkan", type: "Laptop — Dell Latitude", location: "Toronto" },
      { serial: "MN-10133", owner: "C. Arslan", type: "Monitör — Dell 24\"", location: "Ankara" },
      { serial: "VN-8821", owner: "E. Aydın", type: "76, 69, 78, 32, 76, 84, 50, 50, 50, 51, 112, 119, 67", location: "Genel Müdürlük" },
    ],
    active: [
      { serial: "MN-10021", user: "B. Şahin" }, // A. Yılmaz'ın zimmetli cihazını B. Şahin kullanıyor
      { serial: "MN-10300", user: "D. Tekin" }, // A. Yılmaz'ın 2. monitörünü D. Tekin kullanıyor
      { serial: "MN-10088", user: "S. Kaya" }, // tutarlı
      { serial: "MN-10133", user: "A. Yılmaz" }, // A. Yılmaz kendi zimmetlisi yerine C. Arslan'a ait cihazı kullanıyor
    ],
  },
  d2: {
    assigned: [
      { serial: "MN-30012", owner: "H. Polat", type: "Monitör — Dell 24\"", location: "Abidjan" },
      { serial: "LP-30099", owner: "İ. Çelik", type: "Laptop — HP EliteBook", location: "İzmir" },
    ],
    active: [
      { serial: "MN-30012", user: "H. Polat" },
      { serial: "LP-30099", user: "J. Doğan" }, // İ. Çelik'in cihazını J. Doğan kullanıyor
    ],
  },
  d3: {
    assigned: [
      { serial: "MN-40071", owner: "L. Yıldız", type: "Monitör — LG 27\"", location: "Ankara" },
    ],
    active: [],
  },
};
