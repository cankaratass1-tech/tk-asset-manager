import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { backendClient } from "../services/backendClient";
import Pagination from "./Pagination";
import { mailShell, infoTable, dataTable } from "../services/mailLayout";

// Formdaki tüm seçim alanları (Seri No, Lokasyon, Bitlocker, Durum, Nedeni) aynı görünüm ve davranışta
// olsun diye tek açılır liste bileşeni (tarayıcının native select/datalist'i her biri farklı görünüyordu).
// typeable: true → yazarak filtrelenir ve serbest metin kabul eder; false → sadece listeden seçilir.
function ChoiceField({ value, onChange, options, inputStyle, pal, typeable = false, placeholder = "", emptyLabel = "— seçiniz —", autoFocusOnOpen }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const q = String(value || "").toLocaleLowerCase("tr-TR");
  const shown = typeable && q ? options.filter((o) => String(o).toLocaleLowerCase("tr-TR").includes(q)) : options;
  const pick = (v) => { onChange(v); setOpen(false); };
  const item = (selected) => ({
    padding: "9px 14px", cursor: "pointer", fontSize: 14, fontWeight: selected ? 700 : 500,
    color: pal.ink, background: selected ? pal.accentSoft : "transparent", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  });
  const arrow = <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: pal.inkSoft, pointerEvents: "none" }}>▾</span>;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {typeable ? (
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={inputStyle}
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocusOnOpen}
        />
      ) : (
        <div onClick={() => setOpen((v) => !v)} style={{ ...inputStyle, cursor: "pointer", display: "flex", alignItems: "center", userSelect: "none" }}>
          <span style={{ color: value ? undefined : pal.inkSoft }}>{value || emptyLabel}</span>
        </div>
      )}
      {arrow}
      {open && (shown.length > 0 || !typeable) && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30, maxHeight: 280, overflowY: "auto",
            background: pal.panelSolid || pal.panel, border: `1px solid ${pal.line}`, borderRadius: 12, boxShadow: pal.shadow, padding: "6px 0",
          }}
        >
          {!typeable && <div style={item(!value)} onClick={() => pick("")}>{emptyLabel}</div>}
          {shown.map((o) => (
            <div key={o} style={item(o === value)} onClick={() => pick(o)}>{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// Diğer raporlarla aynı sayfalama seçenekleri.
const PAGE_SIZE_OPTIONS = [25, 50, 100, Infinity];

// "Yeni Kurulum Kaydı" (demo) — formdan kayıt → sistemde saklama → mevcut Excel'e satır ekleme
// → mail hazırlama/gönderme. Demoda
// dosya "varmış gibi" (backend YeniKurulumlar-DEMO.xlsx'i okuyup satır ekler).
// Kullanıcının gerçek Excel başlıkları. options = sabit açılır liste;
// options: "LOCATIONS" = App.jsx'ten gelen mevcut lokasyon listesi.
const FIELDS = [
  { k: "serial", label: "SERİ NO" },
  { k: "hostname", label: "HOSTNAME" },
  { k: "model", label: "MODEL" },
  { k: "location", label: "LOKASYON", options: "LOCATIONS" },
  { k: "userInfo", label: "KULLANICI BİLGİSİ" },
  { k: "atoNo", label: "ATO NUMARASI" },
  { k: "date", label: "TARİH", type: "date" },
  { k: "bitlocker", label: "Bitlocker Kontrol", options: ["ENABLE", "SÜREÇ DEVAM EDİYOR"] },
  { k: "processedBy", label: "İŞLEM YAPAN" },
  { k: "status", label: "DURUM", options: ["TESLİM EDİLDİ", "HAZIRLANDI"] },
  { k: "deliveryDate", label: "TESLİM TARİHİ", type: "date" },
  // "İADE" kaldırıldı, yerine "YENİ İŞE GİRİŞ" eklendi — Excel'de de bu görünür.
  { k: "reason", label: "NEDENI", options: ["YENİ İŞE GİRİŞ", "DEĞİŞİM"] },
  { k: "returns", label: "İADELER", wide: true },
];

const QF_LABEL = { undelivered: "Teslim bekleyen", waiting: "7+ gün bekleyen", unmailed: "E-posta gönderilmemiş", unsynced: "Excel'e işlenmemiş" };
// Liste sütunları: [başlık, sıralama anahtarı]
const YK_COLS = [["Cihaz", "device"], ["Kullanıcı / Lokasyon", "user"], ["ATO / Tarih", "ato"], ["Durum", "status"], ["İşlem", ""], ["Aksiyon", ""]];

const today = () => new Date().toISOString().slice(0, 10);
const toUpperTr = (v) => String(v ?? "").toLocaleUpperCase("tr-TR");
// Büyük harfe çevrilecek serbest metin alanları. Sabit seçenekli alanlara (DURUM/Bitlocker/NEDENİ)
// dokunulmaz — kod bu değerlerle karşılaştırma yapıyor ("Teslim edildi" vb.), büyütülürse eşleşme
// bozulur.
const UPPER_FIELDS = new Set(["serial", "hostname", "model", "location", "userInfo", "atoNo", "processedBy"]);
const emptyForm = (who) => Object.fromEntries(FIELDS.map((f) => [f.k, f.k === "date" ? today() : f.k === "processedBy" ? toUpperTr(who || "") : ""]));

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Mail metinleri — TR (kullanıcının verdiği şablona birebir) ve EN (aynı şablonun İngilizcesi).
// Adres satırındaki bina/tarif metni gerçek fiziksel adres olduğu için iki dilde de aynen korunur.
const MAIL_TEXT = {
  tr: {
    greeting: "Merhaba,",
    intro: "Cihazınız hazırlanmıştır. ATO kaydına TuruncuHat'tan kapatma onayı vermeniz durumunda&nbsp; bizden teslim alabilirsiniz.",
    head: ["Seri Numarası", "Barkod", "Model", "Marka", "Varlık Kataloğu", "Varlık Transfer Emri"],
    addressLabel: "Adres",
    address: "<strong>EBİ- Corporate Club binası</strong> (Atatürk Uluslararası Havalimanı B Kapısı, (Eğitim Akademisi, Merkez yemekhane yanı))",
    locationLabel: "Konum",
    subjectOne: "Cihazınız Hazır — ATO Kapatma Onayı",
    plain: "Cihazınız hazırlanmıştır. ATO kaydına TuruncuHat'tan kapatma onayı vermeniz durumunda bizden teslim alabilirsiniz. Adres: EBİ- Corporate Club binası. Konum: https://goo.gl/maps/boaRCuAx7Qu",
  },
  en: {
    greeting: "Hello,",
    intro: "Your device has been prepared. Once you give the ATO record closure approval via TuruncuHat, you may collect it from us.",
    head: ["Serial Number", "Barcode", "Model", "Brand", "Asset Catalog", "Asset Transfer Order"],
    addressLabel: "Address",
    address: "<strong>EBİ- Corporate Club binası</strong> (Atatürk Uluslararası Havalimanı B Kapısı, (Eğitim Akademisi, Merkez yemekhane yanı))",
    locationLabel: "Location",
    subjectOne: "Your Device Is Ready — ATO Closure Approval",
    plain: "Your device has been prepared. Once you give the ATO record closure approval via TuruncuHat, you may collect it from us. Address: EBİ- Corporate Club binası. Location: https://goo.gl/maps/boaRCuAx7Qu",
  },
};

// Mail gövdesi — kullanıcının verdiği şablon metni, Ofis Bant Genişliği ile ortak çerçevede (services/mailLayout.js). lang: "tr" | "en".
// Tablo alanları: Seri Numarası · Barkod · Model · Marka · Varlık Kataloğu · Varlık Transfer Emri
// Barkod/Marka form'da yok → seri no ile TuruncuHat'tan doldurulur. Varlık Transfer Emri = ATO NUMARASI.
const MAIL_FRAME = {
  tr: { eyebrow: "YENİ KURULUM", title: "CİHAZINIZ HAZIR", footer: "Teşekkürler · BT Operasyonları / IT Support" },
  en: { eyebrow: "NEW INSTALLATION", title: "YOUR DEVICE IS READY", footer: "Thank you · IT Operations / IT Support" },
};
function buildMailHtml(recs, thRows = [], lang = "tr") {
  const T = MAIL_TEXT[lang] || MAIL_TEXT.tr;
  const F = MAIL_FRAME[lang] || MAIL_FRAME.tr;
  const thBySerial = new Map();
  thRows.forEach((t) => {
    const k = String(t.serial || "").trim().toLowerCase();
    if (k) thBySerial.set(k, t);
  });
  const rowsOf = recs.map((r) => {
    const th = thBySerial.get(String(r.serial || "").trim().toLowerCase());
    // Sütun kaynakları (kullanıcı onayı): Seri No/Barkod/Model/Marka/Varlık Kataloğu → TH; Varlık Transfer Emri → form ATO NUMARASI.
    return [
      (th && th.serial) || r.serial || "", // TH → SERİ NO
      (th && th.barkod) || "", // TH → Varlık Barkodu
      (th && th.deviceType) || "", // TH → "Model" sütunu
      (th && th.marka) || "", // TH → Marka
      (th && (th.asset || th.model)) || "", // TH → Asset (Varlık Kataloğu)
      r.atoNo || "", // form → ATO NUMARASI
    ];
  });
  // Tek cihaz (varsayılan, mail kayıt başına gider): bilgi alanı; birden fazla kayıt verilirse tablo.
  const detail =
    rowsOf.length === 1
      ? infoTable(T.head.map((h, i) => [h, i === 0 ? `<strong>${esc(rowsOf[0][i])}</strong>` : esc(rowsOf[0][i]) || "—"]))
      : dataTable(T.head, rowsOf);
  return mailShell({
    eyebrow: F.eyebrow,
    title: F.title,
    greeting: T.greeting,
    intro: T.intro,
    bodyHtml: `${detail}<p style="margin:14px 0 0;"><strong>${T.addressLabel}:</strong> ${T.address}</p><p style="margin:6px 0 0;"><strong>${T.locationLabel}:</strong> <a href="https://goo.gl/maps/boaRCuAx7Qu">https://goo.gl/maps/boaRCuAx7Qu</a></p>`,
    footer: F.footer,
  });
}

const norm = (v) => String(v || "").trim().toLowerCase();
// TH satırından "kişiye zimmetli fiziksel cihaz" mı? (User zimmeti + Desktop/Laptop/Notebook/Monitor)
const isPersonDevice = (r) => {
  const at = norm(r.assignmentType);
  const dt = norm(r.deviceType);
  if (at && at !== "user") return false;
  return /desktop|laptop|notebook|monitor|tablet/.test(dt) || !dt;
};

export default function NewInstallScreen({ styles, pal, user, locationOptions = [], thRows = [], mailGroupsText, recordMailHistory, showToast, company = "all", companyOf }) {
  const [returnQuery, setReturnQuery] = useState("");
  const [allRecords, setRecords] = useState([]);
  // Sol menüden şirket seçiliyse yalnız o şirketin kayıtları (şirket: kişi → TuruncuHat, olmadıysa lokasyon → SCCM; bkz. recordCompany.js)
  const records = useMemo(() => (company === "all" || !companyOf ? allRecords : allRecords.filter((r) => companyOf(r) === company)), [allRecords, company, companyOf]);
  const [excelPath, setExcelPath] = useState("");
  const [form, setForm] = useState(() => emptyForm(user?.username));
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [mailTo, setMailTo] = useState("");
  const [mailLang, setMailLang] = useState("tr"); // "tr" | "en" — gönderim öncesi seçilir
  const [mailBusy, setMailBusy] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [mailPreview, setMailPreview] = useState(null); // { url, to, at } — Ethereal/test SMTP önizleme linki

  // "Kullanıcı Bilgisi" formda serbest metin, yeni cihaz henüz TuruncuHat'ta kayıtlı olmadığı için
  // seri no üzerinden bulunamaz — ama aynı kişinin TH'de BAŞKA bir cihaza ait kaydı (ve dolayısıyla
  // "Cihaz Sahibinin Maili"si) genelde vardır. İsim TAM doğru yazılmışsa bu haritadan otomatik
  // bulunur.
  const thByOwnerName = useMemo(() => {
    const m = new Map();
    thRows.forEach((t) => {
      const key = norm(t.owner);
      if (key && t.ownerMail && !m.has(key)) m.set(key, t.ownerMail);
    });
    return m;
  }, [thRows]);

  // Geriye dönük sorgu — hızlı filtre çipi + serbest arama (hepsi client-side, kayıtlar zaten yüklü).
  const [qFilter, setQFilter] = useState("all"); // all | undelivered | unmailed | unsynced | waiting
  const [qText, setQText] = useState("");
  const [sort, setSort] = useState({ key: "", dir: 1 }); // key: device | user | ato | date | status ("" = en yeni kayıt üstte)
  const [expanded, setExpanded] = useState(() => new Set()); // ayrıntısı açık kayıtlar
  const [menuId, setMenuId] = useState(null); // "⋯" menüsü açık satır
  const toggleExpand = (id) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSort = (key) => setSort((p) => (p.key === key ? (p.dir === 1 ? { key, dir: -1 } : { key: "", dir: 1 }) : { key, dir: 1 }));
  useEffect(() => {
    if (menuId == null) return undefined;
    const close = (e) => { if (!e.target.closest?.("[data-yk-menu]") && !e.target.closest?.("[role=menu]")) setMenuId(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuId]);

  const reload = () =>
    backendClient
      .getNewInstalls()
      .then((s) => {
        setRecords(Array.isArray(s.records) ? s.records : []);
        setExcelPath(s.excelPath || "");
      })
      .catch(() => {});

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: UPPER_FIELDS.has(k) ? toUpperTr(v) : v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.hostname.trim() && !form.serial.trim()) {
      showToast("En az Hostname veya Seri No girin");
      return;
    }
    setSaving(true);
    try {
      if (editingId) await backendClient.updateNewInstall(editingId, form);
      else await backendClient.addNewInstall(form);
      await reload();
      setForm(emptyForm(user?.username));
      setEditingId(null);
      showToast(editingId ? "Kayıt güncellendi" : "Kayıt eklendi");
    } catch (err) {
      showToast(`Kaydedilemedi — ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const edit = (r) => {
    setEditingId(r.id);
    setForm(Object.fromEntries(FIELDS.map((f) => [f.k, r[f.k] || ""])));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // Tek tıkla teslim: sadece teslim tarihini sor (varsayılan bugün), DURUM'u "TESLİM EDİLDİ" yap
  // ve arkasından otomatik olarak Excel'e işle ("Excel'e İşle" demeye gerek kalmadan).
  const deliver = async (r) => {
    const d = window.prompt(`"${r.hostname || r.serial}" teslim tarihi:`, r.deliveryDate || today());
    if (d === null) return;
    try {
      await backendClient.updateNewInstall(r.id, { ...r, status: "TESLİM EDİLDİ", deliveryDate: String(d).trim() });
      let synced = false;
      try {
        const res = await backendClient.syncNewInstallExcel();
        setLastSync(res);
        synced = true;
      } catch (e) {
        showToast(`Teslim işlendi ama Excel'e yazılamadı — ${e.message}`);
      }
      await reload();
      if (synced) showToast("Teslim edildi ve Excel'e işlendi");
    } catch (err) {
      showToast(`Güncellenemedi — ${err.message}`);
    }
  };

  const del = async (r) => {
    if (!window.confirm(`"${r.hostname || r.serial}" kaydı silinsin mi?`)) return;
    await backendClient.deleteNewInstall(r.id).catch(() => {});
    await reload();
    setSelected((s) => {
      const n = new Set(s);
      n.delete(r.id);
      return n;
    });
  };

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // "Bekliyor" = teslim edilmemiş VE kayıt tarihinden bu yana 7+ gün geçmiş (masada bekleyen cihaz).
  const daysSince = (d) => {
    const t = Date.parse(d);
    return Number.isNaN(t) ? 0 : Math.floor((Date.now() - t) / 86400000);
  };
  const isUndelivered = (r) => norm(r.status) !== norm("TESLİM EDİLDİ");
  const isWaitingLong = (r) => isUndelivered(r) && daysSince(r.date) > 7;

  const counts = useMemo(
    () => ({
      all: records.length,
      undelivered: records.filter(isUndelivered).length,
      unmailed: records.filter((r) => !r.mailSentAt).length,
      unsynced: records.filter((r) => !r.excelSyncedAt).length,
      waiting: records.filter(isWaitingLong).length,
    }),
    [records]
  );

  const filteredRecords = useMemo(() => {
    let list = records;
    if (qFilter === "undelivered") list = list.filter(isUndelivered);
    else if (qFilter === "unmailed") list = list.filter((r) => !r.mailSentAt);
    else if (qFilter === "unsynced") list = list.filter((r) => !r.excelSyncedAt);
    else if (qFilter === "waiting") list = list.filter(isWaitingLong);
    const q = norm(qText);
    if (q) {
      list = list.filter((r) =>
        [r.serial, r.hostname, r.userInfo, r.atoNo, r.location, r.model, r.processedBy, r.returns]
          .map(norm)
          .some((v) => v.includes(q))
      );
    }
    // Yeni kurulan cihaz en üstte görünsün — takip kolaylaşsın. createdAt yoksa
    // (eski kayıt) id/date'e düşer, en azından backend ekleme sırasının tersini verir.
    const SORT_VAL = { device: (r) => r.serial || r.hostname, user: (r) => r.userInfo, ato: (r) => r.atoNo, date: (r) => r.date, status: (r) => r.status };
    if (sort.key) return [...list].sort((a, b) => sort.dir * String(SORT_VAL[sort.key](a) ?? "").localeCompare(String(SORT_VAL[sort.key](b) ?? ""), "tr", { numeric: true }));
    return [...list].sort((a, b) => {
      const ta = Date.parse(a.createdAt || "") || 0;
      const tb = Date.parse(b.createdAt || "") || 0;
      if (tb !== ta) return tb - ta;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [records, qFilter, qText, sort]);

  // Sayfalama — diğer raporlarla aynı desen (Pagination bileşeni + 25/50/100/Tümü seçici).
  // Seçim/mail hedefi hâlâ TÜM filtrelenmiş kayıtları kapsar (filteredRecords) — sayfalama
  // sadece tabloda o an GÖRÜNENİ sınırlar, "Tümünü Seç"in anlamını değiştirmez.
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [qFilter, qText, pageSize]);
  const totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRecords = useMemo(() => {
    if (pageSize === Infinity) return filteredRecords;
    const start = (safePage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, pageSize, safePage]);

  const allChecked = filteredRecords.length > 0 && filteredRecords.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (filteredRecords.every((r) => n.has(r.id))) filteredRecords.forEach((r) => n.delete(r.id));
      else filteredRecords.forEach((r) => n.add(r.id));
      return n;
    });

  const isMaster = user?.role === "master";
  const saveExcelPath = async () => {
    try {
      const res = await backendClient.setNewInstallExcelPath(excelPath);
      setExcelPath(res.excelPath || excelPath);
      showToast("Excel yolu kaydedildi");
    } catch (err) {
      showToast(`Excel yolu kaydedilemedi — ${err.message}`);
    }
  };

  const syncExcel = async () => {
    setSyncing(true);
    try {
      const res = await backendClient.syncNewInstallExcel();
      setLastSync(res);
      await reload();
      showToast(`Excel'e işlendi: ${res.file} · ${res.totalRows} satır (${res.newlyMarked} yeni)`);
    } catch (err) {
      showToast(`Excel'e işlenemedi — ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Seçim varsa seçililer; yoksa o an filtrelenmiş liste (aktif filtre "tümü" anlamına gelir).
  const targetRecs = useMemo(
    () => (selected.size > 0 ? records.filter((r) => selected.has(r.id)) : filteredRecords),
    [records, selected, filteredRecords]
  );

  // SERİ NO — yazarken TuruncuHat'tan seri no önerisi, seçilince SADECE Model otomatik dolar.
  const thBySerial = useMemo(() => {
    const m = new Map();
    thRows.forEach((t) => {
      const k = norm(t.serial);
      if (k) m.set(k, t);
    });
    return m;
  }, [thRows]);

  // yazılan öneki içeren seri numaraları (öneri listesi, en çok 50)
  const serialSuggestions = useMemo(() => {
    const q = norm(form.serial);
    if (q.length < 2 || !thRows.length) return [];
    const seen = new Set();
    const out = [];
    for (const t of thRows) {
      const s = norm(t.serial);
      if (!s || seen.has(s)) continue;
      if (s.startsWith(q) || s.includes(q)) {
        seen.add(s);
        out.push(t);
        if (out.length >= 50) break;
      }
    }
    return out;
  }, [form.serial, thRows]);

  // Seri no TAM eşleşince yalnızca MODEL alanını TH'den doldur (diğer alanlara dokunma).
  useEffect(() => {
    if (editingId) return;
    const th = thBySerial.get(norm(form.serial));
    if (!th) return;
    const model = toUpperTr(th.deviceType || th.model || th.asset || "");
    setForm((p) => (p.model === model ? p : { ...p, model }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.serial, thBySerial, editingId]);

  // İADELER — girilen kişi adına (SCCM tam ad) göre TH zimmetindeki fiziksel cihazlar.
  const returnMatches = useMemo(() => {
    const q = norm(returnQuery);
    if (q.length < 2 || !thRows.length) return [];
    // Her arama kelimesi, sahibin adında TAM kelime olarak geçmeli ("005" → "0053"e takılmasın).
    const terms = q.split(/\s+/).filter(Boolean);
    const res = terms.map((t) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu"));
    return thRows
      .filter((r) => {
        if (!isPersonDevice(r)) return false;
        const hay = norm(`${r.ownerFull} ${r.owner} ${r.ownerUsername} ${r.ownerSicil}`);
        return res.every((re) => re.test(" " + hay));
      })
      .slice(0, 40);
  }, [returnQuery, thRows]);

  // Mail gönderimi TEKLİ: her kayıt için ayrı mail (tek cihaz, verilen şablon). Alıcı kaydın kendisine göre bulunur:
  // 1) üstteki kutuya elle yazılan adres(ler) → seçilen her kayıt için ayrı mail oraya gider,
  // 2) TuruncuHat'ta "Kullanıcı Bilgisi" ile eşleşen kişinin maili, 3) lokasyon mail grubu.
  const sendMail = async () => {
    if (targetRecs.length === 0) {
      showToast("Gönderilecek kayıt yok");
      return;
    }
    const manual = mailTo.split(/[;,\s]+/).map((x) => x.trim()).filter((x) => /@/.test(x));
    const groups = Object.fromEntries(
      (mailGroupsText || "")
        .split("\n")
        .map((l) => l.split(/[\t,;]/).map((x) => x.trim()))
        .filter((x) => x[0] && x[1] && /@/.test(x[1]))
    );
    const recipientsOf = (r) => {
      if (manual.length) return manual;
      const owner = thByOwnerName.get(norm(r.userInfo));
      if (owner) return [owner];
      return groups[r.location] ? [groups[r.location]] : [];
    };
    const plan = targetRecs.map((r) => ({ r, to: recipientsOf(r) }));
    const sendable = plan.filter((x) => x.to.length > 0);
    const noRecipient = plan.filter((x) => x.to.length === 0);
    if (sendable.length === 0) {
      showToast("Alıcı yok — üstteki kutuya e-posta girin veya Ayarlar > Lokasyon E-postaları'nı doldurun");
      return;
    }
    const T = MAIL_TEXT[mailLang] || MAIL_TEXT.tr;
    const lang = mailLang === "en" ? "EN" : "TR";
    setMailBusy(true);
    const details = noRecipient.map(({ r }) => ({ location: r.hostname || r.serial || "—", to: null, count: 1, ok: false, message: `[${lang}] Alıcı bulunamadı` }));
    const sentIds = [];
    let lastPreview = null;
    try {
      for (const { r: rec, to } of sendable) {
        const toStr = to.join(", ");
        try {
          const res = await backendClient.sendMail({ to: toStr, subject: T.subjectOne, text: T.plain, html: buildMailHtml([rec], thRows, mailLang) });
          const ok = !!res.ok;
          if (ok) {
            sentIds.push(rec.id);
            if (res.previewUrl) lastPreview = { url: res.previewUrl, to: toStr, at: new Date() };
          }
          details.push({ location: rec.hostname || rec.serial || "—", to: toStr, count: 1, ok, message: `[${lang}] ` + (res.message || (ok ? "Gönderildi" : "Gönderilemedi")) + (res.previewUrl ? ` · önizleme: ${res.previewUrl}` : "") });
        } catch (err) {
          details.push({ location: rec.hostname || rec.serial || "—", to: toStr, count: 1, ok: false, message: `[${lang}] ${err.message || "Gönderilemedi"}` });
        }
      }
      if (sentIds.length) {
        await backendClient.markNewInstallsMailed(sentIds).catch(() => {});
        await reload();
        setSelected(new Set()); // gönderilenler seçili kalmasın: bir sonraki "E-posta Gönder" aynı kayıtlara yeniden e-posta göndermesin
        setMailPreview(lastPreview);
      }
      const failed = sendable.length - sentIds.length;
      recordMailHistory &&
        recordMailHistory({
          id: Date.now(),
          date: new Date().toLocaleString("tr-TR"),
          dept: "Yeni Kurulum",
          report: `Yeni Kurulum Kaydı (${lang})`,
          recipients: sentIds.length,
          status: sentIds.length === 0 ? "Gönderilemedi" : failed > 0 || noRecipient.length > 0 ? "Kısmen Başarısız" : "Başarılı",
          details,
        });
      const extra = (failed ? `, ${failed} gönderilemedi` : "") + (noRecipient.length ? `, ${noRecipient.length} kayıt için alıcı bulunamadı` : "");
      showToast(sentIds.length === 0 ? `❌ Gönderilemedi${extra}` : `${failed || noRecipient.length ? "⚠️" : "✅"} ${sentIds.length} kayıt için ayrı ayrı e-posta gönderildi${extra}${lastPreview ? " — önizleme linki aşağıda" : ""}`);
    } finally {
      setMailBusy(false);
    }
  };

  const inp = { ...styles.formInput };
  const ykTd = (extra) => ({ ...styles.td, padding: "12px 14px", verticalAlign: "middle", ...extra });

  // İADELER — artık elle yazılmıyor: aşağıdaki "zimmetli cihaz" listesinden seçilen cihazlar
  // satır satır form.returns içine yazılır (backend değişmez), formda çip olarak gösterilir.
  const returnLines = useMemo(() => (form.returns ? form.returns.split("\n").filter((l) => l.trim()) : []), [form.returns]);
  const lineForDevice = (r) =>
    `SN: ${r.serial || "—"} · ${r.model || r.marka || r.deviceType || ""} · sahibi: ${r.ownerFull || r.owner}${r.location && r.location !== "—" ? ` · ${r.location}` : ""}`;
  const isReturnAdded = (r) => returnLines.some((l) => l.startsWith(`SN: ${r.serial || "—"} ·`));
  const addReturn = (r) => {
    if (isReturnAdded(r)) return;
    setForm((p) => ({ ...p, returns: (p.returns ? p.returns.replace(/\s*$/, "") + "\n" : "") + lineForDevice(r) }));
    setReturnQuery(""); // seçince açılan liste kapansın
    showToast("İADELER'e eklendi");
  };
  const removeReturnAt = (idx) =>
    setForm((p) => {
      const ls = (p.returns || "").split("\n").filter((l) => l.trim());
      ls.splice(idx, 1);
      return { ...p, returns: ls.join("\n") };
    });

  return (
    <>
      <div style={{ ...styles.panel, padding: "20px 24px" }}>
        <p style={styles.pageTitle}>Yeni Kurulum Kaydı</p>
        <p style={styles.pageSub}>
          Yeni kurduğunuz cihazı formdan girin → sistemde saklanır → "Excel'e İşle" ile mevcut kurulum Excel'ine satır eklenir → "E-posta Gönder" ile bildirim hazırlanır.
          <em> (Demo: Excel dosyası hazır varsayılıyor.)</em>
        </p>
        {records.length > 0 && (
          <div data-yk-stats style={{ ...styles.statStrip, flexWrap: "wrap", rowGap: 16 }}>
            {[
              ["all", "Toplam Kayıt", counts.all, pal.ink, "Tümünü göster"],
              ["undelivered", "Teslim Bekleyen", counts.undelivered, pal.warnFg || pal.bad, "Henüz teslim edilmemiş kayıtlar"],
              ["waiting", "7+ Gün Bekleyen", counts.waiting, pal.bad, "Teslim edilmemiş ve kurulumdan 7 günden fazla geçmiş"],
              ["unmailed", "E-posta Gönderilmemiş", counts.unmailed, pal.ink, "Kullanıcıya bildirim e-postası henüz gitmemiş kayıtlar"],
              ["unsynced", "Excel'e İşlenmemiş", counts.unsynced, pal.ink, "Kurulum Excel'ine henüz yazılmamış kayıtlar"],
            ].map(([key, label, n, color, tip]) => (
              <div key={key} role="button" tabIndex={0} data-yk-stat={key} aria-pressed={qFilter === key} title={tip}
                onClick={() => setQFilter(key)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setQFilter(key); } }}
                style={{ ...styles.stat, ...styles.statClickable, ...(qFilter === key ? styles.statActive : {}) }}>
                <span style={{ ...styles.statNum, color }}>{n}</span>
                <span style={styles.statLabel}>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FORM */}
      <div style={{ ...styles.panel, padding: "20px 24px" }}>
        <div style={styles.settingsSectionHead}>
          <p style={styles.settingsSectionTitle}>{editingId ? "Kaydı Düzenle" : "Yeni Kayıt"}</p>
          {editingId && (
            <button style={styles.btnGhost} onClick={() => { setEditingId(null); setForm(emptyForm(user?.username)); }}>
              Vazgeç
            </button>
          )}
        </div>
        <form onSubmit={submit} style={styles.formGrid}>
          {FIELDS.map((f) => {
            const isLoc = f.options === "LOCATIONS";
            const fixedOpts = Array.isArray(f.options) ? f.options : null;
            const isReturns = f.k === "returns";
            return (
              <div key={f.k} style={f.wide ? styles.formFieldWide : styles.formField}>
                <label style={styles.formLabel}>{f.label}</label>
                {isLoc ? (
                  <>
                    <ChoiceField
                      typeable
                      value={form[f.k]}
                      onChange={(v) => setF(f.k, v)}
                      options={locationOptions}
                      inputStyle={inp}
                      pal={pal}
                      placeholder={locationOptions.length ? "yazarak arayın veya listeden seçin" : "lokasyon"}
                    />
                  </>
                ) : fixedOpts ? (
                  <ChoiceField
                    value={form[f.k]}
                    onChange={(v) => setF(f.k, v)}
                    options={form[f.k] && !fixedOpts.includes(form[f.k]) ? [...fixedOpts, form[f.k]] : fixedOpts}
                    inputStyle={inp}
                    pal={pal}
                  />
                ) : isReturns ? (
                  <div
                    style={{
                      ...inp,
                      height: "auto",
                      minHeight: 42,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      alignItems: "flex-start",
                      padding: 7,
                    }}
                  >
                    {returnLines.length === 0 ? (
                      <span style={{ color: pal.inkSoft, fontSize: 13, alignSelf: "center" }}>
                        Aşağıdaki "kişinin zimmetli cihazları" listesinden seçin
                      </span>
                    ) : (
                      returnLines.map((l, i) => (
                        <span
                          key={i}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            border: `1px solid ${pal.line}`,
                            borderRadius: 6,
                            padding: "3px 6px 3px 9px",
                            fontSize: 12,
                            maxWidth: "100%",
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</span>
                          <button
                            type="button"
                            onClick={() => removeReturnAt(i)}
                            title="Kaldır"
                            style={{ border: "none", background: "transparent", cursor: "pointer", color: pal.bad, fontWeight: 700, fontSize: 14, lineHeight: 1, flexShrink: 0 }}
                          >
                            ×
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                ) : f.k === "serial" ? (
                  <>
                    <ChoiceField
                      typeable
                      value={form.serial}
                      onChange={(v) => setF("serial", v)}
                      options={serialSuggestions.map((t) => t.serial)}
                      inputStyle={inp}
                      pal={pal}
                      placeholder="SYNP… yazın, listeden seçin"
                    />
                    {!editingId && norm(form.serial).length >= 2 && (
                      <p style={{ margin: "3px 0 0", fontSize: 12, color: pal.inkSoft }}>
                        {thBySerial.has(norm(form.serial))
                          ? "✓ TuruncuHat'ta bulundu — Model otomatik dolduruldu"
                          : serialSuggestions.length
                          ? `${serialSuggestions.length} eşleşme — listeden seçin`
                          : "TuruncuHat'ta eşleşme yok"}
                      </p>
                    )}
                  </>
                ) : (
                  <input
                    type={f.type || "text"}
                    value={form[f.k]}
                    onChange={(e) => setF(f.k, e.target.value)}
                    style={inp}
                    placeholder={f.k === "hostname" ? "MHY-LAP-…" : ""}
                  />
                )}
              </div>
            );
          })}
          <div style={{ ...styles.formActions, gridColumn: "1 / -1" }}>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>
              {saving ? "Kaydediliyor…" : editingId ? "Güncelle" : "Kaydet"}
            </button>
          </div>
        </form>

        {/* İADELER — kişinin TH zimmetindeki cihazları getir */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${pal.line}` }}>
          <p style={{ ...styles.formLabel, marginBottom: 6 }}>İADELER — kişinin zimmetli cihazlarını getir (TuruncuHat)</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              value={returnQuery}
              onChange={(e) => setReturnQuery(e.target.value)}
              style={{ ...inp, flex: "1 1 280px" }}
              placeholder="Kişi adını yazın (SCCM'deki tam ad) — örn. Ahmet Yılmaz"
            />
          </div>
          {returnQuery.trim().length >= 2 && (
            <div style={{ marginTop: 8, border: `1px solid ${pal.line}`, borderRadius: 8, maxHeight: 220, overflowY: "auto" }}>
              {returnMatches.length === 0 ? (
                <p style={{ ...styles.pageSub, margin: 0, padding: "10px 12px" }}>
                  {thRows.length === 0 ? "TuruncuHat verisi henüz yüklenmedi." : "Eşleşen kişi/cihaz bulunamadı."}
                </p>
              ) : (
                returnMatches.map((r) => {
                  const added = isReturnAdded(r);
                  return (
                    <div
                      key={r.rowKey || `${r.serial}-${r.ownerFull}`}
                      onClick={() => !added && addReturn(r)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "8px 12px",
                        borderBottom: `1px solid ${pal.line}`,
                        fontSize: 13,
                        cursor: added ? "default" : "pointer",
                        opacity: added ? 0.55 : 1,
                      }}
                    >
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                        <strong>{r.ownerFull || r.owner}</strong> · {r.serial || "—"} · {r.model || r.marka || r.deviceType || "—"}
                        {r.location && r.location !== "—" ? ` · ${r.location}` : ""}
                      </span>
                      <button
                        type="button"
                        disabled={added}
                        style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 12, flexShrink: 0 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          addReturn(r);
                        }}
                      >
                        {added ? "✓ eklendi" : "+ İADELER'e ekle"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
          <p style={{ ...styles.formHelper, marginTop: 6 }}>
            Kişi adı SCCM'deki gibi yazılır; TuruncuHat zimmet kayıtlarında eşleşen kişiye ait cihazlar listelenir. Bir cihaza tıklayınca (veya "+ İADELER'e ekle") yukarıdaki İADELER alanına çip olarak eklenir; çipin ×'i ile kaldırılır. Elle yazılmaz.
          </p>
        </div>
      </div>

      {/* KAYITLAR + AKSİYONLAR */}
      <div style={styles.panel}>
        <div style={{ ...styles.toolbar, paddingBottom: 10 }}>
          <div style={{ ...styles.toolbarFiltersRow, justifyContent: "space-between" }}>
            <div style={styles.settingsSectionHead}>
              <p style={styles.settingsSectionTitle}>Kayıtlar</p>
              <span data-yk-count style={{ fontSize: 13, color: pal.inkSoft }}>
                <b style={{ color: pal.ink }}>{filteredRecords.length}</b> / {records.length} kayıt · {counts.unsynced === 0 ? "tümü Excel'e işlendi" : `${counts.unsynced} Excel'e işlenmedi`} · {counts.unmailed === 0 ? "tümüne e-posta gönderildi" : `${counts.unmailed} e-posta gönderilmedi`}
              </span>
            </div>
          </div>

          {records.length > 0 && (
            <div data-yk-filters style={styles.toolbarFiltersRow}>
              <div style={{ ...styles.searchWrap, flex: "1 1 260px", maxWidth: 420 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
                <input type="text" value={qText} onChange={(e) => setQText(e.target.value)} style={styles.searchInput} placeholder="Ara: seri no / hostname / kullanıcı / ATO / lokasyon" />
                {qText && <span onClick={() => setQText("")} title="Aramayı temizle" style={{ cursor: "pointer", color: pal.inkSoft, fontSize: 14, lineHeight: 1, padding: "0 2px" }}>×</span>}
              </div>
              {(qFilter !== "all" || qText) && (
                <span data-yk-chips style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  {qFilter !== "all" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: pal.accentSoft, color: pal.accent, borderRadius: 14, padding: "3px 10px", fontWeight: 600 }}>
                      {QF_LABEL[qFilter]}
                      <span onClick={() => setQFilter("all")} role="button" aria-label="Filtreyi kaldır" style={{ cursor: "pointer", fontWeight: 700 }}>×</span>
                    </span>
                  )}
                  <span onClick={() => { setQFilter("all"); setQText(""); }} role="button" style={{ cursor: "pointer", color: pal.accent, fontWeight: 600 }}>Tümünü temizle</span>
                </span>
              )}
              {filteredRecords.length > PAGE_SIZE_OPTIONS[0] && (
                <div style={{ ...styles.segmented, marginLeft: "auto" }} title="Sayfada gösterilecek kayıt sayısı">
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <div key={n} onClick={() => setPageSize(n)} style={{ ...styles.seg, ...(pageSize === n ? styles.segActive : {}) }}>{n === Infinity ? "Tümü" : n}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div data-yk-actions style={{ ...styles.toolbarFiltersRow, paddingTop: 2 }}>
            <input type="text" value={mailTo} onChange={(e) => setMailTo(e.target.value)} style={{ ...inp, flex: "1 1 260px", maxWidth: 380 }} placeholder="E-posta alıcı(lar) — boşsa lokasyon e-posta grubu" />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: pal.inkSoft, flex: "0 0 auto" }}>
              Dil
              <select value={mailLang} onChange={(e) => setMailLang(e.target.value)} style={{ ...inp, width: 120, flex: "0 0 auto" }}>
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </select>
            </label>
            <span style={{ flex: 1 }} />
            <button style={styles.btnGhost} onClick={syncExcel} disabled={syncing || records.length === 0} title="Kayıtları mevcut kurulum Excel'ine satır olarak ekler">
              {syncing ? "İşleniyor…" : "📄 Excel'e İşle"}
            </button>
            <button style={styles.btnPrimary} onClick={sendMail} disabled={mailBusy || targetRecs.length === 0}>
              {mailBusy
                ? "Gönderiliyor…"
                : `✉️ E-posta Gönder — ${mailLang === "en" ? "EN" : "TR"} (${
                    selected.size > 0 ? selected.size + " seçili" : qFilter !== "all" || qText ? filteredRecords.length + " filtreli" : "tümü"
                  })`}
            </button>
          </div>
          <details data-yk-settings style={{ fontSize: 13, color: pal.inkSoft }}>
            <summary style={{ cursor: "pointer", color: pal.accent, fontWeight: 600, width: "fit-content" }}>Gönderim ayarları (Excel dosya yolu)</summary>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              <input
                type="text"
                value={excelPath}
                readOnly={!isMaster}
                onChange={(e) => setExcelPath(e.target.value)}
                style={{ ...inp, maxWidth: 560, fontFamily: "var(--font-mono)", fontSize: 12, ...(isMaster ? {} : { opacity: 0.75 }) }}
                placeholder="Excel dosya yolu (.xlsx)"
                title={isMaster ? "Tam yol, .xlsx uzantılı" : "Yolu yalnızca Master User değiştirebilir"}
              />
              {isMaster && <button style={styles.btnGhost} onClick={saveExcelPath}>Yolu Kaydet</button>}
            </div>
          </details>

          {lastSync && (
            <p style={{ ...styles.formHelper, color: pal.ok, margin: 0 }}>
              {lastSync.existed ? "Mevcut dosyaya işlendi" : "Dosya oluşturuldu"} · {lastSync.file} · toplam {lastSync.totalRows} satır
              {lastSync.manualRowsKept ? ` (${lastSync.manualRowsKept} elle eklenen satır korundu)` : ""}
            </p>
          )}
          {mailPreview && (
            <p style={{ ...styles.formHelper, margin: 0 }}>
              ✉️ Son gönderim ({mailPreview.to}) —{" "}
              <a href={mailPreview.url} target="_blank" rel="noreferrer" style={{ color: pal.accent || pal.ok, fontWeight: 600 }}>e-postayı tarayıcıda önizle</a>{" "}
              <span style={{ color: pal.inkSoft }}>(test SMTP kutusu)</span>
            </p>
          )}
        </div>

        {records.length === 0 ? (
          <p style={{ ...styles.pageSub, padding: "10px 24px 24px" }}>Henüz kayıt yok — yukarıdaki formdan ekleyin.</p>
        ) : filteredRecords.length === 0 ? (
          <p style={{ ...styles.pageSub, padding: "30px 24px 36px", textAlign: "center" }}>
            Bu filtreyle eşleşen kayıt yok. <span onClick={() => { setQFilter("all"); setQText(""); }} role="button" style={{ cursor: "pointer", color: pal.accent, fontWeight: 600 }}>Filtreleri temizle</span>
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table data-yk-table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: 32, padding: "12px 6px 12px 24px" }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} style={styles.checkbox} aria-label="Tümünü seç" />
                  </th>
                  {YK_COLS.map(([label, key], i) => (
                    <th
                      key={label}
                      data-yk-sort={key || undefined}
                      onClick={key ? () => toggleSort(key) : undefined}
                      aria-sort={key && sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                      title={key ? "Sıralamak için tıklayın" : undefined}
                      style={{ ...styles.th, fontSize: 13, padding: `12px ${i === YK_COLS.length - 1 ? 24 : 14}px 12px 14px`, cursor: key ? "pointer" : "default", userSelect: "none" }}
                    >
                      {label}{key && sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map((r) => {
                  const open = expanded.has(r.id);
                  const delivered = !isUndelivered(r);
                  const wait = isWaitingLong(r) ? daysSince(r.date) : 0;
                  const retLines = (r.returns || "").split("\n").filter((l) => l.trim());
                  return (
                    <Fragment key={r.id}>
                      <tr style={selected.has(r.id) ? styles.rowSelected : undefined}>
                        <td style={ykTd({ padding: "12px 6px 12px 24px" })} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} style={styles.checkbox} aria-label={`${r.serial || r.hostname} seç`} />
                        </td>
                        <td style={ykTd()}>
                          <span style={{ ...styles.serial, ...styles.clickableName }} onClick={() => toggleExpand(r.id)} title={open ? "Ayrıntıyı gizle" : "Ayrıntıyı göster (Bitlocker, işlem yapan, neden, iadeler)"}>
                            {open ? "▾ " : "▸ "}{r.serial || r.hostname || "—"}
                          </span>
                          <div style={styles.cellSub}>{[r.model, r.serial ? r.hostname : ""].filter(Boolean).join(" · ") || "—"}</div>
                        </td>
                        <td style={ykTd()}>
                          <div style={{ fontWeight: 600 }}>{r.userInfo || <span style={{ color: pal.inkSoft }}>—</span>}</div>
                          <div style={styles.cellSub}>{r.location || "—"}</div>
                        </td>
                        <td style={ykTd()}>
                          <div style={{ ...styles.serial, fontSize: 13 }}>{r.atoNo || <span style={{ color: pal.inkSoft }}>—</span>}</div>
                          <div style={styles.cellSub}>{r.date || "—"}</div>
                        </td>
                        <td style={ykTd()}>
                          <span style={{ ...styles.badge, ...(delivered ? styles.badgeOk : styles.badgeNeutral) }}>
                            <span style={{ ...styles.badgeDot, background: delivered ? pal.ok : pal.inkSoft }} />
                            {delivered ? "Teslim edildi" : r.status ? r.status.charAt(0) + r.status.slice(1).toLocaleLowerCase("tr-TR") : "Durum yok"}
                          </span>
                          {wait > 0 && <div style={{ ...styles.cellSub, color: pal.warnFg, fontWeight: 600 }}>{wait} gündür bekliyor</div>}
                          {delivered && r.deliveryDate && <div style={styles.cellSub}>{r.deliveryDate}</div>}
                        </td>
                        <td style={ykTd()}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                            <span style={{ ...styles.badge, ...(r.excelSyncedAt ? styles.badgeOk : styles.badgeNeutral) }}>
                              Excel: {r.excelSyncedAt ? "işlendi" : "bekliyor"}
                            </span>
                            <span style={{ ...styles.badge, ...(r.mailSentAt ? styles.badgeOk : styles.badgeNeutral) }} title={r.mailSentAt ? new Date(r.mailSentAt).toLocaleString("tr-TR") : undefined}>
                              E-posta: {r.mailSentAt ? "gönderildi" : "gönderilmedi"}
                            </span>
                          </div>
                        </td>
                        <td style={ykTd({ whiteSpace: "nowrap", paddingRight: 24 })}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", position: "relative" }}>
                            {!delivered && (
                              <button style={{ ...styles.btnGhost, padding: "5px 11px", fontSize: 13, color: pal.ok }} onClick={() => deliver(r)} title="Teslim edildi olarak işaretle (teslim tarihini sorar)">
                                ✓ Teslim Et
                              </button>
                            )}
                            <button data-yk-menu={r.id} style={{ ...styles.btnGhost, padding: "5px 10px", fontSize: 15, lineHeight: 1 }} aria-haspopup="menu" aria-expanded={menuId === r.id} aria-label="Diğer işlemler" onClick={(e) => { e.stopPropagation(); setMenuId(menuId === r.id ? null : r.id); }}>⋯</button>
                            {menuId === r.id && (
                              <div role="menu" onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 20, minWidth: 130, background: pal.panelSolid || pal.panel, border: `1px solid ${pal.line}`, borderRadius: 10, boxShadow: pal.shadow, padding: "4px 0" }}>
                                <div role="menuitem" data-yk-edit style={{ padding: "8px 14px", fontSize: 14, cursor: "pointer" }} onClick={() => { setMenuId(null); edit(r); }}>Düzenle</div>
                                <div role="menuitem" data-yk-delete style={{ padding: "8px 14px", fontSize: 14, cursor: "pointer", color: pal.bad }} onClick={() => { setMenuId(null); del(r); }}>Sil</div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr data-yk-detail>
                          <td colSpan={YK_COLS.length + 1} style={{ ...styles.td, background: pal.fieldBg, padding: "12px 24px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "10px 20px", fontSize: 14 }}>
                              {[["BitLocker", r.bitlocker], ["İşlem yapan", r.processedBy], ["Nedeni", r.reason], ["Teslim tarihi", r.deliveryDate], ["Hostname", r.hostname], ["Seri no", r.serial]].map(([k, v]) => (
                                <div key={k}>
                                  <div lang={k === "BitLocker" ? "en" : undefined} style={{ fontSize: 12, color: pal.inkSoft, textTransform: "uppercase", letterSpacing: "0.03em" }}>{k}</div>
                                  <div style={{ fontWeight: 600 }}>{v || <span style={{ color: pal.inkSoft, fontWeight: 400 }}>—</span>}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: 12, color: pal.inkSoft, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>İadeler ({retLines.length})</div>
                              {retLines.length === 0 ? (
                                <span style={{ color: pal.inkSoft, fontSize: 13 }}>İade kaydı yok</span>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  {retLines.map((l, i) => (
                                    <div key={i} style={{ fontSize: 13, background: pal.panelSolid || pal.panel, borderRadius: 8, padding: "6px 10px" }}>{l}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredRecords.length > 0 && (
          <div style={{ ...styles.tableFooter, flexWrap: "wrap", gap: 10 }}>
            <span>
              {filteredRecords.length} kayıttan {pagedRecords.length} tanesi gösteriliyor
              {pageSize !== Infinity && totalPages > 1 ? ` · Sayfa ${safePage} / ${totalPages}` : ""}
              {selected.size > 0 ? ` · ${selected.size} seçili` : ""}
            </span>
            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} styles={styles} pal={pal} />
          </div>
        )}
      </div>
    </>
  );
}
