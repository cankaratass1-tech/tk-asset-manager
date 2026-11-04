// İlk kurulum (Master User oluşturma) kurulum koduyla korunur. Kod, ilk Master oluşturulana
// kadar gereklidir. Kaynak: SETUP_CODE ortam değişkeni (en az 16 karakter) ya da süreç başına
// rastgele üretilen değer (yalnızca bellekte, açılışta konsola yazılır, diske kaydedilmez).
const crypto = require("crypto");

let cachedCode = null;
let generated = false;

function getSetupCode() {
  if (cachedCode) return cachedCode;
  const fromEnv = process.env.SETUP_CODE;
  if (fromEnv && fromEnv.length >= 16) {
    cachedCode = fromEnv;
  } else {
    cachedCode = crypto.randomBytes(16).toString("hex");
    generated = true;
  }
  return cachedCode;
}

const digest = (v) => crypto.createHash("sha256").update(String(v ?? "")).digest();

// SETUP_CODE_REQUIRED=0 ise ilk kurulumda kod istenmez (yalnızca yerel/taşınabilir test paketi için: baslat.bat). Varsayılan: kod ZORUNLU.
const setupCodeRequired = () => String(process.env.SETUP_CODE_REQUIRED ?? "1").trim() !== "0";

function verifySetupCode(input) {
  return crypto.timingSafeEqual(digest(input), digest(getSetupCode()));
}

// Master henüz yoksa, kodu operatörün görebileceği tek yere (sunucu konsolu) yazar.
function announceSetupCode() {
  if (!setupCodeRequired()) {
    console.log("İlk kurulum için Master User oluşturulmamış. Kurulum kodu İSTENMİYOR (SETUP_CODE_REQUIRED=0); yalnız kullanıcı adı ve şifre girilir.");
    return;
  }
  const code = getSetupCode();
  if (generated) {
    console.log(
      `İlk kurulum için Master User oluşturulmamış. Kurulum kodu: ${code}\n` +
        "(Kod bu çalıştırmaya özeldir; SETUP_CODE ortam değişkeniyle sabitlenebilir.)"
    );
  } else {
    console.log("İlk kurulum için Master User oluşturulmamış. Kurulum kodu SETUP_CODE ortam değişkeninden alınır.");
  }
}

module.exports = { getSetupCode, verifySetupCode, announceSetupCode, setupCodeRequired };
