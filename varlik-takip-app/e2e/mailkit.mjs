// Mail testi yardımcıları: gerçek mail göndermeyen, süreç içi SMTP "kum havuzu" + .eml ayrıştırıcı.
import { createRequire } from "node:module";
import { join } from "node:path";
import { appDir } from "./harness.mjs";

const backendRequire = createRequire(join(appDir, "..", "backend", "package.json"));

// Gelen her mesajı hafızada tutar. port: 0 → boş bir port seçilir.
export async function startSmtpSink() {
  const { SMTPServer } = backendRequire("smtp-server");
  const messages = [];
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onAuth(auth, session, cb) { cb(null, { user: auth.username }); },
    onData(stream, session, cb) {
      const chunks = [];
      stream.on("data", (c) => chunks.push(c));
      stream.on("end", () => {
        messages.push(parseEml(Buffer.concat(chunks).toString("utf8")));
        cb();
      });
    },
  });
  const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.server.address().port)));
  return { port, messages, stop: () => new Promise((r) => server.close(r)) };
}

// RFC 2047: bitişik kodlanmış sözcükler arasındaki boşluk yok sayılır ve çok baytlı bir karakter iki sözcüğe
// bölünmüş olabilir — bu yüzden ardışık sözcüklerin baytları önce birleştirilir, sonra UTF-8 çözülür.
const decodeWords = (v) => {
  const WORD = "=\\?[^?]+\\?[bBqQ]\\?[^?]*\\?=";
  const group = new RegExp(`${WORD}(?:\\s+${WORD})*`, "g");
  const one = new RegExp("=\\?([^?]+)\\?([bBqQ])\\?([^?]*)\\?=", "g");
  return String(v || "").replace(group, (g) => {
    const bytes = [];
    for (const [, , enc, data] of g.matchAll(one)) {
      if (enc.toLowerCase() === "b") bytes.push(...Buffer.from(data, "base64"));
      else bytes.push(...Buffer.from(data.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))), "latin1"));
    }
    return Buffer.from(bytes).toString("utf8");
  });
};

function decodeBody(body, encoding) {
  const enc = String(encoding || "").toLowerCase();
  if (enc === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  if (enc === "quoted-printable") {
    const bytes = [];
    const t = body.replace(/=\r?\n/g, "");
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "=" && /^[0-9A-F]{2}$/i.test(t.slice(i + 1, i + 3))) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; }
      else bytes.push(...Buffer.from(t[i], "utf8"));
    }
    return Buffer.from(bytes).toString("utf8");
  }
  return body;
}

function splitHeaders(raw) {
  const idx = raw.search(/\r?\n\r?\n/);
  const head = idx < 0 ? raw : raw.slice(0, idx);
  const body = idx < 0 ? "" : raw.slice(idx).replace(/^\r?\n\r?\n/, "");
  const headers = {};
  head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
  });
  return { headers, body };
}

// Dönen: { to, from, subject, text, html }
export function parseEml(raw) {
  const out = { to: "", from: "", subject: "", text: "", html: "", attachments: [] };
  const walk = (part) => {
    const { headers, body } = splitHeaders(part);
    const ct = headers["content-type"] || "text/plain";
    const boundary = (ct.match(/boundary="?([^";]+)"?/i) || [])[1];
    if (/multipart\//i.test(ct) && boundary) {
      body.split(`--${boundary}`).slice(1).forEach((p) => { if (!p.startsWith("--")) walk(p.replace(/^\r?\n/, "")); });
    } else if (/text\/html/i.test(ct)) out.html += decodeBody(body, headers["content-transfer-encoding"]);
    else if (/text\/plain/i.test(ct)) out.text += decodeBody(body, headers["content-transfer-encoding"]);
    else if (headers["content-id"]) out.attachments.push({ cid: String(headers["content-id"]).replace(/[<>]/g, ""), type: String(ct).split(";")[0].trim() });
    return headers;
  };
  const top = splitHeaders(raw).headers;
  out.to = decodeWords(top.to);
  out.from = decodeWords(top.from);
  out.subject = decodeWords(top.subject);
  walk(raw);
  return out;
}

export const stripHtml = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
