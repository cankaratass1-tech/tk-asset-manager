import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

// Bazı kaynaklardan (örn. monitör EDID okuma hatası) model bilgisi düzgün metin yerine
// virgülle ayrılmış ASCII kod dizisi olarak gelebiliyor: "76, 69, 78, 32, ..." → "LEN ..."
// Bu fonksiyon böyle bir dizi tespit ederse otomatik olarak okunaklı metne çevirir.
function decodeModelIfNeeded(raw) {
  if (!raw) return raw;
  const parts = raw.split(",").map((p) => p.trim());
  const looksLikeAsciiList = parts.length > 3 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 32 && Number(p) <= 126);
  if (!looksLikeAsciiList) return raw;
  return parts.map((p) => String.fromCharCode(Number(p))).join("").trim();
}

// Departmanlar arası dashboard için: her departmanın zimmet uyuşmazlık istatistiğini hesaplar
function computeDeptZimmetStats(deptId) {
  const { assigned, active } = MOCK_ZIMMET[deptId];
  const activeUserBySerial = Object.fromEntries(active.map((a) => [a.serial, a.user]));
  let ok = 0, bad = 0, noRecord = 0;
  assigned.forEach((a) => {
    const activeUser = activeUserBySerial[a.serial] || null;
    if (activeUser === a.owner) ok++;
    else if (activeUser) bad++;
    else noRecord++;
  });
  return { total: assigned.length, ok, bad, noRecord };
}

const DEPARTMENTS = [
  { id: "d1", name: "Departman 1" },
  { id: "d2", name: "Departman 2" },
  { id: "d3", name: "Departman 3" },
];

const REPORT_TYPES = [
  { id: "inaktif", name: "İnaktif Cihazlar" },
  { id: "disk", name: "Disk Alanı" },
  { id: "zimmet", name: "Zimmet Uyuşmazlığı" },
];

const STATUS_FLOW = ["Yeni", "İnceleniyor", "Çözüldü"];
const STATUS_COLORS = {
  "Yeni": { bg: "rgba(184,74,62,0.09)", fg: "#B84A3E" },
  "İnceleniyor": { bg: "rgba(180,120,10,0.10)", fg: "#B4780A" },
  "Çözüldü": { bg: "rgba(76,122,94,0.10)", fg: "#4C7A5E" },
};

// Zimmet (kaynak A) ve aktif kullanım (kaynak B) — iki ayrı canlı veri kaynağını
// temsil eden sahte veri. Gerçek entegrasyonda bu ikisi ayrı API çağrılarından gelecek.
const MOCK_ZIMMET = {
  d1: {
    assigned: [
      { serial: "MN-10021", owner: "A. Yılmaz", type: "Monitör — Dell 24\"" },
      { serial: "MN-10300", owner: "A. Yılmaz", type: "Monitör — Dell 24\"" },
      { serial: "MN-10088", owner: "S. Kaya", type: "Monitör — LG 27\"" },
      { serial: "MN-10250", owner: "S. Kaya", type: "Monitör — LG 27\"" }, // mükerrer: S. Kaya'ya aynı tür 2. monitör
      { serial: "LP-20044", owner: "T. Özkan", type: "Laptop — Dell Latitude" },
      { serial: "MN-10133", owner: "C. Arslan", type: "Monitör — Dell 24\"" },
      // Gerçek örnek dosyadan: model bilgisi bazen ham ASCII kod dizisi olarak geliyor
      { serial: "VN-8821", owner: "E. Aydın", type: "76, 69, 78, 32, 76, 84, 50, 50, 50, 51, 112, 119, 67" },
    ],
    active: [
      { serial: "MN-10021", user: "B. Şahin" }, // A. Yılmaz'ın zimmetli cihazını B. Şahin kullanıyor
      { serial: "MN-10300", user: "D. Tekin" }, // A. Yılmaz'ın 2. monitörünü D. Tekin kullanıyor
      { serial: "MN-10088", user: "S. Kaya" }, // tutarlı
      { serial: "MN-10133", user: "A. Yılmaz" }, // A. Yılmaz kendi zimmetlisi yerine C. Arslan'a ait cihazı kullanıyor
    ],
  },
  d2: {
    assigned: [
      { serial: "MN-30012", owner: "H. Polat", type: "Monitör — Dell 24\"" },
      { serial: "LP-30099", owner: "İ. Çelik", type: "Laptop — HP EliteBook" },
    ],
    active: [
      { serial: "MN-30012", user: "H. Polat" },
      { serial: "LP-30099", user: "J. Doğan" }, // İ. Çelik'in cihazını J. Doğan kullanıyor
    ],
  },
  d3: {
    assigned: [
      { serial: "MN-40071", owner: "L. Yıldız", type: "Monitör — LG 27\"" },
    ],
    active: [],
  },
};

// Sahte (mock) veri seti — gerçek API bağlanınca bu kısım API çağrısıyla değişecek
const MOCK_DATA = {
  d1: {
    inaktif: [
      { owner: "A. Yılmaz", sub: "İstanbul Satış", serial: "SN-88213X", model: "Dell Latitude 5420", location: "İstanbul", matched: true },
      { owner: "M. Demir", sub: "Abidjan Satış", serial: "SN-77410A", model: "HP EliteBook 840", location: "Abidjan", matched: true },
      { owner: "S. Kaya", sub: "Genel Müdürlük", serial: "SN-91027M", model: "Lenovo ThinkPad T14", location: "—", matched: false },
      { owner: "T. Özkan", sub: "Toronto Satış", serial: "SN-65590T", model: "Dell Latitude 5420", location: "Toronto", matched: true },
      { owner: "E. Aydın", sub: "Genel Müdürlük", serial: "SN-30021B", model: "HP EliteBook 840", location: "—", matched: false },
      { owner: "B. Şahin", sub: "İzmir Satış", serial: "SN-40218C", model: "Lenovo ThinkPad T14", location: "İzmir", matched: true },
      { owner: "C. Arslan", sub: "Ankara Satış", serial: "SN-51092D", model: "Dell Latitude 5420", location: "Ankara", matched: true },
    ],
    disk: [
      { owner: "F. Koç", sub: "İstanbul Satış", serial: "PC-19233", model: "Boş: 2.1 GB / C:", location: "İstanbul", matched: true },
      { owner: "G. Er", sub: "Genel Müdürlük", serial: "PC-20411", model: "Boş: 0.8 GB / C:", location: "—", matched: false },
    ],
  },
  d2: {
    inaktif: [
      { owner: "H. Polat", sub: "Lagos Satış", serial: "SN-11029F", model: "Dell Latitude 5420", location: "Lagos", matched: true },
      { owner: "İ. Çelik", sub: "Genel Müdürlük", serial: "SN-22093G", model: "HP EliteBook 840", location: "—", matched: false },
      { owner: "J. Doğan", sub: "Nairobi Satış", serial: "SN-33871H", model: "Lenovo ThinkPad T14", location: "Nairobi", matched: true },
    ],
    disk: [
      { owner: "K. Aksoy", sub: "Lagos Satış", serial: "PC-30217", model: "Boş: 1.4 GB / C:", location: "Lagos", matched: true },
    ],
  },
  d3: {
    inaktif: [
      { owner: "L. Yıldız", sub: "Kahire Satış", serial: "SN-44127J", model: "Dell Latitude 5420", location: "Kahire", matched: true },
      { owner: "N. Kurt", sub: "Genel Müdürlük", serial: "SN-55890K", model: "HP EliteBook 840", location: "—", matched: false },
    ],
    disk: [],
  },
};

export default function VarlikTakip() {
  const [theme, setTheme] = useState("light");
  const pal = theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const styles = useMemo(() => buildStyles(pal), [theme]);
  const [activeDept, setActiveDept] = useState("d1");
  const [activeReport, setActiveReport] = useState("inaktif");
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("all"); // all | matched | unmatched
  const [toast, setToast] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [rowMeta, setRowMeta] = useState({}); // key -> { status, note, snoozed }
  const [mailHistory, setMailHistory] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [savedFilters, setSavedFilters] = useState([]); // { id, label, search, segment, report }
  const [savingFilter, setSavingFilter] = useState(false);
  const [filterNameDraft, setFilterNameDraft] = useState("");
  const [notifPrefs, setNotifPrefs] = useState({
    d1: { inaktif: true, disk: true, zimmet: true },
    d2: { inaktif: true, disk: true, zimmet: true },
    d3: { inaktif: true, disk: true, zimmet: true },
  });
  const [scheduleConfig, setScheduleConfig] = useState({ enabled: false, cadence: "weekly", day: "Pazartesi", time: "09:00" });

  const isZimmet = activeReport === "zimmet";

  const rowKeyOf = (r) => (isZimmet ? r.rowKey : `${activeDept}|${activeReport}|${r.serial}`);

  const closeAllViews = () => { setShowHistory(false); setShowDashboard(false); setShowSettings(false); };
  const goDept = (id) => { setActiveDept(id); closeAllViews(); setSelectedKeys(new Set()); };
  const goReport = (id) => { setActiveReport(id); closeAllViews(); setSelectedKeys(new Set()); };

  // Cihaz merkezli eşleştirme: her zimmetli cihaz, aktif kullanım API'sindeki kendi kaydıyla
  // ayrı ayrı karşılaştırılıyor. Bir kişiye birden fazla cihaz zimmetliyse her biri kendi satırında görünür.
  const zimmetRows = useMemo(() => {
    if (!isZimmet) return [];
    const { assigned, active } = MOCK_ZIMMET[activeDept];

    const activeUserBySerial = Object.fromEntries(active.map((a) => [a.serial, a.user]));
    const assignedSerials = new Set(assigned.map((a) => a.serial));

    // Her zimmetli cihaz için: bu seri no'yu şu an kim kullanıyor (varsa)?
    const deviceRows = assigned.map((a) => {
      const activeUser = activeUserBySerial[a.serial] || null;
      let statusTag, detail, matched;
      if (activeUser === a.owner) {
        statusTag = "Zimmet Doğru";
        detail = `${a.serial} seri numaralı cihazı ${a.owner} kullanmalı ve kullanıyor.`;
        matched = true;
      } else if (activeUser) {
        statusTag = "Zimmet Hatalı";
        detail = `${a.serial} seri numaralı cihazı ${a.owner} kullanmalı, ama ${activeUser} kullanıyor.`;
        matched = false;
      } else {
        statusTag = "Kullanım Kaydı Yok";
        detail = `${a.serial} seri numaralı cihaz ${a.owner}'e zimmetli, aktif kullanım kaydı bulunamadı.`;
        matched = false;
      }
      return {
        rowKey: `${activeDept}|${a.serial}`,
        owner: a.owner,
        sub: decodeModelIfNeeded(a.type),
        serial: a.serial,
        ownedLabel: a.serial,
        userLabel: activeUser || "Tespit Edilemedi",
        model: detail,
        location: activeUser || "—",
        matched,
        statusTag,
      };
    });

    // Aktif kullanım kaydı olup hiçbir zimmet listesinde geçmeyen cihazlar (tamamen zimmetsiz kullanım)
    const orphanRows = active
      .filter((a) => !assignedSerials.has(a.serial))
      .map((a) => ({
        rowKey: `${activeDept}|orphan|${a.serial}`,
        owner: "—",
        sub: "—",
        serial: a.serial,
        ownedLabel: "—",
        userLabel: a.user,
        model: `${a.serial} seri numaralı cihazın zimmet kaydı yok, ${a.user} kullanıyor.`,
        location: a.serial,
        matched: false,
        statusTag: "Zimmetsiz Kullanım",
      }));

    return [...deviceRows, ...orphanRows];
  }, [isZimmet, activeDept]);

  const rawRows = isZimmet ? zimmetRows : MOCK_DATA[activeDept][activeReport] || [];

  const filteredRows = useMemo(() => {
    return rawRows.filter((r) => {
      if (isZimmet && !showSnoozed && rowMeta[r.rowKey]?.snoozed) return false;
      if (segment === "matched" && !r.matched) return false;
      if (segment === "unmatched" && r.matched) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${r.owner} ${r.sub} ${r.serial} ${r.model} ${r.location}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rawRows, segment, search, isZimmet, showSnoozed, rowMeta]);

  const matchedCount = rawRows.filter((r) => r.matched).length;
  const unmatchedCount = rawRows.length - matchedCount;
  const snoozedCount = isZimmet ? rawRows.filter((r) => rowMeta[r.rowKey]?.snoozed).length : 0;

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const cycleStatus = (key) => {
    setRowMeta((prev) => {
      const current = prev[key]?.status || "Yeni";
      const idx = STATUS_FLOW.indexOf(current);
      const next = STATUS_FLOW[(idx + 1) % STATUS_FLOW.length];
      return { ...prev, [key]: { ...prev[key], status: next } };
    });
  };

  const toggleSnooze = (key) => {
    setRowMeta((prev) => ({ ...prev, [key]: { ...prev[key], snoozed: !prev[key]?.snoozed } }));
  };

  const setNote = (key, text) => {
    setRowMeta((prev) => ({ ...prev, [key]: { ...prev[key], note: text } }));
  };

  const toggleSelect = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedKeys.has(rowKeyOf(r)));

  const toggleSelectAll = () => {
    setSelectedKeys((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filteredRows.forEach((r) => next.delete(rowKeyOf(r)));
        return next;
      }
      const next = new Set(prev);
      filteredRows.forEach((r) => next.add(rowKeyOf(r)));
      return next;
    });
  };

  const buildSheetData = (rows) => {
    if (isZimmet) {
      return rows.map((r) => ({
        "Zimmetli Kişi": r.owner,
        "Cihaz (Seri No)": r.serial,
        "Cihaz Türü": r.sub,
        "Kullanan Kişi": r.userLabel,
        "Açıklama": r.model,
        "Durum": r.statusTag,
      }));
    }
    return rows.map((r) => ({
      "Cihaz Sahibi": r.owner,
      "Birim": r.sub,
      "Seri No": r.serial,
      "Model": r.model,
      "Lokasyon": r.location,
      "Durum": r.matched ? "Eşleşti" : "Eşleşmedi",
    }));
  };

  const buildPersonSummaryRows = (rows) => {
    const entries = [];
    rows.forEach((r) => {
      if (r.owner !== "—") {
        entries.push({
          "Kişi": r.owner,
          "Rol": r.matched ? "Zimmetli (Kullanıyor)" : "Zimmetli",
          "Cihaz (Seri No)": r.serial,
          "Cihaz Türü": r.sub,
          "Açıklama": r.model,
          "Durum": r.statusTag,
        });
      }
      if (r.userLabel !== "—" && r.userLabel !== "Tespit Edilemedi" && r.userLabel !== r.owner) {
        entries.push({
          "Kişi": r.userLabel,
          "Rol": "Kullanıyor",
          "Cihaz (Seri No)": r.serial,
          "Cihaz Türü": r.sub,
          "Açıklama": r.model,
          "Durum": r.statusTag,
        });
      }
    });
    entries.sort((a, b) => a["Kişi"].localeCompare(b["Kişi"], "tr"));
    return entries;
  };

  const downloadSheet = (rows, suffix) => {
    const deptName = DEPARTMENTS.find((d) => d.id === activeDept).name;
    const reportName = REPORT_TYPES.find((r) => r.id === activeReport).name;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildSheetData(rows)), isZimmet ? "Cihaz Bazlı" : "Rapor");
    if (isZimmet) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildPersonSummaryRows(rows)), "Kişi Bazlı Özet");
    }
    XLSX.writeFile(wb, `${deptName} - ${reportName}${suffix}.xlsx`);
  };

  const handleExport = () => {
    downloadSheet(filteredRows, "");
    showToast(`Excel indirildi: ${filteredRows.length} kayıt`);
  };

  const handleExportSelected = () => {
    const rows = filteredRows.filter((r) => selectedKeys.has(rowKeyOf(r)));
    downloadSheet(rows, " - Seçilenler");
    showToast(`Excel indirildi: ${rows.length} seçili kayıt`);
  };

  const saveCurrentFilter = () => {
    const label = filterNameDraft.trim() || `${search || "Tümü"} / ${segment}`;
    setSavedFilters((prev) => [...prev, { id: Date.now(), label, search, segment, report: activeReport }]);
    setSavingFilter(false);
    setFilterNameDraft("");
    showToast(`Filtre kaydedildi: ${label}`);
  };

  const handlePdfExport = () => {
    showToast("Yazdırma penceresi açılıyor — 'PDF olarak kaydet' seçeneğini kullanabilirsin");
    setTimeout(() => window.print(), 300);
  };

  const handleMail = () => {
    const deptName = DEPARTMENTS.find((d) => d.id === activeDept).name;
    const reportName = REPORT_TYPES.find((r) => r.id === activeReport).name;
    setMailHistory((prev) => [
      {
        id: Date.now(),
        date: new Date().toLocaleString("tr-TR"),
        dept: deptName,
        report: reportName,
        recipients: filteredRows.length,
        status: "Başarılı",
      },
      ...prev,
    ]);
    showToast(`Mail gönderme demo — ${filteredRows.length} kayıt için mail hazırlandı, Gönderim Geçmişi'ne eklendi`);
  };

  return (
    <div style={styles.body} className="vt-body">
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 9px; }
        ::-webkit-scrollbar-thumb { background: ${theme === "dark" ? DARK_PALETTE.scrollbarThumb : LIGHT_PALETTE.scrollbarThumb}; border-radius: 10px; }
        input:focus, select:focus { outline: none; }
        @media print {
          .no-print { display: none !important; }
          body, .vt-body { background: #fff !important; padding: 0 !important; }
          .vt-shell { display: block !important; }
          .print-area { box-shadow: none !important; border: none !important; }
          .print-area, .print-area * { color: #000 !important; background: #fff !important; }
        }
      `}</style>

      <div style={styles.shell} className="vt-shell">
        {/* SIDEBAR */}
        <aside style={styles.sidebar} className="no-print">
          <div style={styles.brand}>
            <div style={styles.brandLeft}>
              <div style={styles.brandMark} />
              <div style={styles.brandName}>Varlık Takip</div>
            </div>
            <div style={styles.themeToggle} onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))} title="Temayı değiştir">
              <span style={{ ...styles.themeToggleBtn, ...(theme === "light" ? styles.themeToggleBtnActive : {}) }}>☀︎</span>
              <span style={{ ...styles.themeToggleBtn, ...(theme === "dark" ? styles.themeToggleBtnActive : {}) }}>☾</span>
            </div>
          </div>

          <div style={styles.navLabel}>Bölümler</div>
          <div style={styles.deptList}>
            {DEPARTMENTS.map((d) => {
              const count = (MOCK_DATA[d.id].inaktif?.length || 0) + (MOCK_DATA[d.id].disk?.length || 0);
              const active = d.id === activeDept && !showHistory;
              return (
                <div key={d.id} onClick={() => goDept(d.id)} style={{ ...styles.deptItem, ...(active ? styles.deptItemActive : {}) }}>
                  <div style={styles.deptLeft}>
                    <span style={{ ...styles.deptDot, ...(active ? styles.deptDotActive : {}) }} />
                    {d.name}
                  </div>
                  <span style={{ ...styles.deptCount, ...(active ? styles.deptCountActive : {}) }}>{count}</span>
                </div>
              );
            })}
          </div>

          <div style={styles.navLabel}>Rapor Türü</div>
          <div style={styles.deptList}>
            {REPORT_TYPES.map((r) => {
              const active = r.id === activeReport && !showHistory;
              return (
                <div key={r.id} onClick={() => goReport(r.id)} style={{ ...styles.deptItem, ...(active ? styles.deptItemActive : {}) }}>
                  <div style={styles.deptLeft}>
                    <span style={{ ...styles.deptDot, ...(active ? styles.deptDotActive : {}) }} />
                    {r.name}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={styles.navLabel}>Diğer</div>
          <div style={styles.deptList}>
            <div onClick={() => { closeAllViews(); setShowHistory(true); }} style={{ ...styles.deptItem, ...(showHistory ? styles.deptItemActive : {}) }}>
              <div style={styles.deptLeft}>
                <span style={{ ...styles.deptDot, ...(showHistory ? styles.deptDotActive : {}) }} />
                Gönderim Geçmişi
              </div>
              {mailHistory.length > 0 && <span style={{ ...styles.deptCount, ...(showHistory ? styles.deptCountActive : {}) }}>{mailHistory.length}</span>}
            </div>
            <div onClick={() => { closeAllViews(); setShowDashboard(true); }} style={{ ...styles.deptItem, ...(showDashboard ? styles.deptItemActive : {}) }}>
              <div style={styles.deptLeft}>
                <span style={{ ...styles.deptDot, ...(showDashboard ? styles.deptDotActive : {}) }} />
                Genel Bakış
              </div>
            </div>
            <div onClick={() => { closeAllViews(); setShowSettings(true); }} style={{ ...styles.deptItem, ...(showSettings ? styles.deptItemActive : {}) }}>
              <div style={styles.deptLeft}>
                <span style={{ ...styles.deptDot, ...(showSettings ? styles.deptDotActive : {}) }} />
                Ayarlar
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div style={styles.main}>
          {showDashboard ? (
            <>
              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <p style={styles.pageTitle}>Genel Bakış</p>
                <p style={styles.pageSub}>Departmanlar arası zimmet uyuşmazlık karşılaştırması</p>
              </div>
              <div style={{ ...styles.panel, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
                {DEPARTMENTS.map((d) => {
                  const stats = computeDeptZimmetStats(d.id);
                  const pct = (n) => (stats.total ? Math.round((n / stats.total) * 100) : 0);
                  return (
                    <div key={d.id}>
                      <div style={styles.dashRowHead}>
                        <span style={styles.dashDeptName}>{d.name}</span>
                        <span style={styles.dashDeptTotal}>{stats.total} cihaz</span>
                      </div>
                      <div style={styles.dashBar}>
                        {stats.ok > 0 && <div style={{ ...styles.dashBarSeg, width: `${pct(stats.ok)}%`, background: pal.ok }} title={`Zimmet Doğru: ${stats.ok}`} />}
                        {stats.bad > 0 && <div style={{ ...styles.dashBarSeg, width: `${pct(stats.bad)}%`, background: pal.bad }} title={`Zimmet Hatalı: ${stats.bad}`} />}
                        {stats.noRecord > 0 && <div style={{ ...styles.dashBarSeg, width: `${pct(stats.noRecord)}%`, background: pal.neutralDot }} title={`Kayıt Yok: ${stats.noRecord}`} />}
                      </div>
                      <div style={styles.dashLegendRow}>
                        <span style={styles.dashLegendItem}><span style={{ ...styles.dashDot, background: pal.ok }} />{stats.ok} doğru</span>
                        <span style={styles.dashLegendItem}><span style={{ ...styles.dashDot, background: pal.bad }} />{stats.bad} hatalı</span>
                        <span style={styles.dashLegendItem}><span style={{ ...styles.dashDot, background: pal.neutralDot }} />{stats.noRecord} kayıt yok</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : showSettings ? (
            <>
              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <p style={styles.pageTitle}>Ayarlar</p>
                <p style={styles.pageSub}>Bildirim tercihleri ve zamanlanmış tarama (demo — henüz gerçek gönderim/otomasyon yok)</p>
              </div>

              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <p style={styles.settingsSectionTitle}>Departman Bazlı Bildirim Tercihleri</p>
                <p style={styles.pageSub}>Hangi departman, hangi rapor türü için bildirim almak istiyor</p>
                <table style={{ ...styles.table, marginTop: 14 }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Departman</th>
                      {REPORT_TYPES.map((r) => <th key={r.id} style={styles.th}>{r.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {DEPARTMENTS.map((d) => (
                      <tr key={d.id}>
                        <td style={styles.td}>{d.name}</td>
                        {REPORT_TYPES.map((r) => (
                          <td style={styles.td} key={r.id}>
                            <input
                              type="checkbox"
                              style={styles.checkbox}
                              checked={notifPrefs[d.id][r.id]}
                              onChange={() =>
                                setNotifPrefs((prev) => ({ ...prev, [d.id]: { ...prev[d.id], [r.id]: !prev[d.id][r.id] } }))
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <p style={styles.settingsSectionTitle}>Zamanlanmış Otomatik Tarama</p>
                <p style={styles.pageSub}>Belirlediğin sıklıkla sistem otomatik tarama yapıp yeni uyuşmazlıkları özetler</p>
                <div style={styles.scheduleRow}>
                  <label style={styles.scheduleLabel}>
                    <input
                      type="checkbox"
                      style={styles.checkbox}
                      checked={scheduleConfig.enabled}
                      onChange={() => setScheduleConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                    />
                    Otomatik taramayı etkinleştir
                  </label>
                  <select
                    style={styles.scheduleSelect}
                    value={scheduleConfig.cadence}
                    onChange={(e) => setScheduleConfig((prev) => ({ ...prev, cadence: e.target.value }))}
                    disabled={!scheduleConfig.enabled}
                  >
                    <option value="daily">Her gün</option>
                    <option value="weekly">Haftalık</option>
                    <option value="monthly">Aylık</option>
                  </select>
                  {scheduleConfig.cadence === "weekly" && (
                    <select
                      style={styles.scheduleSelect}
                      value={scheduleConfig.day}
                      onChange={(e) => setScheduleConfig((prev) => ({ ...prev, day: e.target.value }))}
                      disabled={!scheduleConfig.enabled}
                    >
                      {["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"].map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  )}
                  <input
                    type="time"
                    style={styles.scheduleSelect}
                    value={scheduleConfig.time}
                    onChange={(e) => setScheduleConfig((prev) => ({ ...prev, time: e.target.value }))}
                    disabled={!scheduleConfig.enabled}
                  />
                </div>
                <button style={{ ...styles.btnPrimary, marginTop: 14 }} onClick={() => showToast("Ayarlar kaydedildi (demo) — gerçek entegrasyonda otomatik tarama burada devreye girecek")}>
                  Kaydet
                </button>
              </div>
            </>
          ) : showHistory ? (
            <>
              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <p style={styles.pageTitle}>Gönderim Geçmişi</p>
                <p style={styles.pageSub}>Kim, ne zaman, hangi rapor için mail gönderdi — demo modunda tüm gönderimler "Başarılı" işaretlenir</p>
              </div>
              <div style={styles.panel}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Tarih</th>
                      <th style={styles.th}>Departman</th>
                      <th style={styles.th}>Rapor Türü</th>
                      <th style={styles.th}>Alıcı Sayısı</th>
                      <th style={styles.th}>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mailHistory.map((h) => (
                      <tr key={h.id}>
                        <td style={styles.td}><span style={styles.serial}>{h.date}</span></td>
                        <td style={styles.td}>{h.dept}</td>
                        <td style={styles.td}>{h.report}</td>
                        <td style={styles.td}>{h.recipients} kayıt</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.badge, ...styles.badgeOk }}>
                            <span style={{ ...styles.badgeDot, background: pal.ok }} />
                            {h.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {mailHistory.length === 0 && (
                      <tr>
                        <td style={{ ...styles.td, textAlign: "center", color: pal.inkSoft }} colSpan={5}>
                          Henüz mail gönderilmedi — bir rapor ekranında "Mail Gönder" butonuna basınca burada görünecek
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <p style={styles.pageTitle}>
                  {REPORT_TYPES.find((r) => r.id === activeReport).name} — {DEPARTMENTS.find((d) => d.id === activeDept).name}
                </p>
                <p style={styles.pageSub}>
                  {isZimmet
                    ? "Her kişinin zimmetli cihazı ile fiilen kullandığı cihaz karşılaştırılıyor"
                    : "Sahte veri ile demo · gerçek API bağlandığında burası canlı veriyle güncellenecek"}
                </p>

                <div style={styles.statStrip}>
                  <div style={styles.stat}>
                    <span style={styles.statNum}>{rawRows.length}</span>
                    <span style={styles.statLabel}>toplam kayıt</span>
                  </div>
                  <div style={styles.stat}>
                    <span style={{ ...styles.statNum, color: pal.ok }}>{matchedCount}</span>
                    <span style={styles.statLabel}>{isZimmet ? "zimmet doğru" : "eşleşen"}</span>
                  </div>
                  <div style={styles.stat}>
                    <span style={{ ...styles.statNum, color: pal.bad }}>{unmatchedCount}</span>
                    <span style={styles.statLabel}>{isZimmet ? "zimmet hatalı" : "eşleşmeyen"}</span>
                  </div>
                  {isZimmet && snoozedCount > 0 && (
                    <div style={styles.stat}>
                      <span style={{ ...styles.statNum, color: pal.inkSoft }}>{snoozedCount}</span>
                      <span style={styles.statLabel}>ertelenen</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.panel} className="print-area">
                <div style={styles.toolbar} className="no-print">
                  <div style={styles.searchWrap}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.3-4.3" />
                    </svg>
                    <input
                      type="text"
                      placeholder="İsim, seri no veya lokasyon ara..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      style={styles.searchInput}
                    />
                    {search && (
                      <span style={styles.searchClear} onClick={() => setSearch("")} title="Aramayı temizle">
                        ✕
                      </span>
                    )}
                  </div>

                  <div style={styles.segmented}>
                    {[
                      { id: "all", label: "Tümü" },
                      { id: "matched", label: isZimmet ? "Zimmet Doğru" : "Eşleşen" },
                      { id: "unmatched", label: isZimmet ? "Zimmet Hatalı" : "Eşleşmeyen" },
                    ].map((s) => (
                      <div key={s.id} onClick={() => setSegment(s.id)} style={{ ...styles.seg, ...(segment === s.id ? styles.segActive : {}) }}>
                        {s.label}
                      </div>
                    ))}
                  </div>

                  {isZimmet && snoozedCount > 0 && (
                    <div style={styles.chipToggle} onClick={() => setShowSnoozed((v) => !v)}>
                      {showSnoozed ? "Ertelenenleri gizle" : `Ertelenenleri göster (${snoozedCount})`}
                    </div>
                  )}

                  {savingFilter ? (
                    <div style={styles.filterSaveRow}>
                      <input
                        type="text"
                        autoFocus
                        placeholder="Filtre adı..."
                        value={filterNameDraft}
                        onChange={(e) => setFilterNameDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveCurrentFilter(); if (e.key === "Escape") { setSavingFilter(false); setFilterNameDraft(""); } }}
                        style={styles.noteInput}
                      />
                      <span style={styles.iconBtnSmall} onClick={saveCurrentFilter} title="Kaydet">✓</span>
                      <span style={styles.iconBtnSmall} onClick={() => { setSavingFilter(false); setFilterNameDraft(""); }} title="Vazgeç">✕</span>
                    </div>
                  ) : (
                    (search || segment !== "all") && (
                      <div style={styles.chipToggle} onClick={() => setSavingFilter(true)}>
                        ★ Bu filtreyi kaydet
                      </div>
                    )
                  )}

                  <div style={{ flex: 1 }} />

                  {selectedKeys.size > 0 && (
                    <button style={styles.btnGhost} onClick={handleExportSelected}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 15V3M6 9l6 6 6-6" />
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      </svg>
                      Seçilenleri İndir ({selectedKeys.size})
                    </button>
                  )}
                  <button style={styles.btnGhost} onClick={handleExport}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 15V3M6 9l6 6 6-6" />
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    </svg>
                    Excel'e Aktar
                  </button>
                  <button style={styles.btnGhost} onClick={handlePdfExport}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                    PDF'e Aktar
                  </button>
                  <button style={styles.btnPrimary} onClick={handleMail}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M22 2L11 13" />
                      <path d="M22 2l-7 20-4-9-9-4z" />
                    </svg>
                    Mail Gönder
                  </button>
                </div>

                {savedFilters.filter((f) => f.report === activeReport).length > 0 && (
                  <div style={styles.savedFilterBar}>
                    <span style={styles.savedFilterLabel}>Favori filtreler:</span>
                    {savedFilters.filter((f) => f.report === activeReport).map((f) => (
                      <span key={f.id} style={styles.savedFilterChip}>
                        <span onClick={() => { setSearch(f.search); setSegment(f.segment); }}>{f.label}</span>
                        <span style={styles.savedFilterRemove} onClick={() => setSavedFilters((prev) => prev.filter((x) => x.id !== f.id))}>✕</span>
                      </span>
                    ))}
                  </div>
                )}

                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.th, width: 32 }}>
                        <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} style={styles.checkbox} />
                      </th>
                      <th style={styles.th}>{isZimmet ? "Zimmetli Kişi" : "Cihaz Sahibi"}</th>
                      {isZimmet ? (
                        <>
                          <th style={styles.th}>Cihaz (Seri No)</th>
                          <th style={styles.th}>Kullanan Kişi</th>
                        </>
                      ) : (
                        <th style={styles.th}>Seri No / Model</th>
                      )}
                      <th style={styles.th}>{isZimmet ? "Açıklama" : "Lokasyon"}</th>
                      <th style={styles.th}>Durum</th>
                      {isZimmet && <th style={styles.th}>İşlem</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r, i) => {
                      const meta = isZimmet ? rowMeta[r.rowKey] || {} : {};
                      const status = meta.status || "Yeni";
                      const statusColor = STATUS_COLORS[status];
                      return (
                        <tr key={i} style={selectedKeys.has(rowKeyOf(r)) ? styles.rowSelected : undefined}>
                          <td style={styles.td}>
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(rowKeyOf(r))}
                              onChange={() => toggleSelect(rowKeyOf(r))}
                              style={styles.checkbox}
                            />
                          </td>
                          <td style={styles.td}>
                            <div
                              style={{ ...styles.cellName, ...(isZimmet && r.owner !== "—" ? styles.clickableName : {}) }}
                              onClick={isZimmet && r.owner !== "—" ? () => setSelectedPerson(r.owner) : undefined}
                              title={isZimmet && r.owner !== "—" ? `${r.owner} için özet tabloyu aç` : undefined}
                            >
                              {r.owner}
                            </div>
                            {!isZimmet && <div style={styles.cellSub}>{r.sub}</div>}
                          </td>
                          {isZimmet ? (
                            <>
                              <td style={styles.td}>
                                <span style={styles.serial}>{r.serial}</span>
                                <div style={styles.cellSub}>{r.sub}</div>
                              </td>
                              <td style={styles.td}>
                                <span
                                  style={r.userLabel !== "—" && r.userLabel !== "Tespit Edilemedi" ? styles.clickableName : undefined}
                                  onClick={r.userLabel !== "—" && r.userLabel !== "Tespit Edilemedi" ? () => setSelectedPerson(r.userLabel) : undefined}
                                  title={r.userLabel !== "—" && r.userLabel !== "Tespit Edilemedi" ? `${r.userLabel} için özet tabloyu aç` : undefined}
                                >
                                  {r.userLabel}
                                </span>
                              </td>
                            </>
                          ) : (
                            <td style={styles.td}>
                              <span style={styles.serial}>{r.serial}</span>
                              <div style={styles.cellSub}>{r.model}</div>
                            </td>
                          )}
                          <td style={styles.td}>{isZimmet ? r.model : r.location}</td>
                          <td style={styles.td}>
                            {isZimmet ? (
                              <span style={{ ...styles.badge, ...(r.statusTag === "Zimmet Doğru" ? styles.badgeOk : r.statusTag === "Kullanım Kaydı Yok" ? styles.badgeNeutral : styles.badgeBad) }}>
                                <span style={{ ...styles.badgeDot, background: r.statusTag === "Zimmet Doğru" ? pal.ok : r.statusTag === "Kullanım Kaydı Yok" ? pal.inkSoft : pal.bad }} />
                                {r.statusTag}
                              </span>
                            ) : (
                              <span style={{ ...styles.badge, ...(r.matched ? styles.badgeOk : styles.badgeBad) }}>
                                <span style={{ ...styles.badgeDot, background: r.matched ? pal.ok : pal.bad }} />
                                {r.matched ? "Eşleşti" : "Eşleşmedi"}
                              </span>
                            )}
                          </td>
                          {isZimmet && (
                            <td style={styles.td}>
                              {!r.matched && (
                                <div style={styles.opsCell}>
                                  <span
                                    onClick={() => cycleStatus(r.rowKey)}
                                    title="Durumu değiştirmek için tıkla"
                                    style={{ ...styles.statusPill, background: statusColor.bg, color: statusColor.fg }}
                                  >
                                    {status}
                                  </span>
                                  <input
                                    type="text"
                                    placeholder="Not ekle..."
                                    value={meta.note || ""}
                                    onChange={(e) => setNote(r.rowKey, e.target.value)}
                                    style={styles.noteInput}
                                  />
                                  <span
                                    onClick={() => toggleSnooze(r.rowKey)}
                                    title={meta.snoozed ? "Ertelemeyi kaldır" : "Ertele"}
                                    style={{ ...styles.iconBtnSmall, ...(meta.snoozed ? styles.iconBtnSmallActive : {}) }}
                                  >
                                    ⏸
                                  </span>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td style={{ ...styles.td, textAlign: "center", color: pal.inkSoft }} colSpan={isZimmet ? 6 : 5}>
                          Sonuç bulunamadı
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div style={styles.tableFooter}>
                  <span>{rawRows.length} kayıttan {filteredRows.length} tanesi gösteriliyor</span>
                  <span style={{ fontFamily: "monospace" }}>Sahte veri (demo)</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {selectedPerson && (
        <div style={styles.modalOverlay} onClick={() => setSelectedPerson(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <p style={styles.modalTitle}>{selectedPerson}</p>
              <span style={styles.modalClose} onClick={() => setSelectedPerson(null)}>✕</span>
            </div>
            <p style={styles.modalSub}>Bu kişiyle ilgili tüm zimmet kayıtları — hem zimmetli olduğu hem kullandığı cihazlar</p>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Rol</th>
                  <th style={styles.th}>Cihaz (Seri No)</th>
                  <th style={styles.th}>Açıklama</th>
                  <th style={styles.th}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {zimmetRows
                  .filter((r) => r.owner === selectedPerson || r.userLabel === selectedPerson)
                  .map((r, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{r.owner === selectedPerson ? "Zimmetli" : "Kullanıyor"}</td>
                      <td style={styles.td}><span style={styles.serial}>{r.serial}</span></td>
                      <td style={styles.td}>{r.model}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, ...(r.statusTag === "Zimmet Doğru" ? styles.badgeOk : r.statusTag === "Kullanım Kaydı Yok" ? styles.badgeNeutral : styles.badgeBad) }}>
                          <span style={{ ...styles.badgeDot, background: r.statusTag === "Zimmet Doğru" ? pal.ok : r.statusTag === "Kullanım Kaydı Yok" ? pal.inkSoft : pal.bad }} />
                          {r.statusTag}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

const LIGHT_PALETTE = {
  bg: "#F5F5F3",
  bgGradient: "radial-gradient(1200px 600px at 15% -10%, #FBF7F0 0%, transparent 60%)",
  panel: "rgba(255,255,255,0.7)",
  panelSolid: "#FFFFFF",
  line: "rgba(30,30,28,0.08)",
  ink: "#232320",
  inkSoft: "#8A8A85",
  accent: "#C1662F",
  accentGrad: "linear-gradient(135deg, #C1662F, #E29354)",
  accentSoft: "rgba(193,102,47,0.10)",
  accentSoftStrong: "rgba(193,102,47,0.08)",
  ok: "#4C7A5E",
  okBg: "rgba(76,122,94,0.10)",
  bad: "#B84A3E",
  badBg: "rgba(184,74,62,0.09)",
  neutralFg: "#8A8A85",
  neutralBg: "rgba(30,30,28,0.06)",
  neutralDot: "#D2D2CC",
  fieldBg: "rgba(30,30,28,0.045)",
  white: "#FFFFFF",
  overlay: "rgba(20,20,18,0.45)",
  toastBg: "#232320",
  toastFg: "#fff",
  shadow: "0 1px 2px rgba(30,30,28,0.04)",
  modalShadow: "0 24px 60px rgba(0,0,0,0.3)",
  fieldBorder: "1px solid rgba(30,30,28,0.1)",
  scrollbarThumb: "rgba(30,30,28,0.18)",
  warnFg: "#B4780A",
  warnBg: "rgba(180,120,10,0.10)",
};

const DARK_PALETTE = {
  bg: "#1A1A18",
  bgGradient: "radial-gradient(1200px 600px at 15% -10%, rgba(193,102,47,0.08) 0%, transparent 60%)",
  panel: "rgba(40,40,37,0.7)",
  panelSolid: "#2A2A27",
  line: "rgba(255,255,255,0.08)",
  ink: "#F0EFEA",
  inkSoft: "#9B9B93",
  accent: "#E08A4F",
  accentGrad: "linear-gradient(135deg, #E08A4F, #C1662F)",
  accentSoft: "rgba(224,138,79,0.16)",
  accentSoftStrong: "rgba(224,138,79,0.12)",
  ok: "#6FBE8F",
  okBg: "rgba(111,190,143,0.14)",
  bad: "#E27C6F",
  badBg: "rgba(226,124,111,0.14)",
  neutralFg: "#9B9B93",
  neutralBg: "rgba(255,255,255,0.07)",
  neutralDot: "#5A5A55",
  fieldBg: "rgba(255,255,255,0.06)",
  white: "#2A2A27",
  overlay: "rgba(0,0,0,0.6)",
  toastBg: "#F0EFEA",
  toastFg: "#1A1A18",
  shadow: "0 1px 2px rgba(0,0,0,0.2)",
  modalShadow: "0 24px 60px rgba(0,0,0,0.6)",
  fieldBorder: "1px solid rgba(255,255,255,0.12)",
  scrollbarThumb: "rgba(255,255,255,0.18)",
  warnFg: "#E0AC5F",
  warnBg: "rgba(224,172,95,0.14)",
};

function buildStyles(p) {
  return {
    body: {
      minHeight: "100vh",
      background: `${p.bgGradient}, ${p.bg}`,
      fontFamily: "-apple-system, BlinkMacSystemFont, Inter, 'Helvetica Neue', sans-serif",
      color: p.ink,
      padding: "32px",
      position: "relative",
    },
    shell: { maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "232px 1fr", gap: 20 },
    sidebar: { background: p.panel, backdropFilter: "blur(18px)", border: `1px solid ${p.line}`, borderRadius: 16, padding: "20px 14px", height: "fit-content", boxShadow: p.shadow },
    brand: { display: "flex", alignItems: "center", gap: 10, padding: "2px 8px 18px", justifyContent: "space-between" },
    brandLeft: { display: "flex", alignItems: "center", gap: 10 },
    brandMark: { width: 22, height: 22, borderRadius: 6, background: p.accentGrad, flexShrink: 0 },
    brandName: { fontWeight: 600, fontSize: 14.5, letterSpacing: "-0.01em" },
    themeToggle: { display: "flex", alignItems: "center", gap: 3, background: p.fieldBg, borderRadius: 20, padding: 3, cursor: "pointer" },
    themeToggleBtn: { width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 },
    themeToggleBtnActive: { background: p.panelSolid, boxShadow: p.shadow },
    navLabel: { fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: p.inkSoft, padding: "14px 10px 6px" },
    deptList: { display: "flex", flexDirection: "column", gap: 2 },
    deptItem: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13.5, color: p.ink },
    deptItemActive: { background: p.accentSoft, color: p.accent, fontWeight: 600 },
    deptLeft: { display: "flex", alignItems: "center", gap: 9 },
    deptDot: { width: 6, height: 6, borderRadius: "50%", background: p.neutralDot, display: "inline-block" },
    deptDotActive: { background: p.accent },
    deptCount: { fontSize: 11.5, color: p.inkSoft, fontFamily: "monospace" },
    deptCountActive: { color: p.accent },
    main: { display: "flex", flexDirection: "column", gap: 16 },
    panel: { background: p.panel, backdropFilter: "blur(18px)", border: `1px solid ${p.line}`, borderRadius: 16, boxShadow: p.shadow },
    pageTitle: { fontSize: 19, fontWeight: 650, margin: "0 0 3px", letterSpacing: "-0.01em" },
    pageSub: { fontSize: 12.5, color: p.inkSoft, margin: 0 },
    statStrip: { display: "flex", gap: 24, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${p.line}` },
    stat: { display: "flex", flexDirection: "column", gap: 2 },
    statNum: { fontSize: 19, fontWeight: 600, fontFamily: "monospace", letterSpacing: "-0.02em" },
    statLabel: { fontSize: 11, color: p.inkSoft },
    toolbar: { display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", flexWrap: "wrap" },
    searchWrap: { display: "flex", alignItems: "center", gap: 7, background: p.fieldBg, borderRadius: 7, padding: "8px 12px", width: 230 },
    searchInput: { border: "none", background: "transparent", fontSize: 13, width: "100%", fontFamily: "inherit", color: p.ink },
    searchClear: { cursor: "pointer", color: p.inkSoft, fontSize: 11, flexShrink: 0, padding: "2px 3px" },
    segmented: { display: "flex", background: p.fieldBg, borderRadius: 7, padding: 2 },
    seg: { padding: "6px 13px", fontSize: 12.5, borderRadius: 6, color: p.inkSoft, cursor: "pointer" },
    segActive: { background: p.panelSolid, boxShadow: p.shadow, fontWeight: 600, color: p.ink },
    chipToggle: { fontSize: 12, color: p.inkSoft, background: p.fieldBg, padding: "7px 12px", borderRadius: 7, cursor: "pointer" },
    btnGhost: { border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", background: p.fieldBg, color: p.ink },
    btnPrimary: { border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", background: p.accent, color: "#fff" },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { textAlign: "left", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: p.inkSoft, padding: "10px 24px", borderBottom: `1px solid ${p.line}` },
    td: { padding: "12px 24px", borderBottom: `1px solid ${p.line}`, fontSize: 13 },
    cellName: { fontWeight: 600, display: "flex", alignItems: "center", gap: 6 },
    clickableName: { cursor: "pointer", textDecoration: "underline", textDecorationColor: p.accentSoft, textUnderlineOffset: 2 },
    cellSub: { color: p.inkSoft, fontSize: 11.5, marginTop: 1 },
    serial: { fontFamily: "monospace", fontSize: 12, color: p.inkSoft },
    badge: { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 },
    badgeDot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },
    badgeOk: { background: p.okBg, color: p.ok },
    badgeBad: { background: p.badBg, color: p.bad },
    badgeNeutral: { background: p.neutralBg, color: p.inkSoft },
    dupTag: { fontSize: 10, fontWeight: 600, color: p.warnFg, background: p.warnBg, padding: "2px 7px", borderRadius: 10 },
    opsCell: { display: "flex", alignItems: "center", gap: 6 },
    statusPill: { fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap" },
    noteInput: { fontSize: 12, border: p.fieldBorder, borderRadius: 6, padding: "5px 8px", width: 120, fontFamily: "inherit", background: p.white, color: p.ink },
    iconBtnSmall: { width: 26, height: 26, borderRadius: 6, border: p.fieldBorder, background: p.white, color: p.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12, flexShrink: 0 },
    iconBtnSmallActive: { background: p.accent, color: "#fff", borderColor: p.accent },
    tableFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", fontSize: 11.5, color: p.inkSoft, borderTop: `1px solid ${p.line}` },
    checkbox: { width: 15, height: 15, cursor: "pointer", accentColor: p.accent },
    rowSelected: { background: p.accentSoftStrong },
    toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: p.toastBg, color: p.toastFg, padding: "10px 18px", borderRadius: 10, fontSize: 13, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", maxWidth: 420, textAlign: "center" },
    modalOverlay: { position: "fixed", inset: 0, background: p.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 },
    modalCard: { background: p.panelSolid, color: p.ink, borderRadius: 16, padding: "22px 24px", width: "min(680px, 100%)", maxHeight: "80vh", overflowY: "auto", boxShadow: p.modalShadow },
    modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    modalTitle: { fontSize: 17, fontWeight: 650, margin: 0, letterSpacing: "-0.01em" },
    modalClose: { cursor: "pointer", fontSize: 15, color: p.inkSoft, padding: 4 },
    modalSub: { fontSize: 12.5, color: p.inkSoft, margin: "3px 0 16px" },
    dashRowHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 },
    dashDeptName: { fontSize: 14, fontWeight: 600 },
    dashDeptTotal: { fontSize: 11.5, color: p.inkSoft, fontFamily: "monospace" },
    dashBar: { display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: p.fieldBg },
    dashBarSeg: { height: "100%" },
    dashLegendRow: { display: "flex", gap: 16, marginTop: 6 },
    dashLegendItem: { fontSize: 11.5, color: p.inkSoft, display: "flex", alignItems: "center", gap: 5 },
    dashDot: { width: 7, height: 7, borderRadius: "50%", display: "inline-block" },
    settingsSectionTitle: { fontSize: 15, fontWeight: 650, margin: "0 0 3px" },
    scheduleRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" },
    scheduleLabel: { display: "flex", alignItems: "center", gap: 7, fontSize: 13 },
    scheduleSelect: { fontSize: 13, border: p.fieldBorder, borderRadius: 7, padding: "7px 10px", fontFamily: "inherit", background: p.white, color: p.ink },
    filterSaveRow: { display: "flex", alignItems: "center", gap: 6 },
    savedFilterBar: { display: "flex", alignItems: "center", gap: 8, padding: "0 24px 14px", flexWrap: "wrap" },
    savedFilterLabel: { fontSize: 11.5, color: p.inkSoft },
    savedFilterChip: { display: "inline-flex", alignItems: "center", gap: 6, background: p.accentSoftStrong, color: p.accent, padding: "5px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer" },
    savedFilterRemove: { fontSize: 10, color: p.bad, cursor: "pointer" },
  };
}
