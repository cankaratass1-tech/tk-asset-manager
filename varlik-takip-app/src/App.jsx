import { useState, useMemo, useEffect, useRef } from "react";
import companyLogo from "./assets/company-logo.svg";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { DEPARTMENTS, REPORT_TYPES, REPORT_CATEGORIES, NETWORK_ITEMS, REPORTS_WITHOUT_MODEL_FILTER, REPORTS_WITH_REAL_DATA, STATUS_FLOW } from "./data/constants";
import MultiSelectFilter from "./components/MultiSelectFilter";
import Pagination from "./components/Pagination";
import { getZimmetRows, computeOverallZimmetStats, getAllMismatchRows, computeZimmetChains, isZimmetUnverified } from "./services/zimmetService";
import { computeComparisonRows } from "./services/comparisonService";
import { computeInaktifComparisonRows, needsInaktifAction } from "./services/inaktifComparisonService";
import { getReportRows, getDeptAssetCount, USE_MOCK_DATA } from "./services/reportService";
import { fetchInaktifRowsFromFile, mapInaktifRow } from "./services/inaktifFileService";
import { fetchDiskRowsFromFile, mapDiskRow } from "./services/diskFileService";
import { fetchSccmRowsFromFile, mapSccmRow } from "./services/sccmFileService";
import { mapThRows, fetchThRowsFromFile } from "./services/thFileService";
import { mapMonitorRows, fetchMonitorRowsFromFile } from "./services/monitorFileService";
import { fetchLokasyonMailRowsFromFile, mapLokasyonMailRows, resolveMailForLocationName } from "./services/lokasyonMailService";
import { computeLocationIpRows, buildLocationIpMail } from "./services/locationIpService";
import { mailShell, infoTable, dataTable, mailSection, stepsBox, REC_NOTE, MAIL_FOOTER } from "./services/mailLayout";
import MailPreviewModal from "./components/MailPreviewModal";
import { mapBsodRows, fetchBsodRowsFromFile } from "./services/bsodFileService";
import { computeBottlenecks } from "./services/bottleneckService";
import DarbogazScreen from "./components/DarbogazScreen";
import { fetchBantRowsFromFile, uploadBantFile } from "./services/bantGenisligiService";
import { mapBatteryRows, buildBatteryMailHtml, batteryMailSubject, fetchBatteryRowsFromFile, uploadBatteryFile } from "./services/batteryFileService";
import { buildBsodMailHtml, bsodMailSubject, bsodCoverage, lookupBsod } from "./services/bsodKnowledgeService";
import { computeInaktifDashboard, computeDiskDashboard, computeZimmetLocationBreakdown, computeCombinedLocationTrend, classifyDisk, DISK_THRESHOLDS_GB } from "./services/dashboardService";
import { latestPeriodSummary } from "./services/periodComparisonService";
import LocationTrendChart from "./components/LocationTrendChart";
import OverviewPanel from "./components/OverviewPanel";
import ExecutiveSummary from "./components/ExecutiveSummary"; // DEMO: yönetici için tek sayfalık özet
import DashboardV2 from "./components/DashboardV2"; // DEMO (commit edilmedi) — yeni Ana Sayfa tasarımı
import { computeAtilMonitorRows } from "./services/atilMonitorService";
import ManagementKpiPanel from "./components/ManagementKpiPanel";
import { deviceKeyOf, logDeviceAction, persistDeviceMeta } from "./services/deviceActionService";
import { computeUnusedDevices, DEFAULT_STALE_DAYS } from "./services/unusedDeviceService";
import { buildUnusedDeviceMailHtml, unusedDeviceMailSubject } from "./services/unusedDeviceMailService";
import DeviceOverviewCard from "./components/DeviceOverviewCard";
import NewInstallScreen from "./components/NewInstallScreen";
import PendingClosureScreen from "./components/PendingClosureScreen";
import SccmAjanScreen from "./components/SccmAjanScreen";
import ThDepotSccmReportScreen from "./components/ThDepotSccmReportScreen";
import AtilMonitorReportScreen from "./components/AtilMonitorReportScreen";
import BantGenisligiScreen from "./components/BantGenisligiScreen";
import AppFooter from "./components/AppFooter";
import { useStickyTop } from "./hooks/useStickyTop";
import { LIGHT_PALETTE, DARK_PALETTE, AERO_PALETTE, ITSM_PALETTE } from "./theme/palette";
import { buildStyles } from "./theme/buildStyles";
import Donut from "./components/Donut";
import { backendClient, setSettingsAuth, clearSettingsAuth, getMailSuccessCount } from "./services/backendClient";
import { ownerWithTitle } from "./services/ownerName";
import TableView from "./components/recordList/TableView";
import DenseGridView from "./components/recordList/DenseGridView";
import CardDetailView from "./components/recordList/CardDetailView";
import DetailAside from "./components/recordList/DetailAside";
import RecordPopup from "./components/recordList/RecordPopup";

const pageSizeOptions = [25, 50, 100, Infinity];

// Excel'deki "Sahibi Firma" ham değerleri uzun/resmi olduğu için sidebar'da kısa etiket
// gösteriliyor (bkz. konuşma) — eşleştirme/filtreleme hâlâ ham değer üzerinden çalışır, sadece
// görünen metin değişir. Eşlemesi bilinmeyen bir şirket gelirse ham adıyla gösterilir.
const COMPANY_SHORT_LABELS = {
  "TKAO-MHY A.O.": "TKAO",
  "TKAJ-AJET A.Ş.": "AJET",
};
function companyShortLabel(raw) {
  return COMPANY_SHORT_LABELS[raw] || raw;
}

// "PDF'e Aktar" artık window.print() ile tarayıcının yazdırma penceresini açıp kullanıcıya
// "PDF olarak kaydet"i elle seçtirmiyor — jsPDF ile doğrudan indirilebilir bir .pdf dosyası
// üretiyor (bkz. konuşma: "otomatik kaydedilebilir mi"). jsPDF'in yerleşik fontları (Helvetica
// vb.) Türkçe karaktersiz WinAnsi kodlamasını kullanır (ş/ğ/ı/İ/ç/ö/ü YOK) — bu yüzden açık
// kaynaklı (Apache 2.0) Roboto fontu public/fonts altına gömülüp jsPDF'e yükleniyor. Font dosyası
// ~150KB olduğu için ana JS paketine gömülmüyor, sadece PDF'e Aktar'a tıklanınca bir kez
// indirilip taban64'e çevriliyor ve bellekte cache'leniyor (tekrar tekrar indirilmesin diye).
let robotoFontBase64Cache = null;
async function loadRobotoFontBase64() {
  if (robotoFontBase64Cache) return robotoFontBase64Cache;
  const res = await fetch("/fonts/Roboto-Regular.ttf");
  if (!res.ok) throw new Error("Font dosyası yüklenemedi (/fonts/Roboto-Regular.ttf)");
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000; // tek seferde String.fromCharCode.apply'e çok büyük dizi vermemek için parça parça
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  robotoFontBase64Cache = btoa(binary);
  return robotoFontBase64Cache;
}

// Excel'den kopyalanan iki sütunu (lokasyon, mail) satır satır ayrıştırır — tab/virgül/noktalı virgül/çoklu boşluk destekler
function parseMailGroupsText(text) {
  const map = {};
  text.split("\n").forEach((line) => {
    const parts = line.split(/\t|,|;|\s{2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return;
    const [location, email] = parts;
    if (location && email && email.includes("@")) map[location] = email;
  });
  return map;
}

// Aktif ekran (Dashboard / rapor / Gönderim Geçmişi / Ayarlar / Network görünümü) sayfa
// yenilenince kaybolmasın diye localStorage'a yazılır (bkz. konuşma: "refresh yapınca anasayfaya
// gidiyor, bütün sayfalar için düzelt"). Router eklemeden en basit/güvenli çözüm — mevcut
// state-tabanlı navigasyon deseniyle tutarlı.
const NAV_STORAGE_KEY = "varlikTakip.lastView";
function loadNavState() {
  try {
    const raw = localStorage.getItem(NAV_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function App({ user, onLogout } = {}) {
  // "aero" — kullanıcının verdiği havacılık/glassmorphism mockup'ından türetilen, seçilebilir
  // üçüncü tema (bkz. konuşma — ışık/koyu'nun yerine değil, ek olarak). PALETTES ile 3'lü toggle
  // (☀︎/☾/✈) arasında döngü kurulabiliyor.
  // Tema seçimi de aktif ekran gibi localStorage'a yazılır — sayfa yenilenince "açık"a
  // dönmesin (bkz. konuşma: "temayı da kalıcı yap").
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("varlikTakip.theme") || "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("varlikTakip.theme", theme);
      document.documentElement.dataset.theme = theme;
    } catch {
      // localStorage kullanılamıyorsa sessizce geç — madde 14
    }
  }, [theme]);
  // Sol menü ve detay paneli ekrandan uzun olabilir: sabit top yerine useStickyTop (bkz. hooks/useStickyTop.js)
  const [sidebarRef, sidebarTop] = useStickyTop(16);
  const [detailRef, detailTop] = useStickyTop(20);
  const PALETTES = { light: LIGHT_PALETTE, dark: DARK_PALETTE, aero: AERO_PALETTE, itsm: ITSM_PALETTE };
  const pal = PALETTES[theme] || LIGHT_PALETTE;
  const styles = useMemo(() => buildStyles(pal), [theme]);
  const [activeDept, setActiveDept] = useState("d1");
  const [activeReport, setActiveReport] = useState(() => loadNavState().activeReport || "inaktif");
  // Sol menüde Rapor Türü kategorileri (Genel Raporlar / LAKESIDE) ve Network menüsü
  // açılır/kapanır (gereksinim #1, #2) — varsayılan hepsi açık
  const [expandedReportCategories, setExpandedReportCategories] = useState(() => new Set(REPORT_CATEGORIES.map((c) => c.id)));
  const [networkExpanded, setNetworkExpanded] = useState(true);
  // Network raporları (Down Ofisler, Ofis Bant Genişliği) henüz veri kaynağı olmadığı için
  // (gereksinim #1, bkz. plan) activeReport ile aynı koda hiç girmiyor — ayrı bir state (F bloğu
  // deseni). Bu sayede REPORT_TYPES'a dayanan mevcut rapor kodu (export/mail/başlık) bozulmaz.
  const [activeNetworkView, setActiveNetworkView] = useState(() => loadNavState().activeNetworkView || null);
  const toggleReportCategory = (id) =>
    setExpandedReportCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("all"); // all | matched | unmatched
  const [toast, setToast] = useState(null);
  const [showHistory, setShowHistory] = useState(() => loadNavState().showHistory || false);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [showNotedOnly, setShowNotedOnly] = useState(false);
  const [rowMeta, setRowMeta] = useState({}); // key -> { status, note, snoozed }
  const [mailHistory, setMailHistory] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [selectedPerson, setSelectedPerson] = useState(null);
  // Tablodaki bir isme tıklayınca artık ayrı bir popup değil, o satırın hemen altına açılan
  // sıralı bir liste gösteriliyor (bkz. konuşma) — hangi satırın altında açık olduğunu (rowKey)
  // ve hangi kişi için açıldığını birlikte tutuyoruz
  const [expandedPerson, setExpandedPerson] = useState(null); // { rowKey, person } | null
  const togglePersonExpand = (rowKey, person) => {
    setExpandedPerson((prev) => (prev && prev.rowKey === rowKey && prev.person === person ? null : { rowKey, person }));
  };
  const [showDashboard, setShowDashboard] = useState(() => loadNavState().showDashboard ?? true); // IT Ops Dashboard artık ana sayfa
  const [dashboardCompanyFilter, setDashboardCompanyFilter] = useState("all");
  const [dashboardDiskFilter, setDashboardDiskFilter] = useState("critical"); // critical | warning | normal
  // Faz 2 — Yönetim KPI paneli (dönemsel çözüm istatistikleri, madde 2/13)
  const [reportSnapshots, setReportSnapshots] = useState({}); // { [reportId]: [snapshot, ...] }
  const [mgmtReport, setMgmtReport] = useState("inaktif"); // inaktif | zimmet | disk
  const [mgmtPeriod, setMgmtPeriod] = useState("month"); // month | week | raw
  const [overviewPeriod, setOverviewPeriod] = useState("month"); // "Genel Durum" paneli dönemi
  // Rapor durumu mini özeti (Dashboard kartları + her rapor sayfasının üst kısmı) — bkz. konuşma:
  // "haftalık/aylık filtrelenebilecek şekilde... bütün raporlarda gözükmeli". Tek bir paylaşılan
  // state: nerede gösterilirse gösterilsin AYNI dönem seçimini kullanır (senkronizasyon).
  const [summaryPeriod, setSummaryPeriod] = useState("week"); // week | month
  // Ana Sayfa: YENİ görünüm varsayılan (tercih hiç yazılmamışsa); kullanıcı "Eski görünüme dön" ile klasiğe geçince "0" saklanır (yerel tercih, tarayıcıda kalıcı).
  const [dashboardDemo, setDashboardDemo] = useState(() => { try { return localStorage.getItem("varlikTakip.dashboardDemo") !== "0"; } catch { return true; } });
  const [atilStage, setAtilStage] = useState(null); // DEMO: Atıl Monitörler ekranı hangi aşamayla açılsın (null = varsayılan)
  const [execView, setExecView] = useState(() => { try { return localStorage.getItem("varlikTakip.execView") === "1"; } catch { return false; } }); // DEMO: Yönetici Özeti
  const toggleExecView = (v) => { setExecView(v); try { localStorage.setItem("varlikTakip.execView", v ? "1" : "0"); } catch { /* sessiz geç */ } };
  const toggleDashboardDemo = (v) => { setDashboardDemo(v); try { localStorage.setItem("varlikTakip.dashboardDemo", v ? "1" : "0"); } catch { /* sessiz geç */ } };
  const [summaryDetail, setSummaryDetail] = useState(null); // null | "cozulen" | "yeniTespit" | "devamEden" — rozete tıklanınca açılan cihaz listesi
  useEffect(() => { setSummaryDetail(null); }, [activeReport]);

  // Üst seviyede tanımlı — hem Dashboard'un KPI kartları hem her rapor sayfasının üst kısmı
  // (activeReport === X iken render edilen generic başlık bloğu) aynı fonksiyonları çağırır,
  // ikisi de reportSnapshots + summaryPeriod state'ini paylaşır (bkz. konuşma: "bütün raporlarda
  // gözükmeli" + "haftalık/aylık filtrelenebilecek").
  const summaryFor = (reportId) => latestPeriodSummary(reportSnapshots[reportId], summaryPeriod);
  // "extra" — SharePoint yükleme butonu gibi sağ tarafa eklenecek ek öğe (bkz. konuşma: sol okla
  // işaretlenen buton sağdaki okun gösterdiği yere, Haftalık/Aylık seçicinin yanına taşınsın).
  // Özet (çözülen/yeni/bekleyen) yoksa bile "extra" varsa satır yine render edilir.
  const reportPageSummary = (reportId, extra) => {
    const s = summaryFor(reportId);
    if (!s && !extra) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flex: "0 0 auto" }}>
        {s && (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {[
                ["cozulen", "çözülen", s.cozulen, styles.badgeOk, "Önceki dönemde sorunluydu, bu dönem listede yok"],
                ["yeniTespit", "yeni", s.yeniTespit, { background: `${pal.bad}1e`, color: pal.bad }, "Önceki dönemde yoktu, bu dönem sorunlu listede"],
                ["devamEden", "bekleyen", s.devamEden, styles.badgeNeutral, "Önceki dönemde de sorunluydu, hâlâ sorunlu"],
              ].map(([k, label, n, tone, tip]) => (
                <span
                  key={k}
                  onClick={() => setSummaryDetail((cur) => (cur === k ? null : k))}
                  title={`${tip} — cihaz listesi için tıklayın`}
                  style={{ ...styles.badge, ...tone, padding: "7px 14px", borderRadius: 10, fontSize: 13, gap: 6, cursor: "pointer", userSelect: "none", outline: summaryDetail === k ? `2px solid ${pal.accent}` : "none" }}
                >
                  <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{n}</span> {label}
                </span>
              ))}
              <span
                style={{ ...styles.badge, padding: "7px 14px", borderRadius: 10, fontSize: 13, gap: 6, background: pal.accentSoft, color: pal.accent }}
                title="Çözüm oranı = çözülen ÷ (çözülen + bekleyen): önceki dönemdeki sorunlu cihazların yüzde kaçı listeden çıktı"
              >
                <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>%{s.cozumOrani}</span> çözüm oranı
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
              <span style={{ fontSize: 12, color: pal.inkSoft }}>{s.prevLabel} → {s.periodLabel}</span>
              {summaryPeriodToggle}
            </div>
          </>
        )}
        {extra}
      </div>
    );
  };
  // Haftalık/Aylık seçici — her yerde aynı ortak state'i (summaryPeriod) değiştirir, tüm rapor
  // sayfaları ve Dashboard AYNI dönemi gösterir (senkronizasyon).
  const summaryPeriodToggle = (
    <div style={{ display: "inline-flex", border: `1px solid ${pal.line}`, borderRadius: 8, overflow: "hidden" }}>
      {[["week", "Haftalık"], ["month", "Aylık"]].map(([v, l]) => (
        <span
          key={v}
          onClick={() => setSummaryPeriod(v)}
          style={{
            padding: "5px 12px",
            fontSize: 12,
            cursor: "pointer",
            background: summaryPeriod === v ? pal.accentSoft || pal.line : "transparent",
            color: summaryPeriod === v ? pal.accent || pal.ink : pal.inkSoft,
            fontWeight: summaryPeriod === v ? 700 : 400,
          }}
        >
          {l}
        </span>
      ))}
    </div>
  );
  const [mgmtLbsFilter, setMgmtLbsFilter] = useState([]); // üst lokasyon çoklu seçim
  const [showSettings, setShowSettings] = useState(() => loadNavState().showSettings || false);
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  // Ayarlar alt sekmeleri (kullanıcı isteği): Lokasyon Mailleri / SMTP / Veri Input
  const [settingsTab, setSettingsTab] = useState("lokasyon"); // lokasyon | smtp | veri

  useEffect(() => {
    if (settingsTab === "veri" && !scheduleLoaded) loadAnomalySchedule();
    if (settingsTab === "veri" && !bantLoaded) loadRealBantData({ silent: true });
    if (settingsTab === "veri" && !batteryLoaded) loadRealBatteryData({ silent: true });
    if (settingsTab === "veri" && !ustYonetimLoaded) loadUstYonetimList();
    // Gizli/Gelişmiş Raporlar: TuruncuHat + SCCM birlikte gerekir.
    if (settingsTab === "gelismis") {
      loadRealThData({ silent: true });
      loadRealSccmData({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsTab]);

  // Aktif ekranı localStorage'a yaz — sayfa yenilenince aynı ekranda kalınsın (bkz. konuşma).
  // settingsUnlocked KASITLI olarak dahil değil: Ayarlar'a dönülse bile admin girişi (Ayarlar —
  // Giriş) tekrar istenir, güvenlik atlanmaz.
  useEffect(() => {
    try {
      localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify({ showDashboard, showHistory, showSettings, activeNetworkView, activeReport }));
    } catch {
      // localStorage kullanılamıyorsa (gizli sekme, kota dolu vb.) sessizce geç — madde 14
    }
  }, [showDashboard, showHistory, showSettings, activeNetworkView, activeReport]);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [savedFilters, setSavedFilters] = useState([]); // { id, label, search, segment, report }
  const [savingFilter, setSavingFilter] = useState(false);
  const [filterNameDraft, setFilterNameDraft] = useState("");
  const [notifPrefs, setNotifPrefs] = useState({
    d1: { inaktif: true, disk: true, zimmet: true },
    d2: { inaktif: true, disk: true, zimmet: true },
    d3: { inaktif: true, disk: true, zimmet: true },
  });
  const [scheduleConfig, setScheduleConfig] = useState({ enabled: false, cadence: "weekly", day: "Pazartesi", time: "09:00", recipients: "" });
  // Üst Yönetim İstisna Listesi (bkz. konuşma: "excelden o verileri çekme hiç") — admin'in elle
  // yönettiği, Kapatma Onayı vb. mail akışlarının asla göndermeyeceği e-posta listesi.
  const [ustYonetimText, setUstYonetimText] = useState("");
  const [ustYonetimLoaded, setUstYonetimLoaded] = useState(false);
  const [savingUstYonetim, setSavingUstYonetim] = useState(false);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [runningScanNow, setRunningScanNow] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState(null); // { lastRunAt, knownCount }
  const [smtpConfig, setSmtpConfig] = useState({ host: "", port: "587", username: "", password: "", fromAddress: "", useTls: true });
  const [dataSourceConfig, setDataSourceConfig] = useState({ url: "", authMethod: "windows", apiKey: "", username: "", password: "", domain: "", workstation: "" });
  const [testingConnection, setTestingConnection] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [savedSecretHints, setSavedSecretHints] = useState({ smtpPassword: false, dsPassword: false, dsApiKey: false });
  const [testMailTo, setTestMailTo] = useState("");
  const [sendingTestMail, setSendingTestMail] = useState(false);
  const [backendReachable, setBackendReachable] = useState(null); // null: bilinmiyor henüz
  const layoutMode = "classic"; // Görünüm seçici kaldırıldı — Klasik sabit varsayılan (bkz. konuşma)
  const [detailRowKey, setDetailRowKey] = useState(null); // detail modda seçili kayıt
  const [historyPopupRow, setHistoryPopupRow] = useState(null);
  // Tür/Lokasyon/Üst Lokasyon filtreleri artık Model filtresiyle aynı desende — çoklu seçim,
  // arama kutulu (kullanıcı isteği). Boş dizi = "Tümü" (eskiden "all" string'i ile ifade ediliyordu).
  const [typeFilter, setTypeFilter] = useState([]); // cihaz türü/birim filtresi
  const [locationFilter, setLocationFilter] = useState([]);
  // Model filtresi (gereksinim #3) — tüm rapor ekranlarında standart, çoklu seçim
  const [modelFilter, setModelFilter] = useState([]);
  const [windowsFilter, setWindowsFilter] = useState([]); // Windows sürümü filtresi (Zimmet Uyuşmazlığı)
  // Durum filtresi (bkz. konuşma: "Model Tümünün yanına Durum filtresi ekle") — Model'in yanına,
  // r.statusTag üzerinden çoklu seçim.
  const [statusFilter, setStatusFilter] = useState([]);
  const [lbsParentFilter, setLbsParentFilter] = useState([]); // İnaktif gerçek veride LBS Location Parent'a göre üst filtre
  const [activeCompany, setActiveCompany] = useState("all"); // İnaktif gerçek veride "Sahibi Firma" bazlı bölüm seçimi — "all" = tüm şirketler
  // Sayfalama (kullanıcı isteği): tüm raporlarda standart, varsayılan 25, sayfa numaralarıyla gezilebilir
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [mailGroupsText, setMailGroupsText] = useState(""); // yapıştırılan "Lokasyon<TAB>mail" satırları — İnaktif Cihazlar e-posta dağıtımı
  const [savingMailGroups, setSavingMailGroups] = useState(false);
  const [fileSourceConfig, setFileSourceConfig] = useState({ folderPath: "" });
  const [testingFileSource, setTestingFileSource] = useState(false);
  const [fileSourceTestResult, setFileSourceTestResult] = useState(null);
  // Madde 7 — "Kullanılmayan Cihazlar" raporu: "son giriş çok eski" eşiği (gün) ve ileride
  // bağlanacak LakeSide batarya dosya kaynağı. Backend'de appConfig section'ında saklanır.
  const [appConfig, setAppConfig] = useState({ unusedStaleDays: DEFAULT_STALE_DAYS });
  const [savingAppConfig, setSavingAppConfig] = useState(false);
  const staleDays = Number(appConfig.unusedStaleDays) > 0 ? Number(appConfig.unusedStaleDays) : DEFAULT_STALE_DAYS;
  // Tek dosyada tüm şirketler/departmanlar bulunuyor (Sahibi Firma sütunu ile ayrışıyor),
  // bu yüzden departman bazında değil tek seferde, düz bir dizi olarak tutuluyor
  const [realInaktifAll, setRealInaktifAll] = useState([]);
  const [realInaktifMeta, setRealInaktifMeta] = useState(null); // { fileName, modifiedAt }
  const [loadingRealInaktif, setLoadingRealInaktif] = useState(false);
  const [realDiskAll, setRealDiskAll] = useState([]);
  const [realDiskMeta, setRealDiskMeta] = useState(null);
  const [loadingRealDisk, setLoadingRealDisk] = useState(false);
  // Zimmet Uyuşmazlığı artık gerçek SCCM envanter export'undan besleniyor (bkz. konuşma) —
  // İnaktif Cihazlar/Disk Alanı gibi tek seferde düz bir dizi, departman ayrımı yok
  const [realSccmAll, setRealSccmAll] = useState([]);
  const [realSccmMeta, setRealSccmMeta] = useState(null);
  const [loadingRealSccm, setLoadingRealSccm] = useState(false);
  // Lokasyon Mail Listesi — tüm lokasyon maillerinin TEK kaynağı (bkz. konuşma) + Lokasyon
  // Hostname/IP Uyuşmazlığı raporunun temel verisi.
  const [realLokasyonMailAll, setRealLokasyonMailAll] = useState([]);
  const [realLokasyonMailMeta, setRealLokasyonMailMeta] = useState(null);
  const [loadingRealLokasyonMail, setLoadingRealLokasyonMail] = useState(false);
  // TuruncuHat/Monitor Raporu artık İnaktif/Disk/SCCM ile aynı şekilde backend'in senkron
  // klasöründen otomatik yükleniyor (bkz. konuşma: "diğerleri gibi görünmüyor" — önceden sadece
  // tarayıcıda manuel dosya seçimiyle geliyordu, sayfa yenilenince kayboluyordu).
  const [realThAll, setRealThAll] = useState([]);
  const [realThMeta, setRealThMeta] = useState(null);
  const [loadingRealTh, setLoadingRealTh] = useState(false);
  const [realMonitorAll, setRealMonitorAll] = useState([]);
  const [realMonitorMeta, setRealMonitorMeta] = useState(null);
  const [loadingRealMonitor, setLoadingRealMonitor] = useState(false);
  // LAKESIDE "Weekly_BSOD" raporu — sadece elle dosya seçimi (bkz. bsodFileService.js)
  const [realBsodAll, setRealBsodAll] = useState([]);
  const [realBsodMeta, setRealBsodMeta] = useState(null);
  // Ofis Bant Genişliği — monitoring aracının CSV export'u, elle yükleniyor (bkz. konuşma).
  const [realBantAll, setRealBantAll] = useState([]);
  const [realBantMeta, setRealBantMeta] = useState(null);
  const [bantSearch, setBantSearch] = useState("");
  const [bantStatusFilter, setBantStatusFilter] = useState("all"); // all | warning | ok
  const [loadingBant, setLoadingBant] = useState(false);
  const [bantLoaded, setBantLoaded] = useState(false);
  const [bsodMailTo, setBsodMailTo] = useState("");
  // LAKESIDE "Battery Health" — artık backend'de kalıcı saklanıyor (bkz. konuşma: "gömülü olsun
  // her seferinde yüklemeyelim"), Ofis Bant Genişliği ile aynı desen.
  const [realBatteryAll, setRealBatteryAll] = useState([]);
  const [realBatteryMeta, setRealBatteryMeta] = useState(null);
  const [loadingBattery, setLoadingBattery] = useState(false);
  const [batteryLoaded, setBatteryLoaded] = useState(false);

  // Madde 1 — "Son Veri Güncelleme" artık global footer'da. Tüm gerçek veri dosyalarının
  // modifiedAt'lerinin en yenisi.
  const lastUpdated = useMemo(() => {
    const raw = [realInaktifMeta, realDiskMeta, realSccmMeta, realThMeta, realMonitorMeta]
      .map((m) => m?.modifiedAt)
      .filter(Boolean)
      .sort()
      .pop();
    return raw ? new Date(raw).toLocaleString("tr-TR") : "";
  }, [realInaktifMeta, realDiskMeta, realSccmMeta, realThMeta, realMonitorMeta]);
  const [historyStatusFilter, setHistoryStatusFilter] = useState("all");
  const [historyDeptFilter, setHistoryDeptFilter] = useState("all");
  const [historyReportFilter, setHistoryReportFilter] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  // Gereksinim #11: gönderen kullanıcı + tarih aralığı filtresi de eklendi
  const [historySenderFilter, setHistorySenderFilter] = useState("all");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  // Gereksinim #12/#15: satır içi genişleme yerine sağda ayrı bir detay paneli
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [selectedHistoryDetails, setSelectedHistoryDetails] = useState(null);
  const [loadingHistoryDetails, setLoadingHistoryDetails] = useState(false);
  // Gereksinim #5/#15: mail gönderimden önce seçilen kişi sayısı gösterilip onay istenir
  const [confirmMailOpen, setConfirmMailOpen] = useState(false);
  // Kullanıcının kendi şifresini değiştirmesi (sidebar'daki kullanıcı adına tıklayınca açılır)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState("");
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState("");
  const [changePasswordError, setChangePasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const closeChangePassword = () => {
    setChangePasswordOpen(false);
    setCurrentPasswordDraft("");
    setNewPasswordDraft("");
    setConfirmPasswordDraft("");
    setChangePasswordError("");
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setChangePasswordError("");
    if (newPasswordDraft.length < 8) return setChangePasswordError("Yeni şifre en az 8 karakter olmalı");
    if (newPasswordDraft !== confirmPasswordDraft) return setChangePasswordError("Yeni şifreler eşleşmiyor");
    setChangingPassword(true);
    try {
      await backendClient.changePassword({ currentPassword: currentPasswordDraft, newPassword: newPasswordDraft });
      showToast("✅ Şifreniz güncellendi");
      closeChangePassword();
    } catch (err) {
      setChangePasswordError(err.message || "Şifre değiştirilemedi");
    } finally {
      setChangingPassword(false);
    }
  };

  useEffect(() => {
    setDetailRowKey(null);
  }, [activeDept, activeReport, segment, search]);

  const toggleDetailRow = (key) => setDetailRowKey((prev) => (prev === key ? null : key));

  useEffect(() => {
    setTypeFilter([]);
    setLocationFilter([]);
    setModelFilter([]); setWindowsFilter([]);
    setCurrentPage(1);
  }, [activeDept, activeReport]);

  // Ayarlar artık korumalı olduğu için (bkz. konuşma), sayfa açılışında herkese açık kalan
  // verileri (sağlık kontrolü + gönderim geçmişi) burada, Ayarlar'a özel olanları ise ayrı bir
  // effect'te (sadece giriş yapıldıktan sonra) çekiyoruz — aksi halde tek bir Promise.all içinde
  // 401 alan istek diğer başarılı isteklerin de state'e yansımasını engelliyordu
  useEffect(() => {
    (async () => {
      try {
        const history = await backendClient.getMailHistory();
        setBackendReachable(true);
        if (Array.isArray(history) && history.length > 0) {
          setMailHistory(history);
        }
      } catch {
        setBackendReachable(false);
      }
    })();
    // Lokasyon-mail eşleşmeleri artık admin girişi gerektirmeden yükleniyor (bkz. konuşma:
    // "mail gönder dediğimizde herkesin göndermesi gerekiyor") — Ayarlar'a hiç girmemiş bir
    // kullanıcı bile İnaktif Cihazlar'da "Mail Gönder"e bastığında lokasyon eşleşmesi bulunsun.
    (async () => {
      try {
        const groups = await backendClient.getMailGroupsForSending();
        if (groups && Object.keys(groups).length > 0) {
          setMailGroupsText(Object.entries(groups).map(([location, email]) => `${location}\t${email}`).join("\n"));
        }
      } catch {
        // Sessizce yutulur — oturum henüz açılmamışsa (AuthGate) zaten bu istek 401 dönecek,
        // login sonrası normal akışla (ör. Ayarlar'ı açma) tekrar denenebilir.
      }
    })();
    // Cihaz not/durum/ertele bilgisi backend'den hydrate edilir (madde 5) — anahtar deviceKeyOf.
    (async () => {
      try {
        const meta = await backendClient.getDeviceMeta();
        if (meta && typeof meta === "object") setRowMeta(meta);
      } catch {
        // oturum yoksa sessiz geç
      }
    })();
    // Faz 2 — dönemsel snapshot geçmişi.
    (async () => {
      try {
        const snaps = await backendClient.getSnapshots();
        if (snaps && typeof snaps === "object") setReportSnapshots(snaps);
      } catch {
        // sessiz geç
      }
    })();
    // Madde 7 — Kullanılmayan Cihazlar "son giriş çok eski" eşiği.
    (async () => {
      try {
        const cfg = await backendClient.getAppConfig();
        if (cfg && typeof cfg === "object") {
          setAppConfig({ unusedStaleDays: Number(cfg.unusedStaleDays) > 0 ? Number(cfg.unusedStaleDays) : DEFAULT_STALE_DAYS });
        }
      } catch {
        // sessiz geç
      }
    })();
  }, []);

  // Faz 2 — gerçek veri yüklendikçe o rapor için hafif bir "problemli cihazlar" snapshot'ı yaz.
  // Backend aynı kaynak dosya (modifiedAt) için mükerrer yazmaz. Zimmet gibi bileşik
  // hesaplamalar (SCCM+TH+Monitor arka arkaya yüklenir) TAM oturmadan post edilmesin diye
  // rapor başına 2 sn debounce edilir — aksi halde yarım hesaplanmış bir küme snapshot'a donar.
  const snapshotTimers = useRef({});
  const postSnapshot = (reportId, sourceMeta, problemRows) => {
    if (!sourceMeta?.modifiedAt || !problemRows) return;
    clearTimeout(snapshotTimers.current[reportId]);
    snapshotTimers.current[reportId] = setTimeout(() => doPostSnapshot(reportId, sourceMeta, problemRows), 2000);
  };
  const doPostSnapshot = (reportId, sourceMeta, problemRows) => {
    const currDevices = problemRows.map((r) => ({
      key: deviceKeyOf(r),
      hostname: r.hostname || "",
      serial: r.serial || "",
      // Disk Alanı'nda `location` alanı disk BOYUTUNU ("462.0 GB") taşır, gerçek bir lokasyon değildir — snapshot'a yazılmaz
      location: reportId === "disk" ? "" : (r.location && r.location !== "—" ? r.location : r.office) || "",
      lbsParent: r.lbsParent || "",
      company: r.company || "",
      // Zimmet devri tespiti için (Cihaz Aksiyon Geçmişi): disk satırlarında owner hostname olduğu için yazılmaz
      owner: reportId === "disk" ? "" : r.ownerFull || r.owner || "",
    }));
    backendClient
      .postSnapshot({ reportId, capturedAt: new Date().toISOString(), sourceFileModifiedAt: sourceMeta.modifiedAt, devices: currDevices })
      .then((res) => {
        if (!res || !res.ok || res.skipped) return;
        // Snapshot listesini güncel tut ki yönetim paneli anında yeni dönemi görsün.
        backendClient.getSnapshots().then((s) => s && setReportSnapshots(s)).catch(() => {});
        // NOT: Rapordan çıkan cihazlar için "Rapordan Çıktı" aksiyon-geçmişi kaydı kaldırıldı
        // (bkz. konuşma) — her yenilemede aynı cihaz için art arda gürültülü/neredeyse mükerrer
        // kayıtlar üretiyordu ve Cihaz Aksiyon Geçmişi'nde anlamlı bir sinyal taşımıyordu.
        // Dönemsel Devam Eden/Çözülen/Yeni istatistikleri hâlâ prevSnap karşılaştırmasından
        // (raporların kendi ekranlarında) hesaplanıyor — bu sadece device-action logunu kesiyor.
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!settingsUnlocked) return;
    (async () => {
      try {
        const [ds, smtp, groups, fileSource] = await Promise.all([
          backendClient.getDataSourceConfig(),
          backendClient.getSmtpConfig(),
          backendClient.getMailGroups(),
          backendClient.getFileSourceConfig(),
        ]);
        setBackendReachable(true);
        if (ds) {
          setDataSourceConfig((prev) => ({ ...prev, url: ds.url, authMethod: ds.authMethod, username: ds.username, domain: ds.domain, workstation: ds.workstation }));
          setSavedSecretHints((prev) => ({ ...prev, dsPassword: ds.hasPassword, dsApiKey: ds.hasApiKey }));
        }
        if (smtp) {
          setSmtpConfig((prev) => ({ ...prev, host: smtp.host, port: smtp.port, username: smtp.username, fromAddress: smtp.fromAddress, useTls: smtp.useTls }));
          setSavedSecretHints((prev) => ({ ...prev, smtpPassword: smtp.hasPassword }));
        }
        if (groups && Object.keys(groups).length > 0) {
          setMailGroupsText(Object.entries(groups).map(([location, email]) => `${location}\t${email}`).join("\n"));
        }
        if (fileSource?.folderPath) {
          setFileSourceConfig({ folderPath: fileSource.folderPath });
        }
      } catch {
        setBackendReachable(false);
      }
    })();
  }, [settingsUnlocked]);

  const isZimmet = activeReport === "zimmet";
  const isLokasyonIp = activeReport === "lokasyon-ip";
  // Bir kişinin ismine tıklayınca satırın altına diğer kayıtlarının açılması Zimmet'te zaten
  // vardı; İnaktif Cihazlar'da da aynı kişiye ait başka inaktif cihazlar varsa aynı şekilde
  // görülebilsin diye açıldı (bkz. konuşma) — Disk Alanı'nda "owner" bir kişi değil hostname
  // olduğu için bu özellik anlamsız, kapsam dışı bırakıldı.
  const canExpandPerson = isZimmet || activeReport === "inaktif";
  // Kullanıcı isteği: "admin dışında kimse manuel dosya yüklemesi yapamasın" — Ayarlar zaten
  // sadece master role'e açık (bkz. "Yetkiniz Bulunmamaktadır" ekranı); ama BSOD/Battery
  // Health/Ofis Bant Genişliği rapor sayfalarının KENDİ üzerinde de (Ayarlar dışında) birer
  // yükleme butonu vardı, herkese açıktı — bu bayrak o butonları gizlemek için kullanılıyor.
  const isMaster = user?.role === "master";
  // İnaktif Cihazlar ve Zimmet Uyuşmazlığı'nda SCCM ile karşılaştırma yapıldığı için, gerçek
  // Hostname bilgisini de ayrı bir sütunda göstermek istendi (bkz. konuşma) — Disk Alanı'nda
  // "owner" zaten hostname olduğundan burada tekrar göstermeye gerek yok.
  const showHostname = isZimmet || isLokasyonIp || activeReport === "inaktif" || activeReport === "kullanilmayan";
  // Madde 6 — Last Logon sütunu: SCCM türevli veri taşıyan raporlarda (zimmet, inaktif). Değer
  // yoksa "Veri Yok" gösterilir, hata olmaz.
  const showLastLogon = isZimmet || activeReport === "inaktif" || activeReport === "kullanilmayan";
  const isUnused = activeReport === "kullanilmayan";
  const isBsod = activeReport === "bsod";
  const isBattery = activeReport === "battery-health";

  // İnaktif Cihazlar ve Disk Alanı'nda gerçek dosya yüklendiyse departmanlar Excel'deki
  // "Sahibi Firma" sütunundan türetiliyor — sabit Departman 1/2/3 değil (bkz. konuşma). Sol
  // menüdeki Şirketler listesi, gerçek veri bir kez yüklendikten sonra hangi rapor sekmesinde
  // olursanız olun aynı kalır (hasRealCompanies) — veriyi filtrelemek içinse (rawRows) sadece
  // ilgili rapor sekmesindeyken devreye giren usingRealInaktif/usingRealDisk kullanılır.
  const hasRealCompanies = realInaktifAll.length > 0 || realDiskAll.length > 0 || realThAll.length > 0;
  const usingRealInaktif = activeReport === "inaktif" && realInaktifAll.length > 0;
  const usingRealDisk = activeReport === "disk" && realDiskAll.length > 0;
  const usingRealUnused = isUnused && realThAll.length > 0;
  const usingRealFileData = usingRealInaktif || usingRealDisk;

  // Madde 7 — "Kullanılmayan Cihazlar": TH'de OBS zimmetli ama SCCM'de yok / son giriş çok eski.
  // TH gerekir; SCCM yoksa hepsi "SCCM'de Yok" olarak listelenir (bilgi değeri var).
  const unusedDeviceRows = useMemo(() => {
    if (realThAll.length === 0) return [];
    return computeUnusedDevices({ thRows: realThAll, sccmRows: realSccmAll, staleDays });
  }, [realThAll, realSccmAll, staleDays]);

  // hostname (küçük harf) -> SCCM satırı. LAKESIDE BSOD/Battery raporlarında lokasyon + kullanıcı
  // mailini hostname ile eşleştirmek için (kullanıcı isteği: "hostname var, SCCM'den eşleştir").
  const sccmByHostname = useMemo(() => {
    const m = new Map();
    realSccmAll.forEach((s) => {
      const h = String(s.hostname || "").trim().toLowerCase();
      if (h) m.set(h, s);
    });
    return m;
  }, [realSccmAll]);

  const enrichWithSccm = (rows, { setLocationColumn = false } = {}) =>
    rows.map((r) => {
      const s =
        sccmByHostname.get(String(r.hostname || "").trim().toLowerCase()) ||
        sccmByHostname.get(String(r.hostShort || "").trim().toLowerCase());
      const loc = s && s.location && s.location !== "—" ? s.location : "";
      const base = {
        ...r,
        sccmMatched: !!s,
        sccmHostname: s ? s.hostname : "",
        sccmLocation: loc,
        sccmLbsParent: s ? s.lbsParent || "" : "",
        sccmUser: s ? s.userLabel || "" : "",
        sccmUserMail: s ? s.mail || "" : "",
        // [ŞİRKET-FİLTRESİ] şirket bilgisi SCCM'deki İştirak sütunundan (hostname eşleşmesi) gelir
        company: s ? s.company || "" : r.company || "",
      };
      // BSOD listesinde "Lokasyon" kolonu SCCM'den doldurulur (crash tarihi alt satırda kalır).
      if (setLocationColumn) {
        base.location = loc || "—";
        base.lbsParent = (s && s.lbsParent) || r.lbsParent || "";
      }
      return base;
    });

  const bsodRows = useMemo(() => (realBsodAll.length ? enrichWithSccm(realBsodAll, { setLocationColumn: true }) : []), [realBsodAll, sccmByHostname]);
  // Bottleneck (LAKESIDE): SCCM + Disk + BSOD + Battery + birleşimi; şirket filtresine uyar.
  const bottleneck = useMemo(() => {
    if (activeReport !== "darbogaz") return { rows: [], summary: { analyzed: 0, bottleneck: 0, critical: 0, multi: 0, byCause: {}, available: {} } };
    const res = computeBottlenecks({ sccmRows: realSccmAll, diskRows: realDiskAll, bsodRows: realBsodAll, batteryRows: realBatteryAll });
    return res;
  }, [activeReport, realSccmAll, realDiskAll, realBsodAll, realBatteryAll]);
  const batteryRows = useMemo(() => (realBatteryAll.length ? enrichWithSccm(realBatteryAll) : []), [realBatteryAll, sccmByHostname]);

  // Yeni Kurulum Kaydı formundaki LOKASYON açılır listesi — mevcut verideki lokasyonlar.
  const installLocations = useMemo(() => {
    const s = new Set();
    [...realSccmAll, ...realThAll, ...realInaktifAll].forEach((r) => {
      const l = (r.location || "").trim();
      if (l && l !== "—") s.add(l);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "tr"));
  }, [realSccmAll, realThAll, realInaktifAll]);

  const inaktifCompanies = useMemo(() => {
    if (!hasRealCompanies) return [];
    const set = new Set([...realInaktifAll, ...realDiskAll, ...unusedDeviceRows].map((r) => r.company).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [hasRealCompanies, realInaktifAll, realDiskAll, unusedDeviceRows]);

  // Disk Alanı gerçek dosyasında şirket bilgisi yok, o yüzden şirkete göre değil sabit bir
  // etiketle anılıyor — İnaktif Cihazlar'da ise seçili şirket kullanılıyor
  const currentDeptKey = usingRealInaktif || isUnused ? activeCompany : usingRealDisk ? "tum-cihazlar" : activeDept;
  const currentDeptLabel = usingRealInaktif || isUnused
    ? (activeCompany === "all" ? "Tüm Şirketler" : companyShortLabel(activeCompany))
    : usingRealDisk
    ? "Tüm Cihazlar"
    : isZimmet
    ? "SCCM Envanteri"
    : !USE_MOCK_DATA
    ? "Tüm Şirketler"
    : DEPARTMENTS.find((d) => d.id === activeDept).name;
  // Disk Alanı'nda genel "Cihaz Sahibi/Seri No-Model/Lokasyon" sütunları yerine
  // Hostname / Volume Name / Size / Free Space gösterilir (bkz. konuşma)
  const isDiskReport = activeReport === "disk";
  const ownerLabel = isDiskReport ? "Hostname" : isLokasyonIp ? "Beklenen Ofis" : isUnused ? "Zimmet Sahibi" : isBsod || isBattery ? "Cihaz" : "Cihaz Sahibi";
  const serialLabel = isDiskReport ? "Volume Name" : isUnused ? "Seri No / Durum" : isBsod ? "BSOD Kodu" : isBattery ? "Batarya Sağlığı" : "Seri No / Model";
  const modelLabel = isDiskReport ? "Free Space" : "Model";
  const locationLabel = isDiskReport ? "Size" : isLokasyonIp ? "Gerçek IP (172.x)" : isBattery ? "Pil Durumu" : "Lokasyon";
  // owner + serial birlikte: Disk Alanı'nda "serial" (Volume Name) tek başına eşsiz değil
  // (aynı "Windows" birimi yüzlerce cihazda tekrarlanıyor) — hostname eklenmeden aynı anahtar
  // birden fazla satıra düşüp bir tanesini seçince hepsini birden seçili gösteriyordu
  const rowKeyOf = (r) => (isZimmet || isBsod || isBattery ? r.rowKey : `${currentDeptKey}|${activeReport}|${r.owner}|${r.serial}`);

  // Gereksinim #5: kullanıcı listeden 1 ya da daha fazla kayıt SEÇMİŞSE mail SADECE onlara
  // gitmeli, seçim yoksa (mevcut davranış) filtrelenmiş listenin tamamına gidilir. Bu desen
  // zaten sendInaktifMailPreview (896) ve handleExportSelected'ta (585) kullanılıyordu — burada
  // tek bir yardımcıya çıkarılıp handleMail/handleDiskMail'in de aynı mantığı kullanması sağlanıyor.
  const resolveTargetRows = () => (selectedKeys.size > 0 ? filteredRows.filter((r) => selectedKeys.has(rowKeyOf(r))) : filteredRows);

  const closeAllViews = () => { setShowHistory(false); setShowDashboard(false); setShowSettings(false); setActiveNetworkView(null); };

  const handleSettingsLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const result = await backendClient.loginSettings(loginUsername.trim(), loginPassword);
      if (result.ok) {
        setSettingsAuth(loginUsername.trim(), loginPassword);
        setSettingsUnlocked(true);
        setLoginPassword("");
      } else {
        setLoginError(result.message || "Kullanıcı adı veya şifre hatalı");
      }
    } catch (err) {
      setLoginError(err.message || "Giriş yapılamadı");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSettingsLogout = () => {
    clearSettingsAuth();
    setSettingsUnlocked(false);
    setLoginUsername("");
    setLoginPassword("");
  };
  const goDept = (id) => { setActiveDept(id); closeAllViews(); setSelectedKeys(new Set()); };
  const goReport = (id) => { setActiveReport(id); closeAllViews(); setSelectedKeys(new Set()); setExpandedPerson(null); setAtilStage(null); };

  // TuruncuHat envanteri yüklüyse (Ayarlar > TuruncuHat ve Monitor Raporu) SCCM+TH+Monitor üçlü
  // karşılaştırması kullanılır — bu, monitörler için de gerçek doğru/hatalı zimmet tespiti verir
  // (bkz. konuşma: "monitor kullanan kişi boş görünüyor" — SCCM tek başına monitör login bilgisi
  // taşımıyor). TH henüz yüklenmediyse eskisi gibi salt SCCM satırlarına düşülür — mevcut
  // davranış hiç bozulmaz.
  // isZimmet'e bağlı DEĞİL (önceden öyleydi) — Dashboard (Ana Sayfa) da bu satırları kullanıyor
  // ve rapor ekranındaki aktif sekme "zimmet" olmasa bile (ör. İnaktif Cihazlar açıkken Ana
  // Sayfa'ya bakılıyorsa) doğru, monitör dahil sonucu göstermesi lazım (bkz. konuşma).
  const zimmetRows = useMemo(() => {
    if (realSccmAll.length === 0) return [];
    if (realThAll.length === 0) return getZimmetRows(realSccmAll);
    return computeComparisonRows({ sccmRows: realSccmAll, thRows: realThAll, monitorRows: realMonitorAll, staleDays });
  }, [realSccmAll, realThAll, realMonitorAll, staleDays]);

  // Lokasyon Hostname ve IP Uyuşmazlığı — bkz. locationIpService.js
  const lokasyonIpRows = useMemo(
    () => computeLocationIpRows({ sccmRows: realSccmAll, lokasyonRows: realLokasyonMailAll }),
    [realSccmAll, realLokasyonMailAll]
  );

  // rowKey -> { chainId, chainSize }, bkz. zimmetService.computeZimmetChains
  const zimmetChains = useMemo(() => (isZimmet ? computeZimmetChains(zimmetRows) : new Map()), [isZimmet, zimmetRows]);

  // "Monitör Uyuşmazlığı" segmenti sadece gerçekten kesin bir uyuşmazlık varsa gösterilir —
  // TH+Monitor Raporu yüklü değilse veya hiç kesin uyuşmazlık yoksa segment hiç görünmez.
  const anyMonitorIssue = useMemo(() => isZimmet && zimmetRows.some((r) => r.monitorIssue), [isZimmet, zimmetRows]);
  // Madde 3 — "TH Kaydı YOK" segmenti sadece gerçekten bu tip satır varsa gösterilir.
  const anyNoThRecord = useMemo(() => isZimmet && zimmetRows.some((r) => r.statusTag === "TH Kaydı YOK"), [isZimmet, zimmetRows]);
  // "Mükerrer Çift Zimmet" segmenti — aynı kişiye birden fazla notebook zimmetli görünen kayıtlar
  // (bkz. konuşma: "Zimmet uyuşmazlığı altına kırılım yap, mükerrer çift zimmet ekle").
  const anyDuplicateNotebook = useMemo(() => isZimmet && zimmetRows.some((r) => r.statusTag === "Mükerrer Çift Zimmet"), [isZimmet, zimmetRows]);

  // Genel Bakış'taki durum akışı (Yeni/İnceleniyor/Çözüldü) dağılımı
  const statusFlowStats = useMemo(() => {
    const rows = getAllMismatchRows(realSccmAll);
    const counts = Object.fromEntries(STATUS_FLOW.map((s) => [s, 0]));
    rows.forEach((r) => {
      const st = rowMeta[deviceKeyOf(r)]?.status || "Yeni";
      counts[st] = (counts[st] || 0) + 1;
    });
    return { total: rows.length, counts };
  }, [rowMeta, realSccmAll]);

  // İnaktif Cihazlar listesi zaten TH'den gelen "sahibi inaktif" listesi — bu yüzden TH'ye tekrar
  // bakılmıyor (bkz. konuşma: "bu liste zaten inaktif liste, TH ile ayrıca teyide gerek yok").
  // Tek kontrol: SCCM'de bu seri no'ya aktif giriş yapan biri var mı (bkz. inaktifComparisonService.js).
  const inaktifComparisonRows = useMemo(() => {
    if (realInaktifAll.length === 0) return [];
    if (realSccmAll.length === 0) return realInaktifAll;
    return computeInaktifComparisonRows({ inaktifRows: realInaktifAll, sccmRows: realSccmAll });
  }, [realInaktifAll, realSccmAll]);

  // Faz 2 — problemli cihazlar snapshot'ları. Her rapor kendi problem tanımına göre.
  // İnaktif → listede olan her cihaz problemlidir.
  useEffect(() => {
    if (realInaktifAll.length === 0 || !realInaktifMeta) return;
    postSnapshot("inaktif", realInaktifMeta, inaktifComparisonRows.length ? inaktifComparisonRows : realInaktifAll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realInaktifMeta, inaktifComparisonRows]);

  // Zimmet → KESİN uyuşmazlık (matched:false & doğrulanamayan değil). "TH Kaydı YOK" dahil değil.
  // TH henüz yüklenmemişken zimmetRows ham SCCM'e düşer ve problem kümesi FARKLI olur; snapshot'ın
  // yanlış donmaması için TH yüklenene kadar beklenir. Idempotency anahtarı SCCM+TH birleşik.
  useEffect(() => {
    if (realSccmAll.length === 0 || !realSccmMeta) return;
    if (realThAll.length === 0 || !realThMeta) return;
    const problem = zimmetRows.filter((r) => !r.matched && !isZimmetUnverified(r.statusTag));
    postSnapshot("zimmet", { modifiedAt: `${realSccmMeta.modifiedAt}|${realThMeta.modifiedAt}` }, problem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realSccmMeta, realThMeta, zimmetRows]);

  // Disk → kritik (≤10 GB) cihazlar. Lokasyon SCCM'den zenginleştirilemiyorsa hostname taşınır.
  useEffect(() => {
    if (realDiskAll.length === 0 || !realDiskMeta) return;
    const problem = realDiskAll.filter((r) => classifyDisk(r.freeSpaceGb) === "critical");
    postSnapshot("disk", realDiskMeta, problem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realDiskMeta, realDiskAll]);

  // Kullanılmayan Cihazlar → listedeki her cihaz problemlidir (kullanılmıyor). TH+SCCM birleşik
  // idempotency anahtarı; TH henüz yüklenmemişken (unusedDeviceRows boş) snapshot yazılmaz.
  useEffect(() => {
    if (realThAll.length === 0 || !realThMeta) return;
    postSnapshot("kullanilmayan", { modifiedAt: `${realThMeta.modifiedAt}|${realSccmMeta?.modifiedAt || "nosccm"}` }, unusedDeviceRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realThMeta, realSccmMeta, unusedDeviceRows]);

  // [ŞİRKET-FİLTRESİ — KRİTİK NOT, bkz. KRITIK-NOTLAR.md] Sol menüdeki şirket seçimi artık Zimmet, Lokasyon IP, BSOD,
  // Battery, Atıl Monitör ekranlarına ve Dashboard kartlarına da uygulanır (önceden yalnızca İnaktif/Kullanılmayan'a
  // uygulanıyordu). Geri almak için KRITIK-NOTLAR.md'deki adımları izleyin. zimmetRows/snapshot/mail hesapları HER ZAMAN
  // filtresizdir; filtre yalnızca ekranda gösterilen satırlara ve dashboard sayılarına uygulanır.
  const byCompany = (rows, co) => (co === "all" ? rows : rows.filter((r) => r.company === co));

  const rawRows = isZimmet
    ? byCompany(zimmetRows, activeCompany)
    : isLokasyonIp
    ? byCompany(lokasyonIpRows, activeCompany)
    : isBsod
    ? byCompany(bsodRows, activeCompany)
    : isBattery
    ? byCompany(batteryRows, activeCompany)
    : isUnused
    ? (activeCompany === "all" ? unusedDeviceRows : unusedDeviceRows.filter((r) => r.company === activeCompany))
    : usingRealInaktif
    ? (activeCompany === "all" ? inaktifComparisonRows : inaktifComparisonRows.filter((r) => r.company === activeCompany))
    : usingRealDisk
    ? realDiskAll // Disk Alanı dosyasında şirket/lokasyon bilgisi yok — düz liste (bkz. konuşma)
    : getReportRows(activeDept, activeReport);

  // Zimmet'te "sub" = "Monitör — Dell 24"" (tür " — " öncesi); diğer raporlarda "sub" = birim/departman
  // Zimmet / Kullanılmayan / Lokasyon IP'de "sub" = "Tür — Model"; BSOD/Pil'de sub bir kategori değil
  // (tarih/kullanıcı metni) olduğu için o raporlarda Tür filtresi hiç gösterilmez.
  const subHasType = isZimmet || isUnused || isLokasyonIp;
  const deviceTypeOf = (r) => (subHasType ? (r.sub || "").split(" — ")[0].trim() : isBsod || isBattery ? "" : (r.sub || "").trim());
  const typeFilterLabel = subHasType ? "Tür" : "Birim";
  const deviceCategories = useMemo(() => {
    const set = new Set(rawRows.map(deviceTypeOf).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [subHasType, isBsod, isBattery, rawRows]);

  const locationOf = (r) => (isZimmet || isLokasyonIp ? r.office : r.location) || "—";

  // Model filtresi (gereksinim #3) — rapor bazlı doğru alanı okur: Zimmet'te "model" alanı
  // uyuşmazlık açıklama cümlesi taşıdığı için gerçek model "deviceModel"da (bkz.
  // sccmFileService.js); Kullanılmayan Cihazlar'da da aynı sorun — "model" alanı uzun "neden
  // kullanılmıyor" cümlesi taşıyor (bkz. unusedDeviceService.js), gerçek model yine
  // "deviceModel"da (bkz. konuşma: "Model kısmında cihazın bilgisi yerine farklı bir bilgi
  // geliyor ve filtre yapınca okunmuyorlar"). İnaktif/TH'de "model" doğrudan cihaz modeli;
  // Disk Alanı'nda model kavramı yok (REPORTS_WITHOUT_MODEL_FILTER) — model filtresi orada gizlenir.
  const modelOf = (r) => ((isZimmet || isUnused || isLokasyonIp ? r.deviceModel : r.model) || "").trim();
  const showModelFilter = !REPORTS_WITHOUT_MODEL_FILTER.has(activeReport);
  const modelCategories = useMemo(() => {
    if (!showModelFilter) return [];
    const set = new Set(rawRows.map(modelOf).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [isZimmet, isUnused, isLokasyonIp, rawRows, showModelFilter]);

  // Windows sürümü seçenekleri (yalnızca Zimmet satırlarında; SCCM'de işletim sistemi sütunu varsa dolar)
  const windowsCategories = useMemo(() => {
    if (!isZimmet) return [];
    const set = new Set(rawRows.map((r) => r.windowsLabel).filter(Boolean));
    return Array.from(set).sort((a, b) => b.localeCompare(a, "tr"));
  }, [isZimmet, rawRows]);

  const statusCategories = useMemo(() => {
    const set = new Set(rawRows.map((r) => r.statusTag).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [rawRows]);

  // LBS Location Parent — sadece gerçek İnaktif verisinde var; seçilince Lokasyon
  // dropdown'ı sadece o üst konuma ait lokasyonları listeler (bağımlı filtre)
  // Madde 4 — "Üst Lokasyon" filtresi artık TÜM raporlarda (önceden sadece İnaktif/Disk gerçek
  // veri modundaydı). Zimmet/SCCM satırlarında da `lbsParent` (EnvanterLocationParent) var.
  const lbsParentCategories = useMemo(() => {
    const set = new Set(rawRows.map((r) => r.lbsParent).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [rawRows]);

  const locationCategories = useMemo(() => {
    const pool = lbsParentFilter.length > 0 ? rawRows.filter((r) => lbsParentFilter.includes(r.lbsParent)) : rawRows;
    const set = new Set(pool.map(locationOf).filter((v) => v && v !== "—"));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [isZimmet, isLokasyonIp, rawRows, lbsParentFilter]);

  const filteredRows = useMemo(() => {
    return rawRows.filter((r) => {
      if (isZimmet && !showSnoozed && rowMeta[deviceKeyOf(r)]?.snoozed) return false;
      if (isZimmet && showNotedOnly && !(rowMeta[deviceKeyOf(r)]?.notes?.length > 0)) return false;
      if (typeFilter.length > 0 && !typeFilter.includes(deviceTypeOf(r))) return false;
      if (lbsParentFilter.length > 0 && !lbsParentFilter.includes(r.lbsParent)) return false;
      if (locationFilter.length > 0 && !locationFilter.includes(locationOf(r))) return false;
      if (modelFilter.length > 0 && !modelFilter.includes(modelOf(r))) return false;
      if (windowsFilter.length > 0 && !windowsFilter.includes(r.windowsLabel || "")) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(r.statusTag)) return false;
      if (segment === "matched" && !r.matched) return false;
      // "Zimmet Hatalı" segmenti sadece KESİN uyuşmazlıkları göstermeli — doğrulanamayan (ör.
      // TH bazlı tasarımda "SCCM'de Bulunamadı") kayıtlar buraya karışmamalı, bunlar hatalı
      // değil sadece doğrulanamamış demek (bkz. konuşma).
      if (segment === "unmatched" && (r.matched || (isZimmet && isZimmetUnverified(r.statusTag)))) return false;
      if (segment === "monitorIssue" && !r.monitorIssue) return false;
      if ((segment === "critical" || segment === "warning" || segment === "normal") && r.diskLevel !== segment) return false;
      if (segment === "noThRecord" && r.statusTag !== "TH Kaydı YOK") return false;
      if (segment === "duplicateNotebook" && r.statusTag !== "Mükerrer Çift Zimmet") return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${r.owner} ${r.sub} ${r.serial} ${r.model} ${r.location} ${locationOf(r)} ${r.windowsSearch || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rawRows, segment, search, isZimmet, showSnoozed, showNotedOnly, rowMeta, typeFilter, locationFilter, modelFilter, windowsFilter, statusFilter, usingRealFileData, lbsParentFilter]);

  // Sayfalama — filtrelenmiş sonuç listesi büyük olabileceği için görünüm bu dilime göre render edilir;
  // Tümünü Seç / Excel'e Aktar / Mail Gönder gibi işlemler yine filteredRows'un tamamı üzerinden çalışır
  // Gerçek sayfalama (kullanıcı isteği) — "Tümü" seçiliyse tek sayfa, aksi halde pageSize'a göre
  // dilimlenir. safePage, filtre daralınca eski sayfa numarası artık mevcut olmasa bile
  // (currentPage effect'i zaten 1'e döner ama olası bir yarış durumuna karşı) sınırlar.
  const totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(() => {
    if (pageSize === Infinity) return filteredRows;
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, pageSize, safePage]);

  const matchedCount = rawRows.filter((r) => r.matched).length;
  // Doğrulanamayan (isZimmetUnverified) kayıtlar "hatalı" değil — üstteki özet kartı da segment
  // filtresiyle (bkz. filteredRows) tutarlı olsun diye onları saymıyor (bkz. konuşma).
  const unmatchedCount = isZimmet
    ? rawRows.filter((r) => !r.matched && !isZimmetUnverified(r.statusTag)).length
    : rawRows.length - matchedCount;
  const unverifiedCount = isZimmet ? rawRows.filter((r) => isZimmetUnverified(r.statusTag)).length : 0;
  const snoozedCount = isZimmet ? rawRows.filter((r) => rowMeta[deviceKeyOf(r)]?.snoozed).length : 0;
  const notedCount = isZimmet ? rawRows.filter((r) => rowMeta[deviceKeyOf(r)]?.notes?.length > 0).length : 0;
  const detailRow = filteredRows.find((r) => rowKeyOf(r) === detailRowKey) || null;

  const historySenders = useMemo(
    () => Array.from(new Set(mailHistory.map((h) => h.senderUsername).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr")),
    [mailHistory]
  );

  // Rapor adındaki dil eki ("(TR)" / "(EN)") aynı raporu bölmesin
  const historyReportBase = (name) => String(name || "").replace(/\s*\((TR|EN)\)\s*$/, "");
  // Kapsam (şirket / "Tüm Şirketler" / kayıt türü) ve rapor seçenekleri sahte sabit listeden değil, gerçek kayıtlardan gelir
  const historyScopes = useMemo(
    () => Array.from(new Set(mailHistory.map((h) => h.dept).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr")),
    [mailHistory]
  );
  const historyReports = useMemo(
    () => Array.from(new Set(mailHistory.map((h) => historyReportBase(h.report)).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr")),
    [mailHistory]
  );
  const historyFilterCount = [historyStatusFilter, historyDeptFilter, historyReportFilter, historySenderFilter].filter((v) => v !== "all").length + (historyDateFrom ? 1 : 0) + (historyDateTo ? 1 : 0) + (historySearch.trim() ? 1 : 0);
  const clearHistoryFilters = () => {
    setHistoryStatusFilter("all"); setHistoryDeptFilter("all"); setHistoryReportFilter("all"); setHistorySenderFilter("all");
    setHistoryDateFrom(""); setHistoryDateTo(""); setHistorySearch("");
  };

  const filteredMailHistory = useMemo(() => {
    return mailHistory.filter((h) => {
      if (historyStatusFilter !== "all" && h.status !== historyStatusFilter) return false;
      if (historyDeptFilter !== "all" && h.dept !== historyDeptFilter) return false;
      if (historyReportFilter !== "all" && historyReportBase(h.report) !== historyReportFilter) return false;
      if (historySenderFilter !== "all" && h.senderUsername !== historySenderFilter) return false;
      if (historyDateFrom && h.isoDate && h.isoDate < historyDateFrom) return false;
      if (historyDateTo && h.isoDate && h.isoDate > `${historyDateTo}T23:59:59`) return false;
      if (historySearch.trim()) {
        const q = historySearch.trim().toLowerCase();
        const inDetails = (h.details || []).some((d) => `${d.location} ${d.to || ""}`.toLowerCase().includes(q));
        if (!inDetails && !`${h.dept} ${h.report} ${h.senderUsername || ""}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [mailHistory, historyStatusFilter, historyDeptFilter, historyReportFilter, historySenderFilter, historyDateFrom, historyDateTo, historySearch]);

  // Gönderim Geçmişi'nde bir kayıt seçilince sağ panel açılır; detaylar önce elde zaten
  // yüklüyse (aynı oturumda oluşturulan kayıt) oradan, değilse backend'den GET /:id/details ile çekilir
  const selectHistoryRow = async (h) => {
    setSelectedHistoryId(h.id);
    if (h.details) {
      setSelectedHistoryDetails(h.details);
      return;
    }
    setLoadingHistoryDetails(true);
    try {
      const details = await backendClient.getMailHistoryDetails(h.id);
      setSelectedHistoryDetails(details);
    } catch {
      setSelectedHistoryDetails([]);
    } finally {
      setLoadingHistoryDetails(false);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  // Filtre kombinasyonu (arama hariç) sonucu 0 kayıt bırakırsa kullanıcı sıkışıp kalmasın diye
  // otomatik olarak filtresiz hale dönülür — bkz. konuşma (notlu filtresi + bağlam değişince oluşan tuzak)
  useEffect(() => {
    if (showDashboard || showHistory || showSettings) return;
    if (search.trim()) return;
    if (rawRows.length > 0 && filteredRows.length === 0) {
      setSegment("all");
      setTypeFilter([]);
      setLocationFilter([]);
      setLbsParentFilter([]);
      setModelFilter([]); setWindowsFilter([]);
      setShowSnoozed(false);
      setShowNotedOnly(false);
      setCurrentPage(1);
      showToast("Filtre sonucunda hiç kayıt kalmadığı için filtreler sıfırlandı");
    }
  }, [rawRows, filteredRows, showDashboard, showHistory, showSettings, search]);

  // rowMeta artık cihaz anahtarına (deviceKeyOf — seri no/hostname) göre tutuluyor ve her
  // değişiklik backend'e yazılıyor (madde 5 — "sayfa yenilenince not kayboluyor" bug'ı düzeldi).
  // updateRowMeta: yeni meta'yı hesaplar, state'i günceller, backend'e persist eder ve
  // opsiyonel olarak cihaz aksiyon geçmişine bir event yazar.
  const updateRowMeta = (key, mutate, logEvent) => {
    if (!key) return;
    setRowMeta((prev) => {
      const nextForKey = mutate(prev[key] || {});
      persistDeviceMeta(key, nextForKey);
      return { ...prev, [key]: nextForKey };
    });
    if (logEvent) {
      logDeviceAction({ serial: key }, { user: user?.username || "", reportId: activeReport, ...logEvent });
    }
  };

  const cycleStatus = (key) => {
    updateRowMeta(
      key,
      (m) => {
        const idx = STATUS_FLOW.indexOf(m.status || "Yeni");
        return { ...m, status: STATUS_FLOW[(idx + 1) % STATUS_FLOW.length] };
      },
      null
    );
    // event: yeni durumu logla (updateRowMeta içinde eski state okunmadığı için ayrıca)
    setRowMeta((prev) => {
      const st = prev[key]?.status;
      if (st) logDeviceAction({ serial: key }, { type: "Durum Değişikliği", description: `Durum: ${st}`, status: st, user: user?.username || "", reportId: activeReport });
      return prev;
    });
  };

  const toggleSnooze = (key) => {
    updateRowMeta(
      key,
      (m) => ({ ...m, snoozed: !m.snoozed }),
      null
    );
    setRowMeta((prev) => {
      const snoozed = prev[key]?.snoozed;
      logDeviceAction({ serial: key }, { type: "Ertele", description: snoozed ? "Ertelendi" : "Erteleme kaldırıldı", user: user?.username || "", reportId: activeReport });
      return prev;
    });
  };

  const setNote = (key, text) => {
    updateRowMeta(key, (m) => ({ ...m, note: text }), null);
  };

  // Zimmet detay panelindeki "Notlar" listesi — tekil "note" alanından ayrı, birden çok not tutar
  const addNote = (key, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    updateRowMeta(
      key,
      (m) => ({ ...m, notes: [...(m.notes || []), { id: `${Date.now()}-${Math.random()}`, text: trimmed }] }),
      { type: "Not", description: `Not eklendi: ${trimmed}` }
    );
  };

  const editNote = (key, noteId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    updateRowMeta(
      key,
      (m) => ({ ...m, notes: (m.notes || []).map((n) => (n.id === noteId ? { ...n, text: trimmed } : n)) }),
      { type: "Not", description: `Not düzenlendi: ${trimmed}` }
    );
  };

  const deleteNote = (key, noteId) => {
    updateRowMeta(
      key,
      (m) => ({ ...m, notes: (m.notes || []).filter((n) => n.id !== noteId) }),
      { type: "Not", description: "Not silindi" }
    );
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
      return rows.map((r) => {
        const chain = zimmetChains.get(r.rowKey);
        return {
          "Zincir No": chain?.chainId ?? "",
          "Zincirdeki Kayıt Sayısı": chain?.chainSize ?? 1,
          "Zimmetli Kişi": r.owner,
          "Cihaz (Seri No)": r.serial,
          "Cihaz Türü": r.sub,
          "Windows Sürümü": r.windowsLabel || "",
          "Windows Destek": r.windowsSupportLabel || "",
          "Kullanan Kişi": r.userFullName || r.userLabel,
          "Zimmet Türü": r.assignmentType === "OBS" ? "OBS (Müdürlük)" : r.assignmentType === "User" ? "User (Kişi)" : "—",
          "Açıklama": r.model,
          "Durum": r.statusTag,
        };
      });
    }
    if (activeReport === "inaktif") {
      // İnaktif Cihazlar artık SCCM ile karşılaştırılan bir statusTag/actualUser taşıyor (bkz.
      // konuşma — inaktifComparisonService.js) — export bunu düz "Eşleşti/Eşleşmedi" yerine
      // anlaşılır şekilde yansıtmalı: durum, hostname ve varsa fiilen kullanan kişi ayrı sütunlarda.
      return rows.map((r) => ({
        "Cihaz Sahibi (TH)": r.owner,
        "Seri No": r.serial,
        "Model": r.model,
        "Lokasyon": r.location,
        "Şirket": r.company || "",
        "Durum": r.statusTag || (r.matched ? "Eşleşti" : "Eşleşmedi"),
        "Hostname": r.hostname || "",
        "Cihazı Kullanan (SCCM)": r.actualUser || "",
        "Cihazı Kullanan E-posta": r.actualUserMail || "",
        "Açıklama": r.matchDetail || "",
      }));
    }
    if (isUnused) {
      // Madde 7, 8 — Kullanılmayan Cihazlar: hostname, seri no, üst lokasyon, lokasyon, model,
      // BIOS Date, Last Logon, OBS/SCCM durumu, cihaz yaşı, kullanım durumu ayrı sütunlarda.
      return rows.map((r) => ({
        "Hostname": r.hostname || "",
        "Seri Numarası": r.serial || "",
        "Üst Lokasyon": r.lbsParent || "",
        "Lokasyon": r.location || "",
        "Cihaz Modeli": r.deviceModel || "",
        "BIOS Date": r.biosDate || "Veri Yok",
        "Garanti Başlangıç (TH)": r.warrantyStartDate || "Veri Yok",
        "Last Logon": r.lastLogonTime || "Veri Yok",
        "OBS Zimmet Durumu": r.obsStatus || "",
        "SCCM Durumu": r.sccmStatus || "",
        "Cihaz Yaşı": r.deviceAge != null ? `${r.deviceAge} yıl` : "Veri Yok",
        "Cihaz Yaşı Kaynağı": r.deviceAgeSource || "—",
        "Kullanım Durumu": r.statusTag || r.usageStatus || "",
        "Açıklama": r.model || "",
      }));
    }
    if (isBsod) {
      return rows.map((r) => {
        const kb = lookupBsod(r.bsodCode);
        return {
          "Cihaz": r.hostShort || r.hostname || "",
          "Hostname (tam)": r.hostname || "",
          "Lokasyon (SCCM)": r.sccmLocation || "—",
          "Üst Lokasyon (SCCM)": r.sccmLbsParent || "—",
          "Son Kullanıcı (SCCM)": r.sccmUser || "—",
          "Kullanıcı E-posta (SCCM)": r.sccmUserMail || "—",
          "Crash Tarihi": r.crashDate || "",
          "BSOD Kodu": r.bsodName || "",
          "Hex": r.bsodHex || "",
          "Adet": r.count || 1,
          "Kategori": kb.category || "",
          "Önem": kb.severity || "",
          "Olası Neden": kb.cause || "",
          "ThinkPad / Kurumsal İmaj Notu": kb.thinkpad || "",
          "Çözüm Adımları": (kb.actions || []).map((a, i) => `${i + 1}. ${a}`).join("  |  "),
        };
      });
    }
    if (isBattery) {
      return rows.map((r) => ({
        "Cihaz": r.hostShort || r.hostname || "",
        "Hostname (tam)": r.hostname || "",
        "Lokasyon (SCCM)": r.sccmLocation || "—",
        "Son Kullanıcı (SCCM)": r.sccmUser || "—",
        "Kullanıcı E-posta (SCCM)": r.sccmUserMail || "—",
        "Batarya Sağlığı %": r.batteryHealth != null ? r.batteryHealth : "Veri Yok",
        "Döngü Sayısı": r.cycleCount != null ? r.cycleCount : "",
        "Tasarım Kapasitesi": r.designCapacity != null ? r.designCapacity : "",
        "Tam Şarj Kapasitesi": r.fullChargeCapacity != null ? r.fullChargeCapacity : "",
        "Pil Durumu": r.batteryStatus || "",
        "Üretici": r.manufacturer || "",
        "Değerlendirme": r.durum || "",
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
      const chain = zimmetChains.get(r.rowKey);
      if (r.owner !== "—") {
        entries.push({
          "Zincir No": chain?.chainId ?? "",
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
          "Zincir No": chain?.chainId ?? "",
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

  // Zimmet exportunda en büyük zincirler en üstte sıralanır
  const sortRowsForExport = (rows) => {
    if (!isZimmet) return rows;
    return [...rows].sort((a, b) => {
      const ca = zimmetChains.get(a.rowKey) || { chainId: 0, chainSize: 1 };
      const cb = zimmetChains.get(b.rowKey) || { chainId: 0, chainSize: 1 };
      if (cb.chainSize !== ca.chainSize) return cb.chainSize - ca.chainSize;
      return ca.chainId - cb.chainId;
    });
  };

  const downloadSheet = (rows, suffix) => {
    const deptName = currentDeptLabel;
    const reportName = REPORT_TYPES.find((r) => r.id === activeReport).name;
    const sortedRows = sortRowsForExport(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildSheetData(sortedRows)), isZimmet ? "Cihaz Bazlı" : "Rapor");
    if (isZimmet) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildPersonSummaryRows(sortedRows)), "Kişi Bazlı Özet");
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

  // Excel'e Aktar ile AYNI veriyi (buildSheetData) kullanır — sütunlar birebir tutarlı olsun diye
  // ayrı bir PDF veri şeması icat edilmedi (bkz. konuşma: "iki kez aynı şeyi yapmayalım").
  const handlePdfExport = async () => {
    const sortedRows = sortRowsForExport(filteredRows);
    const sheetRows = buildSheetData(sortedRows);
    if (sheetRows.length === 0) {
      showToast("Aktarılacak kayıt yok");
      return;
    }
    const deptName = currentDeptLabel;
    const reportName = REPORT_TYPES.find((r) => r.id === activeReport).name;
    showToast("PDF oluşturuluyor...");
    try {
      const fontBase64 = await loadRobotoFontBase64();
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.addFileToVFS("Roboto-Regular.ttf", fontBase64);
      doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
      doc.setFont("Roboto");

      doc.setFontSize(14);
      doc.text(`${reportName} — ${deptName}`, 28, 28);
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      doc.text(`Oluşturulma: ${new Date().toLocaleString("tr-TR")} · ${sheetRows.length} kayıt`, 28, 42);

      const headers = Object.keys(sheetRows[0]);
      autoTable(doc, {
        startY: 54,
        head: [headers],
        body: sheetRows.map((row) => headers.map((h) => String(row[h] ?? ""))),
        styles: { font: "Roboto", fontSize: 12, cellPadding: 3, overflow: "linebreak" },
        headStyles: { font: "Roboto", fillColor: [217, 99, 31], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 246, 243] },
        margin: { left: 20, right: 20 },
      });

      doc.save(`${deptName} - ${reportName}.pdf`);
      showToast(`✅ PDF indirildi: ${sheetRows.length} kayıt`);
    } catch (err) {
      showToast(`❌ PDF oluşturulamadı: ${err.message || "beklenmeyen hata"}`);
    }
  };

  // Gereksinim #10/#14: her gönderim kaydına gönderen kullanıcı + rapor türü id'si otomatik
  // eklenir — 4 çağrı noktasının (handleMail/handleDiskMail/sendInaktifMailPreview/demo) her
  // birine tekrar tekrar yazmak yerine tek yerden zenginleştiriliyor.
  const recordMailHistory = (entry) => {
    const now = new Date();
    const reportType = entry.reportType || activeReport;
    // Gereksinim #13/#14: detay kayıtları recipientUser/recipientEmail/device/deviceModel/
    // reportType/sendingStatus alanlarını da taşımalı — mevcut location/to/count/ok/message
    // alanları (halihazırda ekranda kullanılıyor) korunarak yeni alanlar üzerlerine eklenir.
    const details = (entry.details || []).map((d) => ({
      ...d,
      recipientUser: d.recipientUser ?? d.location ?? "",
      recipientEmail: d.recipientEmail ?? d.to ?? null,
      device: d.device ?? d.location ?? "",
      deviceName: d.deviceName ?? d.location ?? "",
      deviceModel: d.deviceModel ?? "",
      reportType: d.reportType ?? reportType,
      sendingStatus: d.sendingStatus ?? (d.ok ? "Başarılı" : "Başarısız"),
    }));
    const enriched = {
      ...entry,
      details,
      senderUserId: user?.id || null,
      senderUsername: user?.username || "bilinmiyor",
      time: now.toLocaleTimeString("tr-TR"),
      isoDate: now.toISOString(),
      reportType,
    };
    setMailHistory((prev) => [enriched, ...prev]);
    backendClient.addMailHistory(enriched).catch(() => {});
  };

  const escapeHtml = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Mail içerikleri: Ofis Bant Genişliği Uyarısı ile aynı çerçeve (services/mailLayout.js — lacivert başlık bandı, çerçeveli gövde,
  // tablo, aksiyon, not, alt bilgi). Metinler önceki şablonlarla aynıdır; yalnız görünüm ortaklaştı. Tüm değerler dataTable/mailShell içinde kaçırılır.
  // Cihaz satırı: Seri No/Barkod · Marka/Model · Varlık Adı · sahip · Hostname · Last Logon (gerçek Excel sütunlarından, r._raw).
  const devHead = (ownerLabel) => ["Seri No / Barkod", "Marka / Model", "Varlık Adı", ownerLabel, "Hostname", "Last Logon"];
  const devRow = (r, owner, logon) => {
    const raw = r._raw || {};
    return [[r.serial, raw["Varlık Barkodu"]], [raw["Marka"], raw["Model"]], raw["Asset"], owner, r.hostname || "", logon];
  };

  // İnaktif Cihazlar — lokasyona gönderilen mail (kullanıcının paylaştığı şablon metni).
  const buildInaktifMailHtml = (loc, rows) => {
    const tableRows = rows.map((r) => devRow(r, ownerWithTitle(r), [r.actualUser, r.lastLogonTime].filter(Boolean).join(" · ")));
    return mailShell({
      eyebrow: "İNAKTİF CİHAZ",
      title: "KULLANICI İNAKTİF — DURUM BİLDİRİMİ GEREKLİ",
      greeting: "Merhabalar,",
      intro: "Lokasyonunuzda, aktif olmayan kullanıcıya ait aşağıda listelenen cihazların kayıtlı olduğu tespit edilmiştir. Yapılan kontrollerde, söz konusu cihazların sistem üzerinde aktif olarak kullanılmadığı görülmektedir.",
      bodyHtml:
        dataTable(devHead("Cihaz Sahibi"), tableRows) +
        `<p style="margin:12px 0 4px;">İlgili cihazın mevcut durumu hakkında tarafımıza bilgi verilmesini rica ederiz. Bu kapsamda;</p><ul style="margin:0 0 0 18px;padding:0;"><li>Cihazın tarafınızca teslim alınıp alınmadığı,</li><li>Kullanıcı tarafından iade edilip edilmediği,</li><li>Farklı bir kullanıcı tarafından kullanılıp kullanılmadığı</li></ul><p style="margin:8px 0 0;">hususlarında bilgilendirme yapılması önem arz etmektedir.</p>`,
      action: "Zimmet süreçlerinin doğru ve güncel şekilde yönetilebilmesi adına, gerekli geri bildiriminizi rica ederiz.",
      footer: MAIL_FOOTER,
    });
  };

  // "Kullanılıyor — Zimmet Aktarımı Gerekli": muhatap SCCM'den gelen gerçek kullanıcı, amaç zimmetin ona aktarılması.
  const buildInaktifUsageMailHtml = (rows) =>
    mailShell({
      eyebrow: "ZİMMET AKTARIMI",
      title: "ZİMMET TRANSFERİ GEREKLİ",
      greeting: "Merhabalar,",
      intro: "Sistem kayıtlarımıza göre, aşağıda listelenen cihaz(lar)ın kayıtlı sahibi inaktif durumda. Ancak son giriş kayıtlarına göre bu cihaz(lar)ı <strong>siz</strong> kullanıyorsunuz. Zimmet hareketlerinin doğru ve güncel şekilde yönetilebilmesi için, cihaz(lar)ın sizin adınıza zimmet transferinin yapılması gerekmektedir.",
      bodyHtml: dataTable(devHead("Kayıtlı Sahibi (Eski)"), rows.map((r) => devRow(r, ownerWithTitle(r), [r.actualUser, r.lastLogonTime].filter(Boolean).join(" · ")))),
      action: stepsBox("TuruncuHat üzerinden kayıt oluşturunuz:"),
      notes: [REC_NOTE],
      footer: MAIL_FOOTER,
    });

  // Zimmet Uyuşmazlığı — cihazı fiilen kullanan kişiye. Aynı kişiye hem "Zimmet Hatalı" hem "Mükerrer Çift Zimmet" (ve monitör)
  // kaydı düşebilir (aynı mail adresi): tek mailde bölümler halinde birleşir. Aktif kullanıcı r.userFull/r.userLabel'de (bkz. comparisonService.js).
  const zimmetDevRow = (r) => devRow(r, ownerWithTitle(r), [r.userFull || r.userLabel, r.lastLogonTime].filter(Boolean).join(" · "));
  const buildZimmetCombinedMailHtml = (mismatchRows, duplicateRows, monitorRows = []) => {
    // Monitör satırında Hostname = bağlı olduğu cihaz, Last Logon = monitörü kullanan kişi.
    const monitorEntries = monitorRows.flatMap((r) => (r.monitorDetails || []).filter((m) => m.ok === false));
    const monitorDevRow = (m) => [[m.serial, m.barkod], [m.marka, m.label], m.asset, m.assignedToFull || m.assignedTo, m.hostname || "", m.usedBy];
    const hasTransfer = mismatchRows.length > 0 || monitorEntries.length > 0;
    const hasDup = duplicateRows.length > 0;
    const TRANSFER_INTRO = "Sistem kayıtlarımıza göre, aşağıda listelenen cihaz(lar)ın kayıtlı sahibi farklı bir kişi görünüyor. Ancak son giriş kayıtlarına göre bu cihaz(lar)ı <strong>siz</strong> kullanıyorsunuz. Zimmet hareketlerinin doğru ve güncel şekilde yönetilebilmesi için, cihaz(lar)ın sizin adınıza zimmet transferinin yapılması gerekmektedir.";
    const DUP_INTRO = "Sistem kayıtlarımıza göre üzerinize <strong>birden fazla notebook</strong> zimmetli görünüyor (aşağıdaki liste). Zimmet envanterinin doğru tutulabilmesi için, kullanmadığınız cihaz(lar)ın iade edilmesi ya da gerçekten ihtiyaç duyduğunuz birden fazla cihaz varsa bu durumun gerekçesiyle birlikte bildirilmesi rica olunur.";
    const transferTable = dataTable(devHead("Kayıtlı Sahibi (Eski)"), [...mismatchRows.map(zimmetDevRow), ...monitorEntries.map(monitorDevRow)]);
    const dupTable = dataTable(devHead("Zimmetli Kişi"), duplicateRows.map(zimmetDevRow));
    return mailShell({
      eyebrow: hasTransfer ? "ZİMMET UYUŞMAZLIĞI" : "MÜKERRER ZİMMET",
      title: hasTransfer ? "ZİMMET TRANSFERİ GEREKLİ" : "MÜKERRER ÇİFT ZİMMET BİLDİRİMİ",
      greeting: "Merhabalar,",
      intro: hasTransfer ? TRANSFER_INTRO : DUP_INTRO,
      bodyHtml: hasTransfer
        ? transferTable + (hasDup ? mailSection("Mükerrer çift zimmet", `<p style="margin:0 0 8px;">Ayrıca, ${DUP_INTRO.charAt(0).toLowerCase()}${DUP_INTRO.slice(1)}</p>` + dupTable) : "")
        : dupTable,
      action: stepsBox("İşleminiz için lütfen aşağıdaki adımları izleyerek TuruncuHat üzerinden bir kayıt oluşturunuz:"),
      notes: [REC_NOTE],
      footer: MAIL_FOOTER,
    });
  };

  // Zimmet Uyuşmazlığı "Mail Gönder" — ÖNCEDEN demo stub'du (bkz. konuşma: "hepsi için gidiyor mu"
  // sorusuyla fark edildi, hiçbir zaman gerçek mail göndermiyordu). Artık gerçek gönderim: "Zimmet
  // Doğru" (ve "Zimmet Doğru + Monitör Uyuşmazlığı" — zimmet kısmı zaten doğru, sorun monitörde,
  // bu akışın konusu değil) HİÇBİR ZAMAN mail almaz. "Zimmet Hatalı" VE "Mükerrer Çift Zimmet"
  // ikisi de mail alır (bkz. konuşma: "hariç tutmayalım... çift kullanım var ise onu bilgisini
  // verip işlem yapalım") — ama farklı içerikle: Zimmet Hatalı "cihaz size zimmetli değil ama
  // kullanıyorsunuz, transfer edin" der; Mükerrer Çift Zimmet "üzerinize birden fazla notebook
  // zimmetli, gereksizleri iade edin" der. Aynı kişiye iki türden de kayıt varsa TEK mailde iki
  // ayrı bölüm halinde birleşir. Muhatap: cihazı fiilen kullanan kişi (SCCM'den r.mail) — bu,
  // Mükerrer durumunda da doğru kişidir çünkü o satırlarda zaten owner==user'dır.
  const isZimmetMailable = (r) => r.statusTag === "Zimmet Hatalı" || r.statusTag === "Mükerrer Çift Zimmet" || Boolean(r.monitorIssue);
  const handleZimmetMail = async () => {
    const deptName = currentDeptLabel;
    const targetRows = resolveTargetRows();
    // Zimmet Doğru + Monitör Uyuşmazlığı (kişi başkasının monitörünü kullanıyor) da mail alır: kişinin kendi zimmeti
    // doğru olsa bile, kullandığı monitörün transferi gerekir.
    const mismatchRows = targetRows.filter((r) => isZimmetMailable(r));

    if (mismatchRows.length === 0) {
      showToast("Seçili/filtrelenmiş kayıtlarda Zimmet Hatalı, Mükerrer Çift Zimmet ya da Monitör Uyuşmazlığı yok — gönderilecek kayıt bulunamadı (sorunsuz kayıtlara hiçbir zaman e-posta gitmez)");
      return;
    }

    const byActualUser = new Map();
    const noMailRows = [];
    mismatchRows.forEach((r) => {
      if (!r.mail) {
        noMailRows.push(r);
        return;
      }
      if (!byActualUser.has(r.mail)) byActualUser.set(r.mail, []);
      byActualUser.get(r.mail).push(r);
    });

    let sent = 0, failed = 0, duplicateSent = 0, extraIncluded = 0;
    const skipped = noMailRows.length;
    const details = noMailRows.map((r) => ({ location: r.userFull || r.userLabel || r.hostname, to: null, count: 1, ok: false, message: "SCCM'de bu kullanıcı için e-posta adresi bulunamadı" }));

    for (const [to, rows] of byActualUser) {
      const label = rows[0].userFull || rows[0].userLabel || "Bilinmeyen kullanıcı";
      // Mail kişi bazlı: o kişiye ait diğer türdeki kayıtlar (hedefte seçili/filtreli olmasa bile) aynı
      // mailde ikinci bölüm olarak yer alır — kişi hem zimmeti başkasında olan bir cihazı kullanıp hem de
      // mükerrer notebook'a sahipse tek mailde ikisini de görür (bkz. konuşma: ekran görüntüsündeki format).
      const personRows = zimmetRows.filter((r) => r.mail === to && isZimmetMailable(r));
      const mailRows = [...rows, ...personRows.filter((p) => !rows.some((r) => rowKeyOf(r) === rowKeyOf(p)))];
      const rowsMismatch = mailRows.filter((r) => r.statusTag === "Zimmet Hatalı");
      const rowsDuplicate = mailRows.filter((r) => r.statusTag === "Mükerrer Çift Zimmet");
      const rowsMonitor = mailRows.filter((r) => r.monitorIssue);
      const subject = (rowsMismatch.length || rowsMonitor.length) && rowsDuplicate.length
        ? "Zimmet Uyuşmazlığı ve Mükerrer Zimmet Bildirimi — Aksiyon Gerekli"
        : rowsDuplicate.length
        ? "Mükerrer Çift Zimmet Bildirimi — Aksiyon Gerekli"
        : "Zimmet Uyuşmazlığı — Kullandığınız Cihaz(lar) İçin Zimmet Transferi Gerekli";
      try {
        const result = await backendClient.sendMail({
          to,
          subject,
          text: `Aşağıdaki cihaz(lar) için aksiyon gereklidir:\n\n${mailRows.map((r) => `- ${r.serial} (${r.deviceModel || r.hostname}) — ${r.statusTag}${r.statusTag === "Zimmet Hatalı" ? `, kayıtlı eski sahibi: ${ownerWithTitle(r)}` : ""}`).join("\n")}`,
          html: buildZimmetCombinedMailHtml(rowsMismatch, rowsDuplicate, rowsMonitor),
        });
        if (result.ok) {
          sent += rows.length;
          // sayaçlar yalnızca SEÇİLİ/hedef kayıtları sayar; aynı kişiye ait ek kayıtlar ayrıca "extraIncluded" olarak raporlanır
          duplicateSent += rows.filter((r) => r.statusTag === "Mükerrer Çift Zimmet").length;
          extraIncluded += mailRows.length - rows.length;
          details.push({ location: label, to, count: rows.length, ok: true, message: "Gönderildi" });
          rows.forEach((r) => logDeviceAction(r, { type: "Mail", description: `${r.statusTag === "Mükerrer Çift Zimmet" ? "Mükerrer çift zimmet" : r.monitorIssue && r.statusTag !== "Zimmet Hatalı" ? "Monitör uyuşmazlığı" : "Zimmet uyuşmazlığı"} e-postası gönderildi (${label})`, mailSubject: subject, user: user?.username || "", reportId: activeReport, status: "Başarılı" }));
        } else {
          failed += rows.length;
          details.push({ location: label, to, count: rows.length, ok: false, message: result.message || "Gönderilemedi" });
        }
      } catch (err) {
        failed += rows.length;
        details.push({ location: label, to, count: rows.length, ok: false, message: err.message || "Gönderilemedi" });
      }
    }

    recordMailHistory({
      id: Date.now(),
      date: new Date().toLocaleString("tr-TR"),
      dept: deptName,
      report: "Zimmet Uyuşmazlığı",
      recipients: sent,
      status: failed > 0 ? "Kısmen Başarısız" : sent > 0 ? "Başarılı" : "Gönderilemedi",
      details,
    });

    const dupNote =
      (duplicateSent > 0 ? ` (${duplicateSent} kaydı mükerrer çift zimmet bildirimiydi)` : "") +
      (extraIncluded > 0 ? ` (+${extraIncluded} ilgili kayıt, aynı kişiye ait olduğu için aynı e-postaya eklendi)` : "");
    if (sent === 0 && failed === 0 && skipped > 0) {
      showToast(`❌ Gönderilemedi — ${skipped} kayıt için SCCM'de kullanıcı e-postası bulunamadı`);
    } else if (skipped > 0) {
      showToast(`⚠️ ${sent} kayıt gönderildi (${byActualUser.size} kullanıcıya)${dupNote}, ${skipped} kayıt için e-posta adresi bulunamadı${failed > 0 ? `, ${failed} kayıt başarısız` : ""}`);
    } else if (failed > 0 && sent === 0) {
      showToast(`❌ Gönderilemedi — ${failed} kayıt başarısız`);
    } else if (failed > 0) {
      showToast(`⚠️ ${sent} kayıt gönderildi, ${failed} kayıt başarısız`);
    } else {
      showToast(`✅ Başarılı — ${sent} kayıt, ${byActualUser.size} kullanıcıya e-posta gönderildi${dupNote}`);
    }
  };

  // (sccmByHostname yukarıda tanımlı — Disk Alanı zenginleştirmesi + LAKESIDE BSOD/Battery eşleşmesi ortak kullanır.)

  // Disk Alanı kritik mail şablonu — kullanıcının verdiği TR+EN metin birebir korunuyor,
  // sadece boş alanlar gerçek verilerle dolduruluyor (bkz. konuşma)
  const buildDiskMailText = (d) => {
    const sccm = sccmByHostname.get(String(d.owner || "").trim().toLowerCase());
    const hostname = d.owner;
    const deviceModel = sccm?.deviceModel || "";
    const freeSpace = d.model; // GB metni olarak zaten hazır — bkz. diskFileService.mapDiskRow
    const totalSpace = d.location; // GB metni olarak zaten hazır
    const location = sccm && sccm.location !== "—" ? sccm.location : "";
    const serial = sccm?.serial || "";
    const ouName = sccm?.ouName || "";
    const bitlocker = sccm?.bitlocker || "";

    return `Merhaba,

${hostname} hostname'li bilgisayarınızda C diski boş alanı kritik seviyenin altına düşmüştür.

Cihaz Bilgileri
Hostname: ${hostname}
Cihaz: ${deviceModel}
Boş C Disk Alanı: ${freeSpace}
Toplam Disk Alanı: ${totalSpace}
Lokasyon: ${location}
Seri No: ${serial}
OU Adı: ${ouName}
BitLocker Durumu: ${bitlocker}

Disk alanının bu seviyede kalması durumunda cihazınızda aşağıdaki sorunlarla karşılaşabilirsiniz:
•\tWindows ve güvenlik güncellemeleri indirilemez, cihazınız güncel olmayan ve güvenlik açıklarına maruz bir durumda kalır
•\tSistem performansında ciddi yavaşlamalar ve uygulamalarda donmalar yaşanabilir
•\tVPN ve kurumsal ağ bağlantılarında kesintiler veya erişim sorunları oluşabilir
•\tYeni dosya kaydetme, e-posta indirme ve senkronizasyon işlemleri başarısız olabilir
•\tİleri düzeyde, işletim sistemi kararsız hale gelip cihaz tamamen kullanılamaz duruma gelebilir
Olası veri kaybı ve iş kesintisini önlemek için lütfen en kısa sürede işlem yapınız.

Lütfen aşağıdaki adımları izleyerek TuruncuHat üzerinden kayıt oluşturunuz:
turuncuhat.mhy.com.tr → Oluştur → Kullanıcı Vakası → Açılan pencerede Servis kısmına tıklayıp arama bölümünden Lenovo yazıp seçin → Sonrasında diğer gerekli alanları doldurup kaydet ve çık butonuna basabilirsiniz.

Kayıt açıklama kısmına yukarıdaki cihaz bilgilerini (Hostname, Seri No vb.) eklemeniz, işleminizin daha hızlı değerlendirilmesine yardımcı olacaktır.

Regards,
IT Support
________________________________________

Hello,

The C drive free space on your device with hostname ${hostname} has dropped below the critical threshold.

Device Information
Hostname: ${hostname}
Device: ${deviceModel}
Free Space: ${freeSpace}
Total Disk Space: ${totalSpace}
Location: ${location}
Serial Number: ${serial}
OU Name: ${ouName}
BitLocker Enabled: ${bitlocker}

If the disk space remains at this level, you may experience the following issues on your device:
•\tWindows and security updates cannot be downloaded, leaving your device outdated and exposed to security vulnerabilities
•\tSignificant slowdowns and application freezes may occur
•\tVPN and corporate network connections may be interrupted or become inaccessible
•\tSaving new files, downloading emails, and synchronization tasks may fail
•\tIn severe cases, the operating system may become unstable and the device may become completely unusable
Please take action as soon as possible to prevent potential data loss and business disruption.

Please follow the steps below to create a ticket via TuruncuHat:
turuncuhat.mhy.com.tr → Create → User Incident → Click Service (search Lenovo then select) → Fill in the other necessary fields, then click Save and Exit.

Including the device information above (Hostname, Serial Number, etc.) in the ticket description will help expedite the process.

Regards,
IT Support`;
  };

  // Kritik Disk Alanı HTML sürümü — metin sürümüyle (buildDiskMailText) aynı TR+EN içerik, Ofis Bant düzeninde.
  const buildDiskMailHtml = (d) => {
    const sccm = sccmByHostname.get(String(d.owner || "").trim().toLowerCase());
    const hostname = d.owner;
    const free = d.model;
    const L = (tr) => ({
      tr,
      label: tr ? ["Hostname", "Cihaz", "Boş C Disk Alanı", "Toplam Disk Alanı", "Lokasyon", "Seri No", "OU Adı", "BitLocker Durumu"] : ["Hostname", "Device", "Free Space", "Total Disk Space", "Location", "Serial Number", "OU Name", "Bitlocker Enabled"],
    });
    const info = (lab) => infoTable([
      [lab[0], `<strong>${escapeHtml(hostname)}</strong>`],
      [lab[1], escapeHtml(sccm?.deviceModel || "")],
      [lab[2], `<strong style="color:#b42318;">${escapeHtml(free)}</strong>`],
      [lab[3], escapeHtml(d.location)],
      [lab[4], escapeHtml(sccm && sccm.location !== "—" ? sccm.location : "")],
      [lab[5], escapeHtml(sccm?.serial || "")],
      [lab[6], escapeHtml(sccm?.ouName || "")],
      [lab[7], escapeHtml(sccm?.bitlocker || "")],
    ]);
    const list = (items) => `<ul style="margin:0 0 0 18px;padding:0;">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
    const tr = mailShell({
      eyebrow: "DİSK ALANI",
      title: "KRİTİK DİSK ALANI",
      greeting: "Merhaba,",
      intro: `<strong>${escapeHtml(hostname)}</strong> hostname'li bilgisayarınızda C diski boş alanı kritik seviyenin altına düşmüştür.`,
      bodyHtml: info(L(true).label) + `<p style="margin:14px 0 4px;">Disk alanının bu seviyede kalması durumunda cihazınızda aşağıdaki sorunlarla karşılaşabilirsiniz:</p>` + list([
        "Windows ve güvenlik güncellemeleri indirilemez, cihazınız güncel olmayan ve güvenlik açıklarına maruz bir durumda kalır",
        "Sistem performansında ciddi yavaşlamalar ve uygulamalarda donmalar yaşanabilir",
        "VPN ve kurumsal ağ bağlantılarında kesintiler veya erişim sorunları oluşabilir",
        "Yeni dosya kaydetme, e-posta indirme ve senkronizasyon işlemleri başarısız olabilir",
        "İleri düzeyde, işletim sistemi kararsız hale gelip cihaz tamamen kullanılamaz duruma gelebilir",
      ]),
      action: "<strong>Olası veri kaybı ve iş kesintisini önlemek için lütfen en kısa sürede işlem yapınız.</strong>" + stepsBox("Lütfen aşağıdaki adımları izleyerek TuruncuHat üzerinden kayıt oluşturunuz:", "turuncuhat.mhy.com.tr → Oluştur → Kullanıcı Vakası → Açılan pencerede Servis kısmına tıklayıp arama bölümünden Lenovo yazıp seçin → Sonrasında diğer gerekli alanları doldurup kaydet ve çık butonuna basabilirsiniz."),
      notes: [REC_NOTE],
      footer: "Regards, IT Support",
    });
    const en = mailShell({
      eyebrow: "DISK SPACE",
      title: "CRITICAL DISK SPACE",
      greeting: "Hello,",
      intro: `The C drive free space on your device with hostname <strong>${escapeHtml(hostname)}</strong> has dropped below the critical threshold.`,
      bodyHtml: info(L(false).label) + `<p style="margin:14px 0 4px;">If the disk space remains at this level, you may experience the following issues on your device:</p>` + list([
        "Windows and security updates cannot be downloaded, leaving your device outdated and exposed to security vulnerabilities",
        "Significant slowdowns and application freezes may occur",
        "VPN and corporate network connections may be interrupted or become inaccessible",
        "Saving new files, downloading emails, and synchronization tasks may fail",
        "In severe cases, the operating system may become unstable and the device may become completely unusable",
      ]),
      action: "<strong>Please take action as soon as possible to prevent potential data loss and business disruption.</strong>" + stepsBox("Please follow the steps below to create a ticket via TuruncuHat:", "turuncuhat.mhy.com.tr → Create → User Incident → Click Service (search Lenovo then select) → Fill in the other necessary fields, then click Save and Exit."),
      notes: ["Including the device information above (Hostname, Serial Number, etc.) in the ticket description will help expedite the process."],
      footer: "Regards, IT Support",
    });
    return `${tr}<div style="max-width:760px;margin:22px 0;border-top:1px dashed #d0d7de;"></div>${en}`;
  };

  // Disk Alanı — gerçek gönderim: her kritik cihaz kendi (SCCM'den gelen gerçek) kullanıcı
  // mailine ayrı bir mail alır, İnaktif'teki lokasyon-mail eşleşmesine gerek yok (bkz. konuşma)
  const handleDiskMail = async () => {
    let sent = 0, failed = 0, skipped = 0;
    const details = [];
    const skippedRows = [];
    for (const d of resolveTargetRows()) {
      const sccm = sccmByHostname.get(String(d.owner || "").trim().toLowerCase());
      const to = sccm?.mail;
      if (!to) {
        skipped++;
        const reason = sccm ? "SCCM'de eşleşme var ama e-posta adresi yok" : "SCCM'de bu hostname bulunamadı";
        details.push({ location: d.owner, to: null, count: 1, ok: false, message: reason });
        skippedRows.push({
          Hostname: d.owner,
          "Boş C Disk Alanı": d.model,
          "Toplam Disk Alanı": d.location,
          Neden: reason,
        });
        continue;
      }
      try {
        const result = await backendClient.sendMail({
          to,
          subject: `Kritik Disk Alanı Uyarısı — ${d.owner}`,
          text: buildDiskMailText(d),
          html: buildDiskMailHtml(d),
        });
        if (result.ok) {
          sent++;
          details.push({ location: d.owner, to, count: 1, ok: true, message: "Gönderildi" });
          logDeviceAction(d, { type: "Mail", description: `Kritik disk alanı e-postası gönderildi`, mailSubject: `Kritik Disk Alanı Uyarısı — ${d.owner}`, user: user?.username || "", reportId: activeReport, status: "Başarılı" });
        } else {
          failed++;
          details.push({ location: d.owner, to, count: 1, ok: false, message: result.message || "Gönderilemedi" });
        }
      } catch (err) {
        failed++;
        details.push({ location: d.owner, to, count: 1, ok: false, message: err.message || "Gönderilemedi" });
      }
    }

    recordMailHistory({
      id: Date.now(),
      date: new Date().toLocaleString("tr-TR"),
      dept: currentDeptLabel,
      report: "Disk Alanı",
      recipients: sent,
      status: failed > 0 ? "Kısmen Başarısız" : sent > 0 ? "Başarılı" : "Gönderilemedi",
      details,
    });

    // Mail gönderilemeyen (SCCM eşleşmesi ya da maili olmayan) cihazların listesi ayrı bir
    // Excel olarak iniyor — Gönderim Geçmişi'ndeki özet satırına ek olarak, kimin takip
    // edilmesi gerektiği tek bakışta görülsün diye (bkz. konuşma)
    if (skippedRows.length > 0) {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(skippedRows), "Atlanan Cihazlar");
      XLSX.writeFile(wb, `Disk Alanı - Atlanan Cihazlar - ${new Date().toLocaleDateString("tr-TR").replace(/\./g, "-")}.xlsx`);
    }

    if (sent === 0 && failed === 0 && skipped > 0) {
      showToast(`❌ Gönderilemedi — ${skipped} cihaz için SCCM'de e-posta adresi bulunamadı`);
    } else if (skipped > 0) {
      showToast(`⚠️ ${sent} e-posta gönderildi, ${skipped} cihaz için e-posta adresi yok${failed > 0 ? `, ${failed} başarısız` : ""}`);
    } else if (failed > 0 && sent === 0) {
      showToast(`❌ Gönderilemedi — ${failed} e-posta başarısız`);
    } else if (failed > 0) {
      showToast(`⚠️ ${sent} e-posta gönderildi, ${failed} başarısız`);
    } else {
      showToast(`✅ Başarılı — ${sent} cihaza kritik disk alanı e-postası gönderildi`);
    }
  };

  // Madde 8, 9 — "Kullanılmayan Cihazlar" dinamik mail taslağı. Cihaz yaşına göre içerik değişir
  // (buildUnusedDeviceMailHtml içinde >5 yıl → merkeze iade, ≤5 yıl → lokasyonda değerlendir).
  // Alıcı: lokasyon mail grubu (bu cihazlar müdürlük/OBS zimmetinde, lokasyon sorumlusuna gider).
  const handleUnusedMail = async () => {
    const targetRows = resolveTargetRows();
    // Bütün lokasyon mailleri TEK kaynaktan — Lokasyon Mail Listesi (bkz. konuşma: İnaktif
    // Cihazlar'a ek olarak Kullanılmayan Cihazlar da buraya bağlandı).
    const byLocation = new Map();
    targetRows.forEach((r) => {
      const loc = r.location || "—";
      if (!byLocation.has(loc)) byLocation.set(loc, []);
      byLocation.get(loc).push(r);
    });

    let sent = 0, failed = 0, skipped = 0;
    const details = [];
    for (const [loc, rows] of byLocation) {
      const to = resolveMailForLocationName(realLokasyonMailAll, loc);
      const subject = unusedDeviceMailSubject(rows);
      if (!to) {
        skipped += rows.length;
        details.push({ location: loc, to: null, count: rows.length, ok: false, message: "Lokasyon E-posta Listesi'nde bu lokasyon için e-posta adresi bulunamadı" });
        continue;
      }
      const lines = rows.map((r) => `- ${r.hostname || r.serial} — ${r.deviceModel || ""} (${r.deviceAge != null ? r.deviceAge + " yıl" : "yaş bilinmiyor"})`).join("\n");
      try {
        const result = await backendClient.sendMail({
          to,
          subject: `${subject} — ${loc}`,
          text: `${loc} lokasyonunda ${rows.length} kullanılmayan (OBS zimmetli) cihaz tespit edildi:\n\n${lines}`,
          html: buildUnusedDeviceMailHtml(rows),
        });
        if (result.ok) {
          sent += rows.length;
          details.push({ location: loc, to, count: rows.length, ok: true, message: "Gönderildi" });
          rows.forEach((r) => logDeviceAction(r, { type: "Mail", description: `Kullanılmayan cihaz e-postası gönderildi (${loc})`, mailSubject: `${subject} — ${loc}`, user: user?.username || "", reportId: activeReport, status: "Başarılı" }));
        } else {
          failed += rows.length;
          details.push({ location: loc, to, count: rows.length, ok: false, message: result.message || "Gönderilemedi" });
        }
      } catch (err) {
        failed += rows.length;
        details.push({ location: loc, to, count: rows.length, ok: false, message: err.message || "Gönderilemedi" });
      }
    }

    recordMailHistory({
      id: Date.now(),
      date: new Date().toLocaleString("tr-TR"),
      dept: currentDeptLabel,
      report: "Kullanılmayan Cihazlar",
      recipients: sent,
      status: failed > 0 ? "Kısmen Başarısız" : sent > 0 ? "Başarılı" : "Gönderilemedi",
      details,
    });

    if (sent === 0 && failed === 0 && skipped > 0) {
      showToast(`❌ Gönderilemedi — ${skipped} kayıt için lokasyon e-posta eşleşmesi yok (Ayarlar'dan ekleyin)`);
    } else if (skipped > 0) {
      showToast(`⚠️ ${sent} kayıt gönderildi, ${skipped} kayıt için e-posta eşleşmesi yok${failed > 0 ? `, ${failed} başarısız` : ""}`);
    } else if (failed > 0 && sent === 0) {
      showToast(`❌ Gönderilemedi — ${failed} kayıt başarısız`);
    } else if (failed > 0) {
      showToast(`⚠️ ${sent} kayıt gönderildi, ${failed} başarısız`);
    } else {
      showToast(`✅ Başarılı — ${sent} kayıt için kullanılmayan cihaz e-postası gönderildi`);
    }
  };

  // Lokasyon Hostname ve IP Uyuşmazlığı — kişiye özel mail (lokasyon grubu değil), çünkü mesaj
  // doğrudan cihazı kullanan kişiye "computer name'ini BT ile güncelle" diyor (bkz. konuşma —
  // kullanıcının verdiği tam mail metni). Sadece uyuşmazlık (matched:false) satırlarına gider,
  // "Doğru Ofiste Kullanılıyor" satırları için gönderilecek bir şey yok.
  // Lokasyon/IP maili önizlemesi: gönderilecek HTML ile birebir aynı (buildLocationIpMail). Seçili uyuşmazlık kayıtlarından ilkini gösterir.
  const [mailPreviewData, setMailPreviewData] = useState(null);
  const previewLocationIpMail = () => {
    const r = resolveTargetRows().find((x) => !x.matched);
    if (!r) { showToast("Önizlenecek uyuşmazlık kaydı yok — listede (ya da seçimde) Hostname/IP uyuşmazlığı satırı bulunmuyor"); return; }
    const m = buildLocationIpMail(r);
    setMailPreviewData({ subject: m.subject, html: m.html, to: r.mail || "" });
  };

  const handleLocationIpMail = async () => {
    const targetRows = resolveTargetRows().filter((r) => !r.matched);
    if (targetRows.length === 0) {
      showToast("Seçili kayıtlarda gönderilecek uyuşmazlık yok — hepsi doğru ofiste kullanılıyor");
      return;
    }

    let sent = 0, failed = 0, skipped = 0;
    const details = [];
    for (const r of targetRows) {
      const to = r.mail;
      if (!to) {
        skipped += 1;
        details.push({ location: r.hostname, to: null, count: 1, ok: false, message: "SCCM'de bu cihaz için kullanıcı e-postası bulunamadı" });
        continue;
      }
      try {
        const result = await backendClient.sendMail({
          to,
          subject: buildLocationIpMail(r).subject,
          text: buildLocationIpMail(r).text,
          html: buildLocationIpMail(r).html,
        });
        if (result.ok) {
          sent += 1;
          details.push({ location: r.hostname, to, count: 1, ok: true, message: "Gönderildi" });
          logDeviceAction(r, { type: "Mail", description: `Lokasyon/IP uyuşmazlığı e-postası gönderildi (${r.hostname})`, mailSubject: buildLocationIpMail(r).subject, user: user?.username || "", reportId: activeReport, status: "Başarılı" });
        } else {
          failed += 1;
          details.push({ location: r.hostname, to, count: 1, ok: false, message: result.message || "Gönderilemedi" });
        }
      } catch (err) {
        failed += 1;
        details.push({ location: r.hostname, to, count: 1, ok: false, message: err.message || "Gönderilemedi" });
      }
    }

    recordMailHistory({
      id: Date.now(),
      date: new Date().toLocaleString("tr-TR"),
      dept: currentDeptLabel,
      report: "Lokasyon Hostname ve IP Uyuşmazlığı",
      recipients: sent,
      status: failed > 0 ? "Kısmen Başarısız" : sent > 0 ? "Başarılı" : "Gönderilemedi",
      details,
    });

    if (sent === 0 && failed === 0 && skipped > 0) {
      showToast(`❌ Gönderilemedi — ${skipped} cihaz için SCCM'de kullanıcı e-postası yok`);
    } else if (skipped > 0) {
      showToast(`⚠️ ${sent} e-posta gönderildi, ${skipped} cihaz için e-posta adresi yok${failed > 0 ? `, ${failed} başarısız` : ""}`);
    } else if (failed > 0 && sent === 0) {
      showToast(`❌ Gönderilemedi — ${failed} e-posta başarısız`);
    } else if (failed > 0) {
      showToast(`⚠️ ${sent} e-posta gönderildi, ${failed} başarısız`);
    } else {
      showToast(`✅ Başarılı — ${sent} kişiye lokasyon/IP uyuşmazlığı e-postası gönderildi`);
    }
  };

  // LAKESIDE (BSOD + Battery Health) ortak gönderim: her satırın hostname'i SCCM ile eşleştirilip
  // gerçek kullanıcının maili (SCCM LastLogonMail) bulunur, mail KİŞİYE gider — lokasyon mail
  // grubuna değil (bkz. konuşma: "onların excelinde kullanıcıların email adresi olacak, onlara o
  // şekilde direkt mail atılabilir"). Aynı kişinin birden fazla olayı varsa (ör. birden fazla BSOD
  // kaydı) tek mailde birleşir. SCCM'de eşleşmeyen veya maili olmayan kayıtlar için, rapor
  // ekranındaki "Mail alıcı(lar)" kutusuna adres girildiyse tek bir yedek mail; o da boşsa bu
  // kayıtlar "atlandı" olarak Gönderim Geçmişi'ne yazılır.
  const sendLakesideMailByLocation = async ({ targetRows, buildHtml, subjectFn, reportLabel, reportId, actionDesc, textFn }) => {
    const fallback = bsodMailTo.split(/[;,\s]+/).map((s) => s.trim()).filter((s) => /@/.test(s));

    const byLoc = new Map(); // mail -> rows[]
    const noRoute = [];
    targetRows.forEach((r) => {
      // Battery Health'te artık öncelik kendi Excel'indeki kullanıcı mailinde (r.ownerMail, bkz.
      // konuşma: "mail gönderirken de orada mail adresi var onu baz alacağız") — SCCM eşleşmesi
      // (sccmUserMail) sadece bu alan boşsa (ör. BSOD, ya da Username sütunu tanınamadıysa) yedek.
      const to = r.ownerMail || r.sccmUserMail || "";
      if (to) {
        if (!byLoc.has(to)) byLoc.set(to, []);
        byLoc.get(to).push(r);
      } else {
        noRoute.push(r);
      }
    });

    let sent = 0, failed = 0, skipped = 0;
    const details = [];
    const sentHosts = new Set();

    const sendOne = async (label, to, rows) => {
      const hasLabel = label && label !== "—";
      const subject = `${subjectFn(rows)}${hasLabel ? ` — ${label}` : ""}`;
      try {
        const result = await backendClient.sendMail({
          to,
          subject,
          text: textFn(rows),
          html: buildHtml(rows, { locationLabel: hasLabel ? label : "" }),
        });
        if (result.ok) {
          sent += rows.length;
          rows.forEach((r) => sentHosts.add(r.hostShort));
          details.push({ location: label, to, count: rows.length, ok: true, message: "Gönderildi" });
          rows.forEach((r) =>
            logDeviceAction(
              { hostname: r.hostShort, serial: "" },
              { type: "Mail", description: `${actionDesc}${hasLabel ? ` (${label})` : ""}`, mailSubject: subject, user: user?.username || "", reportId, status: "Başarılı" }
            )
          );
        } else {
          failed += rows.length;
          details.push({ location: label, to, count: rows.length, ok: false, message: result.message || "Gönderilemedi" });
        }
      } catch (err) {
        failed += rows.length;
        details.push({ location: label, to, count: rows.length, ok: false, message: err.message || "Gönderilemedi" });
      }
    };

    for (const [to, rows] of byLoc) await sendOne(rows[0].sccmUser || rows[0].hostShort || "Kullanıcı", to, rows);
    if (noRoute.length) {
      if (fallback.length) {
        await sendOne("Eşleşmeyen cihazlar", fallback.join(", "), noRoute);
      } else {
        skipped += noRoute.length;
        details.push({
          location: "Eşleşmeyen cihazlar",
          to: null,
          count: noRoute.length,
          ok: false,
          message: "SCCM'de kullanıcı e-postası bulunamadı — alıcı kutusu da boş",
        });
      }
    }

    recordMailHistory({
      id: Date.now(),
      date: new Date().toLocaleString("tr-TR"),
      dept: "LakeSide",
      report: reportLabel,
      recipients: sentHosts.size,
      status: failed > 0 ? "Kısmen Başarısız" : sent > 0 ? "Başarılı" : "Gönderilemedi",
      details,
    });

    if (sent === 0 && failed === 0 && skipped > 0) {
      showToast(`❌ Gönderilemedi — ${skipped} kayıt için SCCM'de kullanıcı e-postası yok. Üstteki kutuya yedek adres girebilirsiniz.`);
    } else if (skipped > 0) {
      showToast(`⚠️ ${sent} kayıt ${byLoc.size} kişiye gönderildi · ${skipped} kayıt eşleşmedi${failed ? ` · ${failed} başarısız` : ""}`);
    } else if (failed > 0 && sent === 0) {
      showToast(`❌ Gönderilemedi — ${failed} kayıt başarısız`);
    } else if (failed > 0) {
      showToast(`⚠️ ${sent} kayıt gönderildi · ${failed} başarısız`);
    } else {
      showToast(`✅ ${sent} kayıt · ${byLoc.size} kişiye${noRoute.length ? " + 1 yedek" : ""} e-posta gönderildi`);
    }
  };

  const handleBsodMail = async () => {
    const targetRows = resolveTargetRows();
    if (targetRows.length === 0) {
      showToast("Gönderilecek BSOD kaydı yok");
      return;
    }
    return sendLakesideMailByLocation({
      targetRows,
      buildHtml: buildBsodMailHtml,
      subjectFn: bsodMailSubject,
      reportLabel: "BSOD",
      reportId: "bsod",
      actionDesc: "BSOD çözüm adımları e-postası gönderildi",
      textFn: (rows) => `BSOD raporu: ${rows.length} olay, ${new Set(rows.map((r) => r.hostShort)).size} cihaz. Ayrıntı ve çözüm adımları HTML gövdededir.`,
    });
  };

  const handleBatteryMail = async () => {
    const targetRows = resolveTargetRows().filter((r) => r.batteryHealth != null && r.batteryHealth < 80);
    if (targetRows.length === 0) {
      showToast("Eşik altında (%80) batarya yok — gönderilecek kayıt yok");
      return;
    }
    return sendLakesideMailByLocation({
      targetRows,
      buildHtml: (rows) => buildBatteryMailHtml(rows),
      subjectFn: batteryMailSubject,
      reportLabel: "Battery Health",
      reportId: "battery-health",
      actionDesc: "Düşük batarya sağlığı bildirimi gönderildi",
      textFn: (rows) => `Battery Health: ${rows.length} cihazda düşük batarya sağlığı. Ayrıntı HTML gövdededir.`,
    });
  };

  // Rapor sayfalarındaki "Mail Gönder": en az bir mail gittiyse seçili kayıtlar temizlenir (aynı kayıtlar sonraki gönderimde yeniden gitmesin)
  const handleMailAndReset = async () => {
    const before = getMailSuccessCount();
    try {
      await handleMail();
    } finally {
      if (getMailSuccessCount() > before) setSelectedKeys(new Set());
    }
  };

  const handleMail = async () => {
    const deptName = currentDeptLabel;
    const reportName = REPORT_TYPES.find((r) => r.id === activeReport).name;

    if (activeReport === "disk") {
      return handleDiskMail();
    }
    if (isZimmet) {
      return handleZimmetMail();
    }
    if (isUnused) {
      return handleUnusedMail();
    }
    if (isLokasyonIp) {
      return handleLocationIpMail();
    }
    if (isBsod) {
      return handleBsodMail();
    }
    if (isBattery) {
      return handleBatteryMail();
    }

    const targetRows = resolveTargetRows();

    if (activeReport !== "inaktif") {
      recordMailHistory({
        id: Date.now(),
        date: new Date().toLocaleString("tr-TR"),
        dept: deptName,
        report: reportName,
        recipients: targetRows.length,
        status: "Başarılı",
        details: null,
      });
      showToast(`E-posta gönderme demo — ${targetRows.length} kayıt için e-posta hazırlandı, Gönderim Geçmişi'ne eklendi`);
      return;
    }

    // Bütün lokasyon mailleri artık TEK kaynaktan (Lokasyon Mail Listesi Excel'i, "Açık Lokasyon
    // Adı" eşleşmesiyle "Mail Adresi") geliyor — eski elle yapıştırılan metin kutusu İnaktif
    // Cihazlar için kullanılmıyor (bkz. konuşma).

    // Kullanıcı isteği: "X cihazı biri kullanıyorsa ona tıkladığımda mail şablonu değişsin, eski
    // şablon kalsın" — "Kullanılıyor — Zimmet Aktarımı Gerekli" satırları eski lokasyon bazlı akışa
    // hiç girmiyor, ayrı bir grupta doğrudan SCCM'den gelen gerçek kullanıcının mailine gidiyor.
    const actionRows = targetRows.filter((r) => needsInaktifAction(r.statusTag));
    const inactiveRows = targetRows.filter((r) => !needsInaktifAction(r.statusTag));

    const byLocation = new Map();
    inactiveRows.forEach((r) => {
      const loc = r.location || "—";
      if (!byLocation.has(loc)) byLocation.set(loc, []);
      byLocation.get(loc).push(r);
    });

    const byActualUser = new Map();
    actionRows.forEach((r) => {
      const key = r.actualUserMail || `__nomail__${r.actualUser || r.rowKey}`;
      if (!byActualUser.has(key)) byActualUser.set(key, []);
      byActualUser.get(key).push(r);
    });

    let sent = 0, failed = 0, skipped = 0;
    const details = [];
    for (const [loc, rows] of byLocation) {
      const to = resolveMailForLocationName(realLokasyonMailAll, loc);
      if (!to) {
        skipped += rows.length;
        details.push({ location: loc, to: null, count: rows.length, ok: false, message: "Lokasyon E-posta Listesi'nde bu lokasyon için e-posta adresi bulunamadı" });
        continue;
      }
      const lines = rows.map((r) => `- ${ownerWithTitle(r)} — ${r.serial} (${r.model})`).join("\n");
      try {
        const result = await backendClient.sendMail({
          to,
          subject: `İnaktif Cihazlar Raporu — ${loc}`,
          text: `${loc} lokasyonunda ${rows.length} inaktif cihaz kaydı bulundu:\n\n${lines}`,
          html: buildInaktifMailHtml(loc, rows),
        });
        if (result.ok) {
          sent += rows.length;
          details.push({ location: loc, to, count: rows.length, ok: true, message: "Gönderildi" });
          rows.forEach((r) => logDeviceAction(r, { type: "Mail", description: `İnaktif Cihazlar e-postası gönderildi (${loc})`, mailSubject: `İnaktif Cihazlar Raporu — ${loc}`, user: user?.username || "", reportId: activeReport, status: "Başarılı" }));
        } else {
          failed += rows.length;
          details.push({ location: loc, to, count: rows.length, ok: false, message: result.message || "Gönderilemedi" });
        }
      } catch (err) {
        failed += rows.length;
        details.push({ location: loc, to, count: rows.length, ok: false, message: err.message || "Gönderilemedi" });
      }
    }

    for (const rows of byActualUser.values()) {
      const to = rows[0].actualUserMail;
      const label = rows[0].actualUserFull || rows[0].actualUser || "Bilinmeyen kullanıcı";
      if (!to) {
        skipped += rows.length;
        details.push({ location: label, to: null, count: rows.length, ok: false, message: "SCCM'de bu kullanıcı için e-posta adresi bulunamadı" });
        continue;
      }
      const lines = rows.map((r) => `- ${r.serial} (${r.model}) — eski kayıtlı sahibi: ${ownerWithTitle(r)}`).join("\n");
      try {
        const result = await backendClient.sendMail({
          to,
          subject: "Zimmet Aktarımı Gerekli — Kullandığınız Cihaz(lar)",
          text: `Aşağıdaki cihaz(lar)ı kullandığınız tespit edildi, zimmetin size aktarılması için TuruncuHat üzerinden kayıt açmanız rica olunur:\n\n${lines}`,
          html: buildInaktifUsageMailHtml(rows),
        });
        if (result.ok) {
          sent += rows.length;
          details.push({ location: label, to, count: rows.length, ok: true, message: "Gönderildi" });
          rows.forEach((r) => logDeviceAction(r, { type: "Mail", description: `Zimmet aktarımı e-postası gönderildi (${label})`, mailSubject: "Zimmet Aktarımı Gerekli — Kullandığınız Cihaz(lar)", user: user?.username || "", reportId: activeReport, status: "Başarılı" }));
        } else {
          failed += rows.length;
          details.push({ location: label, to, count: rows.length, ok: false, message: result.message || "Gönderilemedi" });
        }
      } catch (err) {
        failed += rows.length;
        details.push({ location: label, to, count: rows.length, ok: false, message: err.message || "Gönderilemedi" });
      }
    }

    recordMailHistory({
      id: Date.now(),
      date: new Date().toLocaleString("tr-TR"),
      dept: deptName,
      report: reportName,
      recipients: sent,
      status: failed > 0 ? "Kısmen Başarısız" : sent > 0 ? "Başarılı" : "Gönderilemedi",
      details,
    });

    const groupSummary = `${byLocation.size} lokasyon grubu${byActualUser.size > 0 ? `, ${byActualUser.size} kullanıcıya zimmet aktarım e-postası` : ""}`;
    if (sent === 0 && failed === 0 && skipped > 0) {
      showToast(`❌ Gönderilemedi — ${skipped} kayıt için e-posta adresi/eşleşmesi bulunamadı (lokasyon grupları için Ayarlar'dan e-posta eşleşmesi ekleyin)`);
    } else if (skipped > 0) {
      showToast(`⚠️ ${sent} kayıt gönderildi, ${skipped} kayıt için e-posta adresi/eşleşmesi bulunamadı${failed > 0 ? `, ${failed} kayıt başarısız` : ""}`);
    } else if (failed > 0 && sent === 0) {
      showToast(`❌ Gönderilemedi — ${failed} kayıt başarısız`);
    } else if (failed > 0) {
      showToast(`⚠️ ${sent} kayıt gönderildi, ${failed} kayıt başarısız`);
    } else {
      showToast(`✅ Başarılı — ${sent} kayıt için e-posta gönderildi (${groupSummary})`);
    }
  };

  const saveSmtpConfig = async () => {
    try {
      await backendClient.saveSmtpConfig(smtpConfig);
      setBackendReachable(true);
      setSavedSecretHints((prev) => ({ ...prev, smtpPassword: Boolean(smtpConfig.password) || prev.smtpPassword }));
      showToast("SMTP ayarları backend'de şifreli olarak kaydedildi");
    } catch (err) {
      setBackendReachable(false);
      showToast(`Kaydedilemedi — ${err.message}`);
    }
  };

  const testSmtpConnection = async () => {
    setTestingSmtp(true);
    try {
      const result = await backendClient.testSmtpConnection(smtpConfig);
      setBackendReachable(true);
      showToast(result.message);
    } catch (err) {
      setBackendReachable(false);
      showToast(err.message);
    } finally {
      setTestingSmtp(false);
    }
  };

  const sendTestMail = async () => {
    if (!testMailTo.trim()) {
      showToast("Önce bir alıcı e-posta adresi girin");
      return;
    }
    setSendingTestMail(true);
    try {
      const result = await backendClient.sendMail({
        to: testMailTo.trim(),
        subject: "Varlık Takip — Test E-postası",
        text: "Bu, Varlık Takip uygulamasının SMTP ayarlarını doğrulamak için gönderdiği bir test e-postasıdır.",
        // Diğer maillerle aynı çerçeve (başlık bandı + logo): logonun gerçek mailde görünüp görünmediğini de buradan denetleyebilirsiniz
        html: mailShell({
          eyebrow: "SMTP TESTİ",
          title: "TEST MAİLİ",
          greeting: "Merhaba,",
          intro: "Bu, Varlık Takip uygulamasının SMTP ayarlarını doğrulamak için gönderdiği bir test e-postasıdır. Bu e-postayı başlık bandında logoyla birlikte görüyorsanız e-posta ayarları ve şablon düzgün çalışıyor demektir.",
          footer: MAIL_FOOTER,
        }),
      });
      setBackendReachable(true);
      showToast(result.ok ? `Test e-postası gönderildi (${testMailTo.trim()})` : result.message);
    } catch (err) {
      setBackendReachable(false);
      showToast(err.message);
    } finally {
      setSendingTestMail(false);
    }
  };

  const saveFileSourceConfig = async () => {
    if (!fileSourceConfig.folderPath.trim()) {
      showToast("Önce klasör yolunu girin");
      return;
    }
    try {
      await backendClient.saveFileSourceConfig(fileSourceConfig);
      setBackendReachable(true);
      showToast("Dosya kaynağı ayarları kaydedildi");
    } catch (err) {
      setBackendReachable(false);
      showToast(`Kaydedilemedi — ${err.message}`);
    }
  };

  // Madde 7 — "Kullanılmayan Cihazlar" eşiği. (LakeSide batarya artık dosya seçimiyle geliyor —
  // klasör/ayar yok, bkz. handleManualBatteryFile.)
  const saveAppConfigSettings = async () => {
    setSavingAppConfig(true);
    try {
      const saved = await backendClient.saveAppConfig({ unusedStaleDays: staleDays });
      if (saved && typeof saved === "object") {
        setAppConfig({ unusedStaleDays: Number(saved.unusedStaleDays) > 0 ? Number(saved.unusedStaleDays) : DEFAULT_STALE_DAYS });
      }
      showToast("Kullanılmayan Cihazlar ayarları kaydedildi");
    } catch (err) {
      showToast(`Kaydedilemedi — ${err.message}`);
    } finally {
      setSavingAppConfig(false);
    }
  };

  // Zamanlanmış Otomatik Tarama — Ayarlar > Veri Input sekmesi ilk açıldığında backend'deki
  // gerçek durumu çeker (bkz. konuşma: önceden sadece görsel demoydu, gerçek arka planda tarayan
  // backend/src/anomalyScheduler.js'e bağlandı).
  const loadAnomalySchedule = async () => {
    try {
      const cfg = await backendClient.getAnomalySchedule();
      setScheduleConfig({
        enabled: !!cfg.enabled,
        cadence: cfg.cadence || "weekly",
        day: cfg.day || "Pazartesi",
        time: cfg.time || "09:00",
        recipients: (cfg.recipients || []).join(", "),
      });
      setScheduleStatus({ lastRunAt: cfg.lastRunAt, knownCount: cfg.knownCount || 0 });
    } catch {
      // Backend'e ulaşılamıyorsa sessizce yerel varsayılanlarla kalınır — Ayarlar ekranı açık.
    } finally {
      setScheduleLoaded(true);
    }
  };

  const saveAnomalySchedule = async () => {
    setSavingSchedule(true);
    try {
      const recipients = scheduleConfig.recipients.split(/[;,\s]+/).map((s) => s.trim()).filter((s) => /@/.test(s));
      const saved = await backendClient.saveAnomalySchedule({
        enabled: scheduleConfig.enabled,
        cadence: scheduleConfig.cadence,
        day: scheduleConfig.day,
        time: scheduleConfig.time,
        recipients,
      });
      setScheduleConfig((prev) => ({ ...prev, recipients: recipients.join(", ") }));
      setScheduleStatus({ lastRunAt: saved.lastRunAt, knownCount: saved.knownCount || 0 });
      showToast(scheduleConfig.enabled && recipients.length === 0 ? "⚠️ Kaydedildi — ama alıcı e-posta girilmediği için tarama e-posta göndermeyecek" : "✅ Otomatik tarama ayarları kaydedildi");
    } catch (err) {
      showToast(`❌ Kaydedilemedi — ${err.message}`);
    } finally {
      setSavingSchedule(false);
    }
  };

  const loadUstYonetimList = async () => {
    try {
      const res = await backendClient.getUstYonetimListForSettings();
      setUstYonetimText((res.emails || []).join("\n"));
    } catch {
      // Backend'e ulaşılamıyorsa sessizce boş bırakılır — Ayarlar ekranı yine de açık kalır.
    } finally {
      setUstYonetimLoaded(true);
    }
  };

  const saveUstYonetimList = async () => {
    setSavingUstYonetim(true);
    try {
      const emails = ustYonetimText.split("\n").map((s) => s.trim()).filter((s) => /@/.test(s));
      await backendClient.saveUstYonetimList(emails);
      setUstYonetimText(emails.join("\n"));
      showToast(`✅ Üst yönetim istisna listesi kaydedildi — ${emails.length} e-posta`);
    } catch (err) {
      showToast(`❌ Kaydedilemedi — ${err.message}`);
    } finally {
      setSavingUstYonetim(false);
    }
  };

  const runAnomalyScanNow = async () => {
    setRunningScanNow(true);
    try {
      const result = await backendClient.runAnomalyScanNow();
      setScheduleStatus({ lastRunAt: new Date().toISOString(), knownCount: result.totalAnomalies });
      if (result.isFirstRun) {
        showToast(`✅ İlk tarama tamamlandı — ${result.totalAnomalies} mevcut uyuşmazlık baz alındı (bundan sonrakiler "yeni" sayılacak)`);
      } else if (result.newCount === 0) {
        showToast(`✅ Tarama tamamlandı — yeni uyuşmazlık yok (${result.totalAnomalies} toplam)`);
      } else {
        showToast(`✅ Tarama tamamlandı — ${result.newCount} yeni uyuşmazlık için mail ${result.mailResult ? "gönderildi" : "gönderilemedi (alıcı/SMTP eksik)"}`);
      }
    } catch (err) {
      showToast(`❌ Tarama başarısız — ${err.message}`);
    } finally {
      setRunningScanNow(false);
    }
  };

  const testFileSourceConnection = async () => {
    if (!fileSourceConfig.folderPath.trim()) {
      showToast("Önce klasör yolunu girin");
      return;
    }
    setTestingFileSource(true);
    try {
      const result = await backendClient.testFileSourceConnection(fileSourceConfig);
      setBackendReachable(true);
      setFileSourceTestResult(result);
      showToast(result.message);
    } catch (err) {
      setBackendReachable(false);
      setFileSourceTestResult({ ok: false, message: err.message });
      showToast(err.message);
    } finally {
      setTestingFileSource(false);
    }
  };

  const pickFolder = async () => {
    if (!window.varlikTakipDesktop?.pickFolder) {
      showToast("Klasör seçme sadece masaüstü uygulamasında (.exe) çalışır — geliştirme modunda yolu elle yazmalısınız");
      return;
    }
    const folder = await window.varlikTakipDesktop.pickFolder();
    if (folder) setFileSourceConfig({ folderPath: folder });
  };

  // LakeSide Battery Health — artık backend'e KALICI yükleniyor (bkz. konuşma: "gömülü olsun her
  // seferinde yüklemeyelim"), Ofis Bant Genişliği ile aynı desen (loadRealBantData/handleManualBantFile).
  const loadRealBatteryData = async ({ silent = false } = {}) => {
    setLoadingBattery(true);
    try {
      const { fileName, modifiedAt, rows } = await fetchBatteryRowsFromFile();
      setBackendReachable(true);
      setRealBatteryAll(rows);
      setRealBatteryMeta({ fileName, modifiedAt });
      if (!silent) showToast(`${fileName} içinden ${rows.length} batarya kaydı yüklendi`);
    } catch (err) {
      if (!silent) showToast(err.message || "Dosyadan veri yüklenemedi");
    } finally {
      setLoadingBattery(false);
      setBatteryLoaded(true);
    }
  };

  const handleManualBatteryFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLoadingBattery(true);
    try {
      const up = await uploadBatteryFile(file);
      const { fileName, modifiedAt, rows } = up;
      // Sütun kontrolü: eksik/benzer-ama-tanınmayan başlık varsa kullanıcıya bildir (sessizce boş rapor olmasın)
      const c = up.check;
      const colWarn = c && (!c.ok || c.missingRecommended.length > 0 || c.nearMisses.length > 0) ? `
${c.ok ? "⚠️" : "❌"} ${up.checkSummary}` : "";
      setBackendReachable(true);
      setRealBatteryAll(rows);
      setRealBatteryMeta({ fileName, modifiedAt });
      setBatteryLoaded(true);
      showToast(`${fileName} içinden ${rows.length} batarya kaydı yüklendi ve kalıcı kaydedildi${colWarn}`);
    } catch (err) {
      showToast(`Dosya yüklenemedi: ${err.message}`);
    } finally {
      setLoadingBattery(false);
    }
  };

  const loadRealInaktifData = async ({ silent = false } = {}) => {
    setLoadingRealInaktif(true);
    try {
      const { fileName, modifiedAt, rows } = await fetchInaktifRowsFromFile();
      setBackendReachable(true);
      setRealInaktifAll(rows);
      setRealInaktifMeta({ fileName, modifiedAt });
      if (!silent) showToast(`${fileName} içinden ${rows.length} kayıt yüklendi`);
    } catch (err) {
      setBackendReachable(false);
      if (!silent) showToast(err.message || "Dosyadan veri yüklenemedi");
    } finally {
      setLoadingRealInaktif(false);
    }
  };

  const loadRealDiskData = async ({ silent = false } = {}) => {
    setLoadingRealDisk(true);
    try {
      const { fileName, modifiedAt, rows } = await fetchDiskRowsFromFile();
      setBackendReachable(true);
      setRealDiskAll(rows);
      setRealDiskMeta({ fileName, modifiedAt });
      if (!silent) showToast(`${fileName} içinden ${rows.length} kayıt yüklendi`);
    } catch (err) {
      setBackendReachable(false);
      if (!silent) showToast(err.message || "Dosyadan veri yüklenemedi");
    } finally {
      setLoadingRealDisk(false);
    }
  };

  const loadRealSccmData = async ({ silent = false } = {}) => {
    setLoadingRealSccm(true);
    try {
      const { fileName, modifiedAt, rows } = await fetchSccmRowsFromFile();
      setBackendReachable(true);
      setRealSccmAll(rows);
      setRealSccmMeta({ fileName, modifiedAt });
      if (!silent) showToast(`${fileName} içinden ${rows.length} kayıt yüklendi`);
    } catch (err) {
      setBackendReachable(false);
      if (!silent) showToast(err.message || "Dosyadan veri yüklenemedi");
    } finally {
      setLoadingRealSccm(false);
    }
  };

  const loadRealLokasyonMailData = async ({ silent = false } = {}) => {
    setLoadingRealLokasyonMail(true);
    try {
      const { fileName, modifiedAt, rows } = await fetchLokasyonMailRowsFromFile();
      setBackendReachable(true);
      setRealLokasyonMailAll(rows);
      setRealLokasyonMailMeta({ fileName, modifiedAt });
      if (!silent) showToast(`${fileName} içinden ${rows.length} lokasyon kaydı yüklendi`);
    } catch (err) {
      setBackendReachable(false);
      if (!silent) showToast(err.message || "Dosyadan veri yüklenemedi");
    } finally {
      setLoadingRealLokasyonMail(false);
    }
  };

  const loadRealThData = async ({ silent = false } = {}) => {
    setLoadingRealTh(true);
    try {
      const { fileName, modifiedAt, rows } = await fetchThRowsFromFile();
      setBackendReachable(true);
      setRealThAll(rows);
      setRealThMeta({ fileName, modifiedAt });
      if (!silent) showToast(`${fileName} içinden ${rows.length} kayıt yüklendi`);
    } catch (err) {
      // Klasör senkronu kurulmadıysa (fileSource tanımsız) sessizce geç — manuel yükleme hâlâ kullanılabilir
      if (!silent) showToast(err.message || "Dosyadan veri yüklenemedi");
    } finally {
      setLoadingRealTh(false);
    }
  };

  const loadRealMonitorData = async ({ silent = false } = {}) => {
    setLoadingRealMonitor(true);
    try {
      const { fileName, modifiedAt, rows } = await fetchMonitorRowsFromFile();
      setBackendReachable(true);
      setRealMonitorAll(rows);
      setRealMonitorMeta({ fileName, modifiedAt });
      if (!silent) showToast(`${fileName} içinden ${rows.length} kayıt yüklendi`);
    } catch (err) {
      if (!silent) showToast(err.message || "Dosyadan veri yüklenemedi");
    } finally {
      setLoadingRealMonitor(false);
    }
  };

  // LAKESIDE Weekly BSOD — diğer raporlar gibi backend senkron klasöründen otomatik yükler
  // (bkz. konuşma: elle her seferinde eklemek zorunda kalınıyordu). Klasör senkronu yoksa
  // backend hata döner, sessizce yutulur; manuel dosya seçimi (handleManualBsodFile) yedek kalır.
  const loadRealBsodData = async ({ silent = false } = {}) => {
    try {
      const { fileName, modifiedAt, rows } = await fetchBsodRowsFromFile();
      setBackendReachable(true);
      setRealBsodAll(rows);
      setRealBsodMeta({ fileName, modifiedAt });
      if (!silent) showToast(`${fileName} içinden ${rows.length} BSOD kaydı yüklendi`);
    } catch (err) {
      if (!silent) showToast(err.message || "Dosyadan veri yüklenemedi");
    }
  };

  // Canlıya (otomatik SharePoint klasör senkronu) uzun süre geçilemeyeceği için, Ayarlar'dan
  // doğrudan bir Excel dosyası seçip elle yükleme yolu — backend/klasör yolu hiç gerekmez,
  // dosya tamamen tarayıcıda okunup aynı mapInaktifRow/mapDiskRow ile satıra çevrilir (bkz. konuşma)
  const handleManualInaktifFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    persistImport("inaktif", file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", dense: true });
        const idx = Math.min(1, wb.SheetNames.length - 1); // gerçek veri 2. sheet'te (bkz. backend/src/routes/reports.js)
        const sheet = wb.Sheets[wb.SheetNames[idx]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 0 });
        const rows = raw.map(mapInaktifRow);
        setRealInaktifAll(rows);
        setRealInaktifMeta({ fileName: file.name, modifiedAt: new Date(file.lastModified).toISOString() });
        setBackendReachable(true);
        showToast(`${file.name} içinden ${rows.length} kayıt elle yüklendi`);
      } catch (err) {
        showToast(`Dosya okunamadı: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleManualDiskFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    persistImport("disk", file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", dense: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        // Gerçek sütun başlıkları 1. satırda değil, 6. satırda (range: 5) — bkz. backend/src/routes/reports.js
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 5 });
        const rows = raw.map(mapDiskRow);
        setRealDiskAll(rows);
        setRealDiskMeta({ fileName: file.name, modifiedAt: new Date(file.lastModified).toISOString() });
        setBackendReachable(true);
        showToast(`${file.name} içinden ${rows.length} kayıt elle yüklendi`);
      } catch (err) {
        showToast(`Dosya okunamadı: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleManualSccmFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    persistImport("sccm", file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", dense: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        // Gerçek sütun başlıkları 1. satırda değil, 4. satırda (range: 3) — bkz. backend/src/routes/reports.js
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 3 });
        const rows = raw.map(mapSccmRow);
        setRealSccmAll(rows);
        setRealSccmMeta({ fileName: file.name, modifiedAt: new Date(file.lastModified).toISOString() });
        setBackendReachable(true);
        showToast(`${file.name} içinden ${rows.length} kayıt elle yüklendi`);
      } catch (err) {
        showToast(`Dosya okunamadı: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // TuruncuHat (TH) — gerçek örnek dosyadan doğrulandı (bkz. konuşma): sütun şeması İnaktif
  // Cihazlar ile birebir aynı, başlık satırı ilk satırda (range: 0).
  const handleManualThFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    persistImport("th", file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", dense: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 0 });
        const rows = mapThRows(raw);
        setRealThAll(rows);
        setRealThMeta({ fileName: file.name, modifiedAt: new Date(file.lastModified).toISOString() });
        showToast(`${file.name} içinden ${rows.length} kayıt yüklendi${rows.length === 0 ? " (dosya boş)" : ""}`);
      } catch (err) {
        showToast(`Dosya okunamadı: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Elle seçilen dosyayı backend'e de kaydet: uygulama kapanıp açılsa ya da sayfa yenilense bile rapor
  // ekranları veriyi otomatik geri yükler (bkz. backend/src/importStore.js). Başarısız olursa (ör. yetki)
  // bu oturumdaki veri yine de kullanılır, kullanıcıya uyarı gösterilir.
  const persistImport = (kind, file) => {
    backendClient
      .importFile(kind, file)
      .then((res) => {
        // Sütun kontrolü: eksik/benzer-ama-tanınmayan başlık varsa kullanıcıya hemen bildir (sessizce boş rapor olmasın)
        const c = res?.check;
        if (c && (!c.ok || c.missingRecommended.length > 0 || c.nearMisses.length > 0)) showToast(`${c.ok ? "⚠️" : "❌"} ${res.checkSummary}`);
      })
      .catch((err) => showToast(`Dosya bu oturumda yüklendi ama kalıcı kaydedilemedi: ${err.message}`));
  };

  // Lokasyon Mail Listesi — başlık satırı ilk satırda (Lokasyon Kodu, Açık Lokasyon Adı, Mail Adresi, IP_Address);
  // klasör senkronu olmayan ortamlarda (ör. tek exe) elle yüklenebilsin diye.
  const handleManualLokasyonMailFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    persistImport("lokasyon", file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", dense: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 0 });
        const rows = mapLokasyonMailRows(raw);
        setRealLokasyonMailAll(rows);
        setRealLokasyonMailMeta({ fileName: file.name, modifiedAt: new Date(file.lastModified).toISOString() });
        showToast(`${file.name} içinden ${rows.length} lokasyon kaydı yüklendi${rows.length === 0 ? " (dosya boş)" : ""}`);
      } catch (err) {
        showToast(`Dosya okunamadı: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Monitor Raporu — gerçek örnek dosyadan doğrulandı: "Attached Monitors Report", başlık satırı
  // 2. satırda (range: 1).
  const handleManualMonitorFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    persistImport("monitor", file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", dense: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 1 });
        const rows = mapMonitorRows(raw);
        setRealMonitorAll(rows);
        setRealMonitorMeta({ fileName: file.name, modifiedAt: new Date(file.lastModified).toISOString() });
        showToast(`${file.name} içinden ${rows.length} kayıt yüklendi${rows.length === 0 ? " (dosya boş)" : ""}`);
      } catch (err) {
        showToast(`Dosya okunamadı: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Ofis Bant Genişliği — monitoring aracının UTF-16 + TAB ayraçlı CSV export'u. Kullanıcı isteği:
  // "bir kez yükleyeyim bir daha yüklemekle uğraşmayayım" — dosya artık backend'e KALICI olarak
  // yükleniyor (uploadBantFile), tekrar tekrar seçmeye gerek yok; sayfa/oturum yenilense de
  // loadRealBantData ile otomatik geri gelir.
  const loadRealBantData = async ({ silent = false } = {}) => {
    setLoadingBant(true);
    try {
      const { fileName, modifiedAt, rows } = await fetchBantRowsFromFile();
      setBackendReachable(true);
      setRealBantAll(rows);
      setRealBantMeta({ fileName, modifiedAt });
      if (!silent) showToast(`${fileName} içinden ${rows.length} bant genişliği kaydı yüklendi`);
    } catch (err) {
      if (!silent) showToast(err.message || "Dosyadan veri yüklenemedi");
    } finally {
      setLoadingBant(false);
      setBantLoaded(true);
    }
  };

  const handleManualBantFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLoadingBant(true);
    try {
      const up = await uploadBantFile(file);
      const { fileName, modifiedAt, rows } = up;
      // Sütun kontrolü: eksik/benzer-ama-tanınmayan başlık varsa kullanıcıya bildir (sessizce boş rapor olmasın)
      const c = up.check;
      const colWarn = c && (!c.ok || c.missingRecommended.length > 0 || c.nearMisses.length > 0) ? `
${c.ok ? "⚠️" : "❌"} ${up.checkSummary}` : "";
      setBackendReachable(true);
      setRealBantAll(rows);
      setRealBantMeta({ fileName, modifiedAt });
      setBantLoaded(true);
      showToast(`${fileName} içinden ${rows.length} bant genişliği kaydı yüklendi ve kalıcı kaydedildi${colWarn}`);
    } catch (err) {
      showToast(`Dosya yüklenemedi: ${err.message}`);
    } finally {
      setLoadingBant(false);
    }
  };

  const handleManualBsodFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    persistImport("bsod", file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", dense: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        // "Weekly_BSOD" dosyasında 1. satır boş, başlık 2. satırda → range: 1
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 1 });
        const rows = mapBsodRows(raw);
        setRealBsodAll(rows);
        setRealBsodMeta({ fileName: file.name, modifiedAt: new Date(file.lastModified).toISOString() });
        showToast(`${file.name} içinden ${rows.length} BSOD kaydı yüklendi${rows.length === 0 ? " (dosya boş)" : ""}`);
      } catch (err) {
        showToast(`Dosya okunamadı: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Lokasyon→mail eşleşmesini elle metin kutusuna yapıştırmak yerine doğrudan bir Excel/CSV
  // dosyasından da doldurabiliriz — "Lokasyon" ve "Mail"e benzer iki sütun aranır, bulunamazsa
  // ilk iki sütun kullanılır. Kaydetmeden önce yine textarea'da gözden geçirilip düzenlenebilir.
  const handleMailGroupsFileImport = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", dense: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (raw.length === 0) {
          showToast("Dosyada satır bulunamadı");
          return;
        }
        const keys = Object.keys(raw[0]);
        const locKey = keys.find((k) => /lokasyon|location|lbs/i.test(k)) || keys[0];
        const mailKey = keys.find((k) => /mail|e-?posta/i.test(k)) || keys[1];
        const lines = raw
          .map((r) => `${String(r[locKey] ?? "").trim()}\t${String(r[mailKey] ?? "").trim()}`)
          .filter((line) => line.split("\t").every(Boolean));
        if (lines.length === 0) {
          showToast("Lokasyon/mail sütunları tanınamadı — dosyada bu bilgileri içeren iki sütun olmalı");
          return;
        }
        setMailGroupsText(lines.join("\n"));
        showToast(`${lines.length} eşleşme dosyadan okundu — kaydetmeden önce aşağıda gözden geçirebilirsiniz`);
      } catch (err) {
        showToast(`Dosya okunamadı: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // İnaktif Cihazlar/Disk Alanı sekmesine her girişte otomatik yükle — manuel "Yükle" butonuna
  // basmaya gerek kalmasın. Klasör yolu bilgisi artık Ayarlar korumalı olduğu için frontend'de
  // (fileSourceConfig) her zaman bilinmeyebilir — backend zaten kendi kayıtlı klasörünü kullanıyor
  // (bkz. backend/src/routes/reports.js), o yüzden burada frontend'in bilip bilmediğine bakmadan
  // her zaman deneriz; klasör tanımsızsa backend hata döner, sessizce yutulur (silent: true)
  useEffect(() => {
    if (activeReport === "inaktif") {
      loadRealInaktifData({ silent: true });
      // İnaktif Cihazlar artık SCCM ile karşılaştırılıyor (kim fiilen kullanıyor?) — bkz. konuşma,
      // inaktifComparisonService.js. TH'ye ihtiyaç yok, liste zaten TH'den gelen inaktif listesi.
      loadRealSccmData({ silent: true });
      // Mail Gönder butonu artık lokasyon mailini Lokasyon Mail Listesi'nden (Açık Lokasyon Adı
      // eşleşmesiyle) çekiyor — bkz. konuşma: "Bütün lokasyon mailleri tek bir yerden çekilecek".
      loadRealLokasyonMailData({ silent: true });
    }
    if (activeReport === "disk") loadRealDiskData({ silent: true });
    // Madde 7 — "Kullanılmayan Cihazlar": OBS zimmetli (TH) ama SCCM'de yok / son giriş çok eski
    // cihazlar. TH + SCCM birlikte gerekir (bkz. unusedDeviceService.js).
    if (activeReport === "kullanilmayan") {
      loadRealThData({ silent: true });
      loadRealSccmData({ silent: true });
      loadRealMonitorData({ silent: true });
      loadRealInaktifData({ silent: true });
      loadRealDiskData({ silent: true });
      // Mail Gönder artık lokasyon mailini Lokasyon Mail Listesi'nden çekiyor (İnaktif Cihazlar'a
      // ek olarak — bkz. konuşma).
      loadRealLokasyonMailData({ silent: true });
    }
    if (activeReport === "zimmet") {
      loadRealSccmData({ silent: true });
      // TuruncuHat/Monitor Raporu artık diğerleri gibi otomatik yükleniyor (bkz. konuşma) —
      // klasör senkronu kurulmadıysa backend sessizce hata döner, manuel yükleme hâlâ kullanılabilir.
      loadRealThData({ silent: true });
      loadRealMonitorData({ silent: true });
    }
    // Lokasyon Hostname ve IP Uyuşmazlığı — SCCM (hostname+IP) ve Lokasyon Mail Listesi
    // (lokasyon kodu+IP) çapraz karşılaştırılır (bkz. konuşma).
    if (activeReport === "lokasyon-ip") {
      loadRealSccmData({ silent: true });
      loadRealLokasyonMailData({ silent: true });
    }
    // LAKESIDE BSOD / Battery Health: hostname -> SCCM eşleşmesiyle lokasyon/kullanıcı bilgisi
    // getirilip mail lokasyon bazlı gönderilebilsin diye SCCM da yüklenir.
    if (activeReport === "bsod" || activeReport === "battery-health") {
      loadRealSccmData({ silent: true });
    }
    if (activeReport === "bsod") loadRealBsodData({ silent: true });
    // Yeni Kurulum Kaydı formundaki LOKASYON listesi için mevcut lokasyonlar SCCM/TH'den derlenir.
    if (activeReport === "yeni-kurulum") {
      loadRealSccmData({ silent: true });
      loadRealThData({ silent: true });
    }
    // Kapatma Onayı Bekleyen Kayıtlar — hatırlatma mailindeki Barkod/Varlık Adı seri no üzerinden
    // TuruncuHat'tan geliyor (bkz. konuşma: "Barkod ve Varlık Adı hep boş geliyor"). Bu ekrana
    // doğrudan girilip Zimmet/Kullanılmayan/Yeni Kurulum hiç ziyaret edilmemişse realThAll boş
    // kalıyor, TH bulunamıyor gibi görünüyordu — asıl sorun eşleştirme değil, veri hiç yüklenmemişti.
    if (activeReport === "kapatma-onayi") {
      loadRealThData({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport, fileSourceConfig.folderPath]);

  // Ofis Bant Genişliği — backend'de kalıcı yüklüyse (Ayarlar > Veri Input'tan tek seferlik
  // yüklenmiş) rapor sayfası ziyaret edildiğinde otomatik gelir, tekrar dosya seçmeye gerek kalmaz.
  useEffect(() => {
    if (activeNetworkView === "bant-genisligi" && !bantLoaded) loadRealBantData({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNetworkView]);

  // Battery Health — aynı desen (bkz. konuşma: "gömülü olsun her seferinde yüklemeyelim").
  useEffect(() => {
    if (isBattery && !batteryLoaded) loadRealBatteryData({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBattery]);

  // [DEMO DASHBOARD] Aksiyon listesi BSOD / Battery / Bant sayılarını da gösterir; bu veriler normalde yalnızca ilgili rapora girilince
  // yüklenir — demo açıkken Ana Sayfa'da da baştan yüklenir (yoksa bu satırlar rapora girilene kadar 0 görünürdü).
  useEffect(() => {
    if (!(showDashboard && dashboardDemo)) return;
    if (realBsodAll.length === 0) loadRealBsodData({ silent: true });
    if (!batteryLoaded) loadRealBatteryData({ silent: true });
    if (!bantLoaded) loadRealBantData({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDashboard, dashboardDemo]);

  // SCCM Ajan Raporu — dashboard'a hiç girilmeden doğrudan bu ekrana gelinirse SCCM verisi
  // henüz yüklenmemiş olabilir (bkz. konuşma: "defaultta kullandığımız sccm listesinden al").
  useEffect(() => {
    if (activeReport === "sccm-ajan" && realSccmAll.length === 0) loadRealSccmData({ silent: true });
    if (activeReport === "darbogaz") {
      loadRealSccmData({ silent: true });
      loadRealDiskData({ silent: true });
      loadRealBsodData({ silent: true });
      if (!batteryLoaded) loadRealBatteryData({ silent: true });
    }
    // Atıl Monitörler: yalnızca TuruncuHat + Monitor Raporu (bilgisayar/SCCM verisi gerekmez).
    if (activeReport === "atil-monitor") {
      loadRealThData({ silent: true });
      loadRealMonitorData({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport]);

  // Dashboard (ana sayfa) İnaktif, Disk ve Zimmet(SCCM+TH+Monitor) verilerini bir arada özetlediği
  // için, o sekmelere hiç girilmemiş olsa bile hepsini bir kez baştan yükler — aksi halde
  // dashboard açılışta boş/eksik (monitör karşılaştırmasız) görünürdü
  useEffect(() => {
    if (!showDashboard) return;
    if (realInaktifAll.length === 0) loadRealInaktifData({ silent: true });
    if (realDiskAll.length === 0) loadRealDiskData({ silent: true });
    if (realSccmAll.length === 0) loadRealSccmData({ silent: true });
    if (realThAll.length === 0) loadRealThData({ silent: true });
    if (realMonitorAll.length === 0) loadRealMonitorData({ silent: true });
    // Cihaz Genel Görünüm "Donanım" kartındaki batarya sağlığı için (Battery Health yalnızca kendi raporunda yükleniyordu → ana sayfada hep "Veri Yok")
    if (!batteryLoaded) loadRealBatteryData({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDashboard, fileSourceConfig.folderPath]);

  // Veri yüklendiğinde/şirket listesi değiştiğinde, seçili şirket artık listede yoksa
  // (ör. farklı bir dosya yüklendi) "Tüm Şirketler"e dön — varsayılan hep tüm veriyi göstermek,
  // dashboard'daki toplamla (465) tutarlı olsun diye tek bir şirkete zorlamıyoruz (bkz. konuşma)
  useEffect(() => {
    if (hasRealCompanies && activeCompany !== "all" && !inaktifCompanies.includes(activeCompany)) {
      setActiveCompany("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRealCompanies, inaktifCompanies]);

  // Üst lokasyon (LBS Location Parent) filtresi değişince, artık kapsam dışı kalabilecek
  // alt lokasyon seçimini sıfırla
  useEffect(() => {
    setLocationFilter([]);
  }, [lbsParentFilter]);

  // [DEMO DASHBOARD] Dashboard'daki bir lokasyona tıklanınca rapor o lokasyonla (ve gerekirse segmentle) açılır. Rapor/şirket
  // değişince çalışan sıfırlama efektleri (activeReport, lbsParentFilter) filtreyi temizlediği için seçim burada, onlardan SONRA uygulanır.
  const pendingNavRef = useRef(null);
  useEffect(() => {
    const p = pendingNavRef.current;
    if (!p) return;
    pendingNavRef.current = null;
    setLocationFilter(p.location ? [p.location] : []);
    setStatusFilter(p.status ? [p.status] : []);
    setSegment(p.segment || "all");
  }, [lbsParentFilter]);

  // Herhangi bir filtre değişince sayfalama 1. sayfaya döner — aksi halde kullanıcı 10. sayfada
  // filtre daraltınca boş bir sayfada kalabilirdi (kullanıcı isteği: standart sayfalama)
  useEffect(() => {
    setCurrentPage(1);
  }, [typeFilter, locationFilter, modelFilter, statusFilter, lbsParentFilter, segment, search, pageSize]);

  // Sayfa/şirket değiştiğinde sayfalamayı baştan başlat, seçim listesini temizle
  useEffect(() => {
    setLbsParentFilter([]);
  }, [activeCompany, activeReport]);

  const saveDataSourceConfig = async () => {
    try {
      await backendClient.saveDataSourceConfig(dataSourceConfig);
      setBackendReachable(true);
      setSavedSecretHints((prev) => ({
        ...prev,
        dsPassword: Boolean(dataSourceConfig.password) || prev.dsPassword,
        dsApiKey: Boolean(dataSourceConfig.apiKey) || prev.dsApiKey,
      }));
      showToast("Veri kaynağı ayarları backend'de şifreli olarak kaydedildi");
    } catch (err) {
      setBackendReachable(false);
      showToast(`Kaydedilemedi — ${err.message}`);
    }
  };

  const saveMailGroups = async () => {
    const parsed = parseMailGroupsText(mailGroupsText);
    if (Object.keys(parsed).length === 0 && mailGroupsText.trim()) {
      showToast("Geçerli bir eşleşme bulunamadı — her satır \"Lokasyon<TAB>mail\" biçiminde olmalı, kaydetme iptal edildi");
      return;
    }
    setSavingMailGroups(true);
    try {
      await backendClient.saveMailGroups(parsed);
      setBackendReachable(true);
      showToast(`${Object.keys(parsed).length} lokasyon-mail eşleşmesi kaydedildi`);
    } catch (err) {
      setBackendReachable(false);
      showToast(`Kaydedilemedi — ${err.message}`);
    } finally {
      setSavingMailGroups(false);
    }
  };

  const testDataSourceConnection = async () => {
    if (!dataSourceConfig.url.trim()) {
      showToast("Önce rapor/API URL'sini girin");
      return;
    }
    setTestingConnection(true);
    try {
      const result = await backendClient.testDataSourceConnection(dataSourceConfig);
      setBackendReachable(true);
      showToast(
        result.ok
          ? `${result.message}${result.recordCount != null ? ` — ${result.recordCount} kayıt` : ""}`
          : result.message
      );
    } catch (err) {
      setBackendReachable(false);
      showToast(err.message);
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <div style={styles.body} className="vt-body">
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 9px; }
        ::-webkit-scrollbar-thumb { background: ${pal.scrollbarThumb}; border-radius: 10px; }
        input:focus, select:focus { outline: none; }
        /* Native tarayıcı tooltip'i (title özniteliği) yerine — kullanıcı sağ üstteki sabit
           (fixed) çubukta "Çıkış Yap" tooltip'inin sayfanın üst kenarına yakın olduğu için
           garip/kırpık göründüğünü, kullanıcı kartıyla üst üste bindiğini bildirdi (bkz.
           konuşma). Bu özel tooltip her zaman elemanın ALTINDA açılır, konumu tamamen CSS ile
           kontrol edilir — üst kenara ne kadar yakın olursa olsun taşma/çakışma olmaz.
        */
        .vt-tip { position: relative; }
        .vt-tip::after {
          content: attr(data-tip);
          position: absolute; top: calc(100% + 6px); right: 0; z-index: 50;
          background: ${pal.toastBg}; color: ${pal.toastFg};
          font-size: 11.5px; font-weight: 600; white-space: nowrap;
          padding: 5px 9px; border-radius: 6px; box-shadow: ${pal.shadow};
          opacity: 0; visibility: hidden; transform: translateY(-4px);
          transition: opacity .12s ease, transform .12s ease;
          pointer-events: none;
        }
        .vt-tip:hover::after { opacity: 1; visibility: visible; transform: translateY(0); }
        /* ITSM teması: satır vurgusu + klavye odağı; dar ekranda menü üste, içerik tek sütun */
        [data-theme="itsm"] tbody tr:hover td { background: #F5F7FF; }
        [data-theme="itsm"] button:focus-visible, [data-theme="itsm"] input:focus-visible, [data-theme="itsm"] select:focus-visible { outline: 2px solid ${pal.accent}; outline-offset: 1px; }
        @media (max-width: 900px) {
          .vt-shell { grid-template-columns: minmax(0, 1fr) !important; }
          .vt-shell > aside { position: static !important; max-height: none !important; }
        }
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
        <aside ref={sidebarRef} style={{ ...styles.sidebar, maxHeight: "none", overflowY: "visible", top: sidebarTop }} className="no-print">
          {/* Tema değiştirici + Ayarlar butonu buradan kaldırılıp sağ üste (ana panel başlığına)
              taşındı (bkz. konuşma). Logo + isim artık kendi ayrı kartında — sidebar'ın geri
              kalanından (nav listesi) görsel olarak ayrılsın diye (bkz. konuşma — referans görsel). */}
          <div style={{ borderRadius: 12, background: pal.fieldBg, border: `1px solid ${pal.line}`, padding: "14px 12px 10px", marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ width: "100%", height: 56, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: pal.shadow, padding: 8 }}>
              <img src={companyLogo} alt="TK Asset Manager" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.01em", color: pal.ink }}>TK Asset Manager</div>
          </div>

          <div style={styles.deptList}>
            <div
              onClick={() => { closeAllViews(); setShowDashboard(true); setDashboardCompanyFilter("all"); }}
              style={{ ...styles.deptItem, ...(showDashboard ? styles.deptItemActive : {}) }}
            >
              <div style={styles.deptLeft}>
                <span style={{ ...styles.deptDot, ...(showDashboard ? styles.deptDotActive : {}) }} />
                Ana Sayfa
              </div>
            </div>
          </div>

          <div style={styles.navLabel}>{hasRealCompanies || !USE_MOCK_DATA ? "Şirketler (Sahibi Firma)" : "Bölümler"}</div>
          <div style={styles.deptList}>
            {hasRealCompanies
              ? (() => {
                  // [ŞİRKET-FİLTRESİ] sayılar açık raporun kendi satırlarından; Disk dosyasında şirket bilgisi yok ("—")
                  const thMonitors = realThAll.filter((r) => String(r.deviceType || "").toLowerCase() === "monitor");
                  const countSource = showDashboard
                    ? realInaktifAll
                    : ({ inaktif: realInaktifAll, kullanilmayan: unusedDeviceRows, zimmet: zimmetRows, "lokasyon-ip": lokasyonIpRows, bsod: bsodRows, "battery-health": batteryRows, "atil-monitor": thMonitors }[activeReport] || realInaktifAll);
                  const noCompanyData = !showDashboard && activeReport === "disk";
                  const allActive = showDashboard ? dashboardCompanyFilter === "all" : activeCompany === "all" && !showHistory;
                  return (
                    <>
                      <div
                        key="all"
                        onClick={() => {
                          if (showDashboard) {
                            setDashboardCompanyFilter("all");
                          } else {
                            setActiveCompany("all");
                            closeAllViews();
                            setSelectedKeys(new Set());
                          }
                        }}
                        style={{ ...styles.deptItem, ...(allActive ? styles.deptItemActive : {}) }}
                      >
                        <div style={styles.deptLeft}>
                          <span style={{ ...styles.deptDot, ...(allActive ? styles.deptDotActive : {}) }} />
                          Tüm Şirketler
                        </div>
                        <span style={{ ...styles.deptCount, ...(allActive ? styles.deptCountActive : {}) }}>{noCompanyData ? "—" : countSource.length}</span>
                      </div>
                      {inaktifCompanies.map((company) => {
                        const count = countSource.filter((r) => r.company === company).length;
                        // Ana sayfadayken şirket seçimi sayfadan çıkmadan sadece dashboard'u filtreler;
                        // bir rapor sekmesindeyken eskisi gibi o rapora o şirketle geçer (bkz. konuşma)
                        const active = showDashboard ? company === dashboardCompanyFilter : company === activeCompany && !showHistory;
                        return (
                          <div
                            key={company}
                            onClick={() => {
                              if (showDashboard) {
                                setDashboardCompanyFilter(company);
                              } else {
                                setActiveCompany(company);
                                closeAllViews();
                                setSelectedKeys(new Set());
                              }
                            }}
                            style={{ ...styles.deptItem, ...(active ? styles.deptItemActive : {}) }}
                          >
                            <div style={styles.deptLeft}>
                              <span style={{ ...styles.deptDot, ...(active ? styles.deptDotActive : {}) }} />
                              {companyShortLabel(company)}
                            </div>
                            <span style={{ ...styles.deptCount, ...(active ? styles.deptCountActive : {}) }}>{noCompanyData ? "—" : count}</span>
                          </div>
                        );
                      })}
                    </>
                  );
                })()
              : !USE_MOCK_DATA
              ? (
                  <p style={{ fontSize: 13, color: pal.inkSoft, margin: "6px 4px", lineHeight: 1.5 }}>
                    Henüz veri yüklenmedi. Ayarlar &gt; Veri Girişi bölümünden dosyaları seçin.
                  </p>
                )
              : DEPARTMENTS.map((d) => {
                  const count = getDeptAssetCount(d.id);
                  const active = d.id === activeDept && !showHistory && !showDashboard && !showSettings && !activeNetworkView;
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

          <div style={{ ...styles.navLabel, cursor: "default" }}>Rapor Türü</div>
          {REPORT_CATEGORIES.map((cat) => {
            const isOpen = expandedReportCategories.has(cat.id);
            return (
              <div key={cat.id}>
                <div
                  onClick={() => toggleReportCategory(cat.id)}
                  style={{ ...styles.navLabel, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "9px 10px" }}
                  title={isOpen ? "Kapat" : "Aç"}
                >
                  <span>{cat.name}</span>
                  <span style={{ fontSize: 12 }}>{isOpen ? "▾" : "▸"}</span>
                </div>
                {isOpen && (
                  <div style={styles.deptList}>
                    {cat.reports.map((r) => {
                      const active = r.id === activeReport && !showHistory && !showDashboard && !showSettings && !activeNetworkView; // Ana Sayfa / Ayarlar / Network açıkken rapor seçili görünmesin
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
                )}
              </div>
            );
          })}

          <div
            onClick={() => setNetworkExpanded((v) => !v)}
            style={{ ...styles.navLabel, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "9px 10px" }}
            title={networkExpanded ? "Kapat" : "Aç"}
          >
            <span>Network</span>
            <span style={{ fontSize: 12 }}>{networkExpanded ? "▾" : "▸"}</span>
          </div>
          {networkExpanded && (
            <div style={styles.deptList}>
              {NETWORK_ITEMS.map((n) => {
                const active = n.id === activeNetworkView;
                return (
                  <div
                    key={n.id}
                    onClick={() => { closeAllViews(); setActiveNetworkView(n.id); setSelectedKeys(new Set()); }}
                    style={{ ...styles.deptItem, ...(active ? styles.deptItemActive : {}) }}
                  >
                    <div style={styles.deptLeft}>
                      <span style={{ ...styles.deptDot, ...(active ? styles.deptDotActive : {}) }} />
                      {n.name}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={styles.navLabel}>Diğer</div>
          <div style={styles.deptList}>
            <div onClick={() => { closeAllViews(); setShowHistory(true); }} style={{ ...styles.deptItem, ...(showHistory ? styles.deptItemActive : {}) }}>
              <div style={styles.deptLeft}>
                <span style={{ ...styles.deptDot, ...(showHistory ? styles.deptDotActive : {}) }} />
                Gönderim Geçmişi
              </div>
              {mailHistory.length > 0 && <span style={{ ...styles.deptCount, ...(showHistory ? styles.deptCountActive : {}) }}>{mailHistory.length}</span>}
            </div>
            {/* Ayarlar buradan kaldırıldı — tek erişim noktası artık sağ üstteki "Ayarlar" butonu
                butonu (bkz. konuşma). */}
          </div>
        </aside>

        {/* MAIN */}
        <div style={styles.main}>
          {/* Tema değiştirici + Ayarlar + kullanıcı kartı — logo/marka satırından ayrılıp sağ
              üste taşındı (bkz. konuşma). sticky/fixed/absolute hepsi denendi (bkz. git geçmişi)
              — hepsinde scroll edildiğinde altından geçen kartlarla çakışma/şeffaflık sorunu
              çıktı. Kullanıcı kararı: sabitlemekten TAMAMEN vazgeçildi — bu satır normal akışta,
              sayfayla birlikte kayar. Sadece sol menü (sidebar) sabit (sticky) kalıyor. */}
          <div
            className="no-print"
            style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, flexWrap: "wrap" }}
          >
            <div className="vt-tip" data-tip="Temayı değiştir" style={styles.themeToggle}>
              <span onClick={() => setTheme("light")} style={{ ...styles.themeToggleBtn, ...(theme === "light" ? styles.themeToggleBtnActive : {}) }}>☀︎</span>
              <span onClick={() => setTheme("dark")} style={{ ...styles.themeToggleBtn, ...(theme === "dark" ? styles.themeToggleBtnActive : {}) }}>☾</span>
              {/* "Aero" — havacılık/glassmorphism deneme teması (bkz. konuşma), ışık/koyunun yanına
                  seçilebilir üçüncü seçenek olarak eklendi. */}
              <span onClick={() => setTheme("aero")} style={{ ...styles.themeToggleBtn, ...(theme === "aero" ? styles.themeToggleBtnActive : {}) }}>✈</span>
              {/* "ITSM" — Lakeside marka mavisi + kompakt konsol görünümü (palette.js ITSM_PALETTE) */}
              <span onClick={() => setTheme("itsm")} data-theme-btn="itsm" title="ITSM teması" style={{ ...styles.themeToggleBtn, ...(theme === "itsm" ? styles.themeToggleBtnActive : {}) }}>▦</span>
            </div>
            <button
              style={{ ...styles.btnGhost, display: "flex", alignItems: "center", gap: 6, ...(showSettings ? styles.deptItemActive : {}) }}
              onClick={() => { closeAllViews(); setShowSettings(true); }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Ayarlar
            </button>
            {user && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 6px", borderRadius: 10, background: pal.fieldBg }}>
                <div
                  style={{
                    width: 32, height: 32, borderRadius: "50%", background: pal.accentGrad, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0,
                  }}
                >
                  {(user.username || "?").slice(0, 1).toLocaleUpperCase("tr-TR")}
                </div>
                <div
                  className="vt-tip"
                  data-tip="Şifre değiştirmek için tıklayın"
                  style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, cursor: "pointer", maxWidth: 140 }}
                  onClick={() => setChangePasswordOpen(true)}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: pal.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.username}</span>
                  <span style={{ fontSize: 12, color: pal.inkSoft }}>{user.role === "master" ? "Master" : "Kullanıcı"}</span>
                </div>
                <button
                  onClick={onLogout}
                  className="vt-tip"
                  data-tip="Çıkış Yap"
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: pal.inkSoft, fontSize: 16, lineHeight: 1, padding: "2px 2px 2px 6px", flexShrink: 0 }}
                >
                  ⏻
                </button>
              </div>
            )}
          </div>
          {showDashboard ? (
            <>
              {(() => {
                const inaktifStats = computeInaktifDashboard(realInaktifAll, { company: dashboardCompanyFilter });
                const diskStats = computeDiskDashboard(realDiskAll);
                // zimmetRows (realSccmAll değil) kullanılıyor ki TuruncuHat+Monitor Raporu
                // yüklendiğinde dashboard da rapor ekranıyla AYNI (monitör dahil) sonucu göstersin
                // — önceden dashboard doğrudan ham SCCM'den hesaplıyordu, monitör karşılaştırmasından
                // tamamen habersizdi (bkz. konuşma: "dashboard'da ayrımı olacak mı").
                // [ŞİRKET-FİLTRESİ] dashboard kartları seçili şirkete göre; Disk dosyasında şirket bilgisi olmadığı için
                // şirket seçiliyken disk sayıları toplamlara dahil edilmez (diskScoped=false)
                const dc = dashboardCompanyFilter;
                const diskScoped = dc === "all";
                const zimmetScoped = byCompany(zimmetRows, dc);
                const overallZimmet = computeOverallZimmetStats(zimmetScoped);
                const mismatchTotal = overallZimmet.bad + overallZimmet.noRecord;
                const zimmetMismatchRows = getAllMismatchRows(zimmetScoped);
                const zimmetTopLocations = computeZimmetLocationBreakdown(zimmetMismatchRows, 10, { company: dashboardCompanyFilter });
                // "Genel Trend" paneli — Sage Intelligence tarzı bar+line, bkz. konuşma. Zaman
                // serisi veri olmadığı için eksen lokasyon; şirket filtresi diğer bölümlerle aynı
                // (dashboardCompanyFilter) state'i kullanır, ayrı bir seçim mekanizması icat edilmedi.
                const locationTrend = computeCombinedLocationTrend(realInaktifAll, zimmetMismatchRows, { company: dashboardCompanyFilter });

                // Disk Alanı Excel'inde gerçek bir lokasyon alanı yok (Site Code tüm kayıtlarda
                // aynı değeri taşıyor, ör. "MHY") — bu yüzden lokasyon kırılımı yerine seçilen
                // durumun toplam içindeki oranı gösteriliyor (bkz. konuşma)
                const diskFilterCount =
                  dashboardDiskFilter === "critical" ? diskStats.critical : dashboardDiskFilter === "warning" ? diskStats.warning : diskStats.normal;
                const diskFilterPct = diskStats.total ? Math.round((diskFilterCount / diskStats.total) * 100) : 0;
                const diskFilterColor = dashboardDiskFilter === "normal" ? pal.ok : dashboardDiskFilter === "warning" ? pal.warnFg : pal.bad;


                // Genel Risk: üç alanı birbirine göre sıralayıp en yüksek soruna kırmızı, ortaya turuncu,
                // en düşüğe yeşil veriyoruz — sabit bir eşik uydurmak yerine SADECE göreli karşılaştırma
                const riskItems = [
                  { key: "inaktif", label: "İnaktif Cihazlar", value: inaktifStats.total, sub: "toplam inaktif cihaz", reportId: "inaktif" },
                  { key: "disk", label: "Disk Alanı", value: diskStats.critical, sub: "kritik disk", reportId: "disk" },
                  { key: "zimmet", label: "Zimmet Uyuşmazlığı", value: overallZimmet.bad, sub: "hatalı zimmet", reportId: "zimmet" },
                ].filter((it) => diskScoped || it.key !== "disk");
                const rankedKeys = [...riskItems].sort((a, b) => b.value - a.value).map((r) => r.key);
                const riskColor = (item) => {
                  if (!item.value) return pal.ok;
                  const rank = rankedKeys.indexOf(item.key);
                  return rank === 0 ? pal.bad : rank === 1 ? pal.warnFg : pal.ok;
                };
                const riskLabel = (item) => {
                  if (!item.value) return "Normal";
                  const rank = rankedKeys.indexOf(item.key);
                  return rank === 0 ? "Kritik" : rank === 1 ? "Uyarı" : "Normal";
                };

                const goDashboardReport = (id) => { goReport(id); };

                // "Rapor Durumu Mini Özeti" — Dashboard KPI kartlarının üstündeki boş alan İÇİN
                // (bkz. konuşma, madde 3) VE her rapor sayfasının üst kısmı için (bkz. konuşma:
                // "haftalık/aylık filtrelenebilecek şekilde yapman lazım ve bütün raporlarda
                // gözükmeli"). TEK kaynak: periodComparisonService.latestPeriodSummary +
                // reportSnapshots'ın KENDİSİ — bu, aynı reportSnapshots state'i zaten Çözüm/
                // Müdahale İstatistikleri panelini ve ilgili sayfaların "problemli cihaz"
                // sayılarını (postSnapshot'a giden aynı satırlar) beslediği için Dashboard ile
                // sayfa üstü rakamlar arasında ayrı bir hesaplama yolu AÇILMAZ (madde 4/5 —
                // senkronizasyon), ve Haftalık/Aylık seçimi TEK bir paylaşılan state
                // (summaryPeriod) olduğu için her yerde aynı dönem gösterilir. Snapshot geçmişi
                // 2 dönemden azsa null döner, o zaman sessizce mini özet gösterilmez (madde 14).
                const last2wInaktif = summaryFor("inaktif");
                const last2wDisk = summaryFor("disk");
                const last2wZimmet = summaryFor("zimmet");
                const rollingMiniSummary = (s) =>
                  !s ? null : (
                    <div
                      style={{ display: "flex", gap: 8, fontSize: 12, fontFamily: "var(--font-mono)", color: pal.inkSoft, marginBottom: 2 }}
                      title={`${s.prevLabel} → ${s.periodLabel}`}
                    >
                      <span style={{ color: pal.ok }}>çöz {s.cozulen}</span>
                      <span style={{ color: pal.bad }}>yeni {s.yeniTespit}</span>
                      <span style={{ color: pal.warnFg }}>bek {s.devamEden}</span>
                    </div>
                  );
                const barList = (items, { color, emptyText = "Kayıt yok" }) => {
                  const max = items.reduce((m, it) => Math.max(m, it.count), 0) || 1;
                  if (items.length === 0) return <p style={{ ...styles.pageSub, margin: 0 }}>{emptyText}</p>;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {items.map((it) => (
                        <div key={it.key} style={styles.groupedBarBlock}>
                          <div style={styles.groupedBarHead}>
                            <span style={styles.groupedBarDeptName}>{it.key}</span>
                            <span style={{ color: pal.inkSoft }}>{it.count}</span>
                          </div>
                          <div style={styles.groupedBarTrack}>
                            <div style={{ ...styles.dashBarSeg, width: `${Math.round((it.count / max) * 100)}%`, background: color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                };

                if (dashboardDemo) {
                  // ---- DEMO: yeni Ana Sayfa (DashboardV2). Aynı canlı veriden, şirket filtresine uyar ----
                  const unusedScoped = byCompany(unusedDeviceRows, dc);
                  const atilStats = computeAtilMonitorRows({ thRows: byCompany(realThAll, dc), monitorRows: realMonitorAll }).stats;
                  const inCo = (d) => dc === "all" || d.company === dc;
                  const sm = (id) => latestPeriodSummary(reportSnapshots[id], summaryPeriod, inCo);
                  const devices = byCompany(realSccmAll, dc).length;
                  const openTotal = inaktifStats.total + overallZimmet.bad + unusedScoped.length + (diskScoped ? diskStats.critical : 0);
                  const meta = (label, m) => ({ label, at: m?.modifiedAt || null, file: m?.fileName });
                  const v2 = {
                    scope: dc === "all" ? "Tüm Şirketler" : companyShortLabel(dc),
                    diskScoped,
                    totals: { devices, open: openTotal, healthPct: devices ? Math.max(0, Math.round(((devices - openTotal) / devices) * 100)) : 0 },
                    cards: {
                      zimmet: { value: overallZimmet.bad, unverified: overallZimmet.noRecord, monitor: overallZimmet.monitorIssueCount, summary: sm("zimmet") },
                      inaktif: { value: inaktifStats.total, summary: sm("inaktif") },
                      disk: { value: diskScoped ? diskStats.critical : null, warning: diskStats.warning, summary: diskScoped ? sm("disk") : null },
                      unused: { value: unusedScoped.length, summary: sm("kullanilmayan") },
                      atil: { value: atilStats.atil, bilgiDisi: atilStats.outside },
                    },
                    extra: {
                      lokasyonIp: byCompany(lokasyonIpRows, dc).filter((r) => !r.matched).length,
                      bsod: byCompany(bsodRows, dc).length,
                      batteryReplace: byCompany(batteryRows, dc).filter((r) => r.batteryHealth != null && r.batteryHealth < 60).length,
                      bantWarn: realBantAll.filter((r) => r.isWarning).length,
                    },
                    locations: { zimmet: zimmetTopLocations, inaktif: inaktifStats.topLocations },
                    freshness: [meta("TuruncuHat", realThMeta), meta("SCCM", realSccmMeta), meta("İnaktif", realInaktifMeta), meta("Disk", realDiskMeta), meta("Monitor", realMonitorMeta), meta("BSOD", realBsodMeta), meta("Battery", realBatteryMeta)],
                  };
                  v2.topLoc = locationTrend;
                  v2.companies = inaktifCompanies.map((c) => {
                    const dev = byCompany(realSccmAll, c).length;
                    const inak = realInaktifAll.filter((r) => r.company === c).length;
                    const zim = computeOverallZimmetStats(byCompany(zimmetRows, c)).bad;
                    const unu = byCompany(unusedDeviceRows, c).length;
                    const open = inak + zim + unu;
                    return { key: c, label: companyShortLabel(c), devices: dev, inaktif: inak, zimmet: zim, unused: unu, open, healthPct: dev ? Math.max(0, Math.round(((dev - open) / dev) * 100)) : 0 };
                  });
                  // Ana Sayfa kartlarından / grafiklerinden rapora yönlendirme (filtre ve şirketle birlikte) — yeni görünüm ve Yönetici Özeti ortak kullanır
                  const dashNavigate = (id, opts = {}) => {
                      if (id === "bant-genisligi") { closeAllViews(); setActiveNetworkView(id); setSelectedKeys(new Set()); return; }
                      // şirket seçiliyken rapor da aynı şirketle açılsın (kartlardaki sayı ile rapor sayısı tutsun)
                      const effectsWillReset = activeReport !== id || activeCompany !== dc;
                      goReport(id);
                      if (opts.atilStage) setAtilStage(opts.atilStage);
                      setActiveCompany(dc);
                      setTypeFilter([]); setModelFilter([]); setWindowsFilter([]); setStatusFilter([]); setSearch(""); setShowSnoozed(false);
                      if (effectsWillReset) pendingNavRef.current = { location: opts.location, segment: opts.segment, status: opts.status };
                      else { setLocationFilter(opts.location ? [opts.location] : []); setStatusFilter(opts.status ? [opts.status] : []); setSegment(opts.segment || "all"); }
                  };
                  if (execView) {
                    return <ExecutiveSummary data={v2} snapshots={reportSnapshots} company={dc} summaryToggle={summaryPeriodToggle} onBack={() => toggleExecView(false)} onNavigate={dashNavigate} styles={styles} pal={pal} />;
                  }
                  return (
                    <DashboardV2
                      onExec={() => toggleExecView(true)}
                      styles={styles}
                      pal={pal}
                      data={v2}
                      snapshots={reportSnapshots}
                      company={dc}
                      summaryToggle={summaryPeriodToggle}
                      searchSlot={
                        <DeviceOverviewCard
                          sources={{ sccmRows: realSccmAll, thRows: realThAll, monitorRows: realMonitorAll, inaktifRows: inaktifComparisonRows.length ? inaktifComparisonRows : realInaktifAll, diskRows: realDiskAll, batteryRows: realBatteryAll, staleDays }}
                          styles={styles}
                          pal={pal}
                        />
                      }
                      onNavigate={dashNavigate}
                      onBack={() => toggleDashboardDemo(false)}
                    />
                  );
                }

                return (
                  <>
                    {/* Madde 10, 11 — "Cihaz Genel Görünüm": hostname/seri no/last logon ile
                        arama, cihazın tüm kaynaklardaki durumu tek ekranda. Önce Kullanılmayan
                        Cihazlar raporundaydı, sonra o raporun üstüne taşınmıştı; kullanıcı
                        vazgeçip Ana Sayfa'nın EN ÜSTÜNE almak istedi — içinde zaten arama
                        olduğu için Dashboard'un en başında, tüm ekranlarda erişilebilir olması
                        daha kullanışlı (bkz. konuşma). */}
                    <div style={{ marginBottom: 16 }}>
                      <DeviceOverviewCard
                        sources={{
                          sccmRows: realSccmAll,
                          thRows: realThAll,
                          monitorRows: realMonitorAll,
                          inaktifRows: inaktifComparisonRows.length ? inaktifComparisonRows : realInaktifAll,
                          diskRows: realDiskAll,
                          batteryRows: realBatteryAll,
                          staleDays,
                        }}
                        styles={styles}
                        pal={pal}
                      />
                    </div>

                    <div style={{ ...styles.panel, padding: "20px 24px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <p style={styles.pageTitle}>IT Operations Dashboard</p>
                          <p style={styles.pageSub}>İnaktif Cihazlar, Disk Alanı ve Zimmet Uyuşmazlığı gerçek verilerle</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button style={styles.btnGhost} onClick={() => toggleDashboardDemo(true)} title="Yeni Ana Sayfa tasarımına geç">✨ Yeni görünüme geç</button>
                          <span style={{ fontSize: 12, color: pal.inkSoft }}>Kart özetleri:</span>
                          {summaryPeriodToggle}
                        </div>
                        {dashboardCompanyFilter !== "all" && (
                          <div style={{ ...styles.badge, background: pal.accentSoft, color: pal.accent, fontSize: 13, padding: "7px 14px" }}>
                            {companyShortLabel(dashboardCompanyFilter)} için bu sayfayı görüyorsunuz
                            <span style={{ cursor: "pointer", marginLeft: 8, fontWeight: 700 }} onClick={() => setDashboardCompanyFilter("all")} title="Filtreyi kaldır, tüm şirketleri göster">✕</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* KPI satırı */}
                    <div style={{ ...styles.panel, padding: "20px 24px", ...styles.kpiGrid, gridTemplateColumns: "repeat(3, 1fr)" }}>
                      <div style={{ ...styles.kpiCard, cursor: "pointer" }} onClick={() => goDashboardReport("inaktif")} title="İnaktif Cihazlar raporuna git">
                        {rollingMiniSummary(last2wInaktif)}
                        <span style={styles.kpiValue}>{inaktifStats.total}</span>
                        <span style={styles.kpiLabel}>inaktif cihaz</span>
                        <span style={{ ...styles.kpiSub, color: pal.inkSoft }}>{inaktifCompanies.length} şirket</span>
                      </div>
                      <div style={{ ...styles.kpiCard, cursor: "pointer" }} onClick={() => goDashboardReport("disk")} title="Disk Alanı raporuna git">
                        {rollingMiniSummary(last2wDisk)}
                        <span style={{ ...styles.kpiValue, color: diskScoped && diskStats.critical ? pal.bad : pal.ink }}>{diskScoped ? diskStats.critical : "—"}</span>
                        <span style={styles.kpiLabel}>kritik disk (≤{DISK_THRESHOLDS_GB.criticalMax} GB)</span>
                        <span style={{ ...styles.kpiSub, color: pal.warnFg }}>{diskScoped ? `${diskStats.warning} uyarı seviyesinde` : "şirket bazında ayrılamaz"}</span>
                      </div>
                      <div style={{ ...styles.kpiCard, cursor: "pointer" }} onClick={() => goDashboardReport("zimmet")} title="Zimmet Uyuşmazlığı raporuna git">
                        {/* Sadece KESİN uyuşmazlık (overallZimmet.bad) — doğrulanamayan (noRecord)
                            kayıtlar buraya karışmaz, aksi halde TH bazlı tasarımda binlerce
                            "SCCM'de/Monitör Raporu'nda bulunamadı" kaydı sanki gerçek sorunmuş gibi
                            görünürdü (bkz. konuşma). Doğrulanamayan sayısı alt satırda ayrı gösterilir. */}
                        {rollingMiniSummary(last2wZimmet)}
                        <span style={{ ...styles.kpiValue, color: overallZimmet.bad ? pal.bad : pal.ink }}>{overallZimmet.bad}</span>
                        <span style={styles.kpiLabel}>zimmet uyuşmazlığı</span>
                        <span style={{ ...styles.kpiSub, color: pal.inkSoft }}>
                          {overallZimmet.noRecord > 0 ? `${overallZimmet.noRecord} kayıt doğrulanamadı` : "TuruncuHat ile karşılaştırıldı"}
                        </span>
                      </div>
                      {/* "son veri güncelleme" KPI kartı global footer'a taşındı (madde 1). */}
                    </div>

                    {/* Genel Durum — finans dashboard'u referansına göre (bkz. konuşma): cihaz sağlık
                        şelalesi + sağlıklı cihaz/zimmet uyumu göstergeleri + dönemsel bulgu/çözüm trendi. */}
                    <OverviewPanel
                      snapshots={reportSnapshots}
                      period={overviewPeriod}
                      setPeriod={setOverviewPeriod}
                      company={dc}
                      live={{
                        toplamCihaz: byCompany(realSccmAll, dc).length,
                        inaktif: inaktifStats.total,
                        zimmetHatali: overallZimmet.bad,
                        zimmetDogru: overallZimmet.ok,
                        kritikDisk: diskScoped ? diskStats.critical : 0,
                        kullanilmayan: byCompany(unusedDeviceRows, dc).length,
                      }}
                      styles={styles}
                      pal={pal}
                    />

                    {/* Genel Trend — lokasyon bazlı İnaktif Cihaz + Zimmet Uyuşmazlığı, Şirket filtresiyle */}
                    <div style={{ ...styles.panel, padding: "20px 24px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <p style={styles.settingsSectionTitle}>Lokasyon Kırılımı</p>
                          <p style={{ ...styles.pageSub, margin: 0 }}>
                            Lokasyon bazlı İnaktif Cihaz ve Zimmet Uyuşmazlığı{dashboardCompanyFilter !== "all" ? ` — ${companyShortLabel(dashboardCompanyFilter)}` : ""}
                          </p>
                        </div>
                        <select style={styles.scheduleSelect} value={dashboardCompanyFilter} onChange={(e) => setDashboardCompanyFilter(e.target.value)}>
                          <option value="all">Tüm Şirketler</option>
                          {inaktifCompanies.map((c) => <option key={c} value={c}>{companyShortLabel(c)}</option>)}
                        </select>
                      </div>
                      <div style={{ marginTop: 16 }}>
                        <LocationTrendChart data={locationTrend} pal={pal} />
                      </div>
                    </div>

                    {/* Faz 2 — Yönetim odaklı çözüm/müdahale istatistikleri (madde 2, 13) */}
                    <ManagementKpiPanel
                      snapshots={reportSnapshots}
                      report={mgmtReport}
                      setReport={setMgmtReport}
                      period={mgmtPeriod}
                      setPeriod={setMgmtPeriod}
                      lbsFilter={mgmtLbsFilter}
                      setLbsFilter={setMgmtLbsFilter}
                      company={dc}
                      styles={styles}
                      pal={pal}
                    />

                    {/* Genel Risk / System Health */}
                    <div style={{ ...styles.panel, padding: "20px 24px" }}>
                      <p style={styles.settingsSectionTitle}>Genel Risk Durumu</p>
                      <p style={{ ...styles.pageSub, marginBottom: 14 }}>Üç alan birbirine göre karşılaştırılır — en çok sorunlu alan kırmızı, en az sorunlu yeşil işaretlenir</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                        {riskItems.map((item) => (
                          <div
                            key={item.key}
                            style={{ ...styles.kpiCard, cursor: "pointer", borderLeft: `3px solid ${riskColor(item)}` }}
                            onClick={() => goDashboardReport(item.reportId)}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={styles.kpiLabel}>{item.label}</span>
                              <span style={{ ...styles.badge, background: `${riskColor(item)}22`, color: riskColor(item) }}>
                                <span style={{ ...styles.badgeDot, background: riskColor(item) }} />
                                {riskLabel(item)}
                              </span>
                            </div>
                            <span style={{ ...styles.kpiValue, color: riskColor(item) }}>{item.value}</span>
                            <span style={{ ...styles.kpiSub, color: pal.inkSoft }}>{item.sub}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Disk Alanı bölümü */}
                    {!diskScoped && (
                      <div style={{ ...styles.panel, padding: "14px 24px", color: pal.inkSoft, fontSize: 14 }}>
                        {companyShortLabel(dc)} seçili: Disk Alanı dosyasında şirket bilgisi olmadığı için disk sayıları şirket görünümüne dahil edilmedi (Tüm Şirketler'de görünür).
                      </div>
                    )}
                    {diskScoped && (
                    <>
                    <div style={{ ...styles.panel, padding: "20px 24px", ...styles.dashboardTwoCol }}>
                      <div style={styles.dashboardCol}>
                        <p style={styles.settingsSectionTitle}>Disk Alanı</p>
                        <p style={{ ...styles.pageSub, margin: "0 0 10px" }}>Eşik: Kritik ≤{DISK_THRESHOLDS_GB.criticalMax} GB · Uyarı ≤{DISK_THRESHOLDS_GB.warningMax} GB · Normal &gt;{DISK_THRESHOLDS_GB.warningMax} GB</p>
                        <div style={styles.donutRow}>
                          <Donut
                            segments={[
                              { value: diskStats.critical, color: pal.bad, label: "Kritik" },
                              { value: diskStats.warning, color: pal.warnFg, label: "Uyarı" },
                              { value: diskStats.normal, color: pal.ok, label: "Normal" },
                            ]}
                            centerLabel={diskStats.total}
                            centerSub="birim"
                            trackColor={pal.fieldBg}
                          />
                          <div style={styles.legendCol}>
                            {[
                              { label: "Kritik", value: diskStats.critical, color: pal.bad },
                              { label: "Uyarı", value: diskStats.warning, color: pal.warnFg },
                              { label: "Normal", value: diskStats.normal, color: pal.ok },
                            ].map((s) => (
                              <div key={s.label} style={styles.legendItemRow}>
                                <span style={styles.legendItemLeft}>
                                  <span style={{ ...styles.legendDot, background: s.color }} />
                                  {s.label}
                                </span>
                                <span style={styles.legendCount}>{s.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div style={styles.dashboardCol}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p style={styles.groupedBarDeptName}>Toplam İçindeki Oran</p>
                          <select style={styles.scheduleSelect} value={dashboardDiskFilter} onChange={(e) => setDashboardDiskFilter(e.target.value)}>
                            <option value="critical">Kritik</option>
                            <option value="warning">Uyarı</option>
                            <option value="normal">Normal</option>
                          </select>
                        </div>
                        {diskStats.total === 0 ? (
                          <p style={{ ...styles.pageSub, marginTop: 10 }}>Veri bekleniyor — Disk Alanı dosyası henüz yüklenmedi</p>
                        ) : (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                              <span style={{ ...styles.kpiValue, fontSize: 36, color: diskFilterColor }}>%{diskFilterPct}</span>
                              <span style={{ color: pal.inkSoft, fontSize: 13 }}>{diskFilterCount} / {diskStats.total} birim</span>
                            </div>
                            <div style={{ ...styles.dashBar, marginTop: 12 }}>
                              <div style={{ ...styles.dashBarSeg, width: `${diskFilterPct}%`, background: diskFilterColor }} />
                            </div>
                            <p style={{ ...styles.pageSub, marginTop: 10 }}>
                              Not: Disk Alanı Excel'inde fiziksel lokasyon bilgisi yok (Site Code sütunu tüm kayıtlarda aynı) — bu yüzden lokasyon kırılımı yerine oran gösteriliyor.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    </>
                    )}

                    {/* Zimmet Uyuşmazlığı bölümü — artık gerçek SCCM envanter verisiyle hesaplanıyor (bkz. konuşma) */}
                    <div style={{ ...styles.panel, padding: "20px 24px", ...styles.dashboardTwoCol }}>
                      <div style={styles.dashboardCol}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p style={styles.settingsSectionTitle}>Zimmet Uyuşmazlığı</p>
                          {realSccmMeta && <span style={{ ...styles.demoTag, ...styles.badgeOk }}>SCCM Verisi</span>}
                        </div>
                        <div style={styles.donutRow}>
                          <Donut
                            segments={[
                              { value: overallZimmet.ok, color: pal.ok, label: "Doğru Eşleşen" },
                              { value: overallZimmet.bad, color: pal.bad, label: "Uyuşmazlık" },
                              { value: overallZimmet.noRecord, color: pal.neutralDot, label: "Kayıt Yok" },
                            ]}
                            centerLabel={overallZimmet.total}
                            centerSub="cihaz"
                            trackColor={pal.fieldBg}
                          />
                          <div style={styles.legendCol}>
                            <div style={styles.legendItemRow}>
                              <span style={styles.legendItemLeft}><span style={{ ...styles.legendDot, background: pal.ok }} />Doğru eşleşen</span>
                              <span style={styles.legendCount}>{overallZimmet.ok}</span>
                            </div>
                            <div style={styles.legendItemRow}>
                              <span style={styles.legendItemLeft}><span style={{ ...styles.legendDot, background: pal.bad }} />Uyuşmazlık</span>
                              <span style={styles.legendCount}>{overallZimmet.bad}</span>
                            </div>
                            <div style={styles.legendItemRow}>
                              <span style={styles.legendItemLeft}><span style={{ ...styles.legendDot, background: pal.neutralDot }} />Doğrulanamayan</span>
                              <span style={styles.legendCount}>{overallZimmet.noRecord}</span>
                            </div>
                            {overallZimmet.monitorIssueCount > 0 && (
                              // Genel "Uyuşmazlık" sayısının içinde geçiyor (üstüne eklenmiyor) —
                              // sadece kaç tanesinin monitör kaynaklı olduğunu ayrıca gösteriyor
                              // (bkz. konuşma: dashboard'da ayrımı olacak mı).
                              <div style={styles.legendItemRow}>
                                <span style={styles.legendItemLeft}><span style={{ ...styles.legendDot, background: pal.warnFg }} />— bunlardan monitör kaynaklı</span>
                                <span style={{ ...styles.legendCount, color: pal.warnFg }}>{overallZimmet.monitorIssueCount}</span>
                              </div>
                            )}
                            <div style={{ ...styles.legendItemRow, marginTop: 6, borderTop: `1px solid ${pal.line}`, paddingTop: 6 }}>
                              <span style={styles.legendItemLeft}>Uyuşmazlık oranı</span>
                              <span style={{ ...styles.legendCount, color: pal.bad }}>%{overallZimmet.total ? Math.round((overallZimmet.bad / overallZimmet.total) * 100) : 0}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={styles.dashboardCol}>
                        <p style={styles.groupedBarDeptName}>En fazla uyuşmazlık bulunan lokasyon/departman</p>
                        <div style={{ marginTop: 10 }}>
                          {barList(zimmetTopLocations, { color: pal.bad, emptyText: "Uyuşmazlık bulunamadı" })}
                        </div>
                      </div>
                    </div>

                    {/* İnaktif Cihazlar bölümü — lokasyon bazlı liste en altta (bkz. konuşma) */}
                    <div style={{ ...styles.panel, padding: "20px 24px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <p style={styles.settingsSectionTitle}>İnaktif Cihazlar</p>
                          <p style={{ ...styles.pageSub, margin: 0 }}>Toplam {inaktifStats.total} inaktif cihaz{dashboardCompanyFilter !== "all" ? ` — ${companyShortLabel(dashboardCompanyFilter)}` : ""}</p>
                        </div>
                        {inaktifCompanies.length > 1 && (
                          <select style={styles.scheduleSelect} value={dashboardCompanyFilter} onChange={(e) => setDashboardCompanyFilter(e.target.value)}>
                            <option value="all">Tüm Şirketler</option>
                            {inaktifCompanies.map((c) => <option key={c} value={c}>{companyShortLabel(c)}</option>)}
                          </select>
                        )}
                      </div>
                      <div style={{ marginTop: 16 }}>
                        <p style={{ ...styles.groupedBarDeptName, marginBottom: 10 }}>En fazla inaktif cihaz bulunan lokasyonlar</p>
                        {barList(inaktifStats.topLocations, { color: pal.accent, emptyText: "Veri bekleniyor — İnaktif Cihazlar dosyası henüz yüklenmedi" })}
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          ) : showSettings ? (
            // Supervisor (master) olmayan kullanıcılar Ayarlar — Giriş mini formunu hiç görmesin,
            // doğrudan yetkisiz mesajı gösterilsin (bkz. konuşma — test kullanıcısı isteği).
            user && user.role !== "master" ? (
              <div style={{ ...styles.panel, padding: "28px 24px", maxWidth: 360, margin: "40px auto", textAlign: "center" }}>
                <p style={styles.pageTitle}>Yetkiniz Bulunmamaktadır</p>
                <p style={styles.pageSub}>Bu bölüme erişim için Supervisor yetkisi gereklidir.</p>
              </div>
            ) : !settingsUnlocked ? (
              <div style={{ ...styles.panel, padding: "28px 24px", maxWidth: 360, margin: "40px auto" }}>
                <p style={styles.pageTitle}>Ayarlar — Giriş</p>
                <p style={styles.pageSub}>Bu bölüm sadece yetkili kullanıcılar içindir.</p>
                <form onSubmit={handleSettingsLogin} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>Kullanıcı Adı</label>
                    <input
                      type="text"
                      autoFocus
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      style={styles.formInput}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>Şifre</label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      style={styles.formInput}
                    />
                  </div>
                  {loginError && <p style={{ ...styles.formHelper, color: pal.bad, margin: 0 }}>{loginError}</p>}
                  <button type="submit" style={styles.btnPrimary} disabled={loggingIn || !loginUsername.trim() || !loginPassword}>
                    {loggingIn ? "Giriş yapılıyor..." : "Giriş Yap"}
                  </button>
                </form>
              </div>
            ) : (
            <>
              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={styles.pageTitle}>Ayarlar</p>
                    <p style={styles.pageSub}>Lokasyon e-postaları, SMTP ve veri girişi ayarları</p>
                  </div>
                  <button style={styles.btnGhost} onClick={handleSettingsLogout}>Çıkış Yap</button>
                </div>
                <div style={{ ...styles.segmented, marginTop: 16 }}>
                  {[["lokasyon", "Lokasyon E-postaları"], ["smtp", "SMTP"], ["veri", "Veri Girişi"], ["gelismis", "Gizli/Gelişmiş Raporlar"]].map(([id, label]) => (
                    <div key={id} onClick={() => setSettingsTab(id)} style={{ ...styles.seg, ...(settingsTab === id ? styles.segActive : {}) }}>
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              {settingsTab === "gelismis" && (
                <ThDepotSccmReportScreen
                  styles={styles}
                  pal={pal}
                  thRows={realThAll}
                  sccmRows={realSccmAll}
                  thMeta={realThMeta}
                  sccmMeta={realSccmMeta}
                  loading={loadingRealTh || loadingRealSccm}
                  staleDays={staleDays}
                />
              )}

              {settingsTab === "smtp" && (
              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <p style={styles.pageTitle}>SMTP</p>
                <p style={styles.pageSub}>Rapor ve uyuşmazlık e-postalarının gönderileceği SMTP sunucu bilgileri ve test e-postası</p>

                <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${pal.line}` }}>
                <div style={styles.settingsSectionHead}>
                  <p style={styles.settingsSectionTitle}>Mail (SMTP) Sunucu Ayarları</p>
                  <span style={{ ...styles.demoTag, ...(backendReachable ? styles.badgeOk : {}) }}>
                    {backendReachable === null ? "Kontrol ediliyor..." : backendReachable ? "Backend Bağlı" : "Backend Çalışmıyor"}
                  </span>
                </div>
                <p style={styles.pageSub}>
                  Uyuşmazlık ve rapor e-postalarının gönderileceği SMTP sunucu bilgileri. Kaydet ve Test Et,
                  yerel backend servisine (`backend/`) gider — şifre orada AES-256 ile şifrelenip diske yazılır,
                  test gerçek bir SMTP `verify()` çağrısıdır. Backend çalışmıyorsa altta net bir hata görürsün.
                </p>
                <div style={styles.formGrid}>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>SMTP Sunucu Adresi</label>
                    <input
                      type="text"
                      placeholder="mail.sirket.com"
                      value={smtpConfig.host}
                      onChange={(e) => setSmtpConfig((prev) => ({ ...prev, host: e.target.value }))}
                      style={styles.formInput}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>Port</label>
                    <input
                      type="text"
                      placeholder="587"
                      value={smtpConfig.port}
                      onChange={(e) => setSmtpConfig((prev) => ({ ...prev, port: e.target.value }))}
                      style={styles.formInput}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>Kullanıcı Adı</label>
                    <input
                      type="text"
                      placeholder="raporlama@sirket.com"
                      value={smtpConfig.username}
                      onChange={(e) => setSmtpConfig((prev) => ({ ...prev, username: e.target.value }))}
                      style={styles.formInput}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>Şifre</label>
                    <input
                      type="password"
                      placeholder={savedSecretHints.smtpPassword ? "•••••••• (kayıtlı — değiştirmek için yeniden girin)" : "••••••••"}
                      autoComplete="new-password"
                      value={smtpConfig.password}
                      onChange={(e) => setSmtpConfig((prev) => ({ ...prev, password: e.target.value }))}
                      style={styles.formInput}
                    />
                  </div>
                  <div style={styles.formFieldWide}>
                    <label style={styles.formLabel}>Gönderen E-posta Adresi</label>
                    <input
                      type="text"
                      placeholder="varlik-takip@sirket.com"
                      value={smtpConfig.fromAddress}
                      onChange={(e) => setSmtpConfig((prev) => ({ ...prev, fromAddress: e.target.value }))}
                      style={styles.formInput}
                    />
                  </div>
                  <div style={styles.formFieldWide}>
                    <label style={styles.formCheckRow}>
                      <input
                        type="checkbox"
                        style={styles.checkbox}
                        checked={smtpConfig.useTls}
                        onChange={() => setSmtpConfig((prev) => ({ ...prev, useTls: !prev.useTls }))}
                      />
                      TLS/SSL kullan
                    </label>
                  </div>
                </div>
                <p style={styles.formHelper}>
                  Şifre tarayıcıda hiç saklanmıyor — sadece backend'e gönderilip orada AES-256-GCM ile şifreli
                  diske yazılıyor. Bağlantı testi zorunlu değildir — test etmeden de kaydedebilirsiniz.
                </p>
                <div style={styles.formActions}>
                  <button style={styles.btnPrimary} onClick={saveSmtpConfig}>Kaydet</button>
                  <button style={styles.btnGhost} onClick={testSmtpConnection} disabled={testingSmtp}>
                    {testingSmtp ? "Test ediliyor..." : "Bağlantıyı Test Et (isteğe bağlı)"}
                  </button>
                </div>

                <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${pal.line}` }}>
                  <p style={styles.formLabel}>Test E-postası Gönder</p>
                  <p style={{ ...styles.formHelper, margin: "2px 0 10px" }}>
                    Kayıtlı SMTP ayarlarıyla gerçekten bir e-posta gönderir (nodemailer üzerinden) — önce Kaydet'e basmış olmanız gerekir.
                  </p>
                  <div style={styles.formActions}>
                    <input
                      type="text"
                      placeholder="alici@sirket.com"
                      value={testMailTo}
                      onChange={(e) => setTestMailTo(e.target.value)}
                      style={{ ...styles.formInput, width: 240 }}
                    />
                    <button style={styles.btnGhost} onClick={sendTestMail} disabled={sendingTestMail}>
                      {sendingTestMail ? "Gönderiliyor..." : "Test E-postası Gönder"}
                    </button>
                  </div>
                </div>
                </div>
              </div>
              )}

              {settingsTab === "lokasyon" && (
              <>
              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <p style={styles.pageTitle}>Lokasyon E-postaları</p>
                <p style={styles.pageSub}>İnaktif ve Kullanılmayan Cihazlar raporlarının lokasyon bazlı e-posta dağıtımı ve departman bildirim tercihleri</p>

                <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${pal.line}` }}>
                <div style={{ ...styles.panel, padding: "14px 16px", marginBottom: 16, background: pal.fieldBg }}>
                  <p style={{ ...styles.formLabel, marginBottom: 4 }}>
                    📄 Lokasyon E-posta Listesi <span style={{ fontWeight: 400, color: pal.inkSoft }}>— İnaktif Cihazlar ve Kullanılmayan Cihazlar için TEK kaynak</span>
                  </p>
                  <p style={{ ...styles.pageSub, margin: 0 }}>
                    {realLokasyonMailMeta
                      ? `${realLokasyonMailMeta.fileName} — ${realLokasyonMailAll.length} lokasyon kaydı yüklü (${new Date(realLokasyonMailMeta.modifiedAt).toLocaleString("tr-TR")}). Eşleştirme "Açık Lokasyon Adı" üzerinden, gönderilen adres "E-posta Adresi" sütunundan alınır — aşağıdaki metin kutusu bu iki rapor için ARTIK KULLANILMIYOR.`
                      : "Henüz yüklenmedi — İnaktif Cihazlar veya Kullanılmayan Cihazlar raporuna girildiğinde otomatik yüklenir, ya da aşağıdan elle yükleyebilirsiniziz."}
                  </p>
                  <div
                    style={{ ...styles.chipToggle, display: "inline-block", marginTop: 8 }}
                    onClick={loadingRealLokasyonMail ? undefined : loadRealLokasyonMailData}
                  >
                    {loadingRealLokasyonMail ? "Yükleniyor..." : "📄 SharePoint'ten Lokasyon E-posta Listesini Yükle"}
                  </div>
                </div>
                <div style={styles.settingsSectionHead}>
                  <p style={styles.settingsSectionTitle}>Diğer Raporlar — Lokasyon E-posta Grupları (eski)</p>
                  <span style={{ ...styles.demoTag, ...(backendReachable ? styles.badgeOk : {}) }}>
                    {backendReachable === null ? "Kontrol ediliyor..." : backendReachable ? "Backend Bağlı" : "Backend Çalışmıyor"}
                  </span>
                </div>
                <p style={styles.pageSub}>
                  Bu liste artık İnaktif Cihazlar ve Kullanılmayan Cihazlar için kullanılmıyor (onlar yukarıdaki
                  Lokasyon E-posta Listesi'nden besleniyor) — hâlâ BSOD, Kapatma Onayı Bekleyen Kayıtlar ve Yeni
                  Kurulum Kaydı ekranlarının lokasyon/mail eşleşmesinde kullanılıyor. Excel'den iki sütunu
                  (lokasyon, mail) kopyalayıp aşağıya yapıştırabilirsin — her satır bir eşleşmedir, sütunlar
                  arasında tab, virgül veya noktalı virgül olabilir. İstersen bunun yerine bir Excel/CSV dosyası
                  da seçebilirsin, aşağıdaki kutuyu senin adına doldurur.
                </p>
                <label style={{ ...styles.btnGhost, cursor: "pointer", display: "inline-flex", marginTop: 4 }}>
                  Dosyadan İçe Aktar…
                  <input type="file" accept=".xlsx,.csv" onChange={handleMailGroupsFileImport} style={{ display: "none" }} />
                </label>
                <textarea
                  style={{ ...styles.formTextarea, marginTop: 12 }}
                  placeholder={"DUBAI SATIS OFISI\tdubaisatis@sirket.com\nISTANBUL SATIS OFISI\tistanbulsatis@sirket.com\n..."}
                  value={mailGroupsText}
                  onChange={(e) => setMailGroupsText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Tab") return;
                    e.preventDefault();
                    const el = e.target;
                    const start = el.selectionStart;
                    const end = el.selectionEnd;
                    const next = mailGroupsText.slice(0, start) + "\t" + mailGroupsText.slice(end);
                    setMailGroupsText(next);
                    requestAnimationFrame(() => el.setSelectionRange(start + 1, start + 1));
                  }}
                  spellCheck={false}
                />
                <p style={styles.formHelper}>
                  {Object.keys(parseMailGroupsText(mailGroupsText)).length} geçerli eşleşme algılandı.
                </p>
                <div style={styles.formActions}>
                  <button style={styles.btnPrimary} onClick={saveMailGroups} disabled={savingMailGroups}>
                    {savingMailGroups ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                </div>
                </div>
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
              </>
              )}

              {settingsTab === "veri" && (
              <>
              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <p style={styles.pageTitle}>Veri Girişi</p>
                <p style={styles.pageSub}>Rapor verilerinin geldiği kaynaklar: API bağlantısı, SharePoint Excel klasörü, TuruncuHat / Monitor dosyaları, Kullanılmayan Cihazlar &amp; LakeSide batarya ve zamanlanmış otomatik tarama</p>
              </div>

              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <p style={styles.settingsSectionTitle}>Zamanlanmış Otomatik Tarama</p>
                <p style={styles.pageSub}>Belirlediğiniz sıklıkla sistem otomatik tarama yapıp yeni uyuşmazlıkları özetler</p>
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
                <input
                  type="text"
                  value={scheduleConfig.recipients}
                  onChange={(e) => setScheduleConfig((prev) => ({ ...prev, recipients: e.target.value }))}
                  placeholder="Alıcı e-posta(lar) — virgülle ayırın"
                  style={{ ...styles.formInput, marginTop: 10, maxWidth: 420 }}
                  disabled={!scheduleConfig.enabled}
                />
                <p style={{ ...styles.formHelper, margin: "4px 0 0" }}>
                  Mükerrer Çift Zimmet ve Lokasyon Hostname/IP Uyuşmazlığı için — sadece bir önceki taramadan bu yana YENİ çıkanlar e-posta edilir, ilk taramada sadece mevcut durum baz alınır.
                </p>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
                  <button style={styles.btnPrimary} onClick={saveAnomalySchedule} disabled={savingSchedule}>
                    {savingSchedule ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                  <button style={styles.btnGhost} onClick={runAnomalyScanNow} disabled={runningScanNow}>
                    {runningScanNow ? "Taranıyor..." : "🔍 Şimdi Tara"}
                  </button>
                  {scheduleStatus?.lastRunAt && (
                    <span style={{ fontSize: 13, color: pal.inkSoft }}>
                      Son tarama: {new Date(scheduleStatus.lastRunAt).toLocaleString("tr-TR")} · {scheduleStatus.knownCount} uyuşmazlık kayıtlı
                    </span>
                  )}
                </div>
              </div>

              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <p style={styles.settingsSectionTitle}>Üst Yönetim İstisna Listesi</p>
                <p style={styles.pageSub}>
                  Buradaki e-posta adreslerine Kapatma Onayı Bekleyen Kayıtlar (ve ileride eklenecek benzer
                  hatırlatma akışları) KESİNLİKLE e-posta göndermez — Excel'den okunmaz, sadece burada elle
                  yönetilir. Her satıra bir e-posta.
                </p>
                <textarea
                  value={ustYonetimText}
                  onChange={(e) => setUstYonetimText(e.target.value)}
                  placeholder={"genel.mudur@mhy.com.tr\nbaskan@mhy.com.tr"}
                  style={{ ...styles.formInput, width: "100%", minHeight: 120, fontFamily: "var(--font-mono)", fontSize: 13, marginTop: 8 }}
                />
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                  <button style={styles.btnPrimary} onClick={saveUstYonetimList} disabled={savingUstYonetim}>
                    {savingUstYonetim ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                  <span style={{ fontSize: 13, color: pal.inkSoft }}>
                    {ustYonetimText.split("\n").map((s) => s.trim()).filter((s) => /@/.test(s)).length} geçerli e-posta
                  </span>
                </div>
              </div>

              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <div style={styles.settingsSectionHead}>
                  <p style={styles.settingsSectionTitle}>Veri Kaynağı (API) Bağlantısı</p>
                  <span style={{ ...styles.demoTag, ...(backendReachable ? styles.badgeOk : {}) }}>
                    {backendReachable === null ? "Kontrol ediliyor..." : backendReachable ? "Backend Bağlı" : "Backend Çalışmıyor"}
                  </span>
                </div>
                <p style={styles.pageSub}>
                  Raporların canlı verisini çekeceğin kurumsal kaynağı (ör. envanter/rapor sunucusu) burada
                  tanımla. Kaydet ve Test Et backend'e gider — Windows/NTLM dahil tüm yöntemler orada gerçekten
                  denenir (tarayıcının CORS/entegre kimlik doğrulama kısıtlaması burada geçerli değil).
                </p>
                <div style={{ ...styles.chipToggle, display: "inline-block", marginTop: 10 }} onClick={() => setDataSourceConfig((prev) => ({ ...prev, url: "http://localhost:4000/api/inventory", authMethod: "apikey", apiKey: "demo-key-12345", username: "", password: "" }))}>
                  ⚡ Demo API ile doldur ve dene
                </div>
                <div style={styles.formGrid}>
                  <div style={styles.formFieldWide}>
                    <label style={styles.formLabel}>Rapor / API URL</label>
                    <input
                      type="text"
                      placeholder="https://rapor-sunucusu.sirket.com/..."
                      value={dataSourceConfig.url}
                      onChange={(e) => setDataSourceConfig((prev) => ({ ...prev, url: e.target.value }))}
                      style={styles.formInput}
                    />
                  </div>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>Kimlik Doğrulama Yöntemi</label>
                    <select
                      style={styles.scheduleSelect}
                      value={dataSourceConfig.authMethod}
                      onChange={(e) => setDataSourceConfig((prev) => ({ ...prev, authMethod: e.target.value }))}
                    >
                      <option value="windows">Windows / NTLM</option>
                      <option value="basic">Temel Kimlik Doğrulama (Basic)</option>
                      <option value="apikey">API Anahtarı</option>
                      <option value="none">Yok</option>
                    </select>
                  </div>
                  {dataSourceConfig.authMethod === "apikey" && (
                    <div style={styles.formField}>
                      <label style={styles.formLabel}>API Anahtarı</label>
                      <input
                        type="password"
                        placeholder={savedSecretHints.dsApiKey ? "•••••••• (kayıtlı — değiştirmek için yeniden girin)" : "••••••••"}
                        autoComplete="new-password"
                        value={dataSourceConfig.apiKey}
                        onChange={(e) => setDataSourceConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                        style={styles.formInput}
                      />
                    </div>
                  )}
                  {(dataSourceConfig.authMethod === "windows" || dataSourceConfig.authMethod === "basic") && (
                    <>
                      <div style={styles.formField}>
                        <label style={styles.formLabel}>Kullanıcı Adı</label>
                        <input
                          type="text"
                          placeholder="kullanici"
                          value={dataSourceConfig.username}
                          onChange={(e) => setDataSourceConfig((prev) => ({ ...prev, username: e.target.value }))}
                          style={styles.formInput}
                        />
                      </div>
                      <div style={styles.formField}>
                        <label style={styles.formLabel}>Şifre</label>
                        <input
                          type="password"
                          placeholder={savedSecretHints.dsPassword ? "•••••••• (kayıtlı — değiştirmek için yeniden girin)" : "••••••••"}
                          autoComplete="new-password"
                          value={dataSourceConfig.password}
                          onChange={(e) => setDataSourceConfig((prev) => ({ ...prev, password: e.target.value }))}
                          style={styles.formInput}
                        />
                      </div>
                    </>
                  )}
                  {dataSourceConfig.authMethod === "windows" && (
                    <>
                      <div style={styles.formField}>
                        <label style={styles.formLabel}>Domain</label>
                        <input
                          type="text"
                          placeholder="SIRKET"
                          value={dataSourceConfig.domain}
                          onChange={(e) => setDataSourceConfig((prev) => ({ ...prev, domain: e.target.value }))}
                          style={styles.formInput}
                        />
                      </div>
                      <div style={styles.formField}>
                        <label style={styles.formLabel}>Workstation (isteğe bağlı)</label>
                        <input
                          type="text"
                          placeholder=""
                          value={dataSourceConfig.workstation}
                          onChange={(e) => setDataSourceConfig((prev) => ({ ...prev, workstation: e.target.value }))}
                          style={styles.formInput}
                        />
                      </div>
                    </>
                  )}
                </div>
                <p style={styles.formHelper}>
                  Kimlik bilgileri tarayıcıda saklanmaz — backend'e gönderilip orada AES-256-GCM ile
                  şifreli diske yazılır. NTLM implementasyonu standart protokole uygundur; canlıya almadan
                  önce şirketinizin gerçek AD/NTLM sunucusuyla doğrulanması önerilir.
                </p>
                <div style={styles.formActions}>
                  <button style={styles.btnPrimary} onClick={saveDataSourceConfig}>Kaydet</button>
                  <button style={styles.btnGhost} onClick={testDataSourceConnection} disabled={testingConnection}>
                    {testingConnection ? "Test ediliyor..." : "Bağlantıyı Test Et"}
                  </button>
                </div>
              </div>

              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <div style={styles.settingsSectionHead}>
                  <p style={styles.settingsSectionTitle}>Dosya Kaynağı (SharePoint Excel — geçici çözüm)</p>
                  <span style={{ ...styles.demoTag, ...(backendReachable ? styles.badgeOk : {}) }}>
                    {backendReachable === null ? "Kontrol ediliyor..." : backendReachable ? "Backend Bağlı" : "Backend Çalışmıyor"}
                  </span>
                </div>
                <p style={styles.pageSub}>
                  API entegrasyonu hazır olana kadar İnaktif Cihazlar verisi, Power Automate'in SharePoint'e
                  yazdığı Excel dosyasından okunuyor. Bu dosyaların senkronize edildiği yerel klasörü (OneDrive
                  istemcisinin diske indirdiği kopya) aşağıya gir — uygulama klasördeki
                  <code style={{ margin: "0 4px" }}>İnaktifCihazlar_yyyyMMddHHmmss.xlsx</code>
                  desenine uyan en güncel dosyayı otomatik bulur.
                </p>
                <div style={styles.formGrid}>
                  <div style={styles.formFieldWide}>
                    <label style={styles.formLabel}>Klasör Yolu</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        placeholder={"C:\\Users\\...\\Şirket - Belgeler\\WIN 11 UPGRADE SUPPORT\\Powerautomate test"}
                        value={fileSourceConfig.folderPath}
                        onChange={(e) => setFileSourceConfig({ folderPath: e.target.value })}
                        style={{ ...styles.formInput, flex: 1 }}
                      />
                      <button type="button" style={styles.btnGhost} onClick={pickFolder}>Gözat…</button>
                    </div>
                  </div>
                </div>
                <div style={styles.formActions}>
                  <button style={styles.btnPrimary} onClick={saveFileSourceConfig}>Kaydet</button>
                  <button style={styles.btnGhost} onClick={testFileSourceConnection} disabled={testingFileSource}>
                    {testingFileSource ? "Test ediliyor..." : "Bağlantıyı Test Et"}
                  </button>
                </div>
                {fileSourceTestResult && (
                  <p style={{ ...styles.formHelper, color: fileSourceTestResult.ok ? pal.ok : pal.bad, marginTop: 10 }}>
                    {fileSourceTestResult.message}
                    {fileSourceTestResult.ok && fileSourceTestResult.columns && (
                      <> — sütunlar: {fileSourceTestResult.columns.join(", ")}</>
                    )}
                  </p>
                )}

                <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${pal.line}` }}>
                  <p style={styles.formLabel}>Klasör senkronu yerine dosyayı elle seçin</p>
                  <p style={styles.formHelper}>
                    SharePoint/OneDrive klasör senkronu henüz kurulamadıysa, aynı Excel dosyalarını doğrudan
                    bilgisayarından seçip yükleyebilirsiniz — backend'e ya da klasör yoluna gerek kalmaz.
                  </p>
                  <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                    <label style={{ ...styles.btnGhost, cursor: "pointer" }}>
                      İnaktifCihazlar_*.xlsx Seç…
                      <input type="file" accept=".xlsx" onChange={handleManualInaktifFile} style={{ display: "none" }} />
                    </label>
                    <label style={{ ...styles.btnGhost, cursor: "pointer" }}>
                      DiskAlani_*.xlsx Seç…
                      <input type="file" accept=".xlsx" onChange={handleManualDiskFile} style={{ display: "none" }} />
                    </label>
                    <label style={{ ...styles.btnGhost, cursor: "pointer" }}>
                      SCCM Inventory Report Seç…
                      <input type="file" accept=".xlsx" onChange={handleManualSccmFile} style={{ display: "none" }} />
                    </label>
                  </div>
                  {(realInaktifMeta || realDiskMeta || realSccmMeta) && (
                    <p style={{ ...styles.formHelper, marginTop: 10 }}>
                      {realInaktifMeta && <>İnaktif Cihazlar: <strong>{realInaktifMeta.fileName}</strong> ({realInaktifAll.length} kayıt)</>}
                      {realInaktifMeta && (realDiskMeta || realSccmMeta) && " · "}
                      {realDiskMeta && <>Disk Alanı: <strong>{realDiskMeta.fileName}</strong> ({realDiskAll.length} kayıt)</>}
                      {realDiskMeta && realSccmMeta && " · "}
                      {realSccmMeta && <>SCCM (Zimmet): <strong>{realSccmMeta.fileName}</strong> ({realSccmAll.length} kayıt)</>}
                    </p>
                  )}
                </div>

                <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${pal.line}` }}>
                  <p style={styles.formLabel}>TuruncuHat ve Monitör Raporu (üçlü karşılaştırma)</p>
                  <p style={styles.formHelper}>
                    TuruncuHat, İnaktif Cihazlar ile aynı sistemden gelir (Seri No, Sahibi, LBS, Sahibi Firma).
                    Monitör Raporu ayrı bir dosyadır (Hostname, Username, Monitor Serial Number, Monitor Model).
                    Lokasyon E-posta Listesi: Lokasyon Kodu, Açık Lokasyon Adı, E-posta Adresi, IP_Address (Lokasyon Hostname/IP raporu ve İnaktif e-postaları için).
                  </p>
                  <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                    <label style={{ ...styles.btnGhost, cursor: "pointer" }}>
                      TuruncuHat Envanteri Seç…
                      <input type="file" accept=".xlsx,.csv" onChange={handleManualThFile} style={{ display: "none" }} />
                    </label>
                    <label style={{ ...styles.btnGhost, cursor: "pointer" }}>
                      Monitör Raporu Seç…
                      <input type="file" accept=".xlsx,.csv" onChange={handleManualMonitorFile} style={{ display: "none" }} />
                    </label>
                    <label style={{ ...styles.btnGhost, cursor: "pointer" }}>
                      Lokasyon E-posta Listesi Seç…
                      <input type="file" accept=".xlsx,.csv" onChange={handleManualLokasyonMailFile} style={{ display: "none" }} />
                    </label>
                  </div>
                  {(realThMeta || realMonitorMeta || realLokasyonMailMeta) && (
                    <p style={{ ...styles.formHelper, marginTop: 10 }}>
                      {realThMeta && <>TuruncuHat: <strong>{realThMeta.fileName}</strong> ({realThAll.length} kayıt)</>}
                      {realThMeta && realMonitorMeta && " · "}
                      {realMonitorMeta && <>Monitor: <strong>{realMonitorMeta.fileName}</strong> ({realMonitorAll.length} kayıt)</>}
                      {realLokasyonMailMeta && <> · Lokasyon E-posta Listesi: <strong>{realLokasyonMailMeta.fileName}</strong> ({realLokasyonMailAll.length} kayıt)</>}
                    </p>
                  )}
                </div>

                <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${pal.line}` }}>
                  <p style={styles.formLabel}>LAKESIDE — Weekly BSOD Raporu</p>
                  <p style={styles.formHelper}>
                    LakeSide'ın haftalık BSOD (mavi ekran) Excel'i (Crash Date · Machine Name · Application Name · BSOD Count).
                    Her stop code için olası neden + Lenovo ThinkPad / kurumsal Windows imajı çözüm adımları uygulamaya gömülüdür;
                    "BSOD" raporunda listelenir ve "E-posta Gönder" ile çözüm taslağı olarak iletilir.
                  </p>
                  <label style={{ ...styles.btnGhost, cursor: "pointer", display: "inline-flex", marginTop: 8 }}>
                    Weekly_BSOD_*.xlsx Seç…
                    <input type="file" accept=".xlsx" onChange={handleManualBsodFile} style={{ display: "none" }} />
                  </label>
                  {realBsodMeta && (
                    <p style={{ ...styles.formHelper, marginTop: 10 }}>
                      BSOD: <strong>{realBsodMeta.fileName}</strong> ({realBsodAll.length} olay ·{" "}
                      {new Set(realBsodAll.map((r) => r.hostShort)).size} cihaz ·{" "}
                      {bsodCoverage(realBsodAll.map((r) => r.bsodCode)).filter((c) => !c.resolved).length} tanımsız kod)
                    </p>
                  )}
                </div>
              </div>

              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <div style={styles.settingsSectionHead}>
                  <p style={styles.settingsSectionTitle}>Kullanılmayan Cihazlar & LakeSide Batarya</p>
                </div>
                <p style={styles.pageSub}>
                  "Kullanılmayan Cihazlar" raporunda, SCCM'de kaydı olan bir cihazın son girişi bu gün
                  sayısından eskiyse cihaz "kullanılmıyor" sayılır (SCCM'de hiç kaydı olmayan OBS zimmetli
                  cihazlar her hâlükârda listelenir).
                </p>
                <div style={styles.formGrid}>
                  <div style={styles.formField}>
                    <label style={styles.formLabel}>"Son giriş çok eski" eşiği (gün)</label>
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={appConfig.unusedStaleDays}
                      onChange={(e) => setAppConfig((prev) => ({ ...prev, unusedStaleDays: e.target.value }))}
                      style={styles.formInput}
                    />
                  </div>
                </div>
                <div style={styles.formActions}>
                  <button style={styles.btnPrimary} onClick={saveAppConfigSettings} disabled={savingAppConfig}>
                    {savingAppConfig ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                </div>

                <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${pal.line}` }}>
                  <p style={styles.formLabel}>LAKESIDE — Battery Health Raporu</p>
                  <p style={styles.formHelper}>
                    LakeSide'ın batarya sağlığı Excel'ini buradan BİR KEZ yükle — backend'e kalıcı kaydedilir,
                    LAKESIDE → <strong>Battery Health</strong> raporunda otomatik görünür, tekrar dosya seçmene
                    gerek kalmaz (aynı seçim rapor ekranından da yapılabilir, ikisi de aynı yere kaydeder). Cihaz
                    Genel Görünüm'deki "Batarya" kartı da hostname eşleşmesiyle otomatik dolar.
                  </p>
                  <label style={{ ...styles.btnGhost, cursor: "pointer", display: "inline-flex", marginTop: 8 }}>
                    {loadingBattery ? "Yükleniyor..." : "Battery Health *.xlsx Seç…"}
                    <input type="file" accept=".xlsx" onChange={handleManualBatteryFile} style={{ display: "none" }} disabled={loadingBattery} />
                  </label>
                  {realBatteryMeta && (
                    <p style={{ ...styles.formHelper, marginTop: 10 }}>
                      Yüklü: <strong>{realBatteryMeta.fileName}</strong> ({realBatteryAll.length} kayıt ·{" "}
                      {realBatteryAll.filter((r) => r.batteryHealth != null).length} sağlık değeri okundu)
                    </p>
                  )}
                </div>

                <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${pal.line}` }}>
                  <p style={styles.formLabel}>NETWORK — Ofis Bant Genişliği Raporu</p>
                  <p style={styles.formHelper}>
                    Monitoring aracının CSV export'unu buradan BİR KEZ yükle — backend'e kalıcı kaydedilir,
                    Network → <strong>Ofis Bant Genişliği</strong> raporunda otomatik görünür, tekrar dosya
                    seçmene gerek kalmaz (aynı seçim rapor ekranından da yapılabilir, ikisi de aynı yere kaydeder).
                  </p>
                  <label style={{ ...styles.btnGhost, cursor: "pointer", display: "inline-flex", marginTop: 8 }}>
                    {loadingBant ? "Yükleniyor..." : "Bant Genişliği *.csv Seç…"}
                    <input type="file" accept=".csv" onChange={handleManualBantFile} style={{ display: "none" }} disabled={loadingBant} />
                  </label>
                  {realBantMeta && (
                    <p style={{ ...styles.formHelper, marginTop: 10 }}>
                      Yüklü: <strong>{realBantMeta.fileName}</strong> ({realBantAll.length} kayıt ·{" "}
                      {new Date(realBantMeta.modifiedAt).toLocaleString("tr-TR")})
                    </p>
                  )}
                </div>
              </div>
              </>
              )}

            </>
            )
          ) : showHistory ? (
            <>
              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <p style={styles.pageTitle}>Gönderim Geçmişi</p>
                <p style={styles.pageSub}>Hangi kullanıcı, ne zaman, hangi rapor için, kime e-posta gönderdi. Bir satıra tıklayınca kişi ve cihaz bazında sonuçları görürsünüz.</p>
              </div>
              <div style={{ ...styles.panel, padding: "12px 16px", marginBottom: 14 }} className="no-print" data-history-filters>
                <div data-history-row style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ ...styles.searchWrap, flex: "2 1 220px", maxWidth: "none", padding: "6px 11px", boxSizing: "border-box" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.3-4.3" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Kişi, cihaz veya e-posta ara..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      style={{ ...styles.searchInput, fontSize: 13 }}
                    />
                    {historySearch && (
                      <span style={styles.searchClear} onClick={() => setHistorySearch("")} title="Aramayı temizle">✕</span>
                    )}
                  </div>
                  <select style={{ ...{ ...styles.scheduleSelect, fontSize: 13, padding: "6px 9px", boxSizing: "border-box", minWidth: 0 }, flex: "1 1 120px" }} value={historyStatusFilter} onChange={(e) => setHistoryStatusFilter(e.target.value)}>
                    <option value="all">Tüm Durumlar</option>
                    <option value="Başarılı">Başarılı</option>
                    <option value="Kısmen Başarısız">Kısmen Başarısız</option>
                    <option value="Gönderilemedi">Gönderilemedi</option>
                  </select>
                  <select style={{ ...{ ...styles.scheduleSelect, fontSize: 13, padding: "6px 9px", boxSizing: "border-box", minWidth: 0 }, flex: "1 1 120px" }} value={historyDeptFilter} onChange={(e) => setHistoryDeptFilter(e.target.value)} title="Gönderimin kapsamı (şirket ya da kayıt türü)">
                    <option value="all">Tüm Kapsamlar</option>
                    {historyScopes.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select style={{ ...{ ...styles.scheduleSelect, fontSize: 13, padding: "6px 9px", boxSizing: "border-box", minWidth: 0 }, flex: "1 1 120px" }} value={historyReportFilter} onChange={(e) => setHistoryReportFilter(e.target.value)}>
                    <option value="all">Tüm Raporlar</option>
                    {historyReports.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <select style={{ ...{ ...styles.scheduleSelect, fontSize: 13, padding: "6px 9px", boxSizing: "border-box", minWidth: 0 }, flex: "1 1 120px" }} value={historySenderFilter} onChange={(e) => setHistorySenderFilter(e.target.value)}>
                    <option value="all">Tüm Gönderenler</option>
                    {historySenders.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div data-history-dates style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
                    <input type="date" style={{ ...styles.scheduleSelect, fontSize: 13, padding: "6px 8px", width: 134, boxSizing: "border-box" }} value={historyDateFrom} onChange={(e) => setHistoryDateFrom(e.target.value)} title="Başlangıç tarihi" aria-label="Başlangıç tarihi" />
                    <span style={{ color: pal.inkSoft }}>–</span>
                    <input type="date" style={{ ...styles.scheduleSelect, fontSize: 13, padding: "6px 8px", width: 134, boxSizing: "border-box" }} value={historyDateTo} onChange={(e) => setHistoryDateTo(e.target.value)} title="Bitiş tarihi" aria-label="Bitiş tarihi" />
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div data-history-summary style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13, color: pal.inkSoft }}>
                      <span><b style={{ color: pal.ink }}>{filteredMailHistory.length}</b> / {mailHistory.length} gönderim{historyFilterCount > 0 ? ` · ${historyFilterCount} aktif filtre` : ""}</span>
                      {historyFilterCount > 0 && <span role="button" data-history-clear onClick={clearHistoryFilters} style={{ cursor: "pointer", color: pal.accent, fontWeight: 600 }}>Filtreleri temizle</span>}
                    </div>
                </div>
              </div>

              <div style={styles.detailLayoutRow}>
                <div style={styles.panel} className="print-area">
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Tarih</th>
                        <th style={styles.th}>Gönderen</th>
                        <th style={styles.th}>Rapor Türü</th>
                        <th style={styles.th}>Kayıt Sayısı</th>
                        <th style={styles.th}>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMailHistory.map((h) => (
                        <tr
                          key={h.id}
                          style={{ cursor: "pointer", ...(selectedHistoryId === h.id ? styles.rowSelected : {}) }}
                          onClick={() => selectHistoryRow(h)}
                        >
                          <td style={styles.td}>
                            <span style={styles.serial}>{h.date}</span>
                            {h.time && <div style={styles.cellSub}>{h.time}</div>}
                          </td>
                          <td style={styles.td}>{h.senderUsername || "—"}</td>
                          <td style={styles.td}>
                            <div style={{ fontWeight: 600 }}>{historyReportBase(h.report)}</div>
                            {h.dept && <div style={styles.cellSub}>{h.dept}</div>}
                          </td>
                          <td style={styles.td}>{h.recipients} kayıt</td>
                          <td style={styles.td}>
                            <span style={{ ...styles.badge, ...(h.status === "Başarılı" ? styles.badgeOk : h.status === "Gönderilemedi" ? styles.badgeBad : styles.badgeNeutral) }}>
                              <span style={{ ...styles.badgeDot, background: h.status === "Başarılı" ? pal.ok : h.status === "Gönderilemedi" ? pal.bad : pal.inkSoft }} />
                              {h.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredMailHistory.length === 0 && (
                        <tr>
                          <td style={{ ...styles.td, textAlign: "center", color: pal.inkSoft }} colSpan={5}>
                            {mailHistory.length === 0
                              ? "Henüz e-posta gönderilmedi — bir rapor ekranında \"E-posta Gönder\" butonuna basınca burada görünecek"
                              : <>Filtreyle eşleşen kayıt yok. <span role="button" onClick={clearHistoryFilters} style={{ cursor: "pointer", color: pal.accent, fontWeight: 600 }}>Filtreleri temizle</span></>}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Gönderim Detayı — sağ panel (gereksinim #12/#13) */}
                <div ref={detailRef} style={{ ...styles.detailAside, top: detailTop }} className="no-print">
                  {!selectedHistoryId ? (
                    <div style={styles.detailEmpty}>Detayları görmek için soldaki listeden bir gönderim seçin</div>
                  ) : (
                    (() => {
                      const h = mailHistory.find((m) => m.id === selectedHistoryId);
                      if (!h) return <div style={styles.detailEmpty}>Kayıt bulunamadı</div>;
                      return (
                        <>
                          <p style={{ ...styles.pageTitle, fontSize: 18 }}>Gönderim Detayı</p>
                          <div>
                            <div style={styles.detailFieldRow}><span style={{ color: pal.ink, fontWeight: 700 }}>Gönderen kullanıcı</span><span>{h.senderUsername || "—"}</span></div>
                            <div style={styles.detailFieldRow}><span style={{ color: pal.ink, fontWeight: 700 }}>Gönderim tarihi</span><span>{h.date}</span></div>
                            <div style={styles.detailFieldRow}><span style={{ color: pal.ink, fontWeight: 700 }}>Gönderim saati</span><span>{h.time || "—"}</span></div>
                            <div style={styles.detailFieldRow}><span style={{ color: pal.ink, fontWeight: 700 }}>Rapor</span><span>{historyReportBase(h.report)}</span></div>
                            <div style={styles.detailFieldRow}><span style={{ color: pal.ink, fontWeight: 700 }}>Kapsam</span><span>{h.dept || "—"}</span></div>
                            <div style={styles.detailFieldRow}><span style={{ color: pal.ink, fontWeight: 700 }}>Gönderim durumu</span><span>{h.status}</span></div>
                            <div style={styles.detailFieldRow}><span style={{ color: pal.ink, fontWeight: 700 }}>Kayıt sayısı</span><span>{h.recipients}</span></div>
                            <div style={{ ...styles.detailFieldRow, borderBottom: "none" }}>
                              <span style={{ color: pal.ink, fontWeight: 700 }}>Alıcı sayısı</span>
                              <span>{(() => {
                                if (!selectedHistoryDetails || selectedHistoryDetails.length === 0) return "—";
                                const to = new Set(selectedHistoryDetails.filter((d) => d.recipientEmail || d.to).map((d) => String(d.recipientEmail || d.to).toLowerCase()));
                                return to.size > 0 ? to.size : "—";
                              })()}</span>
                            </div>
                          </div>

                          <div>
                            <p style={{ ...styles.formLabel, marginBottom: 8, color: pal.ink, fontWeight: 700 }}>Kişi / Cihaz Bazında Detay</p>
                            {loadingHistoryDetails ? (
                              <p style={styles.formHelper}>Yükleniyor...</p>
                            ) : !selectedHistoryDetails || selectedHistoryDetails.length === 0 ? (
                              <p style={styles.formHelper}>Bu gönderim için detay kaydı yok</p>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 320, overflowY: "auto" }}>
                                {selectedHistoryDetails.map((d, i) => (
                                  <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: pal.fieldBg, fontSize: 13 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                      <span style={{ fontWeight: 600 }}>{d.recipientUser || d.location || "—"}</span>
                                      <span style={{ ...styles.badge, ...((d.sendingStatus ? d.sendingStatus === "Başarılı" : d.ok) ? styles.badgeOk : styles.badgeBad) }}>
                                        <span style={{ ...styles.badgeDot, background: (d.sendingStatus ? d.sendingStatus === "Başarılı" : d.ok) ? pal.ok : pal.bad }} />
                                        {d.sendingStatus || (d.ok ? "Başarılı" : "Başarısız")}
                                      </span>
                                    </div>
                                    {(d.recipientEmail || d.to) && <div style={{ color: pal.inkSoft, marginTop: 2 }}>{d.recipientEmail || d.to}</div>}
                                    {(d.device || d.deviceModel) && (
                                      <div style={{ color: pal.inkSoft, marginTop: 2 }}>
                                        {d.device}{d.deviceModel ? ` — ${d.deviceModel}` : ""}
                                      </div>
                                    )}
                                    {d.message && !(d.sendingStatus ? d.sendingStatus === "Başarılı" : d.ok) && <div style={{ color: pal.bad, marginTop: 2 }}>{d.message}</div>}
                                    {d.ok && d.previewUrl && (
                                      <a href={d.previewUrl} target="_blank" rel="noreferrer" style={{ color: pal.accent, fontSize: 12 }}>Önizle ↗</a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()
                  )}
                </div>
              </div>
            </>
          ) : activeReport === "yeni-kurulum" && !activeNetworkView ? (
            <NewInstallScreen
              styles={styles}
              pal={pal}
              user={user}
              locationOptions={installLocations}
              thRows={realThAll}
              mailGroupsText={mailGroupsText}
              recordMailHistory={recordMailHistory}
              showToast={showToast}
            />
          ) : activeReport === "kapatma-onayi" && !activeNetworkView ? (
            <PendingClosureScreen styles={styles} pal={pal} showToast={showToast} thRows={realThAll} />
          ) : activeReport === "atil-monitor" && !activeNetworkView ? (
            <AtilMonitorReportScreen
              key={atilStage || "varsayilan"}
              initialStage={atilStage || "atil"}
              styles={styles}
              pal={pal}
              thRows={byCompany(realThAll, activeCompany)}
              monitorRows={realMonitorAll}
              thMeta={realThMeta}
              monitorMeta={realMonitorMeta}
              loading={loadingRealTh || loadingRealMonitor}
              showToast={showToast}
              recordMailHistory={recordMailHistory}
              deptLabel={currentDeptLabel}
            />
          ) : activeReport === "darbogaz" && !activeNetworkView ? (
            <DarbogazScreen
              styles={styles}
              pal={pal}
              rows={byCompany(bottleneck.rows, activeCompany)}
              summary={bottleneck.summary}
              loading={loadingRealSccm}
            />
          ) : activeReport === "sccm-ajan" && !activeNetworkView ? (
            <SccmAjanScreen
              styles={styles}
              pal={pal}
              rows={realSccmAll.map((r) => r._raw)}
              meta={realSccmMeta}
              loading={loadingRealSccm}
              onLoadClick={loadRealSccmData}
            />
          ) : activeNetworkView === "bant-genisligi" ? (
            <BantGenisligiScreen
              styles={styles}
              pal={pal}
              rows={realBantAll}
              meta={realBantMeta}
              lokasyonRows={realLokasyonMailAll}
              search={bantSearch}
              setSearch={setBantSearch}
              statusFilter={bantStatusFilter}
              setStatusFilter={setBantStatusFilter}
              onFileSelect={handleManualBantFile}
              isMaster={isMaster}
              showToast={showToast}
              recordMailHistory={recordMailHistory}
            />
          ) : activeNetworkView ? (
            <>
              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <p style={styles.pageTitle}>{NETWORK_ITEMS.find((n) => n.id === activeNetworkView)?.name}</p>
                <p style={styles.pageSub}>
                  Veri kaynağı tanımlı değil — bu rapor için şimdilik gerçek bir kaynak bağlanmadı (bkz. konuşma: manuel yükleme/SharePoint/API kararı ileride verilecek).
                </p>
                <div style={{ ...styles.detailEmpty, marginTop: 8 }}>
                  Bu ekran için veri henüz tanımlı değil. Veri kaynağı netleştiğinde (SharePoint/API) otomatik olarak burada listelenecek.
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ ...styles.panel, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 420px", minWidth: 0 }}>
                <p style={styles.pageTitle}>
                  {REPORT_TYPES.find((r) => r.id === activeReport).name} — {currentDeptLabel}
                </p>
                <p style={styles.pageSub}>
                  {isZimmet
                    ? realSccmMeta
                      ? `Gerçek veri (SCCM) — ${realSccmMeta.fileName} (${new Date(realSccmMeta.modifiedAt).toLocaleString("tr-TR")}) · her kişinin zimmetli cihazı ile SCCM'e göre kullandığı cihaz karşılaştırılıyor`
                      : "Henüz SCCM envanter dosyası yüklenmedi — aşağıdan yükleyin"
                    : isLokasyonIp
                    ? realSccmMeta && realLokasyonMailMeta
                      ? `SCCM (${realSccmMeta.fileName}) × Lokasyon E-posta Listesi (${realLokasyonMailMeta.fileName}) — hostname'in işaret ettiği ofis ile cihazın gerçek 172.x IP'si karşılaştırılıyor. Sadece lokasyon kodu bilinen ve 172.x IP'si olan cihazlar listelenir.`
                      : "Henüz SCCM ve/veya Lokasyon E-posta Listesi dosyası yüklenmedi — aşağıdan yükleyin"
                    : isUnused
                    ? realThMeta
                      ? `TuruncuHat (OBS zimmetli) × SCCM karşılaştırması — SCCM'de hiç kaydı olmayan veya son girişi ${staleDays} günden eski cihazlar "kullanılmıyor" sayılır. Eşik Ayarlar'dan değiştirilebilir.`
                      : "Henüz TuruncuHat envanteri yüklenmedi — aşağıdan yükleyin"
                    : isBsod
                    ? realBsodMeta
                      ? `LakeSide BSOD — ${realBsodMeta.fileName} · ${realBsodAll.length} olay · ${bsodRows.filter((r) => r.sccmMatched).length} kayıt SCCM ile eşleşti. Her stop code için neden + ThinkPad/kurumsal çözüm adımları gömülü; e-posta lokasyon bazlı (SCCM EnvanterLokasyon → Lokasyon E-posta Grupları) gönderilir.`
                      : "Henüz Weekly_BSOD Excel'i yüklenmedi — aşağıdan seçin"
                    : isBattery
                    ? realBatteryMeta
                      ? `LakeSide Battery Health — ${realBatteryMeta.fileName} · ${realBatteryAll.length} cihaz · ${batteryRows.filter((r) => r.sccmMatched).length} kayıt SCCM ile eşleşti. Eşik: %60 altı "Değişmeli", %80 altı "İzlenmeli"; e-posta lokasyon bazlı gönderilir.`
                      : "Henüz Battery Health Excel'i yüklenmedi — aşağıdan seçin"
                    : usingRealFileData && (usingRealInaktif ? realInaktifMeta : realDiskMeta)
                    ? `Gerçek veri — ${(usingRealInaktif ? realInaktifMeta : realDiskMeta).fileName} (${new Date((usingRealInaktif ? realInaktifMeta : realDiskMeta).modifiedAt).toLocaleString("tr-TR")})`
                    : REPORTS_WITH_REAL_DATA.has(activeReport)
                    ? "Henüz veri yüklenmedi — Ayarlar > Veri Girişi bölümünden dosyayı seçin"
                    : "Bu rapor için henüz bir veri kaynağı tanımlı değil"}
                </p>
                </div>
                {reportPageSummary(activeReport)}
                </div>
                {(() => {
                  const s = summaryDetail && summaryFor(activeReport);
                  if (!s) return null;
                  const meta = {
                    cozulen: ["Çözülen", "Önceki dönemde sorunluydu, bu dönem listede yok", pal.ok],
                    yeniTespit: ["Yeni tespit", "Önceki dönemde yoktu, bu dönem sorunlu listede", pal.bad],
                    devamEden: ["Bekleyen", "Önceki dönemde de sorunluydu, hâlâ sorunlu", pal.inkSoft],
                  }[summaryDetail];
                  const list = s.lists[summaryDetail] || [];
                  return (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${pal.line}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: meta[2] }}>
                          {meta[0]} — {list.length} cihaz <span style={{ fontWeight: 500, color: pal.inkSoft }}>({s.prevLabel} → {s.periodLabel}) · {meta[1]}</span>
                        </span>
                        <span style={{ cursor: "pointer", fontSize: 13, color: pal.inkSoft }} onClick={() => setSummaryDetail(null)} title="Kapat">✕</span>
                      </div>
                      {list.length === 0 ? (
                        <div style={{ fontSize: 13, color: pal.inkSoft }}>Bu kategoride cihaz yok.</div>
                      ) : (
                        <div style={{ maxHeight: 260, overflowY: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                              <tr>
                                {["Hostname", "Seri No", "Lokasyon", "Üst Lokasyon"].map((h) => (
                                  <th key={h} style={{ ...styles.th, position: "static" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {list.slice(0, 300).map((d, i) => (
                                <tr key={d.key || i} style={{ borderTop: `1px solid ${pal.line}` }}>
                                  <td style={{ padding: "7px 10px" }}>{d.hostname || "—"}</td>
                                  <td style={{ padding: "7px 10px" }}>{d.serial || "—"}</td>
                                  <td style={{ padding: "7px 10px" }}>{d.location || "—"}</td>
                                  <td style={{ padding: "7px 10px" }}>{d.lbsParent || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {list.length > 300 && <div style={{ fontSize: 12, color: pal.inkSoft, padding: "6px 10px" }}>İlk 300 cihaz gösteriliyor.</div>}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {isBsod && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                    {isMaster ? (
                      <label style={{ ...styles.chipToggle, display: "inline-flex", cursor: "pointer" }}>
                        📄 Weekly_BSOD Excel Seç…
                        <input type="file" accept=".xlsx" onChange={handleManualBsodFile} style={{ display: "none" }} />
                      </label>
                    ) : (
                      <span style={{ fontSize: 12, color: pal.inkSoft }}>Dosya yükleme yalnızca Supervisor kullanıcılarına açıktır.</span>
                    )}
                    <input
                      type="text"
                      placeholder="Eşleşmeyen cihazlar için yedek e-posta alıcısı (isteğe bağlı)"
                      value={bsodMailTo}
                      onChange={(e) => setBsodMailTo(e.target.value)}
                      style={{ ...styles.searchInput, border: `1px solid ${pal.line}`, borderRadius: 8, padding: "8px 11px", minWidth: 260, background: pal.fieldBg }}
                    />
                  </div>
                )}
                {isBattery && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                    {isMaster ? (
                      <label style={{ ...styles.chipToggle, display: "inline-flex", cursor: "pointer" }}>
                        📄 Battery Health Excel Seç…
                        <input type="file" accept=".xlsx" onChange={handleManualBatteryFile} style={{ display: "none" }} />
                      </label>
                    ) : (
                      <span style={{ fontSize: 12, color: pal.inkSoft }}>Dosya yükleme yalnızca Supervisor kullanıcılarına açıktır.</span>
                    )}
                    <input
                      type="text"
                      placeholder="Eşleşmeyen cihazlar için yedek e-posta alıcısı (isteğe bağlı)"
                      value={bsodMailTo}
                      onChange={(e) => setBsodMailTo(e.target.value)}
                      style={{ ...styles.searchInput, border: `1px solid ${pal.line}`, borderRadius: 8, padding: "8px 11px", minWidth: 260, background: pal.fieldBg }}
                    />
                  </div>
                )}
                <div style={styles.statStrip}>
                  <div
                    style={{ ...styles.stat, ...styles.statClickable, ...(segment === "all" ? styles.statActive : {}) }}
                    onClick={() => setSegment("all")}
                    title="Tümünü göster"
                  >
                    <span style={styles.statNum}>{rawRows.length}</span>
                    <span style={styles.statLabel}>Toplam Kayıt</span>
                  </div>
                  {!isUnused && !isBsod && !isBattery && !isDiskReport && (
                  <div
                    style={{ ...styles.stat, ...styles.statClickable, ...(segment === "matched" ? styles.statActive : {}) }}
                    onClick={() => setSegment("matched")}
                    title={isZimmet ? "Zimmet doğru olanları göster" : activeReport === "inaktif" ? "Kullanılmayan cihazları göster" : "Eşleşenleri göster"}
                  >
                    <span style={{ ...styles.statNum, color: activeReport === "inaktif" ? pal.bad : pal.ok }}>{matchedCount}</span>
                    <span style={styles.statLabel}>{isZimmet ? "Zimmet Doğru" : activeReport === "inaktif" ? "Kullanılmıyor" : "Eşleşen"}</span>
                  </div>
                  )}
                  {!isUnused && !isBsod && !isBattery && !isDiskReport && (
                  <div
                    style={{ ...styles.stat, ...styles.statClickable, ...(segment === "unmatched" ? styles.statActive : {}) }}
                    onClick={() => setSegment("unmatched")}
                    title={isZimmet ? "Zimmet hatalı olanları göster" : activeReport === "inaktif" ? "Kullanımdaki cihazları göster" : "Eşleşmeyenleri göster"}
                  >
                    <span style={{ ...styles.statNum, color: activeReport === "inaktif" ? pal.ok : pal.bad }}>{unmatchedCount}</span>
                    <span style={styles.statLabel}>{isZimmet ? "Zimmet Hatalı" : activeReport === "inaktif" ? "Kullanımda" : "Eşleşmeyen"}</span>
                  </div>
                  )}
                  {/* Disk Alanı — kullanıcı isteği: "Tümü/Eşleşen/Eşleşmeyen" anlamsız (bu raporda
                      eşleşme kavramı yok), dashboard'daki Kritik/Uyarı/Normal eşikleriyle aynı
                      seviyelere göre filtre (bkz. konuşma, bkz. dashboardService.classifyDisk). */}
                  {isDiskReport && (
                  <div
                    style={{ ...styles.stat, ...styles.statClickable, ...(segment === "critical" ? styles.statActive : {}) }}
                    onClick={() => setSegment("critical")}
                    title="Kritik (≤10 GB) diskleri göster"
                  >
                    <span style={{ ...styles.statNum, color: pal.bad }}>{rawRows.filter((r) => r.diskLevel === "critical").length}</span>
                    <span style={styles.statLabel}>Kritik (≤10 GB)</span>
                  </div>
                  )}
                  {isDiskReport && (
                  <div
                    style={{ ...styles.stat, ...styles.statClickable, ...(segment === "warning" ? styles.statActive : {}) }}
                    onClick={() => setSegment("warning")}
                    title="Uyarı (≤20 GB) diskleri göster"
                  >
                    <span style={{ ...styles.statNum, color: pal.warnFg || pal.bad }}>{rawRows.filter((r) => r.diskLevel === "warning").length}</span>
                    <span style={styles.statLabel}>Uyarı (≤20 GB)</span>
                  </div>
                  )}
                  {isDiskReport && (
                  <div
                    style={{ ...styles.stat, ...styles.statClickable, ...(segment === "normal" ? styles.statActive : {}) }}
                    onClick={() => setSegment("normal")}
                    title="Normal (>20 GB) diskleri göster"
                  >
                    <span style={{ ...styles.statNum, color: pal.ok }}>{rawRows.filter((r) => r.diskLevel === "normal").length}</span>
                    <span style={styles.statLabel}>Normal (&gt;20 GB)</span>
                  </div>
                  )}
                  {isBattery && (
                  <div style={styles.stat}>
                    <span style={{ ...styles.statNum, color: pal.bad }}>{rawRows.filter((r) => r.batteryHealth != null && r.batteryHealth < 60).length}</span>
                    <span style={styles.statLabel}>Değişmeli (&lt;%60)</span>
                  </div>
                  )}
                  {isBattery && (
                  <div style={styles.stat}>
                    <span style={{ ...styles.statNum, color: pal.warnFg || pal.bad }}>{rawRows.filter((r) => r.batteryHealth != null && r.batteryHealth >= 60 && r.batteryHealth < 80).length}</span>
                    <span style={styles.statLabel}>İzlenmeli (&lt;%80)</span>
                  </div>
                  )}
                  {isBsod && (
                  <div style={styles.stat}>
                    <span style={{ ...styles.statNum, color: pal.accent }}>{new Set(rawRows.map((r) => r.hostShort)).size}</span>
                    <span style={styles.statLabel}>Etkilenen Cihaz</span>
                  </div>
                  )}
                  {isBsod && (
                  <div style={styles.stat}>
                    <span style={{ ...styles.statNum, color: pal.bad }}>{new Set(rawRows.map((r) => r.bsodName)).size}</span>
                    <span style={styles.statLabel}>Farklı Hata Tipi</span>
                  </div>
                  )}
                  {isUnused && (
                  <div style={styles.stat}>
                    <span style={{ ...styles.statNum, color: pal.bad }}>{rawRows.filter((r) => r.sccmStatus === "SCCM'de Yok").length}</span>
                    <span style={styles.statLabel}>SCCM'de Yok</span>
                  </div>
                  )}
                  {isUnused && (
                  <div style={styles.stat}>
                    <span style={{ ...styles.statNum, color: pal.warnFg || pal.bad }}>{rawRows.filter((r) => r.statusTag === "Kullanılmıyor — Son Giriş Çok Eski").length}</span>
                    <span style={styles.statLabel}>Giriş Çok Eski</span>
                  </div>
                  )}
                  {isZimmet && snoozedCount > 0 && (
                    <div
                      style={{ ...styles.stat, ...styles.statClickable, ...(showSnoozed ? styles.statActive : {}) }}
                      onClick={() => setShowSnoozed((v) => !v)}
                      title={showSnoozed ? "Ertelenenleri gizle" : "Ertelenenleri göster"}
                    >
                      <span style={{ ...styles.statNum, color: pal.inkSoft }}>{snoozedCount}</span>
                      <span style={styles.statLabel}>Ertelenen</span>
                    </div>
                  )}
                  {isZimmet && (notedCount > 0 || showNotedOnly) && (
                    <div
                      style={{ ...styles.stat, ...styles.statClickable, ...(showNotedOnly ? styles.statActive : {}) }}
                      onClick={() => setShowNotedOnly((v) => !v)}
                      title={showNotedOnly ? "Not filtresini kaldır" : "Sadece notlanmış kayıtları göster"}
                    >
                      <span style={{ ...styles.statNum, color: pal.accent }}>📝 {notedCount}</span>
                      <span style={styles.statLabel}>Notlanmış</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={detailRow ? styles.detailLayoutRow : undefined}>
              <div style={styles.panel} className="print-area">
                <div style={styles.toolbar} className="no-print">
                <div style={styles.toolbarFiltersRow}>
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

                  {deviceCategories.length > 1 && (
                    <MultiSelectFilter
                      label={typeFilterLabel}
                      options={deviceCategories}
                      selected={typeFilter}
                      onChange={setTypeFilter}
                      styles={styles}
                      pal={pal}
                    />
                  )}

                  {lbsParentCategories.length > 1 && (
                    <MultiSelectFilter
                      label="Üst Lokasyon"
                      options={lbsParentCategories}
                      selected={lbsParentFilter}
                      onChange={setLbsParentFilter}
                      styles={styles}
                      pal={pal}
                    />
                  )}

                  {!isDiskReport && locationCategories.length > 1 && (
                    <MultiSelectFilter
                      label={isLokasyonIp ? "Beklenen Ofis" : isBattery ? "Pil Durumu" : "Lokasyon"}
                      options={locationCategories}
                      selected={locationFilter}
                      onChange={setLocationFilter}
                      styles={styles}
                      pal={pal}
                    />
                  )}
                  {showModelFilter && modelCategories.length > 1 && (
                    <MultiSelectFilter
                      label="Model"
                      options={modelCategories}
                      selected={modelFilter}
                      onChange={setModelFilter}
                      styles={styles}
                      pal={pal}
                    />
                  )}
                  {windowsCategories.length > 0 && (
                    <MultiSelectFilter
                      label="Windows"
                      options={windowsCategories}
                      selected={windowsFilter}
                      onChange={setWindowsFilter}
                      styles={styles}
                      pal={pal}
                    />
                  )}
                  {statusCategories.length > 1 && (
                    <MultiSelectFilter
                      label="Durum"
                      options={statusCategories}
                      selected={statusFilter}
                      onChange={setStatusFilter}
                      styles={styles}
                      pal={pal}
                    />
                  )}
                </div>

                {/* Filtre dropdown'larından ayrı bir satır — görünüm modu (Tümü/Doğru/Hatalı/
                    Monitör) ve ek etiketler farklı bir amaca hizmet ediyor, aynı satırda arama +
                    3-4 dropdown + segment + chip'ler sıkışık görünüyordu (bkz. konuşma). */}
                <div style={{ ...styles.toolbarFiltersRow, marginTop: 10 }}>
                  <div style={styles.segmented}>
                    {[
                      { id: "all", label: "Tümü" },
                      // Disk Alanı — Tümü/Eşleşen/Eşleşmeyen yerine dashboard'daki Kritik/Uyarı/
                      // Normal seviyeleriyle aynı filtre (bkz. konuşma).
                      ...(isDiskReport ? [
                        { id: "critical", label: "Kritik" },
                        { id: "warning", label: "Uyarı" },
                        { id: "normal", label: "Normal" },
                      ] : []),
                      // Kullanılmayan Cihazlar'da her satır zaten "kullanılmıyor" (matched:false) —
                      // Eşleşen/Eşleşmeyen ayrımı anlamsız, gösterilmez.
                      ...(isUnused || isBsod || isBattery || isDiskReport ? [] : [
                        { id: "matched", label: isZimmet ? "Zimmet Doğru" : activeReport === "inaktif" ? "Kullanılmıyor" : "Eşleşen" },
                        { id: "unmatched", label: isZimmet ? "Zimmet Hatalı" : activeReport === "inaktif" ? "Kullanımda" : "Eşleşmeyen" },
                      ]),
                      // Gereksinim: "bunu raporda ayırabilmem gerekiyor" — TH+Monitor Raporu
                      // yüklüyse, sadece KESİN monitör uyuşmazlığı tespit edilen satırları ayrı
                      // görebilmek için. Sadece TH'de kaydı olmayan (doğrulanamayan) monitörler
                      // burada SAYILMAZ — bkz. konuşma, aksi halde TH eksikse rapor hep "uyumsuz"
                      // görünürdü.
                      ...(isZimmet && anyMonitorIssue ? [{ id: "monitorIssue", label: "Monitör Uyuşmazlığı" }] : []),
                      ...(isZimmet && anyNoThRecord ? [{ id: "noThRecord", label: "TH Kaydı YOK" }] : []),
                      ...(isZimmet && anyDuplicateNotebook ? [{ id: "duplicateNotebook", label: "Mükerrer Çift Zimmet" }] : []),
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

                  {isZimmet && (notedCount > 0 || showNotedOnly) && (
                    <div
                      style={{ ...styles.chipToggle, ...(showNotedOnly ? styles.statActive : {}) }}
                      onClick={() => setShowNotedOnly((v) => !v)}
                    >
                      {showNotedOnly ? "📝 Notlu filtresini kaldır" : `📝 Notlu kayıtları göster (${notedCount})`}
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
                </div>

                <div style={{ ...styles.toolbarActionsRow, marginTop: 10 }}>
                  {filteredRows.length > pageSizeOptions[0] && (
                    <div style={styles.segmented} title="Sayfada gösterilecek kayıt sayısı">
                      {pageSizeOptions.map((n) => (
                        <div
                          key={n}
                          onClick={() => setPageSize(n)}
                          style={{ ...styles.seg, ...(pageSize === n ? styles.segActive : {}) }}
                        >
                          {n === Infinity ? "Tümü" : n}
                        </div>
                      ))}
                    </div>
                  )}
                  {filteredRows.length > 0 && (
                    <button style={styles.btnGhost} onClick={toggleSelectAll}>
                      {allFilteredSelected ? "Seçimi İptal Et" : "Tümünü Seç"}
                    </button>
                  )}
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
                  {isLokasyonIp && (
                    <button style={styles.btnGhost} onClick={previewLocationIpMail} data-locip-preview>E-posta önizle</button>
                  )}
                  {/* Seçim varsa doğrudan seçililere gönderilir; seçim yoksa "hepsine gidecek" onayı sorulur */}
                  <button style={styles.btnPrimary} onClick={() => (selectedKeys.size > 0 ? handleMailAndReset() : setConfirmMailOpen(true))}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M22 2L11 13" />
                      <path d="M22 2l-7 20-4-9-9-4z" />
                    </svg>
                    E-posta Gönder
                  </button>
                </div>
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

                {layoutMode === "classic" && (
                  <TableView
                    rows={pagedRows}
                    ownerLabel={ownerLabel}
                    serialLabel={serialLabel}
                    modelLabel={modelLabel}
                    splitModel={isDiskReport}
                    locationLabel={locationLabel}
                    isZimmet={isZimmet}
                    styles={styles}
                    pal={pal}
                    rowKeyOf={rowKeyOf}
                    selectedKeys={selectedKeys}
                    toggleSelect={toggleSelect}
                    allSelected={allFilteredSelected}
                    toggleSelectAll={toggleSelectAll}
                    rowMeta={rowMeta}
                    cycleStatus={cycleStatus}
                    setNote={setNote}
                    toggleSnooze={toggleSnooze}
                    canExpandPerson={canExpandPerson}
                    showHostname={showHostname}
                    showLastLogon={showLastLogon}
                    showDeviceAge={isUnused}
                    expandedPerson={expandedPerson}
                    togglePersonExpand={togglePersonExpand}
                    allPersonRows={rawRows}
                    onOpenRecord={setHistoryPopupRow}
                    detailRowKey={detailRowKey}
                    setDetailRowKey={toggleDetailRow}
                  />
                )}
                {layoutMode === "dense" && (
                  <DenseGridView
                    rows={pagedRows}
                    ownerLabel={ownerLabel}
                    serialLabel={serialLabel}
                    modelLabel={modelLabel}
                    locationLabel={locationLabel}
                    isZimmet={isZimmet}
                    styles={styles}
                    pal={pal}
                    rowKeyOf={rowKeyOf}
                    selectedKeys={selectedKeys}
                    toggleSelect={toggleSelect}
                    allSelected={allFilteredSelected}
                    toggleSelectAll={toggleSelectAll}
                    rowMeta={rowMeta}
                    cycleStatus={cycleStatus}
                    setNote={setNote}
                    toggleSnooze={toggleSnooze}
                    setSelectedPerson={setSelectedPerson}
                    detailRowKey={detailRowKey}
                    setDetailRowKey={toggleDetailRow}
                  />
                )}
                {layoutMode === "detail" && (
                  <CardDetailView
                    rows={pagedRows}
                    ownerLabel={ownerLabel}
                    serialLabel={serialLabel}
                    modelLabel={modelLabel}
                    splitModel={isDiskReport}
                    locationLabel={locationLabel}
                    isZimmet={isZimmet}
                    styles={styles}
                    pal={pal}
                    rowKeyOf={rowKeyOf}
                    selectedKeys={selectedKeys}
                    toggleSelect={toggleSelect}
                    detailRowKey={detailRowKey}
                    setDetailRowKey={toggleDetailRow}
                  />
                )}

                <div style={{ ...styles.tableFooter, flexWrap: "wrap", gap: 10 }}>
                  <span>
                    {filteredRows.length} kayıttan {pagedRows.length} tanesi gösteriliyor
                    {rawRows.length !== filteredRows.length ? ` (filtre öncesi ${rawRows.length})` : ""}
                    {pageSize !== Infinity && totalPages > 1 ? ` · Sayfa ${safePage} / ${totalPages}` : ""}
                  </span>
                  <Pagination page={safePage} totalPages={pageSize === Infinity ? 1 : totalPages} onChange={setCurrentPage} styles={styles} pal={pal} />
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {isZimmet
                      ? realSccmMeta
                        ? `Gerçek veri: ${realSccmMeta.fileName}`
                        : "Veri yüklenmedi"
                      : isUnused
                      ? realThMeta
                        ? `Gerçek veri: ${realThMeta.fileName}${realSccmMeta ? ` + ${realSccmMeta.fileName}` : ""}`
                        : "Veri yüklenmedi"
                      : isBsod
                      ? realBsodMeta
                        ? `Gerçek veri: ${realBsodMeta.fileName}`
                        : "Dosya seçilmedi"
                      : isBattery
                      ? realBatteryMeta
                        ? `Gerçek veri: ${realBatteryMeta.fileName}`
                        : "Dosya seçilmedi"
                      : usingRealFileData && (usingRealInaktif ? realInaktifMeta : realDiskMeta)
                      ? `Gerçek veri: ${(usingRealInaktif ? realInaktifMeta : realDiskMeta).fileName}`
                      : "Veri yüklenmedi"}
                  </span>
                </div>
              </div>
              {detailRow && (
                <DetailAside
                  row={detailRow}
                  isZimmet={isZimmet}
                  ownerLabel={ownerLabel}
                  serialLabel={serialLabel}
                  modelLabel={modelLabel}
                  locationLabel={locationLabel}
                  styles={styles}
                  pal={pal}
                  setSelectedPerson={setSelectedPerson}
                  rowMeta={rowMeta}
                  addNote={addNote}
                  editNote={editNote}
                  deleteNote={deleteNote}
                  mailHistory={mailHistory}
                />
              )}
              </div>
            </>
          )}
        </div>

        <AppFooter styles={styles} pal={pal} lastUpdated={lastUpdated} />
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
                      <td style={styles.td}>
                        <span style={{ ...styles.serial, ...styles.clickableName, cursor: "pointer" }} onClick={() => setHistoryPopupRow(r)} title="Bu kaydın detayını gör">
                          {r.serial}
                        </span>
                      </td>
                      <td style={styles.td}>{r.model}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, ...(r.statusTag === "Zimmet Doğru" || r.statusTag === "Müdürlük Zimmeti (OBS)" ? styles.badgeOk : isZimmetUnverified(r.statusTag) ? styles.badgeNeutral : styles.badgeBad) }}>
                          <span style={{ ...styles.badgeDot, background: r.statusTag === "Zimmet Doğru" || r.statusTag === "Müdürlük Zimmeti (OBS)" ? pal.ok : isZimmetUnverified(r.statusTag) ? pal.inkSoft : pal.bad }} />
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

      <MailPreviewModal preview={mailPreviewData} onClose={() => setMailPreviewData(null)} styles={styles} noRecipientText="— (SCCM'de bu cihaz için kullanıcı e-postası bulunamadı)" />

      {confirmMailOpen && (
        <div style={styles.modalOverlay} onClick={() => setConfirmMailOpen(false)}>
          <div style={{ ...styles.modalCard, width: "min(420px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <p style={styles.modalTitle}>E-posta Gönderimini Onayla</p>
              <span style={styles.modalClose} onClick={() => setConfirmMailOpen(false)}>✕</span>
            </div>
            <p style={styles.modalSub}>
              {`Listede seçim yapılmadı — filtrelenmiş ${resolveTargetRows().length} kaydın tamamı için e-posta gönderilecek.`}
            </p>
            <div style={styles.formActions}>
              <button style={styles.btnGhost} onClick={() => setConfirmMailOpen(false)}>Vazgeç</button>
              <button
                style={styles.btnPrimary}
                onClick={() => {
                  setConfirmMailOpen(false);
                  handleMailAndReset();
                }}
              >
                Onayla ve Gönder
              </button>
            </div>
          </div>
        </div>
      )}

      {changePasswordOpen && (
        <div style={styles.modalOverlay} onClick={closeChangePassword}>
          <div style={{ ...styles.modalCard, width: "min(380px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <p style={styles.modalTitle}>Şifre Değiştir</p>
              <span style={styles.modalClose} onClick={closeChangePassword}>✕</span>
            </div>
            <p style={styles.modalSub}>
              {user?.role === "master" ? "Master User şifreniz." : "Hesap şifreniz."} LDAP/RADIUS/TACACS+ ile giriş yaptıysanız şifreniz burada değil, kendi kurumsal sisteminizde değiştirilir.
            </p>
            <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={styles.formField}>
                <label style={styles.formLabel}>Mevcut Şifre</label>
                <input type="password" autoFocus value={currentPasswordDraft} onChange={(e) => setCurrentPasswordDraft(e.target.value)} style={styles.formInput} />
              </div>
              <div style={styles.formField}>
                <label style={styles.formLabel}>Yeni Şifre (en az 8 karakter)</label>
                <input type="password" value={newPasswordDraft} onChange={(e) => setNewPasswordDraft(e.target.value)} style={styles.formInput} />
              </div>
              <div style={styles.formField}>
                <label style={styles.formLabel}>Yeni Şifre (tekrar)</label>
                <input type="password" value={confirmPasswordDraft} onChange={(e) => setConfirmPasswordDraft(e.target.value)} style={styles.formInput} />
              </div>
              {changePasswordError && <p style={{ ...styles.formHelper, color: pal.bad, margin: 0 }}>{changePasswordError}</p>}
              <div style={styles.formActions}>
                <button type="button" style={styles.btnGhost} onClick={closeChangePassword}>Vazgeç</button>
                <button type="submit" style={styles.btnPrimary} disabled={changingPassword}>
                  {changingPassword ? "Kaydediliyor..." : "Şifreyi Güncelle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <RecordPopup row={historyPopupRow} isZimmet={isZimmet} styles={styles} pal={pal} mailHistory={mailHistory} onClose={() => setHistoryPopupRow(null)} />

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}
