import { Fragment, useEffect, useMemo, useState } from "react";
import MultiSelectFilter from "./MultiSelectFilter";
import * as XLSX from "xlsx";
import Pagination from "./Pagination";
import { computeAtilMonitorRows, buildOtherUserMailPlan, REASON_ACTIVE, REASON_DEPOT_USED, REASON_NOT_ATTACHED, REASON_USED_BY_OTHER } from "../services/atilMonitorService";
import { backendClient } from "../services/backendClient";
import { ownerTitleOf, ownerWithTitle } from "../services/ownerName";
import { mailShell, dataTable, stepsBox, REC_NOTE, MAIL_FOOTER } from "../services/mailLayout";

// Metin, Zimmet Uyuşmazlığı mailiyle aynı şablon: aynı giriş, aynı sütunlar, aynı Turuncuhat kayıt talimatı — "cihaz" yerine "monitör".
// Görünüm: Ofis Bant Genişliği ile ortak çerçeve (services/mailLayout.js).
const MAIL_SUBJECT = "Zimmet Uyuşmazlığı — Kullandığınız Cihaz(lar) İçin Zimmet Transferi Gerekli";
const buildMailText = (items, username) =>
  `Aşağıdaki cihaz(lar) için aksiyon gereklidir:\n\n${items
    .map((r) => `- ${r.monitorSerial} (${r.model || "—"}) — kayıtlı eski sahibi: ${ownerWithTitle(r)}`)
    .join("\n")}\n\nTuruncuhat: turuncuhat.mhy.com.tr → Oluştur → Kullanıcı Vakası → ilgili zimmet servisi.`;
const buildMailHtml = (items, username) =>
  mailShell({
    eyebrow: "MONİTÖR ZİMMET UYUŞMAZLIĞI",
    title: "ZİMMET TRANSFERİ GEREKLİ",
    greeting: "Merhabalar,",
    intro: "Sistem kayıtlarımıza göre, aşağıda listelenen cihaz(lar)ın kayıtlı sahibi farklı bir kişi görünüyor. Ancak son giriş kayıtlarına göre bu cihaz(lar)ı <strong>siz</strong> kullanıyorsunuz. Zimmet hareketlerinin doğru ve güncel şekilde yönetilebilmesi için, cihaz(lar)ın sizin adınıza zimmet transferinin yapılması gerekmektedir.",
    bodyHtml: dataTable(
      ["Seri No / Barkod", "Marka / Model", "Varlık Adı", "Kayıtlı Sahibi (Eski)", "Hostname", "Last Logon"],
      items.map((r) => [[r.monitorSerial, r.barkod], [r.marka, r.model], r.asset, ownerWithTitle(r), r.hostnames, username])
    ),
    action: stepsBox("İşleminiz için lütfen aşağıdaki adımları izleyerek TuruncuHat üzerinden bir kayıt oluşturunuz:"),
    notes: [REC_NOTE],
    footer: MAIL_FOOTER,
  });

const PAGE_SIZE = 50;
const norm = (v) => String(v ?? "").trim().toLowerCase();

const HEADERS = ["Monitör Seri No", "Model", "Zimmet Türü", "Sahibi", "Şu An Kullanan", "Şirket", "Lokasyon", "Neden / Durum"];
const TYPE_LABELS = { Warehouse: "Depo", Site: "Saha (Site)", Supplier: "Tedarikçi (Supplier)", "": "Tür yok" };
const typeLabel = (t) => TYPE_LABELS[t] ?? t ?? "Tür yok";
const isMainType = (t) => t === "User" || t === "OBS" || t === "Warehouse";
const toCells = (r) => [r.monitorSerial, r.model, typeLabel(r.assignmentType), r.owner, r.usedBy, r.company, r.location, r.reason];
const toExportRow = (r) => Object.fromEntries(HEADERS.map((h, i) => [h, toCells(r)[i]]));
const sheetFrom = (rows) => XLSX.utils.json_to_sheet(rows.map(toExportRow), { header: HEADERS });
const dateTag = () => new Date().toLocaleDateString("tr-TR").replace(/\./g, "-");

// Dosya/sayfa adlarında "/" ve ":" kullanılamadığı için aşama başına sabit, okunur adlar
const STAGE_EXPORT_NAMES = {
  inScope: "Kapsamdaki Monitörler",
  active: "Aktif",
  outside: "Bilgi Dışı Kullanım",
  atil: "Atıl Monitörler",
  depotUsed: "Depoda Görünen Kullanılan",
  depotAll: "Depodaki Monitörler",
  excludedScope: "Kapsam Dışı",
  all: "Tüm Monitörler",
};

// Ayarlar'daki rapor ekranlarıyla aynı davranış (İnaktif Cihazlar tablosu gibi): satırlar onay
// kutusuyla seçilebilir, sahibe tıklayınca kişinin tüm monitörleri açılır, seri numarasına
// tıklayınca monitörün detayı açılır. Hesaplama atilMonitorService.js'te.
export default function AtilMonitorReportScreen({ styles, pal, thRows, monitorRows, thMeta, monitorMeta, loading, showToast, recordMailHistory, deptLabel, initialStage = "atil" }) {
  const [confirmMailOpen, setConfirmMailOpen] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [search, setSearch] = useState(""); // uygulanan arama (yazdıkça 250 ms sonra güncellenir)
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState({ col: -1, dir: 1 }); // col: HEADERS indeksi
  const [advOpen, setAdvOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [stage, setStage] = useState(initialStage);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [expandedOwner, setExpandedOwner] = useState(null); // { rowKey, ownerKey, userKey, person }
  const [detailRow, setDetailRow] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all"); // all | User | OBS | Warehouse | other
  // Ek filtreler (yalnız veri modelinde karşılığı olan alanlar: şirket, lokasyon, marka, model, kullanım durumu). Hepsi birlikte uygulanır.
  const [facets, setFacets] = useState({ company: [], location: [], brand: [], model: [] });
  const [usage, setUsage] = useState("all"); // all | used | unused  (Monitör Raporu'nda kullanan kişi var mı)

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { stages, stats } = useMemo(
    () => computeAtilMonitorRows({ thRows, monitorRows }),
    [thRows, monitorRows]
  );

  const stageList = useMemo(() => stages[stage] || [], [stages, stage]);
  const typeCounts = useMemo(
    () => ({
      all: stageList.length,
      User: stageList.filter((r) => r.assignmentType === "User").length,
      OBS: stageList.filter((r) => r.assignmentType === "OBS").length,
      Warehouse: stageList.filter((r) => r.assignmentType === "Warehouse").length,
      other: stageList.filter((r) => !isMainType(r.assignmentType)).length,
    }),
    [stageList]
  );
  const FACET_FIELDS = { company: (r) => r.company, location: (r) => (r.location && r.location !== "—" ? r.location : ""), brand: (r) => r.marka, model: (r) => r.model };
  const facetOptions = useMemo(() => {
    const out = {};
    Object.entries(FACET_FIELDS).forEach(([k, fn]) => { out[k] = [...new Set(stageList.map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")); });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageList]);
  const isUsed = (r) => r.usedBy && r.usedBy !== "—";
  const filtered = useMemo(() => {
    let list =
      typeFilter === "all" ? stageList : typeFilter === "other" ? stageList.filter((r) => !isMainType(r.assignmentType)) : stageList.filter((r) => r.assignmentType === typeFilter);
    Object.entries(FACET_FIELDS).forEach(([k, fn]) => { if (facets[k].length) list = list.filter((r) => facets[k].includes(fn(r))); });
    if (usage === "used") list = list.filter(isUsed);
    else if (usage === "unused") list = list.filter((r) => !isUsed(r));
    const q = norm(search);
    if (q) list = list.filter((r) => toCells(r).some((v) => norm(v).includes(q)));
    if (sort.col >= 0) list = [...list].sort((a, b) => sort.dir * String(toCells(a)[sort.col] ?? "").localeCompare(String(toCells(b)[sort.col] ?? ""), "tr", { numeric: true }));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageList, typeFilter, search, facets, usage, sort]);
  const toggleSort = (i) => { setSort((p) => (p.col === i ? (p.dir === 1 ? { col: i, dir: -1 } : { col: -1, dir: 1 }) : { col: i, dir: 1 })); setPage(1); };
  const setFacet = (k, vals) => { setFacets((p) => ({ ...p, [k]: vals })); setPage(1); };
  const FACET_LABEL = { company: "Şirket", location: "Lokasyon", brand: "Marka", model: "Model" };
  const activeChips = [
    ...Object.entries(facets).flatMap(([k, vals]) => vals.map((v) => ({ key: `${k}:${v}`, text: `${FACET_LABEL[k]}: ${v}`, clear: () => setFacet(k, facets[k].filter((x) => x !== v)) }))),
    ...(usage !== "all" ? [{ key: "usage", text: usage === "used" ? "Kullanılıyor" : "Kullanılmıyor", clear: () => { setUsage("all"); setPage(1); } }] : []),
    ...(typeFilter !== "all" ? [{ key: "type", text: `Zimmet türü: ${typeFilter === "other" ? "Diğer" : typeLabel(typeFilter)}`, clear: () => { setTypeFilter("all"); setPage(1); } }] : []),
    ...(search ? [{ key: "search", text: `Arama: ${search}`, clear: () => { setSearchInput(""); setSearch(""); setPage(1); } }] : []),
  ];
  const facetCount = Object.values(facets).reduce((n, v) => n + v.length, 0);
  const clearExtraFilters = () => { setFacets({ company: [], location: [], brand: [], model: [] }); setUsage("all"); setTypeFilter("all"); setSearchInput(""); setSearch(""); setPage(1); };

  const monitorsByOwner = useMemo(() => {
    const m = new Map();
    stages.inScope.forEach((r) => {
      if (!r.ownerKey) return;
      if (!m.has(r.ownerKey)) m.set(r.ownerKey, []);
      m.get(r.ownerKey).push(r);
    });
    return m;
  }, [stages]);

  // kullanıcı adı (Monitor Raporu'ndaki oturum açan kişi) -> o kişinin kullandığı, BAŞKASINA zimmetli monitörler
  const borrowedByUser = useMemo(() => {
    const m = new Map();
    [...stages.inScope, ...stages.depotUsed].forEach((r) => {
      if (!r.usedByOther && !r.depot) return;
      r.usedByKeys.forEach((u) => {
        if (u === r.ownerUsername.trim().toLowerCase()) return;
        if (!m.has(u)) m.set(u, []);
        m.get(u).push(r);
      });
    });
    return m;
  }, [stages]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const missingData = thRows.length === 0 || monitorRows.length === 0;
  const allSelected = filtered.length > 0 && filtered.every((r) => selectedKeys.has(r.rowKey));

  const toggleSelect = (key) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleSelectAll = () =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allSelected) filtered.forEach((r) => next.delete(r.rowKey));
      else filtered.forEach((r) => next.add(r.rowKey));
      return next;
    });
  const toggleOwner = (r) => {
    const userKey = r.ownerUsername.trim().toLowerCase();
    setExpandedOwner((cur) =>
      cur && cur.rowKey === r.rowKey && cur.ownerKey === r.ownerKey ? null : { rowKey: r.rowKey, ownerKey: r.ownerKey, userKey, person: r.owner }
    );
  };
  // kullanıcı adı -> TuruncuHat'taki ad soyad (şu an kullanan kişinin ismini göstermek için)
  const nameByUsername = useMemo(() => {
    const m = new Map();
    thRows.forEach((r) => {
      const u = String(r.ownerUsername || "").trim().toLowerCase();
      if (u && r.owner && !m.has(u)) m.set(u, r.owner);
    });
    return m;
  }, [thRows]);
  // "Şu An Kullanan" kişisine tıklayınca: o kişiye zimmetli monitörler + kullandığı başkasına ait monitörler
  const toggleUser = (r, username) => {
    const key = username.trim().toLowerCase();
    const full = nameByUsername.get(key);
    setExpandedOwner((cur) =>
      cur && cur.rowKey === r.rowKey && cur.ownerKey === key ? null : { rowKey: r.rowKey, ownerKey: key, userKey: key, person: full ? `${full} (${username})` : username }
    );
  };

  // Her grubun ne demek olduğu, nasıl hesaplandığı ve diğer sayılarla ilişkisi (rozet altındaki açıklama kutusunda gösterilir)
  const ofType = (list, pred) => list.filter((r) => pred(r.assignmentType)).length;
  const exCount = {
    depo: ofType(stages.excludedScope, (t) => t === "Warehouse"),
    site: ofType(stages.excludedScope, (t) => t === "Site"),
    supplier: ofType(stages.excludedScope, (t) => t === "Supplier"),
    other: ofType(stages.excludedScope, (t) => !["Warehouse", "Site", "Supplier"].includes(t)),
  };
  const depotIdle = stats.depotTotal - stats.depotUsed;
  const GROUP_INFO = {
    atil: {
      what: "TuruncuHat'ta User veya OBS olarak zimmetli, ama Monitör Raporu'nda hiç satırı olmayan monitörler. Hiçbir yerde kullanılmıyor, boşta duruyor.",
      calc: `Kapsamdaki ${stats.inScope} monitörün ${stats.atil} tanesi.`,
    },
    outside: {
      what: "Monitör Raporu'nda görünüyor ama kullanan kişi TuruncuHat'taki zimmetli kişiden farklı, yani kayıtlarımız dışında başkası kullanıyor. OBS (müdürlük) monitörlerini herkes kullanabildiği için bu kontrole girmez.",
      calc: "Karşılaştırma kullanıcı adıyladır: Monitör Raporu'ndaki Username ile TuruncuHat'taki Owner Username aynı değilse bu gruba girer.",
    },
    depotUsed: {
      what: "TuruncuHat'ta Zimmet Depoda görünüyor ama Monitör Raporu'nda satırı var, yani biri kullanıyor. Depoda durması gerekirdi.",
      calc: `Depoda görünen ${stats.depotTotal} monitörün ${stats.depotUsed} tanesi kullanılıyor, ${depotIdle} tanesi depoda duruyor (normal).`,
    },
    active: {
      what: "Monitör Raporu'nda görünüyor ve kullanan kişi zimmetli kişiyle uyumlu (OBS'de herkes kullanabilir). Sorun yok.",
      calc: `Atıl ${stats.atil} + Bilgi dışı ${stats.outside} + Aktif ${stats.active} = Kapsamdaki ${stats.inScope}`,
    },
    inScope: {
      what: "Raporun değerlendirdiği tüm monitörler: TuruncuHat'ta zimmet türü User veya OBS olanlar.",
      calc: `Atıl ${stats.atil} + Bilgi dışı ${stats.outside} + Aktif ${stats.active} = ${stats.inScope}`,
    },
    depotAll: {
      what: "TuruncuHat'ta depoda görünen monitörler (zimmet türü Depo/Warehouse ya da durum alanında 'Zimmet Depoda'). Kapsam dışı grubunun yalnızca depo olan kısmıdır; hem kullanılanlar hem depoda duranlar listelenir.",
      calc: `${stats.depotUsed} kullanılıyor + ${depotIdle} depoda duruyor = ${stats.depotTotal}`,
    },
    excludedScope: {
      what: "Zimmet türü User veya OBS olmayan tüm monitörler: depo, saha (Site), tedarikçi (Supplier) ya da türü boş. Bu rapor bunlar için atıl/bilgi dışı hesabı yapmaz; yalnızca depoda görünüp kullanılanları ayrıca işaretler. Depoda görünen monitörler bu grubun içindedir.",
      calc: `Depo ${exCount.depo} + Saha (Site) ${exCount.site} + Tedarikçi (Supplier) ${exCount.supplier} + Tür yok/diğer ${exCount.other} = ${stats.excludedScope}`,
    },
    all: {
      what: "TuruncuHat'taki tüm monitörler (kapsamdakiler ve kapsam dışı olanlar).",
      calc: `Kapsamdaki ${stats.inScope} + Kapsam dışı ${stats.excludedScope} = ${stats.thMonitorTotal}`,
    },
  };
  const stageInfo = GROUP_INFO[stage];

  // Rozetler iki grupta: üstte aksiyon gerektirenler, altta bilgi rozetleri. Hepsi tıklanabilir (o gruptaki monitörleri listeler).
  // [id, etiket, adet, ton] — ton: "bad" kırmızı, "warn" turuncu, "" nötr
  const funnelGroups = [
    {
      title: "Aksiyon gerektirenler",
      items: [
        ["atil", "Atıl monitör (kullanılmıyor)", stats.atil, "bad"],
        ["outside", "Bilgi dışı kullanılan", stats.outside, "warn"],
        ["depotUsed", "Depoda görünen ama kullanılan", stats.depotUsed, "warn"],
      ],
    },
    {
      title: "Diğer",
      items: [
        ["active", "Aktif (sorunsuz)", stats.active, ""],
        ["inScope", "Kapsamdaki (User/OBS)", stats.inScope, ""],
        ["depotAll", "Depoda görünen (Zimmet Depoda)", stats.depotTotal, ""],
        ["excludedScope", "Kapsam dışı (User/OBS olmayan)", stats.excludedScope, ""],
        ["all", "TuruncuHat monitör toplam", stats.thMonitorTotal, ""],
      ],
    },
  ];
  const funnel = funnelGroups.flatMap((g) => g.items);
  const stageLabel = (funnel.find(([id]) => id === stage) || [])[1];

  const exportCurrent = () => {
    const label = STAGE_EXPORT_NAMES[stage] || "Liste";
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetFrom(filtered), label);
    XLSX.writeFile(wb, `Atıl Monitörler - ${label} - ${dateTag()}.xlsx`);
  };
  const exportSelected = () => {
    const rows = stages.inScope.filter((r) => selectedKeys.has(r.rowKey));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetFrom(rows), "Seçilen Monitörler");
    XLSX.writeFile(wb, `Atıl Monitörler - Seçilenler - ${dateTag()}.xlsx`);
  };
  const exportAllStages = () => {
    const wb = XLSX.utils.book_new();
    const summary = funnel.map(([, label, n]) => ({ "Aşama": label, "Monitör Sayısı": n }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Özet");
    ["atil", "outside", "depotUsed", "active", "inScope", "depotAll", "excludedScope", "all"].forEach((id) => {
      XLSX.utils.book_append_sheet(wb, sheetFrom(stages[id]), STAGE_EXPORT_NAMES[id]);
    });
    XLSX.writeFile(wb, `Atıl Monitörler - Tüm Aşamalar - ${dateTag()}.xlsx`);
  };

  // Mail: monitörü fiilen kullanan (zimmetli olmayan) kişiye. Seçim varsa yalnızca seçililer, yoksa tüm
  // "bilgi dışı kullanım" satırları (o durumda önce onay sorulur). Atıl/aktif monitörlere mail gitmez.
  const mailTargets = selectedKeys.size > 0 ? stages.inScope.filter((r) => selectedKeys.has(r.rowKey)) : stages.outside;
  const mailPlan = useMemo(() => buildOtherUserMailPlan(mailTargets, thRows), [mailTargets, thRows]);
  const onMailClick = () => {
    if (selectedKeys.size > 0) sendMails();
    else setConfirmMailOpen(true);
  };
  const sendMails = async () => {
    setConfirmMailOpen(false);
    const { recipients, noMail } = mailPlan;
    if (recipients.length === 0 && noMail.length === 0) {
      showToast?.("Seçili kayıtlarda bilgi dışı kullanım yok — e-posta gönderilecek kayıt bulunamadı (atıl/aktif monitörlere e-posta gitmez)");
      return;
    }
    setMailBusy(true);
    let sent = 0, failed = 0;
    const details = noMail.map((n) => ({ location: n.username, to: null, count: n.items.length, ok: false, message: "TuruncuHat'ta bu kullanıcı için e-posta adresi bulunamadı" }));
    for (const r of recipients) {
      try {
        const res = await backendClient.sendMail({ to: r.mail, subject: MAIL_SUBJECT, text: buildMailText(r.items, r.username), html: buildMailHtml(r.items, r.username) });
        if (res.ok) {
          sent += r.items.length;
          details.push({ location: r.username, to: r.mail, count: r.items.length, ok: true, message: "Gönderildi" });
        } else {
          failed += r.items.length;
          details.push({ location: r.username, to: r.mail, count: r.items.length, ok: false, message: res.message || "Gönderilemedi" });
        }
      } catch (err) {
        failed += r.items.length;
        details.push({ location: r.username, to: r.mail, count: r.items.length, ok: false, message: err.message || "Gönderilemedi" });
      }
    }
    setMailBusy(false);
    if (sent > 0) setSelectedKeys(new Set()); // gönderilenler seçili kalmasın: bir sonraki gönderim aynı kayıtlara yeniden e-posta göndermesin
    const skipped = noMail.reduce((n, x) => n + x.items.length, 0);
    recordMailHistory?.({
      id: Date.now(),
      date: new Date().toLocaleString("tr-TR"),
      dept: deptLabel || "Tüm Şirketler",
      report: "Atıl Monitörler — Bilgi Dışı Kullanım",
      recipients: sent,
      status: failed > 0 || skipped > 0 ? (sent > 0 ? "Kısmen Başarısız" : "Gönderilemedi") : "Başarılı",
      details,
    });
    if (sent === 0) showToast?.(`❌ Gönderilemedi — ${failed + skipped} kayıt${skipped ? ` (${skipped} kayıt için e-posta adresi bulunamadı)` : ""}`);
    else if (failed > 0 || skipped > 0) showToast?.(`⚠️ ${sent} kayıt, ${recipients.length} kullanıcıya gönderildi${skipped ? `, ${skipped} kayıt için e-posta adresi bulunamadı` : ""}${failed ? `, ${failed} kayıt başarısız` : ""}`);
    else showToast?.(`✅ Başarılı — ${sent} kayıt, ${recipients.length} kullanıcıya e-posta gönderildi`);
  };

  const selectStage = (id) => {
    setStage(id);
    setPage(1);
    setExpandedOwner(null);
  };

  // Aşama rozeti, arama, seçim ve açılmış kişi satırlarını varsayılana (Atıl monitörler) döndürür
  const isFiltered = stage !== "atil" || typeFilter !== "all" || search !== "" || selectedKeys.size > 0 || expandedOwner !== null || activeChips.length > 0;
  const resetFilters = () => {
    setStage("atil");
    setTypeFilter("all");
    clearExtraFilters();
    setSort({ col: -1, dir: 1 });
    setSelectedKeys(new Set());
    setExpandedOwner(null);
  };

  const reasonBadge = (r) => {
    const ok = r.reason === REASON_ACTIVE;
    const atil = r.reason === REASON_NOT_ATTACHED;
    const outside = r.reason === REASON_USED_BY_OTHER || r.reason === REASON_DEPOT_USED;
    const look = ok ? styles.badgeOk : atil ? styles.badgeBad : outside ? { background: pal.warnBg, color: pal.warnFg } : styles.badgeNeutral;
    const dot = ok ? pal.ok : atil ? pal.bad : outside ? pal.warnFg : pal.inkSoft;
    return (
      <span style={{ ...styles.badge, ...look, flexShrink: 0, whiteSpace: "normal", borderRadius: 14, lineHeight: 1.35 }}>
        <span style={{ ...styles.badgeDot, background: dot, flexShrink: 0 }} />
        {r.reason}
      </span>
    );
  };

  const STAT_LABEL = {
    atil: "Atıl (Kullanılmıyor)", outside: "Bilgi Dışı Kullanılan", depotUsed: "Depoda Ama Kullanılan",
    active: "Aktif (Sorunsuz)", inScope: "Kapsamdaki (User/OBS)", depotAll: "Depoda Görünen", excludedScope: "Kapsam Dışı", all: "Toplam Monitör",
  };
  const statColor = (tone) => (tone === "bad" ? pal.bad : tone === "warn" ? pal.warnFg : pal.ink);
  // Tablo sütunları: [başlık, HEADERS/toCells indeksi (sıralama), hizalama]
  const COLS = [["Monitör", 0], ["Zimmet Türü", 2], ["Sahibi", 3], ["Şu An Kullanan", 4], ["Şirket / Lokasyon", 5], ["Durum", 7]];
  const thS = (i, n) => ({ ...styles.th, fontSize: 13, padding: `12px ${i === n - 1 ? 24 : 14}px 12px 14px`, cursor: "pointer", userSelect: "none" });
  const tdS = (extra) => ({ ...styles.td, padding: "12px 14px", verticalAlign: "middle", ...extra });
  const COLSPAN = COLS.length + 1;

  return (
    <>
      <div style={{ ...styles.panel, padding: "20px 24px" }}>
        <p style={styles.pageTitle}>Atıl Monitörler</p>
        <p style={styles.pageSub}>
          TuruncuHat'ta User/OBS olarak zimmetli monitörlerin gerçek kullanım durumu —{" "}
          {thMeta ? thMeta.fileName : "TuruncuHat yüklenmedi"} × {monitorMeta ? monitorMeta.fileName : "Monitör Raporu yüklenmedi"}
          {loading ? " · yükleniyor…" : ""}
        </p>
        <details data-atil-help style={{ marginTop: 8, fontSize: 13, color: pal.inkSoft }}>
          <summary style={{ cursor: "pointer", color: pal.accent, fontWeight: 600, width: "fit-content" }}>Bu rapor ne yapar, nasıl okunur?</summary>
          <p style={{ margin: "8px 0 0", lineHeight: 1.6, maxWidth: 980 }}>
            İki şeyi bulur: <b>atıl</b> monitörler (Monitör Raporu'nda hiç görünmüyor, yani kullanılmıyor) ve <b>bilgi dışı kullanılan</b> monitörler
            (zimmetli kişi dışında biri kullanıyor; OBS monitörlerini herkes kullanabildiği için OBS bu kontrolün dışında).
            TuruncuHat'ta <b>Zimmet Depoda</b> görünüp kullanıldığı görülen monitörler "Depoda görünen ama kullanılan" grubundadır (depoda duran, kullanılmayanlar listelenmez).
            Üstteki sayılara tıklayarak her gruptaki monitörleri, bir kişinin adına (sahibi ya da şu an kullanan) tıklayarak o kişiyle ilgili tüm monitörleri görebilirsiniz.
          </p>
        </details>

        {missingData && !loading ? (
          <p style={{ fontSize: 14, color: pal.inkSoft, marginTop: 16 }}>
            Rapor için TuruncuHat ve Monitör Raporu dosyaları gerekir. Ayarlar &gt; Veri Girişi &gt; Dosya Kaynağı klasörünü kontrol edin.
          </p>
        ) : (
          <>
            <div data-atil-stats style={{ ...styles.statStrip, flexWrap: "wrap", rowGap: 16, alignItems: "stretch" }}>
              {funnelGroups.map((group, gi) => (
                <Fragment key={group.title}>
                  {gi > 0 && <span aria-hidden="true" style={{ width: 1, background: pal.line, margin: "2px 0" }} />}
                  {group.items.map(([id, , n, tone]) => (
                    <div
                      key={id}
                      role="button"
                      tabIndex={0}
                      data-atil-stage={id}
                      aria-pressed={id === stage}
                      onClick={() => selectStage(id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectStage(id); } }}
                      title={`${GROUP_INFO[id].what} — Tıklayınca bu gruptaki monitörleri listeler.`}
                      style={{ ...styles.stat, ...styles.statClickable, ...(id === stage ? styles.statActive : {}) }}
                    >
                      <span style={{ ...styles.statNum, color: statColor(tone) }}>{n}</span>
                      <span style={styles.statLabel}>{STAT_LABEL[id]}</span>
                    </div>
                  ))}
                </Fragment>
              ))}
            </div>
            {stageInfo && (
              <div style={{ marginTop: 16, paddingLeft: 12, borderLeft: `3px solid ${pal.accent}`, fontSize: 13, lineHeight: 1.55 }}>
                <b>{stageLabel}</b> <span style={{ color: pal.inkSoft }}>— {stageInfo.what}</span>
                <div style={{ color: pal.inkSoft, marginTop: 2 }}>{stageInfo.calc}</div>
              </div>
            )}
          </>
        )}
      </div>

      {!(missingData && !loading) && (
        <div style={styles.panel}>
          <div style={styles.toolbar} className="no-print">
            <div data-atil-filters style={styles.toolbarFiltersRow}>
              <div style={{ ...styles.searchWrap, flex: "1 1 260px", maxWidth: 380 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  placeholder="Seri no, model, sahibi, kullanan veya neden ara..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  style={styles.searchInput}
                />
                {searchInput && (
                  <span onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }} title="Aramayı temizle" style={{ cursor: "pointer", color: pal.inkSoft, fontSize: 14, lineHeight: 1, padding: "0 2px" }}>×</span>
                )}
              </div>
              <div style={styles.segmented} title="Zimmet türüne göre filtrele. User = kişi zimmeti, OBS = müdürlük zimmeti, Depo = TuruncuHat'ta depoda (Warehouse), Diğer = Saha (Site), Tedarikçi (Supplier) ya da tür boş">
                {[["all", "Tümü"], ["User", "User"], ["OBS", "OBS"], ["Warehouse", "Depo"], ["other", "Diğer"]].map(([id, label]) => (
                  <div key={id} onClick={() => { setTypeFilter(id); setPage(1); }} style={{ ...styles.seg, ...(typeFilter === id ? styles.segActive : {}) }}>
                    {label} ({typeCounts[id]})
                  </div>
                ))}
              </div>
              <div style={styles.segmented} title="Monitör Raporu'nda bu monitörü kullanan bir kişi görünüyor mu?">
                {[["all", "Tümü"], ["used", "Kullanılıyor"], ["unused", "Kullanılmıyor"]].map(([id, label]) => (
                  <div key={id} onClick={() => { setUsage(id); setPage(1); }} data-atil-usage={id} style={{ ...styles.seg, ...(usage === id ? styles.segActive : {}) }}>{label}</div>
                ))}
              </div>
              <button type="button" data-atil-adv aria-expanded={advOpen || facetCount > 0} onClick={() => setAdvOpen((o) => !o)} style={styles.btnGhost} title="Şirket, lokasyon, marka ve model filtreleri">
                Gelişmiş filtreler{facetCount > 0 ? ` (${facetCount})` : ""} {advOpen || facetCount > 0 ? "▴" : "▾"}
              </button>
              {(advOpen || facetCount > 0) && Object.keys(FACET_LABEL).map((k) => (
                <MultiSelectFilter key={k} label={FACET_LABEL[k]} options={facetOptions[k] || []} selected={facets[k]} onChange={(v) => setFacet(k, v)} styles={styles} pal={pal} />
              ))}
            </div>
            {activeChips.length > 0 && (
              <div data-atil-chips style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 13 }}>
                <span style={{ color: pal.inkSoft }}>Aktif filtreler ({activeChips.length}):</span>
                {activeChips.map((c) => (
                  <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: pal.accentSoft, color: pal.accent, borderRadius: 14, padding: "3px 10px", fontWeight: 600 }}>
                    {c.text}
                    <span onClick={c.clear} role="button" aria-label={`${c.text} filtresini kaldır`} style={{ cursor: "pointer", fontWeight: 700 }}>×</span>
                  </span>
                ))}
                <span onClick={clearExtraFilters} role="button" data-atil-clear style={{ cursor: "pointer", color: pal.accent, fontWeight: 600 }}>Tümünü temizle</span>
              </div>
            )}
            <div style={styles.toolbarActionsRow}>
              <span data-atil-count style={{ fontSize: 13, color: pal.inkSoft, marginRight: "auto" }}>
                <b style={{ color: pal.ink }}>{filtered.length}</b> / {stageList.length} monitör{activeChips.length > 0 ? ` · ${activeChips.length} aktif filtre` : ""}
              </span>
              {isFiltered && (
                <button type="button" style={styles.btnGhost} onClick={resetFilters} title="Aşama, arama ve seçimi varsayılana döndürür">Filtreleri Sıfırla</button>
              )}
              {selectedKeys.size > 0 && (
                <button type="button" style={styles.btnGhost} onClick={exportSelected} title="Seçilen monitörleri Excel'e aktarır">Seçilenleri İndir ({selectedKeys.size})</button>
              )}
              <button type="button" style={styles.btnGhost} onClick={exportCurrent} disabled={filtered.length === 0} title="Ekrandaki listeyi (seçili aşama ve filtreler) Excel'e aktarır">Excel'e Aktar ({filtered.length})</button>
              <button type="button" style={styles.btnGhost} onClick={exportAllStages} title="Atıl monitörler ve diğer aşamalar sayfa sayfa tek dosyada">Tüm Aşamaları Aktar</button>
              <button
                type="button"
                style={styles.btnPrimary}
                onClick={onMailClick}
                disabled={mailBusy || stages.outside.length === 0}
                title="Monitörü kullanan (zimmetli olmayan) kişiye zimmet transferi e-postası gönderir. Seçim yoksa tüm bilgi dışı kullanımlara (onayla)"
              >
                {mailBusy ? "Gönderiliyor…" : `Bilgi Dışı Kullanıma E-posta Gönder${selectedKeys.size > 0 ? ` (${selectedKeys.size} seçili)` : ""}`}
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: 32, padding: "12px 6px 12px 24px" }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={styles.checkbox} aria-label="Tümünü seç" />
                  </th>
                  {COLS.map(([h, ci], i) => (
                    <th key={h} data-atil-sort={ci} onClick={() => toggleSort(ci)} aria-sort={sort.col === ci ? (sort.dir === 1 ? "ascending" : "descending") : "none"} title="Sıralamak için tıklayın" style={thS(i, COLS.length)}>
                      {h}{sort.col === ci ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => {
                  const expanded = expandedOwner && expandedOwner.rowKey === r.rowKey;
                  const hasOwner = r.owner && r.owner !== "—";
                  return (
                    <Fragment key={`${stage}|${r.rowKey}`}>
                      <tr style={selectedKeys.has(r.rowKey) ? styles.rowSelected : undefined}>
                        <td style={tdS({ padding: "12px 6px 12px 24px" })}>
                          <input type="checkbox" checked={selectedKeys.has(r.rowKey)} onChange={() => toggleSelect(r.rowKey)} style={styles.checkbox} aria-label={`${r.monitorSerial} seç`} />
                        </td>
                        <td style={tdS()}>
                          <span style={{ ...styles.serial, ...styles.clickableName }} onClick={() => setDetailRow(r)} title="Monitörün detayını göster">{r.monitorSerial}</span>
                          {r.model && <div style={styles.cellSub}>{r.model}</div>}
                        </td>
                        <td style={tdS()}>
                          <span style={{ ...styles.badge, ...styles.badgeNeutral }}>{typeLabel(r.assignmentType)}</span>
                        </td>
                        <td style={tdS()}>
                          <div style={{ ...styles.cellName, ...(hasOwner ? styles.clickableName : {}) }} onClick={hasOwner ? () => toggleOwner(r) : undefined} title={hasOwner ? `${r.owner}'e ait monitörleri göster/gizle` : undefined}>
                            {r.owner}
                          </div>
                          {ownerTitleOf(r.ownerFull) && <div style={styles.cellSub} title={r.ownerFull}>{ownerTitleOf(r.ownerFull)}</div>}
                        </td>
                        <td style={tdS()}>
                          {r.usedBy === "—"
                            ? <span style={{ color: pal.inkSoft }}>—</span>
                            : r.usedBy.split(", ").map((u, i) => (
                                <Fragment key={u}>
                                  {i > 0 && ", "}
                                  <span
                                    style={{ ...(r.usedByOther ? { ...styles.badge, background: pal.warnBg, color: pal.warnFg } : {}), ...styles.clickableName }}
                                    onClick={() => toggleUser(r, u)}
                                    title={r.usedByOther ? `Zimmetli kişi dışında biri kullanıyor — ${u}'in monitörlerini göster/gizle` : `${u}'in monitörlerini göster/gizle`}
                                  >
                                    {u}
                                  </span>
                                </Fragment>
                              ))}
                        </td>
                        <td style={tdS()}>
                          <div style={{ fontWeight: 600 }}>{r.company || "—"}</div>
                          <div style={styles.cellSub}>{r.location}</div>
                        </td>
                        <td style={tdS({ paddingRight: 24 })}>{reasonBadge(r)}</td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td style={{ ...styles.td, background: pal.fieldBg, padding: 0 }} colSpan={COLSPAN}>
                            <div style={{ padding: "12px 24px" }}>
                              {[
                                ["tüm monitörleri (zimmetli)", monitorsByOwner.get(expandedOwner.ownerKey) || [], false],
                                ["kullandığı, başkasına ait monitörler", expandedOwner.userKey ? borrowedByUser.get(expandedOwner.userKey) || [] : [], true],
                              ].map(([title, list, borrowed]) => (
                                <div key={title} style={{ marginBottom: 10 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: pal.inkSoft, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                    {expandedOwner.person} — {title} ({list.length})
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {list.length === 0 && <div style={{ fontSize: 13, color: pal.inkSoft }}>Kayıt yok</div>}
                                    {list.map((pr) => (
                                      <div key={pr.rowKey} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 8, background: pal.panelSolid, fontSize: 14 }}>
                                        <span style={{ ...styles.serial, ...styles.clickableName, flexShrink: 0 }} onClick={() => setDetailRow(pr)} title="Bu monitörün detayını gör">{pr.monitorSerial}</span>
                                        <span style={{ flex: 1, color: pal.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {[
                                            pr.model,
                                            borrowed ? (pr.depot ? "TuruncuHat'ta Zimmet Depoda" : `Zimmetli: ${pr.owner}`) : pr.usedByOther ? `Şu an kullanan: ${pr.usedBy}` : null,
                                          ].filter(Boolean).join(" · ")}
                                        </span>
                                        {borrowed ? (
                                          <span style={{ ...styles.badge, background: pal.warnBg, color: pal.warnFg, flexShrink: 0 }}>{pr.depot ? "Depoda görünüyor" : "Başkasına ait"}</span>
                                        ) : pr.usedByOther ? (
                                          <span style={{ ...styles.badge, background: pal.warnBg, color: pal.warnFg, flexShrink: 0 }}>Başkası kullanıyor</span>
                                        ) : null}
                                        {reasonBadge(pr)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {paged.length === 0 && (
                  <tr>
                    <td style={{ ...styles.td, color: pal.inkSoft, textAlign: "center", padding: "40px 24px" }} colSpan={COLSPAN} data-atil-empty>
                      {loading ? "Veriler yükleniyor…" : stageList.length > 0 ? <>Seçili filtrelere uyan monitör yok. <span onClick={clearExtraFilters} role="button" style={{ cursor: "pointer", color: pal.accent, fontWeight: 600 }}>Ek filtreleri temizle</span></> : "Bu aşamada monitör bulunamadı."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ ...styles.tableFooter, flexWrap: "wrap", gap: 10 }}>
            <span>
              {filtered.length} kayıttan {paged.length} tanesi gösteriliyor{totalPages > 1 ? ` · Sayfa ${safePage} / ${totalPages}` : ""}
              {selectedKeys.size > 0 ? ` · ${selectedKeys.size} seçili` : ""}
            </span>
            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} styles={styles} pal={pal} />
          </div>
        </div>
      )}

      {confirmMailOpen && (
        <div style={styles.modalOverlay} onClick={() => setConfirmMailOpen(false)}>
          <div style={{ ...styles.modalCard, width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <p style={styles.modalTitle}>E-posta Gönderimini Onayla</p>
              <span style={styles.modalClose} onClick={() => setConfirmMailOpen(false)}>✕</span>
            </div>
            <p style={styles.modalSub}>
              Listede seçim yapılmadı — tüm bilgi dışı kullanımlar için e-posta gönderilecek: {stages.outside.length} monitör, {mailPlan.recipients.length} kullanıcı
              {mailPlan.noMail.length > 0 ? ` (${mailPlan.noMail.length} kullanıcının e-posta adresi bulunamadığı için atlanacak)` : ""}.
            </p>
            <div style={styles.formActions}>
              <button style={styles.btnGhost} onClick={() => setConfirmMailOpen(false)}>Vazgeç</button>
              <button style={styles.btnPrimary} onClick={sendMails}>Onayla ve Gönder</button>
            </div>
          </div>
        </div>
      )}

      {detailRow && (
        <div style={styles.modalOverlay} onClick={() => setDetailRow(null)}>
          <div style={{ ...styles.modalCard, width: "min(580px, 100%)", fontSize: 16 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <p style={{ ...styles.modalTitle, fontFamily: "var(--font-mono)" }}>{detailRow.monitorSerial}</p>
              <span style={styles.modalClose} onClick={() => setDetailRow(null)}>✕</span>
            </div>
            <p style={styles.modalSub}>{detailRow.model || "Model bilgisi yok"}</p>
            <div style={{ marginBottom: 14 }}>{reasonBadge(detailRow)}</div>
            {detailRow.depot && detailRow.reason === REASON_DEPOT_USED && (
              <div style={{ ...styles.detailAlert, marginBottom: 14, background: pal.warnBg, border: `1px solid ${pal.warnFg}33` }}>
                <div style={{ ...styles.detailAlertTitle, color: pal.warnFg }}>Depoda görünen monitör kullanılıyor</div>
                <div style={styles.detailAlertBody}>
                  Bu monitör TuruncuHat'ta Zimmet Depoda görünüyor, ancak {detailRow.usedBy} kullanıyor.
                </div>
              </div>
            )}
            {detailRow.usedByOther && (
              <div style={{ ...styles.detailAlert, marginBottom: 14, background: pal.warnBg, border: `1px solid ${pal.warnFg}33` }}>
                <div style={{ ...styles.detailAlertTitle, color: pal.warnFg }}>Başkasına ait monitör kullanılıyor</div>
                <div style={styles.detailAlertBody}>
                  Bu monitör {detailRow.owner} adına zimmetli, ancak {detailRow.usedBy} kullanıyor.
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", rowGap: 8, columnGap: 12, fontSize: 14 }}>
              {[
                ["Sahibi", detailRow.owner],
                ["Kullanıcı adı", detailRow.ownerUsername || "—"],
                ["Zimmet türü", typeLabel(detailRow.assignmentType)],
                ["Şu an kullanan", detailRow.usedBy],
                ["Şirket", detailRow.company || "—"],
                ["Lokasyon", detailRow.location],
              ].map(([k, v]) => (
                <Fragment key={k}>
                  <span style={{ color: pal.inkSoft }}>{k}</span>
                  <span>{v}</span>
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
