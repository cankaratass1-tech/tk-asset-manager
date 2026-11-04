const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const { streamSheetObjects, peekHeaders, needsStreaming, parseSharedStrings, unescapeXml } = require("./bigXlsx");
const { loadLatestReportAsync, coreDeviceRow } = require("./excelSource");

function makeXlsx(dir, name, aoa) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "S");
  const p = path.join(dir, name);
  XLSX.writeFile(wb, p);
  return p;
}

test("akışlı okuyucu SheetJS ile aynı satırları üretir (üst satırlar, boş hücre, sayı, Türkçe karakter, XML kaçışları)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "big-"));
  try {
    const aoa = [
      ["Rapor başlığı"], [""],
      ["Seri No", "Model", "Sahibi", "Not", "Adet"],
      ["A1", "NOTEBOOK", "Ayşe Yılmaz", "a & b <c>", 5],
      ["A2", "PRINTER", "", "", 7],
      ["", "", "", "", ""], // tamamen boş satır atlanır
      ["A3", "MONITOR", "Çağrı Öz", "\"tırnak\"", 0],
    ];
    const p = makeXlsx(dir, "TH_20260101000000.xlsx", aoa);
    const sheetjs = XLSX.utils.sheet_to_json(XLSX.readFile(p, { dense: true }).Sheets.S, { defval: "", range: 2 }).filter((r) => Object.values(r).some((v) => v !== ""));
    const req = ["Seri No", "Model", "Sahibi"];
    const streamed = await streamSheetObjects(p, { sheetIndex: 0, headerRow: 2, requiredColumns: req });
    assert.deepEqual(streamed.rows, sheetjs);
    const filtered = await streamSheetObjects(p, { sheetIndex: 0, headerRow: 0, requiredColumns: req, rowFilter: coreDeviceRow, excludedKey: "Seri No" });
    assert.deepEqual(filtered.rows.map((r) => r["Seri No"]), ["A1", "A3"]);
    assert.deepEqual(filtered.excluded, ["A2"]);
    assert.equal(filtered.totalRows, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("peekHeaders yalnızca başlık satırını döner (başlık farklı satırda olsa da)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "big-"));
  try {
    const rows = Array.from({ length: 40 }, (_, i) => [`S${i}`, "NOTEBOOK", "x"]);
    const p = makeXlsx(dir, "TH_1.xlsx", [["r"], ["r"], ["Seri No", "Model", "Sahibi"], ...rows]);
    const r = await peekHeaders(p, { sheetIndex: 0, headerRow: 0, requiredColumns: ["Seri No", "Model", "Sahibi"] });
    assert.deepEqual(r.headers, ["Seri No", "Model", "Sahibi"]);
    assert.equal(r.headerRowIndex, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("küçük dosya akışlı okuma gerektirmez; loadLatestReportAsync senkron yolla aynı sonucu verir", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "big-"));
  try {
    makeXlsx(dir, "TH_20260101000000.xlsx", [["Seri No", "Model"], ["A1", "DESKTOP"], ["T1", "TABLET"]]);
    assert.equal(needsStreaming(path.join(dir, "TH_20260101000000.xlsx")), false);
    const r = await loadLatestReportAsync(dir, "TH", { sheetIndex: 0, headerRow: 0, rowFilter: coreDeviceRow, excludedKey: "Seri No" });
    assert.deepEqual(r.rows.map((x) => x["Seri No"]), ["A1"]);
    assert.deepEqual(r.excluded, ["T1"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("paylaşılan metin ve XML kaçışları", () => {
  assert.deepEqual(parseSharedStrings("<sst><si><t>a &amp; b</t></si><si><r><t>x</t></r><r><t xml:space=\"preserve\"> y</t></r></si><si/></sst>"), ["a & b", "x y", ""]);
  assert.equal(unescapeXml("&lt;&#65;&#x42;&gt;"), "<AB>");
});

test("Turuncuhat v2 sütunları eski (kanonik) adlara çevrilir; '-' boş sayılır; var olan kanonik sütuna dokunulmaz", () => {
  const { normalizeThRow } = require("./thAlias");
  const v2 = { "Seri No": "S1", Model: "NOTEBOOK", "Cihaz Sahibi": "AYSE YILMAZ (BT)", "Location identifier": "User", "Cihaz Sahibinin Sicil No": "012345", "Cihaz Sahibinin Mail Adresi": "A@THY.COM", "Varlık Adı": "Apple MacBook", Barkod: "THY1", "Cihaz Sahibi Firma": "TKAO-THY A.O.", LBS: "BINA", "Cihaz Sahibinin Profili": "-" };
  const r = normalizeThRow({ ...v2 });
  assert.equal(r.Sahibi, "AYSE YILMAZ (BT)");
  assert.equal(r["Konum Kategorisi"], "User");
  assert.equal(r["Cihaz Sahibinin Sicili"], "012345");
  assert.equal(r["Cihaz Sahibinin Maili"], "A@THY.COM");
  assert.equal(r.Asset, "Apple MacBook");
  assert.equal(r["Varlık Barkodu"], "THY1");
  assert.equal(r["Sahibi Firma"], "TKAO-THY A.O.");
  assert.equal(r["Cihaz Sahibinin LBS'i"], "BINA");
  assert.equal(normalizeThRow({ "Location identifier": "-" })["Konum Kategorisi"], "");
  const old = normalizeThRow({ Sahibi: "ESKI", "Cihaz Sahibi": "YENI", "Konum Kategorisi": "OBS", "Location identifier": "User" });
  assert.equal(old.Sahibi, "ESKI");
  assert.equal(old["Konum Kategorisi"], "OBS");
});

test("Turuncuhat v2 başlıkları şema doğrulamasından geçer (kullanıcı adı yok, sicil var)", () => {
  const { checkHeaders } = require("./fileSchemas");
  const v2 = ["Total", "Seri No", "Barkod", "Marka", "Model", "Varlık Adı", "Cihaz Sahibi", "Cihaz Sahibinin Sicil No", "Cihaz Sahibinin Mail Adresi", "LBS", "LBS Location Parent", "Location identifier", "Cihaz Sahibi Firma"];
  const r = checkHeaders("th", v2);
  assert.equal(r.ok, true, JSON.stringify(r.missingRequired));
});
