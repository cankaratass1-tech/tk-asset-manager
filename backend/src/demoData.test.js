// Demo (dump) verisi güncel yapıya uygun ve kaynaklar arası TUTARLI mı? scripts/refresh-demo-data.js sonrası bozulursa burada yakalanır.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { findLatestFile } = require("./excelSource");

const DEMO = path.join(__dirname, "..", "demo-data");
const CUR = path.join(DEMO, "current");
const sheet = (file, idx = 0, hr = 0) => {
  const wb = XLSX.read(fs.readFileSync(file));
  const a = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[idx]], { header: 1, defval: "" });
  const H = a[hr].map((h) => String(h).trim());
  return { H, rows: a.slice(hr + 1).filter((r) => r.some((c) => String(c).trim())).map((r) => Object.fromEntries(H.map((h, i) => [h, r[i]]))) };
};
const find = (p) => path.join(CUR, findLatestFile(CUR, p));
const short = (h) => String(h).trim().split(".")[0].toLowerCase();

const sccm = sheet(find("SCCM Inventory Report"), 0, 3);
const th = sheet(find("TH"));
const disk = sheet(find("DiskAlani"), 0, 5);
const mon = sheet(find("Attached Monitors Report"), 0, 1);
const bsod = sheet(find("Weekly_BSOD"), 0, 1);
const lok = sheet(find("LokasyonMailListesi"));
const bat = sheet(path.join(DEMO, "battery-health.xlsx"));
const bantWb = XLSX.read(fs.readFileSync(path.join(DEMO, "bant-genisligi.csv")));
const bant = XLSX.utils.sheet_to_json(bantWb.Sheets[bantWb.SheetNames[0]], { defval: "" });
const sccmHosts = new Set(sccm.rows.map((r) => short(r["Hostname"])));

test("güncel yapı: SCCM'de Windows sürümü + ajan durumu, TH'de güncelleme tarihi/mail, pil kapasitesi sütunları var", () => {
  ["Operating System", "OS Version", "Last Client Check", "Client Active", "IPAddresses", "BIOS Date"].forEach((c) => assert.ok(sccm.H.includes(c), `SCCM: ${c}`));
  ["Son Güncelleme Tarihi", "Cihaz Sahibinin Maili", "Cihaz Sahibinin Unvan Kademesi"].forEach((c) => assert.ok(th.H.includes(c), `TH: ${c}`));
  ["Design Capacity", "Full Charge Capacity"].forEach((c) => assert.ok(bat.H.includes(c), `Battery: ${c}`));
});

test("kaynaklar arası tutarlılık: disk / monitör / BSOD / pil hostname'leri SCCM'de var", () => {
  const miss = (rows, col) => rows.filter((r) => !sccmHosts.has(short(r[col]))).length;
  assert.equal(miss(disk.rows, disk.H.includes("Name") ? "Name" : "Device ID"), 0, "disk");
  assert.equal(miss(mon.rows, "Hostname"), 0, "monitör");
  assert.equal(miss(bsod.rows, "Machine Name"), 0, "bsod");
  assert.equal(miss(bat.rows, "System"), 0, "pil");
});

test("pil kapasitesi sağlık yüzdesiyle tutarlı (tam şarj ≈ tasarım × sağlık)", () => {
  const hc = bat.H.find((h) => /battery health/i.test(h));
  bat.rows.slice(0, 200).forEach((r) => {
    const exp = (Number(r["Design Capacity"]) * Number(r[hc])) / 100;
    assert.ok(Math.abs(Number(r["Full Charge Capacity"]) - exp) <= 1, `${r["System"]}`);
  });
});

test("TH 'Son Güncelleme Tarihi' geçerli tarih ve dosya tarihini aşmıyor", () => {
  const m = path.basename(find("TH")).match(/_(\d{4})(\d{2})(\d{2})/);
  const fileDate = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  th.rows.forEach((r) => {
    const t = Date.parse(r["Son Güncelleme Tarihi"]);
    assert.ok(!Number.isNaN(t), `geçersiz tarih ${r["Seri No"]}`);
    assert.ok(t <= fileDate, `gelecek tarih ${r["Seri No"]}`);
  });
});

test("SCCM ajan durumu: çoğu aktif, az sayıda eski/pasif (rapor anlamlı) ve tarihler geçerli", () => {
  const active = sccm.rows.filter((r) => r["Client Active"] === "Yes").length;
  assert.ok(active / sccm.rows.length > 0.9 && active < sccm.rows.length, `aktif oranı ${active}/${sccm.rows.length}`);
  sccm.rows.slice(0, 300).forEach((r) => assert.ok(!Number.isNaN(Date.parse(r["Last Client Check"])), "Last Client Check"));
});

test("her bant ofisi Lokasyon Mail Listesi'nde var; mail adreslerinin çoğu dolu, birkaçı bilerek boş", () => {
  const codes = new Set(lok.rows.map((r) => String(r["Lokasyon Kodu"]).trim()));
  const missing = [...new Set(bant.map((r) => String(r["Lokasyon"]).trim()))].filter((c) => !codes.has(c));
  assert.deepEqual(missing, []);
  const filled = lok.rows.filter((r) => String(r["Mail Adresi"]).includes("@")).length;
  assert.ok(filled / lok.rows.length > 0.85 && filled < lok.rows.length, `mail dolu ${filled}/${lok.rows.length}`);
  assert.ok(lok.rows.some((r) => String(r["Lokasyon Kodu"]).trim() === "ABJ1-SD1" && !String(r["Mail Adresi"]).trim()), "ABJ1-SD1 bilerek boş");
});

test("Lokasyon/IP raporu için yeterli veri: lokasyon koduna bağlanan cihazların çoğu doğru ofiste, bir kısmı uyuşmazlık", () => {
  const code = (v) => { const m = String(v).trim().match(/^([A-Za-z]+)(\d)/); return m ? (m[1] + m[2]).toUpperCase() : ""; };
  const nameByCode = new Map(), pfx = new Map();
  lok.rows.forEach((r) => {
    const n = String(r["Açık Lokasyon Adı"]).trim().toLowerCase(), c = code(r["Lokasyon Kodu"]);
    const p = String(r["IP_Address"]).trim().split(".").slice(0, 3).join(".");
    if (c && !nameByCode.has(c)) nameByCode.set(c, n);
    if (!pfx.has(n)) pfx.set(n, new Set());
    pfx.get(n).add(p);
  });
  let ok = 0, bad = 0;
  sccm.rows.forEach((r) => {
    const n = nameByCode.get(code(r["Hostname"]));
    const ips = String(r["IPAddresses"]).split(",").map((x) => x.trim()).filter((x) => x.startsWith("172."));
    if (!n || ips.length === 0) return;
    (ips.some((ip) => pfx.get(n).has(ip.split(".").slice(0, 3).join("."))) ? (ok++) : (bad++));
  });
  assert.ok(ok > 200 && bad > 10, `doğru ${ok}, uyuşmazlık ${bad}`);
});
