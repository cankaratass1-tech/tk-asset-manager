// Yerel test SMTP sunucusu — mail göndermez, gelen bağlantıyı/mesajı kabul edip loglar. Üretimde kullanılmaz.
// Şablon içeriğini de doğrulayabilmek için (bkz. konuşma: "yaptığını test etmemiz lazım") her
// mesajın ham içeriği inbox/ altına kaydediliyor, konsola da To/Subject özeti basılıyor.
const { SMTPServer } = require("smtp-server");
const fs = require("fs");
const path = require("path");

const USERNAME = "demo-smtp-user";
const PASSWORD = "demo-smtp-pass";
const INBOX_DIR = path.join(__dirname, "test-smtp-inbox");
fs.mkdirSync(INBOX_DIR, { recursive: true });

let counter = 0;

const server = new SMTPServer({
  authOptional: false,
  onAuth(auth, session, callback) {
    if (auth.username === USERNAME && auth.password === PASSWORD) {
      return callback(null, { user: auth.username });
    }
    return callback(new Error("Geçersiz kullanıcı adı/şifre"));
  },
  onData(stream, session, callback) {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      counter += 1;
      const file = path.join(INBOX_DIR, `${Date.now()}-${counter}.eml`);
      fs.writeFileSync(file, raw);
      const toHeader = (raw.match(/^To:\s*(.+)$/im) || [, "?"])[1].trim();
      const subjectHeader = (raw.match(/^Subject:\s*(.+)$/im) || [, "?"])[1].trim();
      console.log(`[${counter}] from=${session.envelope.mailFrom.address} to=${toHeader} subject="${subjectHeader}" -> ${path.basename(file)}`);
      callback();
    });
  },
  disabledCommands: ["STARTTLS"],
});

server.listen(2525, "127.0.0.1", () => {
  console.log(`Test SMTP sunucusu 127.0.0.1:2525 — kullanıcı: ${USERNAME} / şifre: ${PASSWORD}`);
  console.log(`Gelen mailler şuraya kaydediliyor: ${INBOX_DIR}`);
});
