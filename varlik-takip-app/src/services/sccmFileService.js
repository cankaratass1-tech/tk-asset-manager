// SCCM envanter export'unu ("SCCM Inventory Report-W Collection.xlsx") okuyup Zimmet
// Uyuşmazlığı satırlarına çevirir. Diğer gerçek veri dosyalarından farkı: burada zaten hem
// "zimmetli görünen kişi" hem "gerçekte kim kullanıyor" bilgisi TEK satırda bir arada geliyor
// (Envanter* sütunları vs LastLogon* sütunları) — ayrı "assigned"/"active" listelerini
// eşleştirmeye gerek yok, karşılaştırma satır bazında doğrudan yapılabiliyor (bkz. konuşma).
// Sütun adları gerçek dosyadan doğrulandı:
//   Serial Number -> serial, Hostname -> yedek anahtar (Serial Number boşsa)
//   Envanter User Name -> zimmetli kişinin kısa/sicil adı (karşılaştırma bunun üzerinden yapılır)
//   Envanter User -> zimmetli kişinin uzun/tam açıklaması ("Ad Soyad (Unvan...)" biçiminde)
//   LastLogon UserName -> gerçekte giriş yapanın kısa adı, LastLogonUser -> uzun/DOMAIN\kullanıcı biçimi
//   İştirak -> şirket kodu, EnvanterLokasyon/EnvanterLocationParent -> lokasyon
import { backendClient } from "./backendClient";
import { daysSince, DEFAULT_STALE_DAYS } from "./comparisonService";

function col(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return String(row[name]).trim();
  }
  return "";
}

// İnaktif Cihazlar'daki "Sahibi" alanıyla aynı desen — uzun açıklamadan sadece isim kısmını çıkar
function shortName(full) {
  if (!full) return full;
  const idx = full.indexOf(" (");
  return idx > 0 ? full.slice(0, idx).trim() : full;
}

export function mapSccmRow(raw) {
  const hostname = col(raw, "Hostname");
  const serial = col(raw, "Serial Number") || hostname;
  const ownerShort = col(raw, "Envanter User Name");
  const ownerFullRaw = col(raw, "Envanter User");
  const userShort = col(raw, "LastLogon UserName");
  const userFullRaw = col(raw, "LastLogonUser");
  // Gerçekte giriş yapan kişinin sicil numarası — TuruncuHat'taki "Cihaz Sahibinin Sicili" ile
  // birebir karşılaştırılabilir (bkz. comparisonService.js). İsim bazlı karşılaştırma güvenilmez:
  // TH'de tam ad ("Ensar Bekdemir"), SCCM lastlogon'da kısa kullanıcı adı ("E_BEKDEMIR") farklı
  // formatlarda olduğu için aynı kişi bile olsa metin olarak hiç eşleşmiyordu (bkz. konuşma —
  // gerçek TuruncuHat verisiyle "zimmeti doğru ama neden hatalı diyor" sorunu). Sicil numarası
  // format bağımsız, kesin bir eşleştirme sağlıyor.
  const userSicil = col(raw, "Last LogonSicil", "Last LogonSicil ", "LastLogonSicil");

  const lastLogonTime = col(raw, "LastLogonTime");
  const lastLogonDaysAgo = daysSince(lastLogonTime);

  let statusTag, matched, detail;
  if (!ownerShort && userShort) {
    // "Envanter kaydı yok + SCCM'de bir kullanıcı görünüyor" tek başına KANIT değil — o kullanıcı
    // adı aylar/yıllar önceki bir oturumdan kalmış olabilir (cihaz sonradan depoya dönmüş olabilir).
    // Gerçek/güncel kullanım ancak son girişin yakın tarihli olmasıyla doğrulanır — aynı eşik
    // (DEFAULT_STALE_DAYS) "Kullanılmayan Cihazlar" raporunda da kullanılıyor (bkz. konuşma).
    if (lastLogonDaysAgo != null && lastLogonDaysAgo <= DEFAULT_STALE_DAYS) {
      statusTag = "Zimmetsiz Kullanım";
      matched = false;
      detail = `${serial} seri numaralı cihazın envanter kaydı yok, ${userShort} kullanıyor (son giriş ${lastLogonDaysAgo} gün önce).`;
    } else {
      statusTag = "Zimmetsiz Kullanım (Doğrulanamadı)";
      matched = false;
      detail = lastLogonDaysAgo != null
        ? `${serial} seri numaralı cihazın envanter kaydı yok; SCCM'de ${userShort} görünüyor ama son giriş ${lastLogonDaysAgo} gün önce (eşik: ${DEFAULT_STALE_DAYS} gün) — güncel kullanım doğrulanamıyor, muhtemelen depoya dönmüş.`
        : `${serial} seri numaralı cihazın envanter kaydı yok; SCCM'de ${userShort} görünüyor ama son giriş tarihi bilinmiyor — güncel kullanım doğrulanamıyor.`;
    }
  } else if (!userShort) {
    statusTag = "Kullanım Kaydı Yok";
    matched = false;
    detail = `${serial} seri numaralı cihaz ${ownerShort || "—"}'e zimmetli, aktif kullanım kaydı bulunamadı.`;
  } else if (ownerShort.toLowerCase() === userShort.toLowerCase()) {
    statusTag = "Zimmet Doğru";
    matched = true;
    detail = `${serial} seri numaralı cihazı ${ownerShort} kullanmalı ve kullanıyor.`;
  } else {
    statusTag = "Zimmet Hatalı";
    matched = false;
    detail = `${serial} seri numaralı cihazı ${ownerShort} kullanmalı, ama ${userShort} kullanıyor.`;
  }

  const location = col(raw, "EnvanterLokasyon");

  return {
    rowKey: `sccm|${serial}`,
    owner: shortName(ownerFullRaw) || ownerShort || "—",
    ownerFull: ownerFullRaw || ownerShort || "—",
    // "Tür" filtresi (App.jsx deviceTypeOf) " — " öncesini cihaz tipi olarak alıyor — burada
    // gerçek "Type" (Desktop/Laptop) sütunu kullanılmalı, "Model" (ör. "OptiPlex 7090") değil;
    // aksi halde filtre modele göre çalışıp anlamsız düşük sayılar veriyordu (bkz. konuşma)
    sub: `${col(raw, "Type") || "Bilinmiyor"} — ${col(raw, "Model")}`,
    hostname,
    serial,
    ownedLabel: serial,
    userLabel: userShort || "Tespit Edilemedi",
    userFull: userFullRaw || userShort,
    userSicil,
    model: detail,
    location: location || "—",
    lbsParent: col(raw, "EnvanterLocationParent"),
    company: col(raw, "İştirak"),
    // Lokasyon Hostname ve IP Uyuşmazlığı raporu için — SCCM'in "IPAddresses" sütunu virgülle
    // ayrılmış birden fazla IP taşıyabilir (VPN/sanal adaptörler dahil); ham haliyle taşınır,
    // filtreleme (172.x seçimi) locationIpService.js'te yapılır (bkz. konuşma).
    ipAddresses: col(raw, "IPAddresses"),
    office: location || "—",
    lastLogonTime: col(raw, "LastLogonTime"),
    // Disk Alanı kritik mail'i için ek alanlar — Disk Alanı Excel'inde bulunmayan Seri No/OU/
    // Bitlocker/gerçek kullanıcı maili bilgileri hostname üzerinden SCCM'den zenginleştiriliyor
    // (bkz. konuşma). "model" alanı yukarıda zimmet açıklama cümlesi için kullanıldığından,
    // gerçek cihaz modeli için ayrı bir alan.
    deviceModel: col(raw, "Model"),
    ouName: col(raw, "OUName"),
    bitlocker: col(raw, "Bitlocker Enabled"),
    mail: col(raw, "LastLogonMail"),
    // Faz 3 (madde 8/10/11) — BIOS/üretim tarihi (cihaz yaşı hesabı) + SCCM ajanının son iletişim
    // zamanı. Gerçek export'ta tam sütun adları farklı olabilir; birkaç varyant denenir, yoksa
    // boş kalır ("Veri Yok" gösterilir, uygulama hata vermez).
    biosDate: col(raw, "BIOS Date", "BIOSDate", "Bios Date", "BiosReleaseDate", "SMBIOS BIOS Date"),
    lastClientContact: col(raw, "Last Client Check", "LastClientCheck", "Last Hardware Scan", "LastHardwareScan", "Last Active Time", "LastActiveTime"),
    clientActive: col(raw, "Client Active", "ClientActive", "Active"),
    matched,
    statusTag,
    _raw: raw,
  };
}

export async function fetchSccmRowsFromFile() {
  const result = await backendClient.getSccmReport();
  if (!result.ok) throw new Error(result.message || "Dosya okunamadı");
  return {
    fileName: result.fileName,
    modifiedAt: result.modifiedAt,
    rows: (result.rows || []).map(mapSccmRow),
  };
}
