// Ortak e-posta çerçevesi: Ofis Bant Genişliği Uyarısı mailinin tasarımı (lacivert başlık bandı, çerçeveli gövde, bilgi alanı,
// aksiyon cümlesi, not, alt bilgi). Farklı mail türleri (Bant, Lokasyon/IP…) aynı ürünün parçası gibi görünsün diye bu çerçeveyi kullanır.
// Yalnız iç içerik (intro / bodyHtml / action / notes / footer) maile özeldir. Tüm değerler çağıran tarafından KAÇIRILMIŞ (esc) verilmelidir.
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Başlık bandındaki logo: mail gövdesinde cid:mail-logo olarak anılır; backend (routes/mail.js) dosyayı gömülü ek olarak ekler.
export const MAIL_LOGO_CID = "mail-logo";
const NAVY = "#243a5e";
const LINE = "#d0d7de";
const MUTED = "#8a8886";

// Bilgi alanı: [[etiket, değer], ...] — değer HTML (çağıran kaçırır). Değeri boş olan satır atlanır.
export function infoTable(rows) {
  const body = rows
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `<tr><td style="border:1px solid ${LINE};padding:7px 10px;background:#f6f8fa;font-weight:600;white-space:nowrap;width:34%;">${esc(k)}</td><td style="border:1px solid ${LINE};padding:7px 10px;">${v}</td></tr>`)
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-size:13px;"><tbody>${body}</tbody></table>`;
}

// title/eyebrow/greeting düz metin (burada kaçırılır); intro, bodyHtml, action HTML (çağıran kaçırır); notes düz metin dizisi; footer düz metin.
export function mailShell({ eyebrow = "", title = "", greeting = "", intro = "", bodyHtml = "", action = "", notes = [], footer = "", logo = true } = {}) {
  return `<div style="font-family:Segoe UI,Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6;max-width:760px;">
    <div style="background:${NAVY};color:#fff;padding:14px 18px;border-radius:6px 6px 0 0;">
      <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
        <td style="vertical-align:middle;color:#fff;">
          <div style="font-size:11px;letter-spacing:.1em;color:#fff;opacity:.8;">${esc(eyebrow)}</div>
          <div style="font-size:18px;font-weight:700;color:#fff;">${esc(title)}</div>
        </td>
        ${logo ? `<td style="vertical-align:middle;text-align:right;width:1%;white-space:nowrap;padding-left:14px;"><span style="display:inline-block;background:#fff;border-radius:6px;padding:6px 10px;"><img src="cid:${MAIL_LOGO_CID}" alt="Turkish Airlines" width="132" style="display:block;border:0;height:auto;"></span></td>` : ""}
      </tr></table>
    </div>
    <div style="border:1px solid ${LINE};border-top:none;padding:16px 18px;border-radius:0 0 6px 6px;">
      ${greeting ? `<p style="margin:0 0 10px;">${esc(greeting)}</p>` : ""}
      ${intro ? `<p style="margin:0 0 12px;">${intro}</p>` : ""}
      ${bodyHtml}
      ${action ? `<p style="margin:14px 0 0;">${action}</p>` : ""}
      ${notes.length ? `<p style="margin:12px 0 0;font-size:12px;color:${MUTED};">${notes.map(esc).join(" ")}</p>` : ""}
      ${footer ? `<p style="margin:14px 0 0;font-size:12px;color:${MUTED};">${esc(footer)}</p>` : ""}
    </div>
  </div>`;
}

// ---- Çok kayıtlı mailler için ortak parçalar (aynı çerçevenin tablo/bölüm/adım stilleri) ----
export const TH_STEPS = "turuncuhat.mhy.com.tr → Oluştur → Kullanıcı Vakası → açılan pencerede Servis kısmına tıklayıp arama bölümünden ilgili zimmet servisini seçin → gerekli alanları doldurup kaydet ve çık butonuna basabilirsiniz.";
export const REC_NOTE = "Kayıt açıklama kısmına yukarıdaki cihaz bilgilerini (Seri No, Hostname vb.) eklemeniz, işleminizin daha hızlı değerlendirilmesine yardımcı olacaktır.";
export const MAIL_FOOTER = "Bu bildirim, envanter sistemlerindeki kayıtların otomatik karşılaştırılması sonucunda oluşturulmuştur. Teşekkürler · BT Operasyonları / IT Support";

// head: başlık dizisi; rows: satır dizisi; hücre = düz metin ya da [ana, alt satır] (ikisi de burada kaçırılır; boş ana metin "—" olur)
export function dataTable(head, rows) {
  const th = head.map((h) => `<th style="border:1px solid ${LINE};padding:7px 10px;background:#f6f8fa;text-align:left;font-weight:600;white-space:nowrap;">${esc(h)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${r.map((c) => {
      const [a, b] = Array.isArray(c) ? c : [c, ""];
      return `<td style="border:1px solid ${LINE};padding:7px 10px;vertical-align:top;"><div style="font-weight:600;">${esc(a || "—")}</div>${b ? `<div style="font-size:12px;color:${MUTED};">${esc(b)}</div>` : ""}</td>`;
    }).join("")}</tr>`)
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-size:13px;margin:4px 0 6px;"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

// Bölüm başlığı (düz metin) + içerik (HTML)
export const mailSection = (title, html) => `<div style="margin:14px 0 4px;font-weight:700;font-size:13px;">${esc(title)}</div>${html}`;

// Gri adım kutusu: lead düz metin, text düz metin (kaçırılır)
export const stepsBox = (lead, text = TH_STEPS) =>
  `<div style="margin:12px 0 0;background:#f6f8fa;border:1px solid ${LINE};border-radius:6px;padding:10px 12px;font-size:13px;"><div style="font-weight:700;margin-bottom:4px;">${esc(lead)}</div>${esc(text)}</div>`;
