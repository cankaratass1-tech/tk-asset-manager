const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { SCHEMAS, checkHeaders, checkWorkbook, summarize } = require("./fileSchemas");
const { findLatestFile } = require("./excelSource");

const DEMO = path.join(__dirname, "..", "demo-data", "current");

test("demo dosyaların hepsi şemadan geçer (zorunlu + önerilen sütunlar tam)", () => {
  const UPLOADED = { battery: path.join(DEMO, "..", "battery-health.xlsx"), bant: path.join(DEMO, "..", "bant-genisligi.csv") };
  for (const [kind, schema] of Object.entries(SCHEMAS)) {
    const full = schema.fromUpload ? UPLOADED[kind] : path.join(DEMO, findLatestFile(DEMO, schema.prefix) || "yok");
    assert.ok(fs.existsSync(full), `${kind}: demo dosya bulunamadı`);
    const r = checkWorkbook(kind, XLSX.readFile(full));
    assert.ok(r.ok, `${kind}: ${summarize(r)}`);
    assert.deepEqual(r.missingRecommended, [], `${kind}: ${summarize(r)}`);
    assert.ok(r.dataRows > 0, `${kind}: veri satırı yok`);
  }
});

test("sayfa ve başlık satırı değerleri routes/reports.js ile aynı (kayma koruması)", () => {
  const src = fs.readFileSync(path.join(__dirname, "routes", "reports.js"), "utf8");
  for (const [kind, s] of Object.entries(SCHEMAS).filter(([, x]) => !x.fromUpload)) {
    const re = new RegExp(`loadLatestReport\\(cfg\\.folderPath, "${s.prefix}", \\{ sheetIndex: (\\d+)(?:, headerRow: (\\d+))? \\}\\)`);
    const m = src.match(re);
    assert.ok(m, `${kind}: reports.js'te "${s.prefix}" okuması bulunamadı`);
    assert.equal(Number(m[1]), s.sheetIndex, `${kind}: sheetIndex farklı`);
    assert.equal(Number(m[2] || 0), s.headerRow, `${kind}: headerRow farklı`);
  }
});

test("zorunlu sütun eksikse ok=false ve eksik adı döner", () => {
  const r = checkHeaders("th", ["Seri No", "Sahibi", "Model", "Konum Kategorisi"]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingRequired, ["Owner Username"]);
});

test("alternatifli sütun: biri yeterli", () => {
  const base = ["Seri No", "Sahibi", "Cihaz Sahibinin LBS'i"];
  assert.equal(checkHeaders("inaktif", [...base, "Asset"]).ok, true);
  assert.equal(checkHeaders("inaktif", [...base, "Model"]).ok, true);
  const r = checkHeaders("inaktif", base);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingRequired, ["Asset / Model"]);
});

test("benzer ama birebir olmayan başlık (büyük/küçük harf, boşluk) tanımadığı için bildirilir", () => {
  const r = checkHeaders("th", ["seri no", "Sahibi", "Model", "Konum Kategorisi", "Owner  Username"]);
  assert.equal(r.ok, false);
  assert.ok(r.nearMisses.some((n) => n.expected === "Seri No" && n.found === "seri no"));
  assert.ok(r.nearMisses.some((n) => n.expected === "Owner Username"));
});

test("uç boşluklu başlık (SCCM'de olduğu gibi) tam eşleşme sayılır", () => {
  const r = checkHeaders("sccm", ["Hostname ", "Serial Number", "Type", "Model", "LastLogon UserName", "LastLogonTime", "IPAddresses"]);
  assert.equal(r.ok, true);
});

test("beklenen sayfa yoksa (İnaktif için 2. sayfa) sayfa sorunu bildirilir", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Seri No", "Sahibi"], ["A", "B"]]), "Sheet1");
  const r = checkWorkbook("inaktif", wb);
  assert.equal(r.ok, false);
  assert.equal(r.sheetProblem, true);
});

test("başlık satırı boşsa / veri yoksa uyarır", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Seri No", "Sahibi", "Model", "Konum Kategorisi", "Owner Username"]]), "S");
  const r = checkWorkbook("th", wb);
  assert.equal(r.ok, false);
  assert.ok(r.emptyProblem);
});

test("battery: sağlık sütunu yoksa tasarım+tam şarj kapasitesi yeterli; ikisi de yoksa zorunlu eksik", () => {
  const base = ["Machine Name"];
  assert.equal(checkHeaders("battery", [...base, "Battery Health"]).ok, true);
  assert.equal(checkHeaders("battery", [...base, "Design Capacity", "Full Charge Capacity"]).ok, true);
  const r = checkHeaders("battery", [...base, "Design Capacity"]);
  assert.equal(r.ok, false);
  assert.ok(r.missingRequired[0].includes("Pil sağlığı"));
});

test("battery: başlık 2. satırdaysa (ilk satır boş) doğru satır seçilir", () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["Rapor"], ["Machine Name", "Battery Health", "Username"], ["PC1", 85, "a@b.com"]]);
  XLSX.utils.book_append_sheet(wb, ws, "S");
  const r = checkWorkbook("battery", wb);
  assert.equal(r.ok, true);
  assert.equal(r.headerRow, 2);
});

test("bant: zorunlu sütunlar (Lokasyon, Hat, Bant Genişliği, Uyarı Durumu)", () => {
  const r = checkHeaders("bant", ["Lokasyon", "Hat", "Bant Genişliği"]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingRequired, ["Uyarı Durumu"]);
  assert.equal(checkHeaders("bant", ["Lokasyon", "Hat", "Bant Genişliği", "Uyarı Durumu"]).ok, true);
});
