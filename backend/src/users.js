// Kullanıcı hesaplarını (Master User dahil) mevcut şifreli store.js deseniyle saklar — yeni bir
// depolama mekanizması icat edilmez. "users" section'ı bir dizi: her kayıt
// { id, username, domain, passwordHash (sadece local/master), role: "master"|"user", createdAt, lastLoginAt }.
// passwordHash bcrypt ile üretilir; plaintext şifre HİÇBİR ZAMAN buraya veya loglara yazılmaz.
const crypto = require("crypto");
const { readSection, writeSection } = require("./store");

const SECTION = "users";

function listUsers() {
  return readSection(SECTION) || [];
}

function findByUsername(username) {
  if (!username) return null;
  const norm = String(username).trim().toLowerCase();
  return listUsers().find((u) => u.username.toLowerCase() === norm) || null;
}

function findById(id) {
  return listUsers().find((u) => u.id === id) || null;
}

function hasMasterUser() {
  return listUsers().some((u) => u.role === "master");
}

function saveUser(user) {
  const users = listUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx >= 0) users[idx] = user;
  else users.push(user);
  writeSection(SECTION, users);
  return user;
}

function createUser({ username, domain = "", passwordHash = null, role = "user" }) {
  const user = {
    id: crypto.randomUUID(),
    username,
    domain,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
  return saveUser(user);
}

function touchLastLogin(id) {
  const user = findById(id);
  if (!user) return null;
  user.lastLoginAt = new Date().toISOString();
  return saveUser(user);
}

// Frontend'e/loglara asla passwordHash sızdırılmaz
function publicUser(user) {
  if (!user) return null;
  const { id, username, domain, role, createdAt, lastLoginAt } = user;
  return { id, username, domain, role, createdAt, lastLoginAt };
}

module.exports = { listUsers, findByUsername, findById, hasMasterUser, saveUser, createUser, touchLastLogin, publicUser };
