// Demo (dump) verisini UYGULAMANIN GÜNCEL YAPISINA getirir — tek komut, deterministik, tekrar çalıştırmak güvenli.
//   node scripts/refresh-demo-data.js [klasor ...] [--battery=dosya.xlsx ...]
//   (varsayılan: demo-data/current + demo-data/battery-health.xlsx)
// Her klasör için:
//   1) SCCM: "Operating System" / "OS Version" (Windows sürümü/destek) — add-os-version.js
//   2) TH:   "Son Güncelleme Tarihi" (zimmet devri tarihi; seri no'dan türetilir, dosya tarihini aşmaz) — add-th-update-date.js --force
//   3) SCCM: "Last Client Check" + "Client Active" (SCCM ajan durumu: Cihaz Genel Görünüm / SCCM Ajan Raporu)
//   5) Lokasyon Mail Listesi: bant dosyasındaki her ofis listede olsun; mail adresleri dolsun (az sayıda ofis bilerek boş —
//      "mail adresi yok" uyarısı denenebilsin)
// Battery dosyalarına: "Design Capacity" + "Full Charge Capacity" (sağlık % ile tutarlı) eklenir.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const XLSX = require("xlsx");
const { findLatestFile } = require("../src/excelSource");

const DEMO = path.join(__dirname, "..", "demo-data");
const args = process.argv.slice(2);
const dirs = args.filter((a) => !a.startsWith("--"));
if (dirs.length === 0) dirs.push(path.join(DEMO, "current"));
const batteries = args.filter((a) => a.startsWith("--battery=")).map((a) => a.slice(10));
if (batteries.length === 0) batteries.push(path.join(DEMO, "battery-health.xlsx"));

const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const pad = (n) => String(n).padStart(2, "0");
const stamp = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };
const run = (script, ...a) => execFileSync(process.execPath, [path.join(__dirname, script), ...a], { encoding: "utf8" }).trim();
const readAoa = (file, sheet = 0) => { const wb = XLSX.read(fs.readFileSync(file)); return { wb, name: wb.SheetNames[sheet], a: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[sheet]], { header: 1, defval: "" }) }; };
const writeAoa = (file, { wb, name, a }) => { wb.Sheets[name] = XLSX.utils.aoa_to_sheet(a); fs.writeFileSync(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" })); };
const fileDate = (f) => { const m = f.match(/_(\d{4})(\d{2})(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], 6, 0, 0) : Date.UTC(2026, 8, 1, 6); };

// 3) SCCM ajan durumu
function sccmClientCheck(dir) {
  const f = findLatestFile(dir, "SCCM Inventory Report");
  const full = path.join(dir, f);
  const doc = readAoa(full);
  const hr = doc.a.findIndex((r) => r.includes("Hostname"));
  const H = doc.a[hr];
  if (H.includes("Last Client Check")) return `${f}: ajan sütunları zaten var`;
  const hostIx = H.indexOf("Hostname");
  const base = fileDate(f);
  H.push("Last Client Check", "Client Active");
  let stale = 0, off = 0;
  for (let i = hr + 1; i < doc.a.length; i++) {
    const r = doc.a[i];
    if (!r.some((c) => String(c).trim())) continue;
    const h = hash(r[hostIx]);
    const roll = h % 100;
    let age, active;
    if (roll < 4) { age = (35 + (h >>> 8) % 85) * 86400000; active = "No"; stale++; } // uzun süredir iletişim yok
    else if (roll < 5) { age = (1 + (h >>> 8) % 3) * 86400000; active = "No"; off++; } // yakın ama ajan pasif
    else { age = ((h >>> 8) % 72) * 3600000; active = "Yes"; }
    r.push(stamp(base - age), active);
  }
  writeAoa(full, doc);
  return `${f}: ajan sütunları eklendi (${stale} eski iletişim, ${off} pasif ajan)`;
}

// 5) Lokasyon mail listesi
const CITY = { ARN: "STOCKHOLM", DXB: "DUBAI", EWR: "NEWARK", ISU: "SULEYMANIYE", JFK: "NEW YORK", KZN: "KAZAN", LED: "SAINT PETERSBURG", LHR: "LONDRA", NYC: "NEW YORK", RMO: "KISINEV", SSH: "SHARM EL SHEIKH", TIA: "TIRANA", TNR: "ANTANANARIVO", TSR: "TIMISOARA", YNB: "YENBU", ZAG: "ZAGREB", ZRH: "ZURIH" };
const KEEP_BLANK = new Set(["ABJ1-SD1"]); // "mail adresi yok" uyarısı bu ofiste denenir (e2e + elle test)
function lokasyon(dir) {
  const f = findLatestFile(dir, "LokasyonMailListesi");
  if (!f) return "Lokasyon Mail Listesi yok — atlandı (aylık klasörlerde bulunmaz)";
  const full = path.join(dir, f);
  const doc = readAoa(full);
  const H = doc.a[0];
  const ix = (n) => H.indexOf(n);
  const codeIx = ix("Lokasyon Kodu"), nameIx = ix("Açık Lokasyon Adı"), mailIx = ix("Mail Adresi"), ipIx = ix("IP_Address");
  const have = new Set(doc.a.slice(1).map((r) => String(r[codeIx]).trim()));
  let added = 0;
  const bantFile = path.join(DEMO, "bant-genisligi.csv");
  if (fs.existsSync(bantFile)) {
    const b = XLSX.read(fs.readFileSync(bantFile));
    const codes = [...new Set(XLSX.utils.sheet_to_json(b.Sheets[b.SheetNames[0]], { defval: "" }).map((r) => String(r["Lokasyon"]).trim()).filter(Boolean))];
    codes.filter((c) => !have.has(c)).forEach((c, i) => {
      const row = new Array(H.length).fill("");
      row[codeIx] = c; row[nameIx] = `${CITY[c.slice(0, 3)] || c.slice(0, 3)} SATIS OFISI`; row[ipIx] = `172.28.${200 + i}.1`;
      doc.a.push(row); added++;
    });
  }
  let filled = 0, blank = 0;
  for (let i = 1; i < doc.a.length; i++) {
    const r = doc.a[i];
    const code = String(r[codeIx]).trim();
    if (!code) continue;
    if (String(r[mailIx]).trim()) continue;
    if (KEEP_BLANK.has(code) || hash(code) % 100 < 6) { blank++; continue; }
    r[mailIx] = `${code.toLowerCase()}@mhy.com.tr`;
    filled++;
  }
  writeAoa(full, doc);
  return `${f}: ${added} ofis eklendi, ${filled} mail dolduruldu, ${blank} ofis bilerek boş`;
}

// 6) SCCM IP adresleri: hostname'in lokasyon koduna (ABJ0B55 -> ABJ0) göre Lokasyon Mail Listesi'ndeki IP aralıklarıyla tutarlı.
//    ~%90 cihaz kendi ofisinin aralığında ("Doğru Ofiste"), ~%7 başka ofisin aralığında (Hostname/IP Uyuşmazlığı), kalanı değişmez.
//    Kaynak lokasyon listesi: demo-data/current (aylık klasörlerde liste yok).
function sccmIpAlign(dir) {
  const lf = findLatestFile(path.join(DEMO, "current"), "LokasyonMailListesi");
  if (!lf) return "lokasyon listesi yok — atlandı";
  const lok = readAoa(path.join(DEMO, "current", lf)).a;
  const L = lok[0];
  const codeOf = (v) => { const m = String(v || "").trim().match(/^([A-Za-z]+)(\d)/); return m ? (m[1] + m[2]).toUpperCase() : ""; };
  const nameByCode = new Map(), prefixesByName = new Map();
  lok.slice(1).forEach((r) => {
    const code = codeOf(r[L.indexOf("Lokasyon Kodu")]), name = String(r[L.indexOf("Açık Lokasyon Adı")]).trim().toLowerCase();
    const ip = String(r[L.indexOf("IP_Address")]).trim().split(".");
    if (!name || ip.length < 3) return;
    if (code && !nameByCode.has(code)) nameByCode.set(code, name);
    if (!prefixesByName.has(name)) prefixesByName.set(name, new Set());
    prefixesByName.get(name).add(ip.slice(0, 3).join("."));
  });
  const allPrefixes = [...new Set([...prefixesByName.values()].flatMap((s) => [...s]))];
  const f = findLatestFile(dir, "SCCM Inventory Report");
  const full = path.join(dir, f);
  const doc = readAoa(full);
  const hr = doc.a.findIndex((r) => r.includes("Hostname"));
  const H = doc.a[hr];
  const hostIx = H.indexOf("Hostname");
  let ipIx = H.indexOf("IPAddresses");
  if (ipIx < 0) { // eski aylık dosyalarda sütun yok (şema zorunlu kılıyor) — varsayılan kurumsal olmayan IP ile ekle
    H.push("IPAddresses"); ipIx = H.length - 1;
    for (let i = hr + 1; i < doc.a.length; i++) if (doc.a[i].some((c) => String(c).trim())) { const h = hash(doc.a[i][hostIx]); doc.a[i][ipIx] = `10.${20 + (h % 40)}.${(h >>> 8) % 250}.${1 + ((h >>> 16) % 250)}`; }
  }
  let ok = 0, bad = 0;
  for (let i = hr + 1; i < doc.a.length; i++) {
    const r = doc.a[i];
    const code = codeOf(r[hostIx]);
    const name = nameByCode.get(code);
    if (!name) continue;
    const h = hash(r[hostIx]);
    const roll = h % 100;
    const own = [...(prefixesByName.get(name) || [])];
    if (!own.length) continue;
    const last = 10 + ((h >>> 8) % 230);
    if (roll < 90) { r[ipIx] = `${own[(h >>> 4) % own.length]}.${last}`; ok++; }
    else if (roll < 97) {
      const other = allPrefixes.filter((p) => !own.includes(p));
      r[ipIx] = `${other[(h >>> 4) % other.length]}.${last}`; bad++;
    }
  }
  writeAoa(full, doc);
  return `${f}: IP'ler lokasyon aralıklarına göre hizalandı (${ok} doğru ofiste, ${bad} uyuşmazlık)`;
}

// 7) Eski aylık TH dosyalarında olmayan "Cihaz Sahibinin Maili" / "Cihaz Sahibinin Unvan Kademesi" sütunları: aynı seri no'nun güncel dosyadaki
//    değerinden, yoksa kullanıcı adından türetilerek doldurulur.
function thFill(dir) {
  const f = findLatestFile(dir, "TH");
  const curF = findLatestFile(path.join(DEMO, "current"), "TH");
  const full = path.join(dir, f);
  const doc = readAoa(full);
  const H = doc.a[0];
  const need = ["Cihaz Sahibinin Maili", "Cihaz Sahibinin Unvan Kademesi"].filter((c) => !H.includes(c));
  if (need.length === 0) return `${f}: mail/unvan sütunları zaten var`;
  const cur = readAoa(path.join(DEMO, "current", curF)).a;
  const C = cur[0];
  const bySerial = new Map(cur.slice(1).map((r) => [String(r[C.indexOf("Seri No")]).trim().toLowerCase(), r]));
  const sIx = H.indexOf("Seri No"), uIx = H.indexOf("Owner Username");
  need.forEach((c) => H.push(c));
  for (let i = 1; i < doc.a.length; i++) {
    const r = doc.a[i];
    if (!r.some((c) => String(c).trim())) continue;
    const src = bySerial.get(String(r[sIx]).trim().toLowerCase());
    need.forEach((c) => {
      const v = src ? src[C.indexOf(c)] : "";
      const username = String(r[uIx] || "").trim().toLowerCase();
      r[H.indexOf(c)] = v || (c.endsWith("Maili") && username ? `${username}@mhy.com.tr` : "");
    });
  }
  writeAoa(full, doc);
  return `${f}: ${need.join(" + ")} eklendi`;
}

// Battery: kapasite sütunları
function batteryCapacity(file) {
  if (!fs.existsSync(file)) return `${file}: yok — atlandı`;
  const doc = readAoa(file);
  const H = doc.a[0];
  if (H.includes("Design Capacity")) return `${path.basename(file)}: kapasite sütunları zaten var`;
  const hIx = H.findIndex((h) => /battery health|health/i.test(String(h)));
  const sIx = H.indexOf("Battery Serial") >= 0 ? H.indexOf("Battery Serial") : 0;
  const DESIGN = [41000, 45000, 50000, 57000, 66000, 72000];
  H.push("Design Capacity", "Full Charge Capacity");
  for (let i = 1; i < doc.a.length; i++) {
    const r = doc.a[i];
    if (!r.some((c) => String(c).trim())) continue;
    const design = DESIGN[hash(r[sIx] || i) % DESIGN.length];
    const health = Number(r[hIx]);
    r.push(design, Number.isFinite(health) ? Math.round((design * health) / 100) : "");
  }
  writeAoa(file, doc);
  return `${path.basename(file)}: kapasite sütunları eklendi`;
}

console.log("— Demo veri yenileme —");
dirs.forEach((dir) => {
  console.log(`\n[${dir}]`);
  [
    () => run("add-os-version.js", dir),
    () => run("add-th-update-date.js", dir, "--force"),
    () => sccmClientCheck(dir),
    () => lokasyon(dir),
    () => sccmIpAlign(dir),
    () => thFill(dir),
  ].forEach((step) => console.log("  " + String(step()).replace(/\n/g, "\n  ")));
});
console.log("");
batteries.forEach((b) => console.log("  " + batteryCapacity(b)));
