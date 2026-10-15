import { useEffect, useMemo, useRef, useState } from "react";
import { backendClient } from "../services/backendClient";
import Pagination from "./Pagination";

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
  const arrow = <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: pal.inkSoft, pointerEvents: "none" }}>▾</span>;

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

// Diğer raporlarla aynı sayfalama seçenekleri (kullanıcı isteği — bkz. konuşma: "Yeni kurulum
// kaydındaki kayıtlara da sayfa düzeni koyalım").
const PAGE_SIZE_OPTIONS = [25, 50, 100, Infinity];

// "Yeni Kurulum Kaydı" (demo) — formdan kayıt → sistemde saklama → mevcut Excel'e satır ekleme
// → mail hazırlama/gönderme. Bkz. konuşma: 2. adım A seçeneği (mevcut dosyaya ekleme), demoda
// dosya "varmış gibi" (backend YeniKurulumlar-DEMO.xlsx'i okuyup satır ekler).
// Kullanıcının gerçek Excel başlıkları (bkz. konuşma). options = sabit açılır liste;
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
  // "İADE" kaldırıldı, yerine "YENİ İŞE GİRİŞ" eklendi (bkz. konuşma) — Excel'de de bu görünür.
  { k: "reason", label: "NEDENI", options: ["YENİ İŞE GİRİŞ", "DEĞİŞİM"] },
  { k: "returns", label: "İADELER", wide: true },
];

const today = () => new Date().toISOString().slice(0, 10);
const toUpperTr = (v) => String(v ?? "").toLocaleUpperCase("tr-TR");
// Büyük harfe çevrilecek serbest metin alanları. Sabit seçenekli alanlara (DURUM/Bitlocker/NEDENİ)
// dokunulmaz — kod bu değerlerle karşılaştırma yapıyor ("Teslim edildi" vb.), büyütülürse eşleşme
// bozulur (bkz. konuşma).
const UPPER_FIELDS = new Set(["serial", "hostname", "model", "location", "userInfo", "atoNo", "processedBy"]);
const emptyForm = (who) => Object.fromEntries(FIELDS.map((f) => [f.k, f.k === "date" ? today() : f.k === "processedBy" ? toUpperTr(who || "") : ""]));

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Mail metinleri — TR (kullanıcının verdiği şablona birebir) ve EN (aynı şablonun İngilizcesi).
// Adres satırındaki bina/tarif metni gerçek fiziksel adres olduğu için iki dilde de aynen korunur.
const MAIL_TEXT = {
  tr: {
    greeting: "Merhaba,",
    intro: "Cihazınız hazırlanmıştır. ATO kaydına Turuncuhattan kapatma onayı vermeniz durumunda&nbsp; bizden teslim alabilirsiniz.",
    head: ["Seri Numarası", "Barkod", "Model", "Marka", "Varlık Kataloğu", "Varlık Transfer Emri"],
    addressLabel: "Adres",
    address: "<strong>EBİ- Corporate Club binası</strong> (Atatürk Uluslararası Havalimanı B Kapısı , (Eğitim Akademisi, Merkez yemekhane yanı))",
    locationLabel: "Konum",
    subjectOne: "Cihazınız Hazır — ATO Kapatma Onayı",
    subjectMany: (n) => `Cihazlarınız Hazır — ATO Kapatma Onayı (${n} cihaz)`,
    plain: "Cihazınız hazırlanmıştır. ATO kaydına Turuncuhattan kapatma onayı vermeniz durumunda bizden teslim alabilirsiniz. Adres: EBİ- Corporate Club binası. Konum: https://goo.gl/maps/boaRCuAx7Qu",
  },
  en: {
    greeting: "Hello,",
    intro: "Your device has been prepared. Once you give the ATO record closure approval via Turuncuhat, you may collect it from us.",
    head: ["Serial Number", "Barcode", "Model", "Brand", "Asset Catalog", "Asset Transfer Order"],
    addressLabel: "Address",
    address: "<strong>EBİ- Corporate Club binası</strong> (Atatürk Uluslararası Havalimanı B Kapısı , (Eğitim Akademisi, Merkez yemekhane yanı))",
    locationLabel: "Location",
    subjectOne: "Your Device Is Ready — ATO Closure Approval",
    subjectMany: (n) => `Your Devices Are Ready — ATO Closure Approval (${n} devices)`,
    plain: "Your device has been prepared. Once you give the ATO record closure approval via Turuncuhat, you may collect it from us. Address: EBİ- Corporate Club binası. Location: https://goo.gl/maps/boaRCuAx7Qu",
  },
};

// Mail gövdesi — kullanıcının verdiği şablona birebir (bkz. konuşma). lang: "tr" | "en".
// Tablo sütunları: Seri Numarası · Barkod · Model · Marka · Varlık Kataloğu · Varlık Transfer Emri
// Barkod/Marka form'da yok → seri no ile TuruncuHat'tan doldurulur. Varlık Transfer Emri = ATO NUMARASI.
function buildMailHtml(recs, thRows = [], lang = "tr") {
  const T = MAIL_TEXT[lang] || MAIL_TEXT.tr;
  const thBySerial = new Map();
  thRows.forEach((t) => {
    const k = String(t.serial || "").trim().toLowerCase();
    if (k) thBySerial.set(k, t);
  });
  const body = recs
    .map((r) => {
      const th = thBySerial.get(String(r.serial || "").trim().toLowerCase());
      // Sütun kaynakları (kullanıcı onayı): Seri No/Barkod/Model/Marka/Varlık Kataloğu → TH;
      // Varlık Transfer Emri → form ATO NUMARASI.
      const cells = [
        (th && th.serial) || r.serial || "", // TH → SERİ NO
        (th && th.barkod) || "", // TH → Varlık Barkodu
        (th && th.deviceType) || "", // TH → "Model" sütunu
        (th && th.marka) || "", // TH → Marka
        (th && (th.asset || th.model)) || "", // TH → Asset (Varlık Kataloğu)
        r.atoNo || "", // form → ATO NUMARASI
      ];
      return `<tr>${cells.map((c) => `<td style="border:1px solid #000;padding:6px 10px;">${esc(c)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<div style="font-family:Calibri,Arial,Helvetica,sans-serif;font-size:14px;color:#000;line-height:1.55;">
    <p>${T.greeting}</p>
    <p>${T.intro}</p>
    <table style="border-collapse:collapse;margin:10px 0 14px;">
      <thead><tr>${T.head
        .map((h) => `<th style="border:1px solid #000;padding:6px 10px;text-align:left;color:#C00000;font-weight:bold;white-space:nowrap;">${h}</th>`)
        .join("")}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p>${T.addressLabel}: ${T.address}</p>
    <p>${T.locationLabel} : <a href="https://goo.gl/maps/boaRCuAx7Qu">https://goo.gl/maps/boaRCuAx7Qu</a></p>
  </div>`;
}

const norm = (v) => String(v || "").trim().toLowerCase();
// TH satırından "kişiye zimmetli fiziksel cihaz" mı? (User zimmeti + Desktop/Laptop/Notebook/Monitor)
const isPersonDevice = (r) => {
  const at = norm(r.assignmentType);
  const dt = norm(r.deviceType);
  if (at && at !== "user") return false;
  return /desktop|laptop|notebook|monitor|tablet/.test(dt) || !dt;
};

export default function NewInstallScreen({ styles, pal, user, locationOptions = [], thRows = [], mailGroupsText, recordMailHistory, showToast }) {
  const [returnQuery, setReturnQuery] = useState("");
  const [records, setRecords] = useState([]);
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
  // bulunur (bkz. konuşma: "turuncuhat envanter excelinden ilgili kişinin email bilgisini
  // bulamaz mıyız" — Outlook "check names" gibi bir dizin servisi yok, ama TH'deki isim eşleşmesi
  // aynı işi görür).
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
        const res = await backendClient.syncNewInstallExcel(excelPath || undefined);
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
    // Yeni kurulan cihaz en üstte görünsün — takip kolaylaşsın (bkz. konuşma). createdAt yoksa
    // (eski kayıt) id/date'e düşer, en azından backend ekleme sırasının tersini verir.
    return [...list].sort((a, b) => {
      const ta = Date.parse(a.createdAt || "") || 0;
      const tb = Date.parse(b.createdAt || "") || 0;
      if (tb !== ta) return tb - ta;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [records, qFilter, qText]);

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

  const syncExcel = async () => {
    setSyncing(true);
    try {
      const res = await backendClient.syncNewInstallExcel(excelPath || undefined);
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

  const sendMail = async () => {
    if (targetRecs.length === 0) {
      showToast("Gönderilecek kayıt yok");
      return;
    }
    let recipients = mailTo.split(/[;,\s]+/).map((s) => s.trim()).filter((s) => /@/.test(s));
    if (recipients.length === 0) {
      // TuruncuHat'ta "Kullanıcı Bilgisi" (isim) ile eşleşen bir kayıt varsa o kişinin gerçek
      // maili (bkz. konuşma) — yeni cihazın kendisi henüz TH'de olmasa bile, kişi genelde TH'de
      // başka bir kayıtla zaten vardır.
      recipients = [...new Set(targetRecs.map((r) => thByOwnerName.get(norm(r.userInfo))).filter(Boolean))];
    }
    if (recipients.length === 0) {
      // lokasyon mail grupları
      const groups = Object.fromEntries(
        (mailGroupsText || "")
          .split("\n")
          .map((l) => l.split(/[\t,;]/).map((x) => x.trim()))
          .filter((p) => p[0] && p[1] && /@/.test(p[1]))
      );
      recipients = [...new Set(targetRecs.map((r) => groups[r.location]).filter(Boolean))];
    }
    if (recipients.length === 0) {
      showToast("Alıcı yok — üstteki kutuya e-posta girin veya Ayarlar > Lokasyon Mailleri'ni doldurun");
      return;
    }
    const to = recipients.join(", ");
    const T = MAIL_TEXT[mailLang] || MAIL_TEXT.tr;
    const subject = targetRecs.length === 1 ? T.subjectOne : T.subjectMany(targetRecs.length);
    setMailBusy(true);
    try {
      const r = await backendClient.sendMail({
        to,
        subject,
        text: T.plain,
        html: buildMailHtml(targetRecs, thRows, mailLang),
      });
      const ok = !!r.ok;
      if (ok) {
        await backendClient.markNewInstallsMailed(targetRecs.map((x) => x.id)).catch(() => {});
        await reload();
        setSelected(new Set()); // gönderilenler seçili kalmasın: bir sonraki "Mail Gönder" aynı kayıtları yeniden göndermesin
        setMailPreview(r.previewUrl ? { url: r.previewUrl, to, at: new Date() } : null);
      }
      recordMailHistory &&
        recordMailHistory({
          id: Date.now(),
          date: new Date().toLocaleString("tr-TR"),
          dept: "Yeni Kurulum",
          report: `Yeni Kurulum Kaydı (${mailLang === "en" ? "EN" : "TR"})`,
          recipients: ok ? targetRecs.length : 0,
          status: ok ? "Başarılı" : "Gönderilemedi",
          details: [{ location: `${targetRecs.length} cihaz`, to, count: targetRecs.length, ok, message: `[${mailLang === "en" ? "EN" : "TR"}] ` + (r.message || (ok ? "Gönderildi" : "Gönderilemedi")) + (r.previewUrl ? ` · önizleme: ${r.previewUrl}` : "") }],
        });
      showToast(ok ? `✅ Kurulum bildirimi gönderildi (${to})${r.previewUrl ? " — önizleme linki aşağıda" : ""}` : `❌ Gönderilemedi — ${r.message || ""}`);
    } catch (err) {
      showToast(`❌ Gönderilemedi — ${err.message}`);
    } finally {
      setMailBusy(false);
    }
  };

  const inp = { ...styles.formInput };

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
          Yeni kurduğun cihazı formdan gir → sistemde saklanır → "Excel'e İşle" ile mevcut kurulum Excel'ine satır eklenir → "Mail Gönder" ile bildirim hazırlanır.
          <em> (Demo: Excel dosyası hazır varsayılıyor.)</em>
        </p>
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
                      placeholder={locationOptions.length ? "yazarak ara veya listeden seç" : "lokasyon"}
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
                      <span style={{ color: pal.inkSoft, fontSize: 12.5, alignSelf: "center" }}>
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
                      <p style={{ margin: "3px 0 0", fontSize: 11.5, color: pal.inkSoft }}>
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
              placeholder="Kişi adı yaz (SCCM'deki tam ad) — örn. Ahmet Yılmaz"
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
                        fontSize: 12.5,
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
      <div style={{ ...styles.panel, padding: "20px 24px" }}>
        <div style={styles.settingsSectionHead}>
          <p style={styles.settingsSectionTitle}>
            Kayıtlar ({filteredRecords.length === records.length ? records.length : `${filteredRecords.length} / ${records.length}`})
          </p>
          <span style={{ fontSize: 12.5, color: pal.inkSoft }}>
            {counts.unsynced === 0 ? "Tümü Excel'e işlendi" : `${counts.unsynced} Excel'e işlenmedi`} ·{" "}
            {counts.unmailed === 0 ? "Tümü maillendi" : `${counts.unmailed} mail gönderilmedi`}
          </span>
        </div>

        {/* Geriye dönük sorgu — hızlı filtreler + arama */}
        {records.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "4px 0 14px" }}>
            {[
              ["all", "Tümü", counts.all],
              ["undelivered", "Teslim bekleyen", counts.undelivered],
              ["waiting", "7+ gün bekleyen", counts.waiting],
              ["unmailed", "Mail gönderilmemiş", counts.unmailed],
              ["unsynced", "Excel'e işlenmemiş", counts.unsynced],
            ].map(([key, label, n]) => {
              const on = qFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setQFilter(key)}
                  style={{
                    ...styles.btnGhost,
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: on ? 700 : 400,
                    background: on ? pal.accentSoft || pal.line : "transparent",
                    borderColor: on ? pal.accent || pal.ok : pal.line,
                    color: on ? pal.accent || pal.ink : pal.inkSoft,
                  }}
                >
                  {label} <span style={{ opacity: 0.7 }}>({n})</span>
                </button>
              );
            })}
            <input
              type="text"
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              style={{ ...inp, flex: "1 1 200px", minWidth: 160 }}
              placeholder="Ara: seri no / hostname / kullanıcı / ATO / lokasyon"
            />
            {(qFilter !== "all" || qText) && (
              <button type="button" style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 12 }} onClick={() => { setQFilter("all"); setQText(""); }}>
                Temizle
              </button>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "6px 0 14px" }}>
          <input
            type="text"
            value={excelPath}
            onChange={(e) => setExcelPath(e.target.value)}
            style={{ ...inp, flex: "1 1 340px", fontFamily: "var(--font-mono)", fontSize: 12 }}
            placeholder="Excel dosya yolu"
          />
          <button style={styles.btnPrimary} onClick={syncExcel} disabled={syncing || records.length === 0}>
            {syncing ? "İşleniyor…" : "📄 Excel'e İşle"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input
            type="text"
            value={mailTo}
            onChange={(e) => setMailTo(e.target.value)}
            style={{ ...inp, flex: "0 1 360px" }}
            placeholder="Mail alıcı(lar) — boşsa lokasyon mail grubu"
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: pal.inkSoft, flex: "0 0 auto" }}>
            Dil
            <select value={mailLang} onChange={(e) => setMailLang(e.target.value)} style={{ ...inp, width: 120, flex: "0 0 auto" }}>
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </label>
          <button style={styles.btnGhost} onClick={sendMail} disabled={mailBusy || targetRecs.length === 0}>
            {mailBusy
              ? "Gönderiliyor…"
              : `✉️ Mail Gönder — ${mailLang === "en" ? "EN" : "TR"} (${
                  selected.size > 0 ? selected.size + " seçili" : qFilter !== "all" || qText ? filteredRecords.length + " filtreli" : "tümü"
                })`}
          </button>
        </div>

        {lastSync && (
          <p style={{ ...styles.formHelper, color: pal.ok, marginTop: 0 }}>
            {lastSync.existed ? "Mevcut dosyaya işlendi" : "Dosya oluşturuldu"} · {lastSync.file} · toplam {lastSync.totalRows} satır
            {lastSync.manualRowsKept ? ` (${lastSync.manualRowsKept} elle eklenen satır korundu)` : ""}
          </p>
        )}

        {mailPreview && (
          <p style={{ ...styles.formHelper, marginTop: 0 }}>
            ✉️ Son gönderim ({mailPreview.to}) —{" "}
            <a href={mailPreview.url} target="_blank" rel="noreferrer" style={{ color: pal.accent || pal.ok, fontWeight: 600 }}>
              maili tarayıcıda önizle
            </a>{" "}
            <span style={{ color: pal.inkSoft }}>(test SMTP kutusu)</span>
          </p>
        )}

        {records.length === 0 ? (
          <p style={styles.pageSub}>Henüz kayıt yok — yukarıdaki formdan ekleyin.</p>
        ) : filteredRecords.length === 0 ? (
          <p style={styles.pageSub}>Bu filtreyle eşleşen kayıt yok.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: 32 }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} style={styles.checkbox} />
                  </th>
                  {FIELDS.map((f) => (
                    <th key={f.k} style={styles.th}>{f.label}</th>
                  ))}
                  <th style={styles.th}>Excel</th>
                  <th style={styles.th}>Mail</th>
                  <th style={styles.th}>Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map((r) => (
                  <tr key={r.id} style={selected.has(r.id) ? styles.rowSelected : undefined}>
                    <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} style={styles.checkbox} />
                    </td>
                    {FIELDS.map((f) => (
                      <td key={f.k} style={{ ...styles.td, fontSize: 12.5, whiteSpace: f.wide ? "normal" : "nowrap" }}>
                        {r[f.k] || <span style={{ color: pal.inkSoft }}>—</span>}
                      </td>
                    ))}
                    <td style={styles.td}>
                      {r.excelSyncedAt ? (
                        <span style={{ ...styles.badge, ...styles.badgeOk }}>işlendi</span>
                      ) : (
                        <span style={{ ...styles.badge, ...styles.badgeNeutral }}>bekliyor</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      {r.mailSentAt ? (
                        <span style={{ ...styles.badge, ...styles.badgeOk }} title={new Date(r.mailSentAt).toLocaleString("tr-TR")}>gönderildi · 1</span>
                      ) : (
                        <span style={{ ...styles.badge, ...styles.badgeNeutral }}>gönderilmedi · 0</span>
                      )}
                    </td>
                    <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                      {norm(r.status) !== norm("TESLİM EDİLDİ") && (
                        <>
                          <button
                            style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 12, color: pal.ok, borderColor: pal.ok }}
                            onClick={() => deliver(r)}
                            title="Teslim edildi olarak işaretle (teslim tarihini sorar)"
                          >
                            ✓ Teslim Et
                          </button>{" "}
                        </>
                      )}
                      <button style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 12 }} onClick={() => edit(r)}>Düzenle</button>{" "}
                      <button style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 12, color: pal.bad }} onClick={() => del(r)}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredRecords.length > PAGE_SIZE_OPTIONS[0] && (
          <div style={styles.segmented} title="Sayfada gösterilecek kayıt sayısı">
            {PAGE_SIZE_OPTIONS.map((n) => (
              <div key={n} onClick={() => setPageSize(n)} style={{ ...styles.seg, ...(pageSize === n ? styles.segActive : {}) }}>
                {n === Infinity ? "Tümü" : n}
              </div>
            ))}
          </div>
        )}
        {filteredRecords.length > 0 && (
          <div style={{ ...styles.tableFooter, flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            <span>
              {filteredRecords.length} kayıttan {pagedRecords.length} tanesi gösteriliyor
              {pageSize !== Infinity && totalPages > 1 ? ` · Sayfa ${safePage} / ${totalPages}` : ""}
            </span>
            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} styles={styles} pal={pal} />
          </div>
        )}
      </div>
    </>
  );
}
