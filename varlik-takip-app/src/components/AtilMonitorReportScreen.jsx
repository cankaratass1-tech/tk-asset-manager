import { Fragment, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Pagination from "./Pagination";
import { computeAtilMonitorRows, buildOtherUserMailPlan, REASON_ACTIVE, REASON_DEPOT_USED, REASON_NOT_ATTACHED, REASON_USED_BY_OTHER } from "../services/atilMonitorService";
import { backendClient } from "../services/backendClient";
import { ownerTitleOf } from "../services/ownerName";

const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Metin, Zimmet Uyuşmazlığı mailiyle aynı şablon (App.jsx buildZimmetCombinedMailHtml): aynı giriş,
// aynı sütunlar, aynı Turuncuhat kayıt talimatı — "cihaz" yerine "monitör".
const MAIL_SUBJECT = "Zimmet Uyuşmazlığı — Kullandığınız Cihaz(lar) İçin Zimmet Transferi Gerekli";
const MAIL_HEAD = ["Seri No", "Barkod", "Marka", "Model", "Varlık Adı", "Kayıtlı Sahibi (Eski)", "Hostname", "Last Logon"];
const mailCells = (r, username) => [r.monitorSerial, r.barkod, r.marka, r.model, r.asset, r.owner, r.hostnames, username];
const buildMailText = (items, username) =>
  `Aşağıdaki cihaz(lar) için aksiyon gereklidir:\n\n${items
    .map((r) => `- ${r.monitorSerial} (${r.model || "—"}) — kayıtlı eski sahibi: ${r.owner}`)
    .join("\n")}\n\nTuruncuhat: turuncuhat.mhy.com.tr → Oluştur → Kullanıcı Vakası → ilgili zimmet servisi.`;
const buildMailHtml = (items, username) => `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6;">
    <p>Merhabalar,</p>
    <p>Sistem kayıtlarımıza göre, aşağıda listelenen cihaz(lar)ın kayıtlı sahibi farklı bir kişi görünüyor. Ancak son giriş kayıtlarına göre bu cihaz(lar)ı fiilen <strong>siz</strong> kullanıyorsunuz. Zimmet hareketlerinin doğru ve güncel şekilde yönetilebilmesi için, cihaz(lar)ın sizin adınıza zimmet transferinin yapılması gerekmektedir.</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:8px;">
      <thead><tr style="background:#f0f0f0;">${MAIL_HEAD.map((h) => `<th style="border:1px solid #ccc;padding:6px 8px;text-align:left;">${h}</th>`).join("")}</tr></thead>
      <tbody>${items
        .map((r) => `<tr>${mailCells(r, username).map((c) => `<td style="border:1px solid #ccc;padding:6px 8px;">${escHtml(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody>
    </table>
    <p style="margin-top:12px;">İşleminiz için lütfen aşağıdaki adımları izleyerek Turuncuhat üzerinden bir kayıt oluşturunuz:</p>
    <p>turuncuhat.mhy.com.tr → Oluştur → Kullanıcı Vakası → açılan pencerede Servis kısmına tıklayıp arama bölümünden ilgili zimmet servisini seçin → gerekli alanları doldurup kaydet ve çık butonuna basabilirsiniz.</p>
    <p style="margin-top:12px;">Kayıt açıklama kısmına yukarıdaki cihaz bilgilerini (Seri No, Hostname vb.) eklemeniz, işleminizin daha hızlı değerlendirilmesine yardımcı olacaktır.</p>
  </div>`;

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
export default function AtilMonitorReportScreen({ styles, pal, thRows, monitorRows, thMeta, monitorMeta, loading, showToast, recordMailHistory, deptLabel }) {
  const [confirmMailOpen, setConfirmMailOpen] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [stage, setStage] = useState("atil");
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [expandedOwner, setExpandedOwner] = useState(null); // { rowKey, ownerKey, userKey, person }
  const [detailRow, setDetailRow] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all"); // all | User | OBS | Warehouse | other

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
  const filtered = useMemo(() => {
    const list =
      typeFilter === "all" ? stageList : typeFilter === "other" ? stageList.filter((r) => !isMainType(r.assignmentType)) : stageList.filter((r) => r.assignmentType === typeFilter);
    const q = norm(search);
    if (!q) return list;
    return list.filter((r) => toCells(r).some((v) => norm(v).includes(q)));
  }, [stageList, typeFilter, search]);

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
      what: "TuruncuHat'ta User veya OBS olarak zimmetli, ama Monitor Raporu'nda hiç satırı olmayan monitörler. Hiçbir yerde kullanılmıyor, boşta duruyor.",
      calc: `Kapsamdaki ${stats.inScope} monitörün ${stats.atil} tanesi.`,
    },
    outside: {
      what: "Monitor Raporu'nda görünüyor ama kullanan kişi TuruncuHat'taki zimmetli kişiden farklı, yani kayıtlarımız dışında başkası kullanıyor. OBS (müdürlük) monitörlerini herkes kullanabildiği için bu kontrole girmez.",
      calc: "Karşılaştırma kullanıcı adıyladır: Monitor Raporu'ndaki Username ile TuruncuHat'taki Owner Username aynı değilse bu gruba girer.",
    },
    depotUsed: {
      what: "TuruncuHat'ta Zimmet Depoda görünüyor ama Monitor Raporu'nda satırı var, yani biri kullanıyor. Depoda durması gerekirdi.",
      calc: `Depoda görünen ${stats.depotTotal} monitörün ${stats.depotUsed} tanesi kullanılıyor, ${depotIdle} tanesi depoda duruyor (normal).`,
    },
    active: {
      what: "Monitor Raporu'nda görünüyor ve kullanan kişi zimmetli kişiyle uyumlu (OBS'de herkes kullanabilir). Sorun yok.",
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
      showToast?.("Seçili kayıtlarda bilgi dışı kullanım yok — mail gönderilecek kayıt bulunamadı (atıl/aktif monitörlere mail gitmez)");
      return;
    }
    setMailBusy(true);
    let sent = 0, failed = 0;
    const details = noMail.map((n) => ({ location: n.username, to: null, count: n.items.length, ok: false, message: "TuruncuHat'ta bu kullanıcı için mail adresi bulunamadı" }));
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
    if (sent === 0) showToast?.(`❌ Gönderilemedi — ${failed + skipped} kayıt${skipped ? ` (${skipped} kayıt için mail adresi bulunamadı)` : ""}`);
    else if (failed > 0 || skipped > 0) showToast?.(`⚠️ ${sent} kayıt, ${recipients.length} kullanıcıya gönderildi${skipped ? `, ${skipped} kayıt için mail adresi bulunamadı` : ""}${failed ? `, ${failed} kayıt başarısız` : ""}`);
    else showToast?.(`✅ Başarılı — ${sent} kayıt, ${recipients.length} kullanıcıya mail gönderildi`);
  };

  const selectStage = (id) => {
    setStage(id);
    setPage(1);
    setExpandedOwner(null);
  };

  // Aşama rozeti, arama, seçim ve açılmış kişi satırlarını varsayılana (Atıl monitörler) döndürür
  const isFiltered = stage !== "atil" || typeFilter !== "all" || search !== "" || selectedKeys.size > 0 || expandedOwner !== null;
  const resetFilters = () => {
    setStage("atil");
    setTypeFilter("all");
    setSearch("");
    setPage(1);
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
      <span style={{ ...styles.badge, ...look, flexShrink: 0 }}>
        <span style={{ ...styles.badgeDot, background: dot }} />
        {r.reason}
      </span>
    );
  };

  return (
    <>
      <div style={{ ...styles.panel, padding: "20px 24px" }}>
        <p style={styles.pageTitle}>Atıl Monitörler</p>
        <p style={{ ...styles.pageSub, margin: "0 0 12px" }}>
          TuruncuHat'ta User/OBS olarak zimmetli monitörlerin gerçek durumu (Warehouse monitörleri kapsam dışı). İki şeyi bulur:
          <b> atıl</b> monitörler (Monitor Raporu'nda hiç görünmüyor, yani kullanılmıyor) ve <b>bilgi dışı kullanılan</b> monitörler
          (zimmetli kişi dışında biri kullanıyor; OBS monitörlerini herkes kullanabildiği için OBS bu kontrolün dışında).
          Ayrıca TuruncuHat'ta <b>Zimmet Depoda</b> görünüp Monitor Raporu'nda kullanıldığı görülen monitörler de "Depoda görünen ama kullanılan" grubunda listelenir (depoda duran, kullanılmayanlar listelenmez).
          Rozetlere tıklayarak her gruptaki monitörleri, bir kişinin adına (sahibi ya da şu an kullanan) tıklayarak o kişiyle ilgili tüm monitörleri görebilirsiniz.
        </p>
        <p style={{ fontSize: 12, color: pal.inkSoft, margin: "0 0 12px" }}>
          {thMeta ? `TuruncuHat: ${thMeta.fileName}` : "TuruncuHat: yüklenmedi"} · {monitorMeta ? `Monitor Raporu: ${monitorMeta.fileName}` : "Monitor Raporu: yüklenmedi"}
          {loading ? " · yükleniyor…" : ""}
        </p>

        {missingData && !loading ? (
          <p style={{ fontSize: 13, color: pal.inkSoft }}>
            Rapor için TuruncuHat ve Monitor Raporu dosyaları gerekir. Ayarlar &gt; Veri Input &gt; Dosya Kaynağı klasörünü kontrol edin.
          </p>
        ) : (
          <>
            {funnelGroups.map((group) => (
              <div key={group.title} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: pal.inkSoft, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{group.title}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {group.items.map(([id, label, n, tone]) => {
                    const selected = id === stage;
                    const look = tone === "bad" ? styles.badgeBad : tone === "warn" ? { background: pal.warnBg, color: pal.warnFg } : {};
                    return (
                      <span
                        key={id}
                        onClick={() => selectStage(id)}
                        title={`${GROUP_INFO[id].what} — Tıklayınca bu gruptaki monitörleri listeler.`}
                        style={{
                          ...styles.badge,
                          ...look,
                          cursor: "pointer",
                          outline: selected ? `2px solid ${pal.accent || pal.ink}` : "none",
                          outlineOffset: 1,
                          fontWeight: selected ? 700 : undefined,
                        }}
                      >
                        {label}: {n}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}

            {stageInfo && (
              <div style={{ background: pal.fieldBg, borderRadius: 10, padding: "10px 14px", margin: "0 0 14px", fontSize: 13, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{stageLabel}</div>
                <div style={{ color: pal.inkSoft }}>{stageInfo.what}</div>
                <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{stageInfo.calc}</div>
              </div>
            )}

            <div style={styles.toolbar} className="no-print">
              <div style={styles.toolbarFiltersRow}>
                <div style={styles.segmented} title="Zimmet türüne göre filtrele. User = kişi zimmeti, OBS = müdürlük zimmeti, Depo = TuruncuHat'ta depoda (Warehouse), Diğer = Saha (Site), Tedarikçi (Supplier) ya da tür boş">
                  {[
                    ["all", "Tümü"],
                    ["User", "User"],
                    ["OBS", "OBS"],
                    ["Warehouse", "Depo"],
                    ["other", "Diğer"],
                  ].map(([id, label]) => (
                    <div
                      key={id}
                      onClick={() => {
                        setTypeFilter(id);
                        setPage(1);
                      }}
                      style={{ ...styles.seg, ...(typeFilter === id ? styles.segActive : {}) }}
                    >
                      {label} ({typeCounts[id]})
                    </div>
                  ))}
                </div>
                <div style={styles.searchWrap}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Seri no, model, sahibi, kullanan veya neden ara..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    style={styles.searchInput}
                  />
                  {search && (
                    <span
                      onClick={() => {
                        setSearch("");
                        setPage(1);
                      }}
                      title="Aramayı temizle"
                      style={{ cursor: "pointer", color: pal.inkSoft, fontSize: 15, lineHeight: 1, padding: "0 2px" }}
                    >
                      ×
                    </span>
                  )}
                </div>
                {isFiltered && (
                  <button type="button" style={styles.btnGhost} onClick={resetFilters} title="Aşama, arama ve seçimi varsayılana döndürür">
                    Filtreleri Sıfırla
                  </button>
                )}
                {selectedKeys.size > 0 && (
                  <button type="button" style={styles.btnGhost} onClick={exportSelected} title="Seçilen monitörleri Excel'e aktarır">
                    Seçilenleri İndir ({selectedKeys.size})
                  </button>
                )}
                <button type="button" style={styles.btnGhost} onClick={exportCurrent} disabled={filtered.length === 0} title="Ekrandaki listeyi (seçili aşama ve arama) Excel'e aktarır">
                  Excel'e Aktar ({filtered.length})
                </button>
                <button type="button" style={styles.btnGhost} onClick={exportAllStages} title="Atıl monitörler ve diğer aşamalar sayfa sayfa tek dosyada">
                  Tüm Aşamaları Aktar
                </button>
                <button
                  type="button"
                  style={styles.btnPrimary}
                  onClick={onMailClick}
                  disabled={mailBusy || stages.outside.length === 0}
                  title="Monitörü kullanan (zimmetli olmayan) kişiye zimmet transferi maili gönderir. Seçim yoksa tüm bilgi dışı kullanımlara (onayla)"
                >
                  {mailBusy ? "Gönderiliyor…" : `Bilgi Dışı Kullanıma Mail Gönder${selectedKeys.size > 0 ? ` (${selectedKeys.size} seçili)` : ""}`}
                </button>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, width: 32 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={styles.checkbox} />
                    </th>
                    {HEADERS.map((h) => (
                      <th key={h} style={{ ...styles.th, whiteSpace: "nowrap" }}>{h}</th>
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
                          <td style={styles.td}>
                            <input type="checkbox" checked={selectedKeys.has(r.rowKey)} onChange={() => toggleSelect(r.rowKey)} style={styles.checkbox} />
                          </td>
                          <td style={styles.td}>
                            <span style={{ ...styles.serial, ...styles.clickableName }} onClick={() => setDetailRow(r)} title="Monitörün detayını göster">
                              {r.monitorSerial}
                            </span>
                          </td>
                          <td style={styles.td}>{r.model}</td>
                          <td style={styles.td}>{typeLabel(r.assignmentType)}</td>
                          <td style={styles.td}>
                            <div
                              style={{ ...styles.cellName, ...(hasOwner ? styles.clickableName : {}) }}
                              onClick={hasOwner ? () => toggleOwner(r) : undefined}
                              title={hasOwner ? `${r.owner}'e ait monitörleri göster/gizle` : undefined}
                            >
                              {r.owner}
                            </div>
                            {ownerTitleOf(r.ownerFull) && <div style={styles.cellSub} title={r.ownerFull}>{ownerTitleOf(r.ownerFull)}</div>}
                          </td>
                          <td style={styles.td}>
                            {r.usedBy === "—"
                              ? "—"
                              : r.usedBy.split(", ").map((u, i) => (
                                  <Fragment key={u}>
                                    {i > 0 && ", "}
                                    <span
                                      style={{
                                        ...(r.usedByOther ? { ...styles.badge, background: pal.warnBg, color: pal.warnFg } : {}),
                                        ...styles.clickableName,
                                      }}
                                      onClick={() => toggleUser(r, u)}
                                      title={r.usedByOther ? `Zimmetli kişi dışında biri kullanıyor — ${u}'in monitörlerini göster/gizle` : `${u}'in monitörlerini göster/gizle`}
                                    >
                                      {u}
                                    </span>
                                  </Fragment>
                                ))}
                          </td>
                          <td style={styles.td}>{r.company}</td>
                          <td style={styles.td}>{r.location}</td>
                          <td style={{ ...styles.td, fontSize: 12.5 }}>{r.reason}</td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td style={{ ...styles.td, background: pal.fieldBg, padding: 0 }} colSpan={HEADERS.length + 1}>
                              <div style={{ padding: "12px 20px" }}>
                                {[
                                  ["tüm monitörleri (zimmetli)", monitorsByOwner.get(expandedOwner.ownerKey) || [], false],
                                  ["kullandığı, başkasına ait monitörler", expandedOwner.userKey ? borrowedByUser.get(expandedOwner.userKey) || [] : [], true],
                                ].map(([title, list, borrowed]) => (
                                  <div key={title} style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 700, color: pal.inkSoft, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                      {expandedOwner.person} — {title} ({list.length})
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                      {list.length === 0 && <div style={{ fontSize: 13, color: pal.inkSoft }}>Kayıt yok</div>}
                                      {list.map((pr) => (
                                        <div key={pr.rowKey} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 8, background: pal.panelSolid, fontSize: 13.5 }}>
                                          <span style={{ ...styles.serial, ...styles.clickableName, flexShrink: 0 }} onClick={() => setDetailRow(pr)} title="Bu monitörün detayını gör">
                                            {pr.monitorSerial}
                                          </span>
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
                      <td style={{ ...styles.td, color: pal.inkSoft }} colSpan={HEADERS.length + 1}>Bu aşamada monitör bulunamadı.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ ...styles.tableFooter, flexWrap: "wrap", gap: 10, marginTop: 10 }}>
              <span>
                {filtered.length} kayıttan {paged.length} tanesi gösteriliyor{totalPages > 1 ? ` · Sayfa ${safePage} / ${totalPages}` : ""}
                {selectedKeys.size > 0 ? ` · ${selectedKeys.size} seçili` : ""}
              </span>
              <Pagination page={safePage} totalPages={totalPages} onChange={setPage} styles={styles} pal={pal} />
            </div>
          </>
        )}
      </div>

      {confirmMailOpen && (
        <div style={styles.modalOverlay} onClick={() => setConfirmMailOpen(false)}>
          <div style={{ ...styles.modalCard, width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <p style={styles.modalTitle}>Mail Gönderimini Onayla</p>
              <span style={styles.modalClose} onClick={() => setConfirmMailOpen(false)}>✕</span>
            </div>
            <p style={styles.modalSub}>
              Listede seçim yapılmadı — tüm bilgi dışı kullanımlar için mail gönderilecek: {stages.outside.length} monitör, {mailPlan.recipients.length} kullanıcı
              {mailPlan.noMail.length > 0 ? ` (${mailPlan.noMail.length} kullanıcının mail adresi bulunamadığı için atlanacak)` : ""}.
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
          <div style={{ ...styles.modalCard, width: "min(580px, 100%)", fontSize: 15.5 }} onClick={(e) => e.stopPropagation()}>
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
