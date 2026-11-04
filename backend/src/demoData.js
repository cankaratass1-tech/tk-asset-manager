// Paketli örnek (demo) veri geri dönüşü: dosya/kayıt yokken backend, repo ile gelen örnek dosyalara düşer (bulut deploy'da ilk açılış boş görünmesin diye).
// DEMO_DATA=0 ile kapatılır — taşınabilir pakette (baslat.bat) kapalıdır: hiç dosya yüklenmediyse her ekran gerçekten boş / sıfır görünür.
function demoDataEnabled() {
  return String(process.env.DEMO_DATA || "").trim() !== "0";
}

module.exports = { demoDataEnabled };
