// Gerçek veride "Sahibi" alanı "Ad Soyad (Unvan/Organizasyon bilgisi)" biçiminde gelir; örn.
// "Ali Yılmaz (Son Kullanici (Yurtici) Takimi)". Listede sadece isim gösterilince aynı isimli çok sayıda
// kişi birbirine karışıyordu — unvan kısmı ayırt edici olduğu için ayrıca çıkarılıp isim altında gösterilir.
// İç içe parantezler korunur: ilk " (" sonrası metin alınır, yalnızca sondaki tek ")" atılır.
export function ownerTitleOf(full) {
  const text = String(full ?? "").trim();
  const idx = text.indexOf(" (");
  if (idx <= 0) return "";
  let rest = text.slice(idx + 2).trim();
  if (rest.endsWith(")")) rest = rest.slice(0, -1).trim();
  return rest;
}

// Mail ve raporlarda kişiyi net belirtmek için tam ifade ("Ad Soyad (Takım/Unvan)"); yoksa kısa isim.
export function ownerWithTitle(row) {
  const full = String(row?.ownerFull ?? "").trim();
  return full && full !== "—" ? full : row?.owner || "—";
}
