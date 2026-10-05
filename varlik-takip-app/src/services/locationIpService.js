// "Lokasyon Hostname ve IP Uyuşmazlığı" raporu (bkz. konuşma).
//
// Fikir: hostname'in kendisi bir lokasyon kodu taşır (ör. "ABJ0B55" -> kod "ABJ0" — baştaki
// harfler + ilk rakam). Bu kod, Lokasyon Mail Listesi'ndeki "Lokasyon Kodu" sütununda AYNI
// kuralla (baştaki harfler + ilk rakam) çıkarılan koda eşleşiyorsa cihazın "olması gereken"
// lokasyon ADI bulunur. Aynı lokasyon adına ait BİRDEN FAZLA kod (kardeş node/subnet, ör.
// ABJ0-SD1 + ABJ1-SD1, ikisi de "ABIDJAN SATIS OFISI") olabileceğinden, kardeşlerin TÜMÜNÜN
// kayıtlı IP_Address'i (ilk 3 oktet) toplanır. Cihazın SCCM'deki gerçek IP'si (172.x olanı,
// birden fazla olabilir) bu kardeş IP havuzundan HİÇBİRİYLE eşleşmiyorsa "Hostname/IP
// Uyuşmazlığı" — eşleşiyorsa "Doğru Ofiste Kullanılıyor".
//
// Kapsam dışı (rapora hiç girmez, madde: kanıt yoksa hiçbir şey iddia edilmez):
//   - hostname'den kod çıkarılamıyorsa (beklenen "harfler+rakam" örüntüsüne uymuyorsa)
//   - çıkarılan kod Lokasyon Mail Listesi'nde hiç bulunamıyorsa (bilinmeyen kod)
//   - cihazın SCCM'de hiç 172.x IP'si yoksa (karşılaştırma yapılamaz)

const norm = (v) => String(v || "").trim().toLowerCase();

// "ABJ0B55" -> "ABJ0" ("ABJ0-SD1" -> "ABJ0" de aynı kuralla). Baştaki harfler + İLK rakam.
export function extractLocationCode(value) {
  const m = String(value || "").trim().match(/^([A-Za-zÇĞİÖŞÜçğıöşü]+)(\d)/);
  return m ? (m[1] + m[2]).toUpperCase() : "";
}

function ipPrefix(ip) {
  const parts = String(ip || "").trim().split(".");
  return parts.length >= 3 ? parts.slice(0, 3).join(".") : "";
}

export function computeLocationIpRows({ sccmRows = [], lokasyonRows = [] } = {}) {
  // kod -> lokasyon adı (ilk eşleşme kazanır)
  const nameByCode = new Map();
  // lokasyon adı (normalize) -> o ada ait kardeş kodların TÜM IP prefix'leri
  const prefixesByName = new Map();
  // lokasyon adı (normalize) -> orijinal (görüntülenecek) isim
  const displayNameByNorm = new Map();

  lokasyonRows.forEach((r) => {
    const code = extractLocationCode(r.kod);
    const name = r.locationName;
    if (!name) return;
    const nkey = norm(name);
    if (!displayNameByNorm.has(nkey)) displayNameByNorm.set(nkey, name);
    if (code && !nameByCode.has(code)) nameByCode.set(code, nkey);
    const pfx = ipPrefix(r.ipAddress);
    if (pfx) {
      if (!prefixesByName.has(nkey)) prefixesByName.set(nkey, new Set());
      prefixesByName.get(nkey).add(pfx);
    }
  });

  const rows = [];
  sccmRows.forEach((s) => {
    const code = extractLocationCode(s.hostname);
    if (!code) return;
    const nkey = nameByCode.get(code);
    if (!nkey) return; // bilinmeyen kod — kapsam dışı

    const devicePrefixes = Array.from(
      new Set(
        String(s.ipAddresses || "")
          .split(",")
          .map((x) => x.trim())
          .filter((x) => x.startsWith("172."))
          .map(ipPrefix)
          .filter(Boolean)
      )
    );
    if (devicePrefixes.length === 0) return; // 172.x IP yok — karşılaştırılamaz

    const expectedName = displayNameByNorm.get(nkey);
    const expectedPrefixes = Array.from(prefixesByName.get(nkey) || []);
    const matched = devicePrefixes.some((p) => expectedPrefixes.includes(p));

    rows.push({
      rowKey: `locip|${s.serial || s.hostname}`,
      owner: expectedName,
      ownerFull: expectedName,
      sub: s.sub,
      serial: s.serial,
      hostname: s.hostname,
      locationCode: code,
      location: devicePrefixes.join(", "),
      office: expectedName,
      deviceModel: s.deviceModel,
      matched,
      statusTag: matched ? "Doğru Ofiste Kullanılıyor" : "Hostname/IP Uyuşmazlığı",
      model: matched
        ? `${s.hostname} (${code}) — "${expectedName}" için kayıtlı IP aralığıyla eşleşiyor (${devicePrefixes.join(", ")}).`
        : `${s.hostname} (${code}) — "${expectedName}" lokasyonuna ait kayıtlı IP aralıklarından (${expectedPrefixes.join(", ") || "kayıt yok"}) hiçbiri bu cihazın gerçek IP'siyle (${devicePrefixes.join(", ")}) eşleşmiyor.`,
      lastLogonTime: s.lastLogonTime,
      mail: s.mail,
      company: s.company,
      lbsParent: s.lbsParent,
      _raw: s._raw,
    });
  });
  return rows;
}

// Uyuşmazlık maili — kullanıcı tarafından verilen tam metin (bkz. konuşma), sadece lokasyon adı
// ("Merkez Ofis" örneği) satır bazında gerçek beklenen ofis adıyla değiştiriliyor, cihaz
// (Computer name) referansı IT'nin bileti bulabilmesi için alta ekleniyor — gövde metni aksi
// halde AYNEN korunuyor.
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function locationIpMailSubject() {
  return "Lokasyon/IP Uyuşmazlığı — Cihaz Bilgilerinizin Güncellenmesi Gerekiyor";
}

export function buildLocationIpMailHtml(row) {
  const officeName = row.owner || "Merkez Ofis";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6;">
    <p>Merhaba,</p>
    <p>Yapılan envanter kontrolünde, cihazınıza ait personel lokasyonu "${esc(officeName)}" olarak görünmektedir. İzleme sistemleri üzerinden alınan bağlantı bilgileri, cihazınızın farklı bir bölge veya yurt dışı lokasyonuna ait IP bloğundan düzenli olarak bağlandığını göstermektedir.</p>
    <p>Envanter bilgilerimizin güncel ve doğru tutulabilmesi amacıyla cihazınızın "Computer name" bilgilerinin kontrol edilmesi ve gerekiyorsa güncellenmesi gerekmektedir.</p>
    <p>Gerekli güncellemenin yapılabilmesi için BT ekibimizle iletişime geçiniz.</p>
    <p>Bu bildirim, envanter sistemlerindeki lokasyon ve bağlantı bilgilerinin otomatik karşılaştırılması sonucunda oluşturulmuştur.<br/>
    Herhangi bir lokasyon değişikliği bulunmuyorsa veya mevcut bilgilerin doğru olduğunu düşünüyorsanız, bu durumu BT ekibimize bildirmeniz yeterlidir.</p>
    <p>Teşekkürler.<br/>BT Operasyonları / IT Support</p>
    <p style="margin-top:18px;padding-top:10px;border-top:1px solid #ccc;font-size:12px;color:#555;">
      Referans — Computer name: <strong>${esc(row.hostname)}</strong>${row.serial ? ` · Seri No: ${esc(row.serial)}` : ""}
    </p>
  </div>`;
}
