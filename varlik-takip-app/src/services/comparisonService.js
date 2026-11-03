// TuruncuHat (TH) ↔ SCCM ↔ Monitor Raporu üçlü karşılaştırma motoru.
//
// ÖNEMLİ MİMARİ KARAR: Temel liste artık SCCM DEĞİL, TuruncuHat — kullanıcının kendi ifadesiyle
// "TH gerçek/tam envanter, Zimmet Uyuşmazlığı listesi oradan gelmeli". Önceki tasarımda temel
// liste SCCM'in 21.044 kaydıydı (ajanın gördüğü her şey — sunucu, kiosk, vs. dahil, TuruncuHat'ta
// hiç kaydı olmayan binlerce satır da dahil) ve TH sadece doğrulama için kullanılıyordu. Şimdi
// tam tersi: TH'nin "Desktop/Laptop/Monitor" tipindeki satırları temel alınır;
// SCCM (gerçek kullanan kişi/PC için) ve Monitor Raporu (gerçek kullanan kişi/monitör için) çapraz
// referans olarak kullanılır. Monitörler artık PC'nin popup'ında gizli bir alt liste değil, kendi
// başlarına birer satır.
//
// Eşleştirme anahtarları (gerçek verilerden doğrulandı):
//   PC (DESKTOP/NOTEBOOK): TuruncuHat.serial <-> SCCM.serial
//   Monitor:                TuruncuHat.serial <-> MonitorRaporu.monitorSerial
//                            (bir PC'ye bağlı monitörleri popup'ta göstermek için ayrıca
//                             MonitorRaporu.hostname <-> SCCM.hostname de kullanılıyor)
//
// Kullanıcı doğrulaması (format bağımsız, KESİN karşılaştırma; TH'de tam ad, SCCM/Monitor'da kısa kullanıcı adı olduğundan
// isim karşılaştırması güvenilmez): öncelik TH "Owner Username" ↔ SCCM/Monitor kısa kullanıcı adı; o yoksa TH
// "Cihaz Sahibinin Sicili" ↔ SCCM "Last LogonSicil" sicil numarası.
//
// Zimmet iki türde olabilir — TuruncuHat'ın "Konum Kategorisi" sütunu bunu taşır: "User" =
// kişiye zimmetli, "OBS" = bir müdürlüğe/departmana zimmetli. OBS zimmetli cihazlarda birden
// fazla kişinin kullanması normaldir — "Zimmet Hatalı" sayılmaz.
export const norm = (v) => String(v || "").trim().toLowerCase();

// Genel "son X günden eski mi" yardımcı fonksiyonu — Kullanılmayan Cihazlar raporu ve Zimmet
// Uyuşmazlığı'ndaki "gerçek/güncel kullanım kanıtı" kontrolleri AYNI eşiği paylaşır.
// Kanonik kaynak burası — unusedDeviceService.js ve sccmFileService.js buradan alır, döngüsel
// import'tan kaçınmak için (comparisonService zaten en alttaki ortak yardımcı modül).
export const DEFAULT_STALE_DAYS = 90;
export function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// Yalnızca Desktop, Laptop ve Monitor kullanılır — TH'nin ham "Model" sütunundaki gerçek değerler (büyük harf, İngilizce).
const RELEVANT_TH_TYPES = new Set(["DESKTOP", "NOTEBOOK", "MONITOR"]);

// Konum kategorisinde yalnızca User ve OBS esas alınır — gerçek dosyada "Konum Kategorisi" 6 farklı değer taşıyor: User, Warehouse,
// OBS, Site, Supplier (ve boş). Depoda duran (Warehouse) ya da sahada olan (Site) bir cihaz
// kişiye zimmetli değildir — "zimmet uyuşmazlığı" kavramı bunlar için anlamsız, listeye hiç
// girmemeli (önceden hepsi sessizce "User" sayılıyordu, bu yanlıştı).
const RELEVANT_ASSIGNMENT_TYPES = new Set(["User", "OBS"]);

// Format bağımsız kullanıcı karşılaştırması — hem PC hem monitör satırları için ortak.
// Döndürür: { verifiable, isMatch, verifiedBy } — verifiable:false ise ne username ne sicil
// karşılaştırılabildi demektir (çağıran taraf bu durumda SCCM/Monitor'un kendi statüsüne düşer).
export function compareAssignment({ actualUsername, actualSicil, thUsername, thSicil }) {
  if (actualUsername && thUsername) {
    return { verifiable: true, isMatch: norm(actualUsername) === norm(thUsername), verifiedBy: "kullanıcı adıyla" };
  }
  if (actualSicil && thSicil) {
    return { verifiable: true, isMatch: norm(actualSicil) === norm(thSicil), verifiedBy: "sicil numarasıyla" };
  }
  return { verifiable: false };
}

// ---- Personel rehberi: kullanıcı adı / sicil -> { name, full, title } ----
const userKey = (v) => { const s = String(v || "").trim().toLowerCase(); const i = s.lastIndexOf("\\"); return i >= 0 ? s.slice(i + 1) : s; }; // "alan\kullanici" -> "kullanici"
export function buildUserDirectory(thRows = []) {
  const byUser = new Map(), bySicil = new Map();
  thRows.forEach((t) => {
    if (!t.ownerFull && !t.owner) return;
    const entry = { name: t.owner || "", full: t.ownerFull || t.owner || "" };
    const u = userKey(t.ownerUsername);
    if (u && !byUser.has(u)) byUser.set(u, entry);
    const sc = userKey(t.ownerSicil);
    if (sc && !bySicil.has(sc)) bySicil.set(sc, entry);
  });
  return { byUser, bySicil };
}
export function attachUserNames(row, dir) {
  const label = row.userLabel;
  if (!label || label === "—" || label === "Tespit Edilemedi") return row;
  const hit = dir.byUser.get(userKey(label)) || dir.bySicil.get(userKey(row.userSicil));
  if (!hit) return row;
  const idx = hit.full.indexOf(" (");
  return { ...row, userFullName: hit.name || (idx > 0 ? hit.full.slice(0, idx) : hit.full), userFullTitle: idx > 0 ? hit.full.slice(idx + 2).replace(/\)$/, "").trim() : "" };
}

export function computeComparisonRows({ sccmRows = [], thRows = [], monitorRows = [], staleDays = DEFAULT_STALE_DAYS } = {}) {
  const relevantTh = thRows.filter((r) => RELEVANT_TH_TYPES.has(r.deviceType) && RELEVANT_ASSIGNMENT_TYPES.has(r.assignmentType));
  const userDir = buildUserDirectory(thRows);
  const fullNameOf = (u) => { const h = userDir.byUser.get(userKey(u)); return h ? h.name : ""; };

  // "Birden Fazla Zimmet Mevcut" (madde: kırılım) — aynı kişiye (Owner Username, yoksa Sicil, yoksa
  // isim) User kategorisinde BİRDEN FAZLA NOTEBOOK zimmetli görünmesi — normalde bir kişiye bir
  // laptop beklenir, ikinci bir laptop görülmesi kendi başına bir uyuşmazlık (kullanım eşleşmesi
  // doğru olsa bile). Sadece NOTEBOOK için; Desktop/Monitor bu kurala dahil değil.
  const ownerIdentity = (th) => norm(th.ownerUsername) || norm(th.ownerSicil) || norm(th.owner);
  const notebookOwnerCounts = new Map(); // identity -> seri no listesi
  relevantTh
    .filter((r) => r.deviceType === "NOTEBOOK" && r.assignmentType === "User")
    .forEach((r) => {
      const id = ownerIdentity(r);
      if (!id) return;
      if (!notebookOwnerCounts.has(id)) notebookOwnerCounts.set(id, []);
      notebookOwnerCounts.get(id).push(r.serial);
    });

  const thBySerialAll = new Map(relevantTh.map((r) => [norm(r.serial), r]));
  const sccmBySerial = new Map();
  sccmRows.forEach((s) => {
    const key = norm(s.serial);
    if (key) sccmBySerial.set(key, s);
  });

  // TH'deki monitör satırlarını seri no ile hızlı bulmak için (buildMonitorDetails içinde
  // O(n) .find() yerine O(1) lookup — thRows on binlerce satır olabildiği için önemli)
  const thMonitorBySerial = new Map();
  relevantTh.forEach((r) => {
    if (r.deviceType === "MONITOR") thMonitorBySerial.set(norm(r.serial), r);
  });

  const monitorsBySerial = new Map(); // TH'deki monitör satırını Monitör Raporu'ndaki gerçek kayda bağlamak için
  const monitorsByHostname = new Map(); // bir PC'ye bağlı monitörleri (popup'taki "Bağlı Monitörler") bulmak için
  monitorRows.forEach((m) => {
    const serialKey = norm(m.monitorSerial);
    if (serialKey) monitorsBySerial.set(serialKey, m);
    const hostKey = norm(m.hostname);
    if (hostKey) {
      if (!monitorsByHostname.has(hostKey)) monitorsByHostname.set(hostKey, []);
      monitorsByHostname.get(hostKey).push(m);
    }
  });

  // Bir PC'ye bağlı monitörleri, PC'nin kendi zimmet durumundan bağımsız olarak yapılandırılmış
  // obje dizisine çevirir — hem PC satırının "monitorDetails" alanında (popup) hem PC bulunamadığı
  // durumlarda tek başına kullanılabilir.
  function buildMonitorDetails(attachedList) {
    let monitorIssue = false;
    let monitorUnverified = false;
    const details = attachedList.map((m) => {
      const reg = thMonitorBySerial.get(norm(m.monitorSerial));
      const label = `${m.monitorManufacturer} ${m.monitorModel}`.trim();
      const monitorUser = m.username || "";
      // barkod/marka/asset: Zimmet Uyuşmazlığı mailindeki monitör tablosu için (TuruncuHat kaydından)
      const base = { serial: m.monitorSerial, label, hostname: m.hostname, assignedTo: null, usedBy: monitorUser || "—", assignedToFull: reg?.ownerFull || "", barkod: reg?.barkod || "", marka: reg?.marka || m.monitorManufacturer || "", asset: reg?.asset || reg?.model || m.monitorModel || "" };
      if (!reg) {
        monitorUnverified = true;
        return { ...base, status: "TuruncuHat'ta Kaydı Yok (doğrulanamadı)", ok: null };
      }
      if (reg.assignmentType === "OBS") {
        return { ...base, assignedTo: reg.owner || "Müdürlük (OBS)", status: "Müdürlük Zimmeti (OBS)", ok: true };
      }
      const cmp = compareAssignment({ actualUsername: monitorUser, actualSicil: "", thUsername: reg.ownerUsername, thSicil: reg.ownerSicil });
      if (!cmp.verifiable) {
        monitorUnverified = true;
        return { ...base, assignedTo: reg.owner || "—", status: "Bilgi Eksik (doğrulanamadı)", ok: null };
      }
      if (cmp.isMatch) return { ...base, assignedTo: reg.owner, status: "Doğru — Kendi Monitörünü Kullanıyor", ok: true };
      monitorIssue = true;
      return { ...base, assignedTo: reg.owner, status: "Hatalı — Başkasının Monitörünü Kullanıyor", ok: false };
    });
    return { details, monitorIssue, monitorUnverified };
  }

  const thRowsMapped = relevantTh.map((th) => {
    if (th.deviceType === "MONITOR") {
      const m = monitorsBySerial.get(norm(th.serial));
      const actualUser = m?.username || "";
      let statusTag, matched, userDetail;

      if (!m) {
        statusTag = "Monitör Raporu'nda Bulunamadı";
        matched = false;
        userDetail = `${th.serial} seri numaralı monitör TuruncuHat'ta ${th.owner || "—"}'e zimmetli, ama Monitör Raporu'nda (şu an hangi PC'ye bağlı olduğunu gösteren canlı veri) kaydı yok — muhtemelen şu an takılı/aktif değil.`;
      } else if (th.assignmentType === "OBS") {
        statusTag = "Müdürlük Zimmeti (OBS)";
        matched = true;
        userDetail = actualUser
          ? `${th.serial} seri numaralı monitör ${th.owner || "bir müdürlüğe"} zimmetli (OBS) — şu an ${actualUser} kullanıyor.`
          : `${th.serial} seri numaralı monitör ${th.owner || "bir müdürlüğe"} zimmetli (OBS), aktif kullanım kaydı bulunamadı.`;
      } else if (!actualUser) {
        statusTag = "Kullanım Kaydı Yok";
        matched = false;
        userDetail = `${th.serial} seri numaralı monitör ${th.owner}'e zimmetli, Monitör Raporu'nda aktif kullanıcı bilgisi yok.`;
      } else {
        const cmp = compareAssignment({ actualUsername: actualUser, actualSicil: "", thUsername: th.ownerUsername, thSicil: th.ownerSicil });
        if (!cmp.verifiable) {
          statusTag = "Doğrulanamadı";
          matched = false;
          userDetail = `${th.serial} seri numaralı monitör TuruncuHat'ta ${th.owner}'e zimmetli görünüyor, Monitör Raporu'nda ${actualUser} kullanıyor — ama karşılaştırma için gereken kullanıcı adı/sicil bilgisi eksik.`;
        } else if (cmp.isMatch) {
          statusTag = "Zimmet Doğru";
          matched = true;
          userDetail = `${th.serial} seri numaralı monitörü ${th.owner} kullanmalı ve kullanıyor (${cmp.verifiedBy} doğrulandı).`;
        } else {
          statusTag = "Zimmet Hatalı";
          matched = false;
          userDetail = `${th.serial} seri numaralı monitörü ${th.owner} kullanmalı, ama ${actualUser} kullanıyor (${cmp.verifiedBy} doğrulandı).`;
        }
      }

      return {
        rowKey: `th-monitor|${th.serial}`,
        ownerUpdatedAt: th.lastUpdated || "",
        owner: th.owner || "—",
        ownerFull: th.ownerFull || "—",
        sub: `Monitor — ${th.model || th.marka || ""}`.trim(),
        serial: th.serial,
        ownedLabel: th.serial,
        userLabel: actualUser || "Tespit Edilemedi",
        userFull: actualUser,
        personMatched: matched,
        personStatusTag: statusTag,
        assignmentType: th.assignmentType || "User",
        model: userDetail,
        location: th.location || "—",
        lbsParent: th.lbsParent,
        company: th.company,
        office: th.location || "—",
        attachedMonitors: [],
        monitorDetails: [],
        monitorIssue: false,
        monitorUnverified: !m,
        matched,
        statusTag,
        hostname: m?.hostname || "—",
        deviceModel: th.model,
        lastLogonTime: "",
        ouName: "",
        bitlocker: "",
        windowsLabel: "", windowsStatus: "", windowsSupportLabel: "", windowsDetail: "", windowsSearch: "",
        mail: "",
        _raw: th._raw,
        _sccmRaw: null,
        _thRaw: th._raw,
      };
    }

    // DESKTOP / NOTEBOOK — SCCM ile eşleştir (kim gerçekten kullanıyor)
    const s = sccmBySerial.get(norm(th.serial));
    const sccmUser = s && s.userLabel && s.userLabel !== "Tespit Edilemedi" ? s.userLabel : "";
    let statusTag, matched, userDetail;
    let duplicateDevices = []; // Birden Fazla Zimmet Mevcut: aynı kişiye zimmetli notebook'lar (popup/detay listesi için)

    if (!s) {
      // SCCM'de kaydı yok (ör. ajan hiç kurulmamış/silinmiş) — bunu otomatik "hatalı" saymak
      // yanlış olur, bilgi eksikliği olarak işaretlenir.
      statusTag = "SCCM'de Bulunamadı";
      matched = false;
      userDetail = `${th.serial} seri numaralı cihaz TuruncuHat'ta ${th.owner || "—"}'e zimmetli, ama SCCM envanterinde kaydı yok — kim kullandığı doğrulanamıyor.`;
    } else if (th.assignmentType === "OBS") {
      statusTag = "Müdürlük Zimmeti (OBS)";
      matched = true;
      userDetail = sccmUser
        ? `${th.serial} seri numaralı cihaz ${th.owner || "bir müdürlüğe"} zimmetli (OBS) — şu an ${sccmUser} kullanıyor.`
        : `${th.serial} seri numaralı cihaz ${th.owner || "bir müdürlüğe"} zimmetli (OBS), aktif kullanım kaydı bulunamadı.`;
    } else if (!sccmUser) {
      statusTag = "Kullanım Kaydı Yok";
      matched = false;
      userDetail = `${th.serial} seri numaralı cihaz ${th.owner}'e zimmetli, aktif kullanım kaydı bulunamadı.`;
    } else {
      const cmp = compareAssignment({ actualUsername: sccmUser, actualSicil: s.userSicil, thUsername: th.ownerUsername, thSicil: th.ownerSicil });
      if (!cmp.verifiable) {
        // Ne username ne sicil karşılaştırılabiliyorsa SCCM'in kendi (biçim tutarlı, güvenilir)
        // envanterUser/lastLogonUser karşılaştırmasına geri dönülür — isim tahmini yapılmaz.
        statusTag = s.statusTag;
        matched = s.matched;
        userDetail = `${s.model} (TuruncuHat'ta ${th.owner} zimmetli görünüyor, ama kullanıcı adı/sicil eksik olduğu için TH ile doğrulanamadı — bu sonuç SCCM verisine dayanıyor.)`;
      } else if (cmp.isMatch) {
        statusTag = "Zimmet Doğru";
        matched = true;
        userDetail = `${th.serial} seri numaralı cihazı ${th.owner} kullanmalı ve kullanıyor (${cmp.verifiedBy} doğrulandı).`;
      } else {
        statusTag = "Zimmet Hatalı";
        matched = false;
        userDetail = `${th.serial} seri numaralı cihazı ${th.owner} kullanmalı, ama ${sccmUser} kullanıyor (${cmp.verifiedBy} doğrulandı).`;
      }
    }

    // Birden fazla zimmet — aynı kişiye ikinci (veya daha fazla) bir notebook zimmetli görünmesi başlı başına bir
    // uyuşmazlıktır; yukarıdaki statusTag'i EZER (override). İSTİSNA: cihazı kullanan kişi zimmet sahibi DEĞİLSE
    // ("Zimmet Hatalı") etiket korunur — mail cihazı kullanan kişiye gider ve ona "üzerinize birden fazla notebook
    // zimmetli" demek yanlış olur; ona transfer maili gitmeli. Sahibe ayrıca bilgilendirme gider (duplicateDevices).
    if (th.deviceType === "NOTEBOOK") {
      const dupSerials = notebookOwnerCounts.get(ownerIdentity(th));
      if (dupSerials && dupSerials.length > 1) {
        const others = dupSerials.filter((sn) => sn !== th.serial);
        const usedByOther = statusTag === "Zimmet Hatalı";
        if (!usedByOther) {
          statusTag = "Birden Fazla Zimmet Mevcut";
          matched = false;
        }
        duplicateDevices = dupSerials.map((sn) => {
          const t = thBySerialAll.get(norm(sn)) || {};
          const ss = sccmBySerial.get(norm(sn));
          return { serial: sn, isThis: sn === th.serial, model: (ss && ss.deviceModel) || t.model || "", hostname: ss ? ss.hostname : "", user: ss && ss.userLabel && ss.userLabel !== "Tespit Edilemedi" ? ss.userLabel : "", userName: ss && ss.userLabel ? fullNameOf(ss.userLabel) : "", lastLogonTime: ss ? ss.lastLogonTime : "", assetNote: t.asset || "" };
        });
        const dupNote = `${th.owner} kişisine birden fazla notebook zimmetli görünüyor: ${th.serial} (bu kayıt) + ${others.join(", ")} — kullanılmayan varsa iade edilmeli ya da gerekçesi belirtilmeli.`;
        userDetail = usedByOther ? `${userDetail} Ayrıca ${dupNote}` : dupNote;
      }
    }

    const attached = s ? monitorsByHostname.get(norm(s.hostname)) || [] : [];
    const { details: monitorDetails, monitorIssue, monitorUnverified } = buildMonitorDetails(attached);

    const finalStatusTag = monitorIssue && matched ? `${statusTag} + Monitör Uyuşmazlığı` : statusTag;
    const finalMatched = monitorIssue ? false : matched;

    return {
      rowKey: `th-pc|${th.serial}`,
      ownerUpdatedAt: th.lastUpdated || "",
      owner: th.owner || (s ? s.owner : "—"),
      ownerFull: th.ownerFull || (s ? s.ownerFull : "—"),
      sub: s ? s.sub : `${th.deviceType === "NOTEBOOK" ? "Laptop" : "Desktop"} — ${th.model || ""}`.trim(),
      serial: th.serial,
      ownedLabel: th.serial,
      userLabel: sccmUser || "Tespit Edilemedi",
      userFull: s ? s.userFull : "",
      personMatched: matched,
      personStatusTag: statusTag,
      assignmentType: th.assignmentType || "User",
      model: userDetail,
      location: th.location || (s && s.location) || "—",
      lbsParent: th.lbsParent || (s && s.lbsParent),
      company: th.company || (s && s.company),
      office: th.location || (s && s.office) || "—",
      attachedMonitors: attached,
      monitorDetails,
      monitorIssue,
      monitorUnverified,
      matched: finalMatched,
      statusTag: finalStatusTag,
      hostname: s ? s.hostname : "—",
      duplicateDevices,
      ownerMail: th.ownerMail || "",
      deviceModel: s ? s.deviceModel : th.model,
      lastLogonTime: s ? s.lastLogonTime : "",
      ouName: s ? s.ouName : "",
      bitlocker: s ? s.bitlocker : "",
      windowsLabel: s ? s.windowsLabel : "", windowsStatus: s ? s.windowsStatus : "", windowsSupportLabel: s ? s.windowsSupportLabel : "", windowsDetail: s ? s.windowsDetail : "", windowsSearch: s ? s.windowsSearch : "",
      mail: s ? s.mail : "",
      _raw: th._raw,
      _sccmRaw: s ? s._raw : null,
      _thRaw: th._raw,
    };
  });

  // Madde 3 — "TH Kaydı YOK": SCCM envanterinde olup TuruncuHat Excel'inde HİÇ seri no kaydı
  // olmayan cihazlar. Mevcut TH-bazlı karşılaştırma mantığı DEĞİŞMEDİ (yukarısı aynı) — bu sadece
  // ek/bilgilendirici satırlar. "hatalı" sayılmaz (zimmetService.ZIMMET_UNVERIFIED_TAGS'e eklendi),
  // filtrelenebilir ve raporlanabilir.
  const allThSerials = new Set(thRows.map((t) => norm(t.serial)).filter(Boolean));
  const noThRows = sccmRows
    .filter((s) => norm(s.serial) && !allThSerials.has(norm(s.serial)))
    .map((s) => ({
      rowKey: `sccm-noth|${s.serial}`,
      owner: s.owner || "—",
      ownerFull: s.ownerFull || s.owner || "—",
      sub: s.sub,
      serial: s.serial,
      ownedLabel: s.serial,
      userLabel: s.userLabel || "Tespit Edilemedi",
      userFull: s.userFull || "",
      personMatched: false,
      personStatusTag: "TH Kaydı YOK",
      assignmentType: "",
      model: `${s.serial} seri numaralı cihaz SCCM envanterinde var, ancak TuruncuHat Excel'inde bu seri numarası bulunamadı — zimmet karşılaştırması yapılamıyor.`,
      location: s.location || "—",
      lbsParent: s.lbsParent || "",
      company: s.company || "",
      office: s.office || s.location || "—",
      attachedMonitors: [],
      monitorDetails: [],
      monitorIssue: false,
      monitorUnverified: false,
      matched: false,
      statusTag: "TH Kaydı YOK",
      hostname: s.hostname || "—",
      deviceModel: s.deviceModel || "",
      lastLogonTime: s.lastLogonTime || "",
      ouName: s.ouName || "",
      bitlocker: s.bitlocker || "",
      windowsLabel: s.windowsLabel || "", windowsStatus: s.windowsStatus || "", windowsSupportLabel: s.windowsSupportLabel || "", windowsDetail: s.windowsDetail || "", windowsSearch: s.windowsSearch || "",
      mail: s.mail || "",
      _raw: s._raw,
      _sccmRaw: s._raw,
      _thRaw: null,
    }));

  // TH'de "Warehouse" (depoda, zimmetsiz) görünen ama SCCM'de YAKIN TARİHLİ bir aktif kullanım
  // kaydı olan cihazlar. RELEVANT_ASSIGNMENT_TYPES filtresi Warehouse'u normalde
  // TAMAMEN dışlıyor (aksi halde depoda gerçekten boşta duran binlerce cihaz "Zimmet Hatalı"
  // sayılırdı) — burada SADECE staleDays içinde gerçek/güncel kullanım kanıtı varsa (aynı eşik,
  // sccmFileService.js'teki "Zimmetsiz Kullanım" ile tutarlı) ayrıca gösteriliyor; eski/bilinmeyen
  // bir giriş kanıt sayılmaz, cihaz gerçekten depoda duruyor olabilir.
  const warehouseTh = thRows.filter((r) => RELEVANT_TH_TYPES.has(r.deviceType) && r.assignmentType === "Warehouse");
  const warehouseUsedRows = warehouseTh
    .map((th) => {
      const s = sccmBySerial.get(norm(th.serial));
      if (!s) return null;
      const sccmUser = s.userLabel && s.userLabel !== "Tespit Edilemedi" ? s.userLabel : "";
      if (!sccmUser) return null;
      const daysAgo = daysSince(s.lastLogonTime);
      if (daysAgo == null || daysAgo > staleDays) return null;
      return {
        rowKey: `th-warehouse-used|${th.serial}`,
        owner: "Depo (Zimmetsiz)",
        ownerFull: "Depo (Zimmetsiz)",
        sub: s.sub,
        serial: th.serial,
        ownedLabel: th.serial,
        userLabel: sccmUser,
        userFull: s.userFull || sccmUser,
        personMatched: false,
        personStatusTag: "Zimmetsiz Kullanım (Depo)",
        assignmentType: "Warehouse",
        model: `${th.serial} seri numaralı cihaz TuruncuHat'ta depoda (zimmetsiz) görünüyor, ancak SCCM'de ${sccmUser} tarafından ${daysAgo} gün önce kullanılmış — zimmetlenmeden kullanılıyor olabilir.`,
        location: th.location || s.location || "—",
        lbsParent: th.lbsParent || s.lbsParent,
        company: th.company || s.company,
        office: th.location || s.office || "—",
        attachedMonitors: [],
        monitorDetails: [],
        monitorIssue: false,
        monitorUnverified: false,
        matched: false,
        statusTag: "Zimmetsiz Kullanım (Depo)",
        hostname: s.hostname,
        deviceModel: s.deviceModel,
        lastLogonTime: s.lastLogonTime,
        lastLogonDaysAgo: daysAgo,
        ouName: s.ouName,
        bitlocker: s.bitlocker,
        windowsLabel: s.windowsLabel || "", windowsStatus: s.windowsStatus || "", windowsSupportLabel: s.windowsSupportLabel || "", windowsDetail: s.windowsDetail || "", windowsSearch: s.windowsSearch || "",
        mail: s.mail,
        _raw: th._raw,
        _sccmRaw: s._raw,
        _thRaw: th._raw,
      };
    })
    .filter(Boolean);

  // Kullanan kişinin TAM ADI: SCCM yalnız kullanıcı adı verir ("ahmet.yilmaz", "MHYNET\ahmet.yilmaz"); ad-soyad/takım personel eşleştirmesinden
  // (TH "Owner Username" → "Sahibi", yoksa sicil) çözülür. Bulunamazsa mevcut davranış: kullanıcı adı olduğu gibi gösterilir.
  return [...thRowsMapped, ...noThRows, ...warehouseUsedRows].map((r) => attachUserNames(r, userDir));
}
