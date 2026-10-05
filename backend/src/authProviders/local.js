// Local/Master User doğrulaması — bcrypt hash karşılaştırması. Şifre asla plaintext saklanmaz/loglanmaz.
const bcrypt = require("bcryptjs");
const users = require("../users");

async function authenticateLocal(username, password) {
  const user = users.findByUsername(username);
  if (!user || !user.passwordHash) return { ok: false, message: "Kullanıcı adı veya şifre hatalı" };
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return { ok: false, message: "Kullanıcı adı veya şifre hatalı" };
  return { ok: true, user };
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

module.exports = { authenticateLocal, hashPassword };
