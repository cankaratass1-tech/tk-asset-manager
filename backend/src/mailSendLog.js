// Gönderim günlüğü: backend'in gönderdiği HER mail (elle ya da otomatik) burada, istemciden bağımsız kaydedilir.
// Gönderen kullanıcı oturumdan gelir (sahte yazılamaz). Mailin gövdesi yalnız en yeni KEEP_BODIES kayıtta tutulur
// (şifreli JSON deposu tek dosya; her mailin HTML'i birkaç on KB). Daha eski kayıtlarda üst bilgi (kim/ne zaman/kime/konu/sonuç) kalır.
const { readSection, writeSection } = require("./store");

const SECTION = "mailSendLog";
const MAX_ENTRIES = 5000;
const KEEP_BODIES = 300;

let seq = 0;
const newId = () => `${Date.now().toString(36)}-${(seq++ % 1296).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function record({ source = "manuel", username = "bilinmiyor", userId = null, to = [], subject = "", text = "", html = "", ok, error = "", messageId = "" }) {
  const entry = {
    id: newId(),
    at: new Date().toISOString(),
    source, // "manuel" (kullanıcı ekranından) | "otomatik" (zamanlayıcı)
    username,
    userId,
    to: Array.isArray(to) ? to : String(to || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean),
    subject,
    ok: !!ok,
    error: ok ? "" : String(error || ""),
    messageId: messageId || "",
    text,
    html,
  };
  const rows = [entry, ...(readSection(SECTION) || [])].slice(0, MAX_ENTRIES);
  for (let i = KEEP_BODIES; i < rows.length; i++) {
    if (rows[i].html || rows[i].text) rows[i] = { ...rows[i], html: "", text: "", bodyDropped: true };
    else break; // daha eskiler zaten temizlenmiş
  }
  writeSection(SECTION, rows);
  return entry.id;
}

const strip = ({ text, html, ...meta }) => ({ ...meta, hasBody: !!(html || text) });

const list = () => (readSection(SECTION) || []).map(strip);
const get = (id) => (readSection(SECTION) || []).find((e) => e.id === id) || null;

module.exports = { record, list, get, MAX_ENTRIES, KEEP_BODIES };
