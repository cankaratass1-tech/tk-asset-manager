// "Zimmet Türü" etiketi — TH'deki Konum Kategorisi'nin okunur hâli. Bilinmeyen/boş değer "User" gibi gösterilmez.
const LABELS = { OBS: "OBS (Müdürlük)", User: "User (Kişi)", Warehouse: "Depo (Warehouse)", Site: "Saha (Site)", Supplier: "Tedarikçi (Supplier)" };
export const assignmentLabel = (type) => (type ? LABELS[type] || String(type) : "—");
