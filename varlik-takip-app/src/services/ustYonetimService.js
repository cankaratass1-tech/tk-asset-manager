// Üst Yönetim İstisna Listesi — KRİTİK kural (bkz. konuşma): "Üst yönetime hiçbir şekilde mail
// gitmemeli". Bu bilgi ARTIK Excel'den (TH'nin ünvan sütunundan) OKUNMUYOR (bkz. konuşma:
// "excelden o verileri çekme hiç") — Excel'deki eksik/tutarsız bir satırın bu kritik kontrolü
// atlatması riskini tamamen ortadan kaldırmak için, admin'in Ayarlar'dan elle yönettiği sabit bir
// e-posta listesi backend'de tutuluyor (bkz. backend/src/routes/ustyonetim.js).
import { backendClient } from "./backendClient";

const norm = (v) => String(v || "").trim().toLowerCase();

export function buildUstYonetimEmailSet(emails) {
  return new Set((emails || []).map(norm));
}

export function isUstYonetimEmail(emailSet, email) {
  return !!email && emailSet.has(norm(email));
}

export async function fetchUstYonetimEmails() {
  const result = await backendClient.getUstYonetimList();
  return Array.isArray(result?.emails) ? result.emails : [];
}
