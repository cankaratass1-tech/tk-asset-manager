// Ortak e-posta çerçevesi: Ofis Bant Genişliği Uyarısı mailinin tasarımı (lacivert başlık bandı, çerçeveli gövde, bilgi alanı,
// aksiyon cümlesi, not, alt bilgi). Farklı mail türleri (Bant, Lokasyon/IP…) aynı ürünün parçası gibi görünsün diye bu çerçeveyi kullanır.
// Yalnız iç içerik (intro / bodyHtml / action / notes / footer) maile özeldir. Tüm değerler çağıran tarafından KAÇIRILMIŞ (esc) verilmelidir.
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
export function mailShell({ eyebrow = "", title = "", greeting = "", intro = "", bodyHtml = "", action = "", notes = [], footer = "" } = {}) {
  return `<div style="font-family:Segoe UI,Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6;max-width:760px;">
    <div style="background:${NAVY};color:#fff;padding:14px 18px;border-radius:6px 6px 0 0;">
      <div style="font-size:11px;letter-spacing:.1em;opacity:.8;">${esc(eyebrow)}</div>
      <div style="font-size:18px;font-weight:700;">${esc(title)}</div>
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
