// RADIUS (PAP) kimlik doğrulaması — "radius" paketiyle Access-Request/Access-Accept akışı.
// Config: { server, port, sharedSecret }. sharedSecret hiçbir zaman loglanmaz.
const dgram = require("dgram");
const radius = require("radius");

function sendAccessRequest({ server, port = 1812, sharedSecret, username, password }, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const packet = radius.encode({
      code: "Access-Request",
      secret: sharedSecret,
      attributes: [
        ["User-Name", username],
        ["User-Password", password],
      ],
    });

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("RADIUS sunucusundan yanıt alınamadı (zaman aşımı)"));
    }, timeoutMs);

    socket.on("message", (msg) => {
      clearTimeout(timer);
      socket.close();
      try {
        const response = radius.decode({ packet: msg, secret: sharedSecret });
        resolve(response.code === "Access-Accept");
      } catch (err) {
        reject(err);
      }
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });

    socket.send(packet, 0, packet.length, port, server, (err) => {
      if (err) {
        clearTimeout(timer);
        socket.close();
        reject(err);
      }
    });
  });
}

async function authenticateRadius(cfg, username, password) {
  if (!cfg || !cfg.server || !cfg.sharedSecret) return { ok: false, message: "RADIUS yapılandırması eksik" };
  try {
    const accepted = await sendAccessRequest({ ...cfg, username, password });
    return accepted ? { ok: true } : { ok: false, message: "RADIUS: kullanıcı adı veya şifre hatalı" };
  } catch (err) {
    return { ok: false, message: `RADIUS kimlik doğrulama başarısız: ${err.message}` };
  }
}

// Test butonu: bindUser/bindPassword yerine kullanıcı doğrudan test bilgisi girer (SMTP test deseniyle aynı UX)
async function testRadiusConnection(cfg, testUsername, testPassword) {
  if (!cfg || !cfg.server || !cfg.sharedSecret) return { ok: false, message: "RADIUS sunucu/paylaşılan sır girilmedi" };
  if (!testUsername || !testPassword) {
    return { ok: false, message: "Test için kullanıcı adı ve şifre girilmeli" };
  }
  return authenticateRadius(cfg, testUsername, testPassword);
}

module.exports = { authenticateRadius, testRadiusConnection };
