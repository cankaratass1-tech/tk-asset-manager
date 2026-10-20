// LAKESIDE "Battery Health" Excel'i — kullanıcı dosyayı elle seçer, ama artık backend'e KALICI
// olarak yükleniyor (bkz. konuşma: "gömülü olsun her seferinde yüklemeyelim") — Ofis Bant
// Genişliği ile aynı desen (uploadBatteryFile / fetchBatteryRowsFromFile).
//
// Gerçek kolon adları LakeSide export'una göre değişebildiğinden esnek eşleme yapılır; kolon
// bulunamazsa alan boş kalır ("Veri Yok"), uygulama hata vermez. Gerçek dosya gelince
// COL_* listelerine tam başlık eklenebilir.
import { shortHost } from "./bsodKnowledgeService";
import { backendClient } from "./backendClient";
import { mailShell, dataTable, mailSection, MAIL_FOOTER } from "./mailLayout.js";

const norm = (v) => String(v ?? "").trim();

function col(row, ...names) {
  for (const name of names) {
    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase() === name.toLowerCase() && row[key] !== "") return row[key];
    }
  }
  return "";
}
// "%87", "87.0", "0.87" -> 87
function pct(v) {
  if (v === "" || v == null) return null;
  let n = parseFloat(String(v).replace("%", "").replace(",", "."));
  if (!isFinite(n)) return null;
  if (n > 0 && n <= 1) n *= 100;
  return Math.round(n);
}
function num(v) {
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return isFinite(n) ? n : null;
}

export function mapBatteryRow(raw) {
  const machine = norm(
    col(raw, "Machine Name", "MachineName", "Device Name", "DeviceName", "Computer Name", "ComputerName", "Hostname", "Host", "Cihaz", "Cihaz Adı", "System")
  );
  // Kullanıcı isteği (bkz. konuşma): "System" sütunu FQDN olabilir (ör. "ABJ1B03.mhynet.mhy.com.tr")
  // — hostShort zaten ilk noktadan sonrasını atıyor, ayrıca burada tekrar uygulamaya gerek yok.
  // "Username" sütunu email formatında gelir (ör. "ahmet.yilmaz@mhy.com.tr") — mail gönderirken TAM
  // halin kullanılır (ownerMail), tabloda ise sadece @ öncesi kısa kullanıcı adı gösterilir.
  const usernameRaw = norm(col(raw, "Username", "User Name", "User", "Kullanıcı", "Kullanıcı Adı"));
  const atIdx = usernameRaw.indexOf("@");
  const username = atIdx >= 0 ? usernameRaw.slice(0, atIdx) : usernameRaw;
  const ownerMail = atIdx >= 0 ? usernameRaw : "";
  const design = num(col(raw, "Design Capacity", "DesignCapacity", "Design Capacity (mWh)", "Tasarım Kapasitesi"));
  const full = num(col(raw, "Full Charge Capacity", "FullChargeCapacity", "Full Charge Capacity (mWh)", "Tam Şarj Kapasitesi", "Current Capacity"));
  let health = pct(col(raw, "Battery Health", "BatteryHealth", "Health", "Health (%)", "Battery Health (%)", "SoH", "State of Health", "Sağlık", "Pil Sağlığı"));
  if (health == null && design && full) health = Math.round((full / design) * 100);
  const cycles = num(col(raw, "Cycle Count", "CycleCount", "Cycles", "Şarj Döngüsü", "Döngü Sayısı"));
  const status = norm(col(raw, "Battery Status", "Status", "Condition", "Durum", "Pil Durumu"));
  const manufacturer = norm(col(raw, "Manufacturer", "Battery Manufacturer", "Üretici", "Marka"));
  const serial = norm(col(raw, "Battery Serial", "Serial Number", "SerialNumber", "Seri No"));
  const model = norm(col(raw, "Model", "Device Model", "Battery Name", "Name"));

  // Kurumsal eşik: <60 kritik (değişmeli), <80 uyarı (izlenmeli), ≥80 iyi.
  const durum = health == null ? "Veri Yok" : health < 60 ? "Değişmeli" : health < 80 ? "İzlenmeli" : "İyi";

  return {
    hostname: machine,
    hostShort: shortHost(machine),
    batteryHealth: health, // 0-100 veya null
    cycleCount: cycles,
    designCapacity: design,
    fullChargeCapacity: full,
    batteryStatus: status,
    manufacturer,
    batterySerial: serial,
    deviceModel: model,
    durum,
    // Kullanıcı adı (@ öncesi, görüntüleme) ve mail gönderiminde KULLANILACAK tam e-posta (bkz.
    // konuşma: "mail gönderirken de orada mail adresi var onu baz alacağız") — SCCM eşleşmesi
    // yerine artık öncelik bu alanda (App.jsx sendLakesideMailByLocation, ownerMail'i tercih eder).
    username,
    ownerMail,
    // Genel liste bileşenleriyle (TableView vb.) uyum — serial/model görüntüleme amaçlı
    rowKey: `battery|${machine}|${serial}`,
    owner: shortHost(machine),
    serial: health != null ? `%${health}` : "Veri Yok",
    model: [durum, cycles != null ? `${cycles} döngü` : ""].filter(Boolean).join(" · "),
    sub: [username, manufacturer].filter(Boolean).join(" · "),
    location: status || "—",
    lbsParent: "",
    company: "",
    office: status || "—",
    matched: health != null && health >= 80,
    statusTag: durum,
    _raw: raw,
  };
}

export function mapBatteryRows(rawRows) {
  return (rawRows || [])
    .map(mapBatteryRow)
    .filter((r) => r.hostname);
}

// Cihaz Genel Görünüm için: hostname (veya kısa adı) ile eşleşen batarya kaydını bulur.
export function findBattery(batteryRows, query) {
  const q = norm(query).toLowerCase();
  if (!q || !batteryRows?.length) return null;
  const qShort = shortHost(q);
  return (
    batteryRows.find((r) => r.hostname.toLowerCase() === q) ||
    batteryRows.find((r) => r.hostShort.toLowerCase() === qShort) ||
    batteryRows.find((r) => r.hostShort.toLowerCase().includes(qShort) || qShort.includes(r.hostShort.toLowerCase())) ||
    null
  );
}

// Battery Health raporu için mail gövdesi — "Değişmeli" ve "İzlenmeli" cihazlar iki tabloda.
export function buildBatteryMailHtml(rows = []) {
  const replace = rows.filter((r) => r.batteryHealth != null && r.batteryHealth < 60);
  const watch = rows.filter((r) => r.batteryHealth != null && r.batteryHealth >= 60 && r.batteryHealth < 80);
  const table = (list) =>
    dataTable(
      ["Cihaz", "Sağlık %", "Döngü", "Pil Durumu", "Üretici"],
      list.map((r) => [r.hostShort || r.hostname, r.batteryHealth != null ? `%${r.batteryHealth}` : "Veri Yok", String(r.cycleCount ?? "—"), r.batteryStatus || "—", r.manufacturer || "—"])
    );
  let b = "";
  if (replace.length)
    b += mailSection(`%60 altı — batarya değişimi önerilir (${replace.length} cihaz)`, `<p style="margin:0 0 6px;">Bu cihazlar için Lenovo garanti/servis üzerinden batarya değişimi başlatılmalıdır.</p>${table(replace)}`);
  if (watch.length)
    b += mailSection(`%60–%80 arası — izlenmeli (${watch.length} cihaz)`, `<p style="margin:0 0 6px;">Şarj süresi belirgin kısaldıysa değişim planlanmalı; aksi halde bir sonraki raporda tekrar değerlendirilecek.</p>${table(watch)}`);
  if (!replace.length && !watch.length) b += `<p style="margin:0;">Eşik altında cihaz bulunmuyor.</p>`;
  return mailShell({
    eyebrow: "BATTERY HEALTH",
    title: "DÜŞÜK BATARYA SAĞLIĞI",
    greeting: "Merhabalar,",
    intro: "LakeSide Battery Health raporunda aşağıdaki cihazlarda batarya sağlığı düşük görünüyor.",
    bodyHtml: b,
    action: "Cihazların güncel durumu (değiştirildi / kullanımda / iade) hakkında bilgi verilmesini rica ederiz.",
    footer: MAIL_FOOTER,
  });
}

export function batteryMailSubject(rows = []) {
  const n = rows.filter((r) => r.batteryHealth != null && r.batteryHealth < 80).length;
  return n ? `LakeSide Battery Health — ${n} cihazda düşük batarya sağlığı` : "LakeSide Battery Health — rapor";
}

// health -> {value, state}  (ok / warn / crit / none) — kurumsal eşik: <60 kritik, <80 uyarı
export function batteryHealthState(r) {
  if (!r || r.batteryHealth == null) return { value: "Veri Yok", state: "none" };
  const h = r.batteryHealth;
  const extra = [r.cycleCount != null ? `${r.cycleCount} döngü` : "", r.batteryStatus].filter(Boolean).join(" · ");
  return {
    value: `%${h}${extra ? ` (${extra})` : ""}`,
    state: h < 60 ? "crit" : h < 80 ? "warn" : "ok",
  };
}

export async function fetchBatteryRowsFromFile() {
  const result = await backendClient.getBatteryHealthReport();
  if (!result.ok) throw new Error(result.message || "Dosya okunamadı");
  return { fileName: result.fileName, modifiedAt: result.modifiedAt, rows: mapBatteryRows(result.rows || []) };
}

// Tarayıcıdan seçilen dosyayı base64'e çevirip backend'e yükler (kalıcı saklanır).
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function uploadBatteryFile(file) {
  const buffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const result = await backendClient.uploadBatteryHealth(file.name, base64);
  if (!result.ok) throw new Error(result.message || "Dosya yüklenemedi");
  return { fileName: result.fileName, modifiedAt: result.modifiedAt, rows: mapBatteryRows(result.rows || []), check: result.check, checkSummary: result.checkSummary };
}
