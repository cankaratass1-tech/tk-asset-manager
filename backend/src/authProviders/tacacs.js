// TACACS+ kimlik doğrulaması — RFC 8907'ye göre minimal, elle yazılmış bir TCP client.
// Mainstream/bakımlı bir npm paketi olmadığı için (bkz. plan) sadece PAP authentication (tek
// START paketinde kullanıcı adı + şifre, tek REPLY ile PASS/FAIL) uygulanmıştır — ASCII/CHAP çok
// adımlı akışlar kapsam dışı bırakılmıştır. Bu istemci gerçek bir TACACS+ cihazına karşı bu
// ortamdan test edilememiştir (bkz. konuşma) — kullanıcının kendi kurumsal cihazında "Bağlantıyı
// Test Et" ile doğrulaması gerekir. sharedSecret hiçbir zaman loglanmaz.
const net = require("net");
const crypto = require("crypto");

const TAC_PLUS_AUTHEN = 0x01;
const AUTHEN_TYPE_PAP = 0x02;
const AUTHEN_SVC_LOGIN = 0x01;
const AUTHEN_ACTION_LOGIN = 0x01;

function md5(...bufs) {
  return crypto.createHash("md5").update(Buffer.concat(bufs)).digest();
}

// RFC8907 §4.5 "obfuscation" — body, session_id+key+version+seq_no tabanlı MD5 pad zinciriyle XOR'lanır
function obfuscate(body, key, sessionId, version, seqNo) {
  const sessionIdBuf = Buffer.alloc(4);
  sessionIdBuf.writeUInt32BE(sessionId, 0);
  const keyBuf = Buffer.from(key, "utf8");
  const versionBuf = Buffer.from([version]);
  const seqBuf = Buffer.from([seqNo]);

  let pad = Buffer.alloc(0);
  let prev = Buffer.alloc(0);
  while (pad.length < body.length) {
    prev = md5(sessionIdBuf, keyBuf, versionBuf, seqBuf, prev);
    pad = Buffer.concat([pad, prev]);
  }
  const out = Buffer.alloc(body.length);
  for (let i = 0; i < body.length; i++) out[i] = body[i] ^ pad[i];
  return out;
}

function buildStartBody({ username, port = "vlk-takip", remAddr = "0.0.0.0", password }) {
  const userBuf = Buffer.from(username, "utf8");
  const portBuf = Buffer.from(port, "utf8");
  const remAddrBuf = Buffer.from(remAddr, "utf8");
  const dataBuf = Buffer.from(password, "utf8");
  return Buffer.concat([
    Buffer.from([AUTHEN_ACTION_LOGIN, 0x01, AUTHEN_TYPE_PAP, AUTHEN_SVC_LOGIN, userBuf.length, portBuf.length, remAddrBuf.length, dataBuf.length]),
    userBuf,
    portBuf,
    remAddrBuf,
    dataBuf,
  ]);
}

function authenticateTacacs(cfg, username, password) {
  return new Promise((resolve) => {
    if (!cfg || !cfg.server || !cfg.sharedSecret) {
      resolve({ ok: false, message: "TACACS+ yapılandırması eksik" });
      return;
    }
    const version = 0xc1; // major=0xc, minor=1 (PAP)
    const sessionId = crypto.randomBytes(4).readUInt32BE(0);
    const seqNo = 1;
    const plainBody = buildStartBody({ username, password });
    const encryptedBody = obfuscate(plainBody, cfg.sharedSecret, sessionId, version, seqNo);

    const header = Buffer.alloc(12);
    header.writeUInt8(version, 0);
    header.writeUInt8(TAC_PLUS_AUTHEN, 1);
    header.writeUInt8(seqNo, 2);
    header.writeUInt8(0x00, 3); // flags: 0 = gövde şifreli (obfuscated)
    header.writeUInt32BE(sessionId, 4);
    header.writeUInt32BE(encryptedBody.length, 8);

    const socket = new net.Socket();
    let responseChunks = [];
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, message: "TACACS+ sunucusundan yanıt alınamadı (zaman aşımı)" });
    }, 8000);

    socket.connect(cfg.port || 49, cfg.server, () => {
      socket.write(Buffer.concat([header, encryptedBody]));
    });

    socket.on("data", (chunk) => {
      responseChunks.push(chunk);
      const buf = Buffer.concat(responseChunks);
      if (buf.length < 12) return; // header tam gelmedi
      const bodyLen = buf.readUInt32BE(8);
      if (buf.length < 12 + bodyLen) return; // gövde tam gelmedi

      clearTimeout(timeout);
      socket.destroy();
      try {
        const respSeqNo = buf.readUInt8(2);
        const respBody = obfuscate(buf.subarray(12, 12 + bodyLen), cfg.sharedSecret, sessionId, version, respSeqNo);
        const status = respBody.readUInt8(0);
        if (status === 0x01) resolve({ ok: true }); // TAC_PLUS_AUTHEN_STATUS_PASS
        else if (status === 0x02) resolve({ ok: false, message: "TACACS+: kullanıcı adı veya şifre hatalı" });
        else resolve({ ok: false, message: `TACACS+ beklenmeyen durum kodu: 0x${status.toString(16)}` });
      } catch (err) {
        resolve({ ok: false, message: `TACACS+ yanıtı çözümlenemedi: ${err.message}` });
      }
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, message: `TACACS+ bağlantı hatası: ${err.message}` });
    });
  });
}

async function testTacacsConnection(cfg, testUsername, testPassword) {
  if (!cfg || !cfg.server || !cfg.sharedSecret) return { ok: false, message: "TACACS+ sunucu/paylaşılan sır girilmedi" };
  if (!testUsername || !testPassword) return { ok: false, message: "Test için kullanıcı adı ve şifre girilmeli" };
  return authenticateTacacs(cfg, testUsername, testPassword);
}

module.exports = { authenticateTacacs, testTacacsConnection };
