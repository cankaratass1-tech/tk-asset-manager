// Tüm SMTP transport oluşturma mantığı burada — mail.js (gerçek gönderim) ve smtp.js
// (Bağlantıyı Test Et) AYNI fonksiyonu kullanır. Daha önce ikisi ayrı kopyalardı, biri
// düzeltilip diğeri unutulunca "test başarılı ama gerçek gönderim başarısız" tutarsızlığına
// yol açtı (bkz. konuşma) — bir daha olmasın diye tek kaynağa indirildi.
const nodemailer = require("nodemailer");

function buildTransport(cfg) {
  const useTls = cfg.useTls !== false;
  const isImplicitTls = Number(cfg.port) === 465;
  return nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port) || 587,
    secure: isImplicitTls,
    requireTLS: useTls && !isImplicitTls,
    // TLS kapatıldığında fırsatçı STARTTLS'i de devre dışı bırak, aksi halde sunucu STARTTLS
    // sunuyorsa nodemailer yine de sertifika doğrulamaya çalışır.
    ignoreTLS: !useTls && !isImplicitTls,
    // Dahili şirket SMTP röleleri genelde kurumsal/self-signed bir CA'dan sertifika kullanır,
    // bu Node'un varsayılan güvenilir kök listesinde yoktur ("unable to get local issuer
    // certificate"). Yazıcı/tarayıcı gibi cihazlar bu doğrulamayı zaten yapmıyor — bu araç da
    // sadece güvenilir dahili ağda kullanılacağı için aynı esnekliği uyguluyor. TLS şifrelemesi
    // (requireTLS) hâlâ devrede, sadece sertifika ZİNCİRİ doğrulanmıyor.
    tls: useTls ? { rejectUnauthorized: false } : undefined,
    auth: cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
  });
}

module.exports = { buildTransport };
