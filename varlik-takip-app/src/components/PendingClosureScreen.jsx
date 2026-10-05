import { useEffect, useMemo, useState } from "react";
import { backendClient } from "../services/backendClient";
import { buildUstYonetimEmailSet, isUstYonetimEmail, fetchUstYonetimEmails } from "../services/ustYonetimService";
import Pagination from "./Pagination";

// "Kapatma Onayı Bekleyen Kayıtlar" — ayrı bir veri kaynağı DEĞİL, "Yeni Kurulum Kaydı" akışının
// bir alt kümesi (bkz. konuşma). Akış: form → cihaz hazırlanır → kullanıcıya "ATO kaydına
// TuruncuHat'tan kapatma onayı ver, sonra teslim al" maili atılır (NewInstallScreen.sendMail,
// markNewInstallsMailed → mailSentAt) → kullanıcı TH'de onay verip cihazı teslim alınca
// "✓ Teslim Et" ile status "TESLİM EDİLDİ" olur. Bu ikisi arasındaki kayıtlar — mail gitmiş ama
// henüz teslim edilmemiş — TAM OLARAK "kapatma onayı bekleyen" kayıtlardır. Aynı backend
// (/newinstalls) kaynağı kullanılır, ayrı bir Excel/API'ye ihtiyaç yoktur.
//
// Üst araç çubuğu düzeni kullanıcının paylaştığı "Yeni Kurulum Kaydı" ekran görüntüsüyle aynı
// desende (bkz. konuşma): başlık+özet satırı, filtre çipleri + arama, seçim kutucukları ve altta
// Dil seçimi + tek bir birincil "Hatırlatma Gönder" butonu (seçili/filtreli/tümü kaydı kapsar).
const norm = (v) => String(v || "").trim().toLowerCase();
const PAGE_SIZE_OPTIONS = [25, 50, 100, Infinity];

const daysSince = (d) => {
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
};

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Kullanıcının verdiği hazır metin (bkz. konuşma) — sabit gövde + kullanıcının paylaştığı ekran
// görüntüsündeki tablo şablonu: Barkod / Seri No / Varlık Adı / ATO Code / Etkilenen Kullanıcı.
// Barkod ve Varlık Adı NewInstall kaydında yok — NewInstallScreen.buildMailHtml'deki gibi seri no
// üzerinden TuruncuHat'a bakılıp oradan (th.barkod, th.asset || th.model) dolduruluyor.
// TR/EN — Yeni Kurulum Kaydı'ndaki dil seçimiyle aynı desen (bkz. konuşma).
const MAIL_TEXT = {
  tr: {
    subject: "Kapatma Onayı Bekleniyor — TuruncuHat",
    greeting: "Merhabalar,",
    intro: "Lokasyonunuzda zimmet için açılan ve kapatma onayı bekleyen turuncuhat kayıtları bulunmaktadır.",
    body: 'Turuncuhat prosedürü gereği ilgili kayda onay vermeniz önem arz etmektedir. Süreçlerin ilerleyebilmesi açısından teslim edilmiş/hazırlanmış zimmet kayıtlarına Turuncuhat üzerinden kapatma onayı verilmesi arz/rica olunur. Kaydı incelemek ve onaylamak için ilgili işlem kaydını açıp "Kapatma Onayı" butonuna tıklamanız rica olunur. Ekte yer alan adımları takip ederek işleminizi kolaylıkla tamamlayabilirsiniz.',
    plain: "Lokasyonunuzda zimmet için açılan ve kapatma onayı bekleyen turuncuhat kayıtları bulunmaktadır. Turuncuhat üzerinden ilgili kayda kapatma onayı vermeniz rica olunur.",
    head: ["Barkod", "Seri No", "Varlık Adı", "ATO Code", "Etkilenen Kullanıcı"],
  },
  en: {
    subject: "Closure Approval Pending — TuruncuHat",
    greeting: "Hello,",
    intro: "There are TuruncuHat records opened for asset assignment in your location that are pending closure approval.",
    body: 'As per TuruncuHat procedure, your approval on the relevant record is important. In order for the process to proceed, please give closure approval via TuruncuHat for the delivered/prepared asset assignment records. To review and approve the record, please open the relevant transaction and click the "Closure Approval" button. You can easily complete this by following the attached steps.',
    plain: "There are TuruncuHat records opened for asset assignment in your location that are pending closure approval. Please give closure approval for the relevant record via TuruncuHat.",
    head: ["Barcode", "Serial Number", "Asset Name", "ATO Code", "Affected User"],
  },
};

// recs: bir veya birden fazla kayıt (tek satırlık hatırlatma da, toplu hatırlatma da aynı fonksiyonu
// kullanır — NewInstallScreen.buildMailHtml'deki çoklu satır deseniyle aynı).
function buildClosureReminderHtml(recs, thBySerial, lang = "tr") {
  const T = MAIL_TEXT[lang] || MAIL_TEXT.tr;
  const body = recs
    .map((r) => {
      const th = thBySerial.get(norm(r.serial));
      const cells = [(th && th.barkod) || "", r.serial || "", (th && (th.asset || th.model)) || "", r.atoNo || "", r.userInfo || ""];
      return `<tr>${cells.map((c) => `<td style="border:1px solid #ccc;padding:6px 8px;">${esc(c)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6;">
    <p>${T.greeting}</p>
    <p>${T.intro}</p>
    <p>${T.body}</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:8px;">
      <thead>
        <tr style="background:#f0f0f0;">
          ${T.head.map((h) => `<th style="border:1px solid #ccc;padding:6px 8px;text-align:left;">${h}</th>`).join("")}
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

export default function PendingClosureScreen({ styles, pal, showToast, thRows = [] }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState("");
  const [qFilter, setQFilter] = useState("all"); // all | overdue | unsent | sent
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sendingId, setSendingId] = useState(null); // tek satır gönderimi (satır bazlı buton)
  const [bulkSending, setBulkSending] = useState(false); // toplu gönderim (üst bar)
  const [mailTo, setMailTo] = useState(""); // boşsa lokasyon mail grubu kullanılır
  const [mailLang, setMailLang] = useState("tr"); // "tr" | "en" — Yeni Kurulum Kaydı'ndaki dil seçimiyle aynı
  // KRİTİK: üst yönetime hiçbir şekilde mail gitmemeli (bkz. konuşma) — bu liste ARTIK Excel'den
  // değil, admin'in Ayarlar'dan elle yönettiği sabit e-posta listesinden geliyor (bkz.
  // ustYonetimService.js). Sayfa açılışında bir kez çekilir.
  const [ustYonetimEmails, setUstYonetimEmails] = useState(new Set());

  const reload = () =>
    backendClient
      .getNewInstalls()
      .then((s) => setRecords(Array.isArray(s.records) ? s.records : []))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
    fetchUstYonetimEmails()
      .then((emails) => setUstYonetimEmails(buildUstYonetimEmailSet(emails)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seri no → TuruncuHat satırı (Barkod/Varlık Adı için — NewInstallScreen.buildMailHtml ile aynı desen).
  const thBySerial = useMemo(() => {
    const m = new Map();
    thRows.forEach((t) => {
      const k = norm(t.serial);
      if (k) m.set(k, t);
    });
    return m;
  }, [thRows]);

  // Kapatma onayı bekleyen = mail gönderildi (mailSentAt var) VE henüz teslim edilmedi. KRİTİK:
  // üst yönetime ait kayıtlar bu ekrandan TAMAMEN gizlenir (bkz. konuşma: "üst yönetim listede
  // gözükmesin hiç") — sadece mail engellenmiyor, görünürlük de yok.
  const pending = useMemo(
    () =>
      records.filter((r) => {
        if (!r.mailSentAt || norm(r.status) === norm("TESLİM EDİLDİ")) return false;
        const th = thBySerial.get(norm(r.serial));
        return !(th && isUstYonetimEmail(ustYonetimEmails, th.ownerMail));
      }),
    [records, thBySerial, ustYonetimEmails]
  );

  const overdueCount = useMemo(() => pending.filter((r) => (daysSince(r.mailSentAt) ?? 0) > 7).length, [pending]);
  const unsentCount = useMemo(() => pending.filter((r) => !r.closureReminderSentAt).length, [pending]);
  const sentCount = pending.length - unsentCount;

  const filtered = useMemo(() => {
    let list = pending;
    if (qFilter === "overdue") list = list.filter((r) => (daysSince(r.mailSentAt) ?? 0) > 7);
    else if (qFilter === "unsent") list = list.filter((r) => !r.closureReminderSentAt);
    else if (qFilter === "sent") list = list.filter((r) => r.closureReminderSentAt);
    const q = norm(qText);
    if (q) {
      list = list.filter((r) => {
        const th = thBySerial.get(norm(r.serial));
        return [r.serial, r.hostname, r.userInfo, r.atoNo, r.location, th?.barkod, th?.asset || th?.model]
          .map(norm)
          .some((v) => v.includes(q));
      });
    }
    // En uzun bekleyen en üstte — takip önceliği burada olmalı.
    return [...list].sort((a, b) => (Date.parse(a.mailSentAt) || 0) - (Date.parse(b.mailSentAt) || 0));
  }, [pending, qFilter, qText, thBySerial]);

  useEffect(() => setPage(1), [qFilter, qText, pageSize]);
  const totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    if (pageSize === Infinity) return filtered;
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSize, safePage]);

  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (filtered.every((r) => n.has(r.id))) filtered.forEach((r) => n.delete(r.id));
      else filtered.forEach((r) => n.add(r.id));
      return n;
    });

  // Seçim varsa seçililer; yoksa o an filtrelenmiş liste (aktif filtre "tümü" anlamına gelir) —
  // NewInstallScreen'deki targetRecs ile aynı mantık.
  const targetRecs = useMemo(
    () => (selected.size > 0 ? pending.filter((r) => selected.has(r.id)) : filtered),
    [pending, selected, filtered]
  );

  // Alıcı artık TuruncuHat'taki "Cihaz Sahibinin Maili" alanından, kişiye özel gidiyor (bkz.
  // konuşma: "onların excelinde kullanıcıların email adresi olacak, onlara o şekilde direkt mail
  // atılabilir") — lokasyon mail grubu (mailGroupsText) burada ARTIK KULLANILMIYOR. Eşleşme yoksa
  // elle e-posta sorulur.

  // Tek satır — satırdaki "Gönder"/"Tekrar Hatırlat" butonu.
  const sendReminder = async (r) => {
    const th = thBySerial.get(norm(r.serial));
    // KRİTİK: üst yönetime hiçbir şekilde mail gitmemeli (bkz. konuşma) — bu yüzden manuel
    // e-posta sorma adımına bile gelinmeden en başta engelleniyor.
    if (th && isUstYonetimEmail(ustYonetimEmails, th.ownerMail)) {
      showToast && showToast("⛔ Üst yönetim — bu kişiye hatırlatma maili gönderilmez");
      return;
    }
    let to = (th && th.ownerMail) || "";
    if (!to) {
      const entered = window.prompt(`"${r.userInfo || r.serial}" için TuruncuHat'ta mail adresi bulunamadı — alıcı e-posta girin:`, "");
      if (!entered || !entered.trim()) return;
      to = entered.trim();
      if (isUstYonetimEmail(ustYonetimEmails, to)) {
        showToast && showToast("⛔ Üst yönetim — bu kişiye hatırlatma maili gönderilmez");
        return;
      }
    }
    setSendingId(r.id);
    const T = MAIL_TEXT[mailLang] || MAIL_TEXT.tr;
    try {
      const res = await backendClient.sendMail({
        to,
        subject: T.subject,
        text: T.plain,
        html: buildClosureReminderHtml([r], thBySerial, mailLang),
      });
      if (res.ok) {
        await backendClient.markClosureReminderSent([r.id]);
        await reload();
        showToast && showToast(`✅ Hatırlatma gönderildi (${to})`);
      } else {
        showToast && showToast(`❌ Gönderilemedi — ${res.message || ""}`);
      }
    } catch (err) {
      showToast && showToast(`❌ Gönderilemedi — ${err.message}`);
    } finally {
      setSendingId(null);
    }
  };

  // Toplu — üst bardaki "Hatırlatma Gönder" birincil buton. Kullanıcı isteği (bkz. konuşma):
  // "Birden fazla mail seçtiğimde tek mailin içinde gitmesin. Ayrı ayrı gitsin eğer bir lokasyonda
  // birden fazla var ise tek mailde gidebilir" — yani AYNI lokasyondaki kayıtlar tek mailde
  // (çoklu satır tablosu), FARKLI lokasyonlar ise birbirinden AYRI mail olarak gider. Üstteki
  // kutuya elle alıcı girilmişse (mailTo doluysa) bu gruplama devre dışı kalır — kullanıcı bilinçli
  // olarak tek bir hedefe göndermek istiyor demektir, hepsi o adrese tek mailde gider.
  const sendBulkReminder = async () => {
    if (targetRecs.length === 0) {
      showToast && showToast("Gönderilecek kayıt yok");
      return;
    }
    // KRİTİK: üst yönetime hiçbir şekilde mail gitmemeli (bkz. konuşma) — hem manuel alıcı hem
    // kişiye-göre-grupla yollarından ÖNCE, en başta hedef listeden çıkarılıyor.
    const ustYonetimSkipped = targetRecs.filter((r) => {
      const th = thBySerial.get(norm(r.serial));
      return th && isUstYonetimEmail(ustYonetimEmails, th.ownerMail);
    });
    const sendableRecs = targetRecs.filter((r) => !ustYonetimSkipped.includes(r));
    if (sendableRecs.length === 0) {
      showToast && showToast(`⛔ Seçili ${targetRecs.length} kaydın tamamı üst yönetime ait — mail gönderilmedi`);
      setBulkSending(false);
      return;
    }
    const T = MAIL_TEXT[mailLang] || MAIL_TEXT.tr;
    const manualAll = mailTo.split(/[;,\s]+/).map((s) => s.trim()).filter((s) => /@/.test(s));
    // Elle girilen alıcı üst yönetim listesindeyse (admin bilerek/bilmeyerek yazmış olsa bile)
    // KRİTİK kural burada da geçerli — o adres tamamen çıkarılır.
    const manual = manualAll.filter((e) => !isUstYonetimEmail(ustYonetimEmails, e));
    const manualBlocked = manualAll.length - manual.length;
    if (manualAll.length > 0 && manual.length === 0) {
      showToast && showToast("⛔ Girilen adres(ler) üst yönetime ait — mail gönderilmedi");
      setBulkSending(false);
      return;
    }
    setBulkSending(true);
    try {
      if (manual.length > 0) {
        // Elle girilen alıcı — tek hedef, tüm hedef kayıtlar aynı mailde.
        const to = manual.join(", ");
        const res = await backendClient.sendMail({ to, subject: T.subject, text: T.plain, html: buildClosureReminderHtml(sendableRecs, thBySerial, mailLang) });
        if (res.ok) {
          await backendClient.markClosureReminderSent(sendableRecs.map((r) => r.id));
          showToast &&
            showToast(
              `✅ Hatırlatma gönderildi — ${sendableRecs.length} kayıt (${to})${
                ustYonetimSkipped.length ? ` · ${ustYonetimSkipped.length} üst yönetim kaydı hariç tutuldu` : ""
              }${manualBlocked ? ` · ${manualBlocked} üst yönetim adresi engellendi` : ""}`
            );
        } else {
          showToast && showToast(`❌ Gönderilemedi — ${res.message || ""}`);
        }
      } else {
        // Kişiye göre grupla (TuruncuHat "Cihaz Sahibinin Maili") — her kişi kendi AYRI mailini
        // alır, aynı kişinin birden fazla bekleyen kaydı varsa tek mailde (çoklu satır tablosu)
        // birleşir (bkz. konuşma).
        const groups = new Map(); // to (email) -> records[]
        const missing = new Set();
        sendableRecs.forEach((r) => {
          const th = thBySerial.get(norm(r.serial));
          const to = (th && th.ownerMail) || "";
          if (!to) {
            missing.add(r.userInfo || r.serial || "(bilinmeyen)");
            return;
          }
          if (!groups.has(to)) groups.set(to, []);
          groups.get(to).push(r);
        });
        // Maili bulunamayan kişiler için elle sor (kişi başına bir kez).
        for (const person of missing) {
          const entered = window.prompt(`"${person}" için TuruncuHat'ta mail adresi bulunamadı — alıcı e-posta girin (boş bırakırsan bu kayıtlar atlanır):`, "");
          const email = (entered || "").trim();
          if (email && isUstYonetimEmail(ustYonetimEmails, email)) {
            showToast && showToast(`⛔ "${person}" için girilen adres üst yönetime ait — atlandı`);
            continue;
          }
          if (email && /@/.test(email)) {
            const recs = sendableRecs.filter((r) => (r.userInfo || r.serial || "(bilinmeyen)") === person);
            if (!groups.has(email)) groups.set(email, []);
            groups.get(email).push(...recs);
          }
        }
        if (groups.size === 0) {
          showToast && showToast("Alıcı yok — üstteki kutuya e-posta girin, TuruncuHat'ta mail adresi eksik olabilir");
          setBulkSending(false);
          return;
        }
        const sentRecords = [];
        let failCount = 0;
        for (const [to, recs] of groups) {
          try {
            const res = await backendClient.sendMail({ to, subject: T.subject, text: T.plain, html: buildClosureReminderHtml(recs, thBySerial, mailLang) });
            if (res.ok) sentRecords.push(...recs);
            else failCount++;
          } catch {
            failCount++;
          }
        }
        if (sentRecords.length > 0) await backendClient.markClosureReminderSent(sentRecords.map((r) => r.id));
        showToast &&
          showToast(
            `${failCount === 0 ? "✅" : "⚠️"} ${groups.size} kişiye ayrı mail gönderildi — ${sentRecords.length}/${sendableRecs.length} kayıt${
              failCount ? `, ${failCount} gönderim başarısız` : ""
            }${ustYonetimSkipped.length ? ` · ${ustYonetimSkipped.length} üst yönetim kaydı hariç tutuldu` : ""}`
          );
      }
      await reload();
      setSelected(new Set());
    } catch (err) {
      showToast && showToast(`❌ Gönderilemedi — ${err.message}`);
    } finally {
      setBulkSending(false);
    }
  };

  const inp = { ...styles.formInput };

  return (
    <div style={{ ...styles.panel, padding: "20px 24px" }}>
      <p style={styles.pageTitle}>Kapatma Onayı Bekleyen Kayıtlar</p>
      <p style={styles.pageSub}>
        "Yeni Kurulum Kaydı"nda kullanıcıya cihazı hazır olduğu ve ATO kaydına TuruncuHat'tan kapatma onayı vermesi gerektiği maili atılmış, ancak henüz teslim alınmamış kayıtlar.
      </p>

      {loading ? (
        <p style={styles.pageSub}>Yükleniyor…</p>
      ) : (
        <>
          <div style={{ ...styles.settingsSectionHead, marginTop: 14 }}>
            <p style={styles.settingsSectionTitle}>
              Kayıtlar ({filtered.length === pending.length ? pending.length : `${filtered.length} / ${pending.length}`})
            </p>
            <span style={{ fontSize: 12.5, color: pal.inkSoft }}>
              {unsentCount === 0 ? "Tümü hatırlatıldı" : `${unsentCount} hiç hatırlatılmadı`} ·{" "}
              {overdueCount === 0 ? "7+ gün bekleyen yok" : `${overdueCount} tanesi 7+ gündür bekliyor`}
            </span>
          </div>

          {/* Hızlı filtre çipleri + arama — Yeni Kurulum Kaydı'ndaki desenle aynı (bkz. konuşma). */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "10px 0 14px" }}>
            {[
              ["all", "Tümü", pending.length],
              ["overdue", "7+ gün bekleyen", overdueCount],
              ["unsent", "Hatırlatma gönderilmemiş", unsentCount],
              ["sent", "Hatırlatma gönderilmiş", sentCount],
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
            <span style={{ flex: "1 1 auto" }} />
            <input
              type="text"
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              style={{ ...inp, flex: "0 1 220px", minWidth: 160 }}
              placeholder="Ara: seri no / barkod / kullanıcı / ATO / lokasyon"
            />
            {(qFilter !== "all" || qText) && (
              <button type="button" style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 12 }} onClick={() => { setQFilter("all"); setQText(""); }}>
                Temizle
              </button>
            )}
          </div>

          {/* Toplu hatırlatma — Dil seçimi + tek birincil buton (Yeni Kurulum Kaydı'ndaki "Mail Gönder" barıyla aynı). */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <input
              type="text"
              value={mailTo}
              onChange={(e) => setMailTo(e.target.value)}
              style={{ ...inp, flex: "0 1 320px" }}
              placeholder="Mail alıcı(lar) — boşsa lokasyon mail grubu"
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: pal.inkSoft, flex: "0 0 auto" }}>
              Dil
              <select value={mailLang} onChange={(e) => setMailLang(e.target.value)} style={{ ...inp, width: 120, flex: "0 0 auto" }}>
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </select>
            </label>
            <button style={styles.btnPrimary} onClick={sendBulkReminder} disabled={bulkSending || targetRecs.length === 0}>
              {bulkSending
                ? "Gönderiliyor…"
                : `🔁 Hatırlatma Gönder — ${mailLang === "en" ? "EN" : "TR"} (${
                    selected.size > 0 ? selected.size + " seçili" : qFilter !== "all" || qText ? filtered.length + " filtreli" : "tümü"
                  })`}
            </button>
          </div>

          {pending.length === 0 ? (
            <p style={styles.pageSub}>Şu an kapatma onayı bekleyen kayıt yok — tüm mail atılan cihazlar teslim edilmiş.</p>
          ) : filtered.length === 0 ? (
            <p style={styles.pageSub}>Bu aramayla eşleşen kayıt yok.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, width: 32 }}>
                      <input type="checkbox" checked={allChecked} onChange={toggleAll} style={styles.checkbox} />
                    </th>
                    <th style={styles.th}>Barkod</th>
                    <th style={styles.th}>Seri No</th>
                    <th style={styles.th}>Varlık Adı</th>
                    <th style={styles.th}>ATO Code</th>
                    <th style={styles.th}>Etkilenen Kullanıcı</th>
                    <th style={styles.th}>Lokasyon</th>
                    <th style={styles.th}>Mail Gönderim Tarihi</th>
                    <th style={styles.th}>Kaç Gündür Bekliyor</th>
                    <th style={styles.th}>Hatırlatma</th>
                    <th style={styles.th}>Aksiyon</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => {
                    const days = daysSince(r.mailSentAt);
                    const overdue = (days ?? 0) > 7;
                    const th = thBySerial.get(norm(r.serial));
                    const ustYonetim = th && isUstYonetimEmail(ustYonetimEmails, th.ownerMail);
                    return (
                      <tr key={r.id} style={selected.has(r.id) ? styles.rowSelected : undefined}>
                        <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} style={styles.checkbox} />
                        </td>
                        <td style={{ ...styles.td, fontSize: 12.5, whiteSpace: "nowrap" }}>{(th && th.barkod) || <span style={{ color: pal.inkSoft }}>—</span>}</td>
                        <td style={{ ...styles.td, fontSize: 12.5, whiteSpace: "nowrap" }}>{r.serial || <span style={{ color: pal.inkSoft }}>—</span>}</td>
                        <td style={{ ...styles.td, fontSize: 12.5 }}>{(th && (th.asset || th.model)) || <span style={{ color: pal.inkSoft }}>—</span>}</td>
                        <td style={{ ...styles.td, fontSize: 12.5, whiteSpace: "nowrap" }}>{r.atoNo || <span style={{ color: pal.inkSoft }}>—</span>}</td>
                        <td style={{ ...styles.td, fontSize: 12.5 }}>{r.userInfo || <span style={{ color: pal.inkSoft }}>—</span>}</td>
                        <td style={{ ...styles.td, fontSize: 12.5, whiteSpace: "nowrap" }}>{r.location || <span style={{ color: pal.inkSoft }}>—</span>}</td>
                        <td style={{ ...styles.td, fontSize: 12.5, whiteSpace: "nowrap" }}>{new Date(r.mailSentAt).toLocaleDateString("tr-TR")}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.badge, ...(overdue ? { background: `${pal.bad}1e`, color: pal.bad } : styles.badgeNeutral) }}>
                            {days == null ? "—" : `${days} gün`}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {r.closureReminderSentAt ? (
                            <span style={{ ...styles.badge, ...styles.badgeOk }} title={new Date(r.closureReminderSentAt).toLocaleString("tr-TR")}>
                              gönderildi · {r.closureReminderCount || 1}
                            </span>
                          ) : (
                            <span style={{ ...styles.badge, ...styles.badgeNeutral }}>gönderilmedi</span>
                          )}
                        </td>
                        <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                          {/* KRİTİK: üst yönetime hiçbir şekilde mail gitmemeli (bkz. konuşma) — gönder
                              butonu bu satırlarda hiç render edilmiyor, sadece bilgilendirici bir
                              rozet gösteriliyor. Diğerlerinde: bize dönüş yapmayanlar için tekrar
                              hatırlatma — aynı buton, ilk gönderimden sonra "Tekrar Hatırlat" etiketine
                              değişip son gönderimden bu yana kaç gün geçtiğini gösteriyor. */}
                          {ustYonetim ? (
                            <span
                              style={{ ...styles.badge, background: `${pal.bad}1e`, color: pal.bad }}
                              title="Üst yönetim — bu kişiye kapatma onayı hatırlatma maili gönderilmez"
                            >
                              🔒 Üst Yönetim
                            </span>
                          ) : (
                            <button
                              style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 12 }}
                              onClick={() => sendReminder(r)}
                              disabled={sendingId === r.id}
                              title={
                                r.closureReminderSentAt
                                  ? `Son hatırlatma ${new Date(r.closureReminderSentAt).toLocaleDateString("tr-TR")} — dönüş gelmediyse tekrar gönder (${mailLang === "en" ? "EN" : "TR"})`
                                  : `Kapatma onayı hatırlatma maili gönder (${mailLang === "en" ? "EN" : "TR"})`
                              }
                            >
                              {sendingId === r.id
                                ? "Gönderiliyor…"
                                : r.closureReminderSentAt
                                ? `🔁 Tekrar Hatırlat (${mailLang === "en" ? "EN" : "TR"})`
                                : `✉️ Gönder (${mailLang === "en" ? "EN" : "TR"})`}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > PAGE_SIZE_OPTIONS[0] && (
            <div style={styles.segmented} title="Sayfada gösterilecek kayıt sayısı">
              {PAGE_SIZE_OPTIONS.map((n) => (
                <div key={n} onClick={() => setPageSize(n)} style={{ ...styles.seg, ...(pageSize === n ? styles.segActive : {}) }}>
                  {n === Infinity ? "Tümü" : n}
                </div>
              ))}
            </div>
          )}
          {filtered.length > 0 && (
            <div style={{ ...styles.tableFooter, flexWrap: "wrap", gap: 10, marginTop: 10 }}>
              <span>
                {filtered.length} kayıttan {paged.length} tanesi gösteriliyor
                {pageSize !== Infinity && totalPages > 1 ? ` · Sayfa ${safePage} / ${totalPages}` : ""}
              </span>
              <Pagination page={safePage} totalPages={totalPages} onChange={setPage} styles={styles} pal={pal} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
