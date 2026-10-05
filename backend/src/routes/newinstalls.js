// "Yeni Kurulum Kaydı" — kullanıcı yeni kurduğu cihazların bilgisini formdan girer; kayıtlar
// burada (şifreli JSON section) tutulur; "Excel'e İşle" mevcut bir Excel dosyasına (excelPath)
// satır ekler; sonrasında mail hazırlanır. Bkz. konuşma — 2. adım A seçeneği (mevcut dosyaya ekleme),
// demoda dosya "varmış gibi" davranır (yoksa başlıklarla oluşturulur).
const express = require("express");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { readSection, writeSection } = require("../store");

const router = express.Router();
const SECTION = "yeniKurulumlar"; // { records: [...], excelPath: "..." }

// Excel sütun sırası = form alanları (kullanıcının gerçek Excel başlıkları — bkz. konuşma)
const COLUMNS = [
  ["serial", "SERİ NO"],
  ["hostname", "HOSTNAME"],
  ["model", "MODEL"],
  ["location", "LOKASYON"],
  ["userInfo", "KULLANICI BİLGİSİ"],
  ["atoNo", "ATO NUMARASI"],
  ["date", "TARİH"],
  ["bitlocker", "Bitlocker Kontrol"],
  ["processedBy", "İŞLEM YAPAN"],
  ["status", "DURUM"],
  ["deliveryDate", "TESLİM TARİHİ"],
  ["reason", "NEDENI"],
  ["returns", "İADELER"],
];
// Türetilmiş Excel sütunu — mail gönderildiyse 1, gönderilmediyse 0.
const MAIL_COL = "Mail Gönderildi";

const DEFAULT_EXCEL = "C:/Users/Lenovo/varlik-test-data-3month/YeniKurulumlar-DEMO.xlsx";

// İnaktif/Disk/SCCM/TH gibi diğer raporlar repo'yla giden bir "bundled demo veri" klasörüne
// düşüyor, bu yüzden Render'da (kalıcı olmayan disk) elle bir şey yapmadan çalışıyorlar. Yeni
// Kurulum/Kapatma Onayı kayıtları Excel'den DEĞİL bu yerel JSON store'dan geldiği için aynı sorun
// burada da var (bkz. konuşma: "hala eksiklerin var mesela kapatma onayı") — store hiç
// yazılmamışsa (ilk çalıştırma / Render'da disk sıfırlanmışsa) bundled seed'den otomatik doldurulur.
const SEED_FILE = path.join(__dirname, "..", "..", "demo-data", "newinstalls-seed.json");

function load() {
  const s = readSection(SECTION);
  if (!s) {
    try {
      const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
      const seeded = {
        records: seed.records || [],
        excelPath: DEFAULT_EXCEL,
        managedKeys: (seed.records || []).map((r) => `${r.serial}|${r.hostname}`.toLowerCase()),
      };
      writeSection(SECTION, seeded);
      return seeded;
    } catch {
      return { records: [], excelPath: DEFAULT_EXCEL, managedKeys: [] };
    }
  }
  return {
    records: Array.isArray(s.records) ? s.records : [],
    excelPath: s.excelPath || DEFAULT_EXCEL,
    // Bugüne kadar "sistem tarafından yazılmış" (SERİ NO|HOSTNAME) anahtarların kalıcı listesi —
    // bkz. sync-excel'deki hata düzeltmesi notu.
    managedKeys: Array.isArray(s.managedKeys) ? s.managedKeys : [],
  };
}
function save(state) {
  writeSection(SECTION, state);
}
// Büyük harfle saklanan alanlar — Excel'e de bu şekilde yazılır (bkz. konuşma). DURUM/Bitlocker
// Kontrol/NEDENI da dahil — frontend'in sabit seçenekleri artık zaten büyük harfle tanımlı
// ("TESLİM EDİLDİ" vb.), burası API'ye başka bir yoldan küçük harfle veri gelirse diye ikinci bir
// güvence. TARİH/TESLİM TARİHİ (tarih) ve İADELER (elle yazılmayan, otomatik oluşan cümle) hariç.
const UPPER_FIELDS = new Set(["serial", "hostname", "model", "location", "userInfo", "atoNo", "processedBy", "bitlocker", "status", "reason"]);
function clean(body = {}) {
  const out = {};
  COLUMNS.forEach(([k]) => {
    const v = String(body[k] ?? "").trim().slice(0, 500);
    out[k] = UPPER_FIELDS.has(k) ? v.toLocaleUpperCase("tr-TR") : v;
  });
  return out;
}
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

router.get("/", (req, res) => {
  res.json(load());
});

router.post("/", (req, res) => {
  const state = load();
  const rec = { id: newId(), createdAt: new Date().toISOString(), excelSyncedAt: null, ...clean(req.body) };
  state.records.push(rec);
  save(state);
  res.json(rec);
});

router.put("/:id", (req, res) => {
  const state = load();
  const i = state.records.findIndex((r) => r.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Kayıt bulunamadı" });
  state.records[i] = { ...state.records[i], ...clean(req.body), updatedAt: new Date().toISOString() };
  save(state);
  res.json(state.records[i]);
});

router.delete("/:id", (req, res) => {
  const state = load();
  const before = state.records.length;
  state.records = state.records.filter((r) => r.id !== req.params.id);
  if (state.records.length === before) return res.status(404).json({ error: "Kayıt bulunamadı" });
  save(state);
  res.json({ ok: true });
});

// Mail gönderildi işaretle — frontend başarılı gönderim sonrası çağırır.
router.post("/mark-mailed", (req, res) => {
  const state = load();
  const ids = new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String));
  const now = new Date().toISOString();
  let marked = 0;
  state.records = state.records.map((r) => {
    if (ids.has(String(r.id)) && !r.mailSentAt) {
      marked++;
      return { ...r, mailSentAt: now };
    }
    return r;
  });
  save(state);
  res.json({ ok: true, marked });
});

// Kapatma onayı hatırlatma maili gönderildi işaretle — "Kapatma Onayı Bekleyen Kayıtlar"
// ekranındaki "✉️ Gönder" butonu başarılı gönderimden sonra çağırır (bkz. konuşma: "Teslim Et
// yerine Gönder yapacağız" — inaktif cihazlardaki gibi hatırlatma maili). mark-mailed'daki
// mailSentAt gibi clean() whitelisti dışında, doğrudan işlenir; her gönderimde sayaç artar.
router.post("/mark-closure-reminder-sent", (req, res) => {
  const state = load();
  const ids = new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String));
  const now = new Date().toISOString();
  let marked = 0;
  state.records = state.records.map((r) => {
    if (ids.has(String(r.id))) {
      marked++;
      return { ...r, closureReminderSentAt: now, closureReminderCount: (r.closureReminderCount || 0) + 1 };
    }
    return r;
  });
  save(state);
  res.json({ ok: true, marked });
});

// Excel yolu ayarı
router.put("/config/excel-path", (req, res) => {
  const state = load();
  const p = String(req.body?.excelPath || "").trim();
  if (!p) return res.status(400).json({ error: "Yol boş olamaz" });
  state.excelPath = p;
  save(state);
  res.json({ excelPath: state.excelPath });
});

// Kayıtları Excel'e işle: dosya varsa okunur, YOKSA başlıklarla oluşturulur; TÜM kayıtlar
// (COLUMNS sırasıyla) tek sayfaya yazılır (idempotent — "eklenmiş gibi" ama mükerrer satır olmaz).
router.post("/sync-excel", (req, res) => {
  const state = load();
  const target = String(req.body?.excelPath || state.excelPath || DEFAULT_EXCEL).trim();
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });

    let existingRows = [];
    let existed = false;
    if (fs.existsSync(target)) {
      existed = true;
      const wb = XLSX.readFile(target);
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (ws) existingRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    }

    // Sistemdeki kayıtları Excel satırına çevir + "Mail Gönderildi" (1/0) sütunu
    const sysRows = state.records.map((r) => {
      const o = {};
      COLUMNS.forEach(([k, label]) => {
        o[label] = r[k] || "";
      });
      o[MAIL_COL] = r.mailSentAt ? 1 : 0;
      return o;
    });

    // Sistemde OLMAYAN (dosyada elle eklenmiş) satırları da koru — seri no + hostname anahtarıyla.
    // ÖNEMLİ: sadece "şu an" sistemde olan kayıtların anahtarına değil, sistemin BUGÜNE KADAR
    // yazdığı TÜM anahtarlara (managedKeys) bakılır. Aksi halde şu senaryoda hata oluşuyordu
    // (bkz. konuşma — "yeni cihaz eklediğimde listeyi tekrar aynı şekilde ekliyor"): bir kayıt
    // Excel'e işlenir → sonra o kayıt uygulamadan silinir (ör. yanlış girilmiş) → satırı hâlâ
    // dosyada duruyor ama artık "sistemde yok" göründüğü için bir sonraki işlemede YANLIŞLIKLA
    // "elle eklenmiş" sayılıp korunuyordu; aynı seri no ile yeni bir kayıt eklenip tekrar
    // işlendiğinde ESKİ (öksüz kalmış) satır + YENİ satır yan yana kalıyor, sanki "liste tekrar
    // eklenmiş" gibi görünüyordu. managedKeys bu geçmişi hatırladığı için öksüz satır artık kalıcı
    // olarak dosyadan düşer (silinen kayıt Excel'den de temizlenmiş olur) — mükerrer oluşmaz.
    const sysKeys = new Set(state.records.map((r) => `${r.serial}|${r.hostname}`.toLowerCase()));
    const managedKeys = new Set([...(state.managedKeys || []), ...sysKeys]);
    const keptManual = existingRows.filter((row) => {
      const key = `${row["SERİ NO"] || row["Seri No"] || ""}|${row["HOSTNAME"] || row["Hostname"] || ""}`.toLowerCase();
      return key !== "|" && !managedKeys.has(key);
    }).map((row) => ({ ...row, [MAIL_COL]: row[MAIL_COL] === 1 || row[MAIL_COL] === "1" ? 1 : 0 }));

    const allRows = [...keptManual, ...sysRows];
    const ws = XLSX.utils.json_to_sheet(allRows, { header: [...COLUMNS.map(([, l]) => l), MAIL_COL] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kurulumlar");
    XLSX.writeFile(wb, target);

    const now = new Date().toISOString();
    let added = 0;
    state.records = state.records.map((r) => {
      if (!r.excelSyncedAt) added++;
      return { ...r, excelSyncedAt: r.excelSyncedAt || now };
    });
    state.excelPath = target;
    state.managedKeys = [...managedKeys].slice(-5000); // güvenlik sınırı — sonsuz büyümesin
    save(state);

    res.json({
      ok: true,
      file: target,
      existed,
      totalRows: allRows.length,
      systemRows: sysRows.length,
      manualRowsKept: keptManual.length,
      newlyMarked: added,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
