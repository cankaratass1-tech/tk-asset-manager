const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const { loadLatestReport, coreDeviceRow, coreSccmRow } = require("./excelSource");

function writeXlsx(dir, name, aoa) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "S");
  XLSX.writeFile(wb, path.join(dir, name));
}

test("TH: yalnızca Desktop/Notebook/Monitor alınır, elenen seri no'lar döner", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "th-"));
  try {
    writeXlsx(dir, "TH_20260101000000.xlsx", [
      ["Seri No", "Model"],
      ["A1", "NOTEBOOK"], ["A2", "desktop"], ["A3", "MONITOR"], ["T1", "TABLET"], ["P1", "PRINTER"], ["V1", "Executive Voice Line"],
    ]);
    const r = loadLatestReport(dir, "TH", { sheetIndex: 0, headerRow: 0, rowFilter: coreDeviceRow, excludedKey: "Seri No" });
    assert.deepEqual(r.rows.map((x) => x["Seri No"]), ["A1", "A2", "A3"]);
    assert.deepEqual(r.excluded.sort(), ["P1", "T1", "V1"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SCCM: yalnızca Desktop ve Laptop/Notebook alınır; Type boşsa elenmez", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sccm-"));
  try {
    writeXlsx(dir, "SCCM Inventory Report_1.xlsx", [
      ["r"], [""], [""],
      ["Hostname", "Serial Number", "Type"],
      ["h1", "S1", "Desktop"], ["h2", "S2", "Laptop"], ["h3", "S3", "Notebook"], ["h4", "S4", "Server"], ["h5", "S5", "Virtual Machine"], ["h6", "S6", ""],
    ]);
    const r = loadLatestReport(dir, "SCCM Inventory Report", { sheetIndex: 0, headerRow: 3, rowFilter: coreSccmRow });
    assert.deepEqual(r.rows.map((x) => x.Hostname), ["h1", "h2", "h3", "h6"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Başlık satırı farklı yerdeyse (Monitör, SCCM) doğrulama geçer ve satırlar boş gelmez", () => {
  const { checkWorkbook, SCHEMAS } = require("./fileSchemas");
  for (const [kind, prefix, header, expectedRow, aoaFor] of [
    ["monitor", "Attached Monitors Report", ["ID Monitor Serial Number", "Hostname", "Username", "Active Status"], 1, (pad, h) => [...Array(pad).fill(["Rapor"]), h, ["MON1", "H1", "u1", "Active"]]],
    ["sccm", "SCCM Inventory Report", ["Hostname", "Serial Number", "Type", "Model", "LastLogon UserName", "LastLogonTime", "IPAddresses"], 3, (pad, h) => [...Array(pad).fill(["Rapor"]), h, ["H1", "S1", "Laptop", "m", "u", "2026-01-01", "1.1.1.1"]]],
  ]) {
    for (const pad of [0, 1, 5]) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hdr-"));
      try {
        writeXlsx(dir, `${prefix}_1.xlsx`, aoaFor(pad, header));
        const wb = XLSX.readFile(path.join(dir, `${prefix}_1.xlsx`));
        const chk = checkWorkbook(kind, wb);
        assert.equal(chk.ok, true, `${kind} üstte ${pad} satır: doğrulama geçmeli`);
        assert.equal(chk.headerRow, pad + 1);
        const r = loadLatestReport(dir, prefix, { sheetIndex: 0, headerRow: expectedRow, requiredColumns: SCHEMAS[kind].required });
        assert.equal(r.rows.length, 1, `${kind} üstte ${pad} satır: veri satırı okunmalı`);
        assert.equal(r.rows[0][header[0]], aoaFor(pad, header)[pad + 1][0]);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
});

test("TH: envanterden çıkmış (Kal Edildi / Hibe Edildi / Satıldı) cihazlar elenir ve seri no'ları elenenler listesine girer", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "th-"));
  try {
    writeXlsx(dir, "TH_20260101000000.xlsx", [
      ["Seri No", "Model", "Durum"],
      ["A1", "NOTEBOOK", "Kullanımda"], ["A2", "NOTEBOOK", "Hibe Edildi"], ["A3", "DESKTOP", "Satıldı"], ["A4", "MONITOR", "Hibe Edilecek"], ["A5", "NOTEBOOK", "Personele Satıldı"],
    ]);
    const r = loadLatestReport(dir, "TH", { sheetIndex: 0, headerRow: 0, rowFilter: coreDeviceRow, excludedKey: "Seri No" });
    assert.deepEqual(r.rows.map((x) => x["Seri No"]), ["A1", "A4"]);
    assert.deepEqual(r.excluded.sort(), ["A2", "A3", "A5"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("İnaktif: kategori sütunu varsa yalnız DESKTOP/NOTEBOOK; model adı olan eski biçim etkilenmez", () => {
  const { coreInaktifRow } = require("./excelSource");
  const keep = ["NOTEBOOK", "DESKTOP", "Dell OptiPlex 5090", "HP EliteBook 840 G8", ""];
  const drop = ["MONITOR", "TABLET", "IP PHONE", "MOBILE PHONE", "HEADPHONE", "Data Line", "SERVER"];
  keep.forEach((m) => assert.equal(coreInaktifRow({ Model: m }), true, m));
  drop.forEach((m) => assert.equal(coreInaktifRow({ Model: m }), false, m));
  assert.equal(coreInaktifRow({}), true);
});

test("Lokasyon: 'Lokasyonlar.xlsx' biçimi (Caption/Lokasyon/Node_CP_ContactMail) şema doğrulamasından geçer", () => {
  const { checkHeaders } = require("./fileSchemas");
  assert.equal(checkHeaders("lokasyon", ["Caption", "Lokasyon", "Node_CP_ContactMail", "Node_CP_ContactMail2", "IP_Address"]).ok, true);
  assert.equal(checkHeaders("lokasyon", ["Lokasyon Kodu", "Açık Lokasyon Adı", "Mail Adresi", "Node_CP_ContactMail2", "IP_Address"]).ok, true);
  assert.equal(checkHeaders("lokasyon", ["Lokasyon Kodu", "Açık Lokasyon Adı"]).ok, false);
});

test("Elenen seri no listesine envanterden çıkmış (satılmış/hibe) cihazlar GİRMEZ; yalnız türü başka olanlar girer", () => {
  const { knownOtherTypeRow } = require("./excelSource");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "th-"));
  try {
    writeXlsx(dir, "TH_20260101000000.xlsx", [["Seri No", "Model", "Durum"], ["A1", "NOTEBOOK", "Kullanımda"], ["A2", "NOTEBOOK", "Satıldı"], ["T1", "TABLET", "Kullanımda"], ["T2", "TABLET", "Hibe Edildi"], ["U1", "-", "-"], ["U2", "", ""]]);
    const r = loadLatestReport(dir, "TH", { sheetIndex: 0, headerRow: 0, rowFilter: coreDeviceRow, excludedKey: "Seri No", excludeIf: knownOtherTypeRow });
    assert.deepEqual(r.rows.map((x) => x["Seri No"]), ["A1"]);
    assert.deepEqual(r.excluded, ["T1"], "türü bilinmeyen (\"-\") satırlar elenenler listesine girmez");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Mac'ler (Apple/MacBook/iMac/MAC cihaz tipi) Notebook/Desktop listesinden çıkar; Apple monitör ve diğer markalar kalır; Mac seri no'ları SCCM/İnaktif için elenenlere girer", () => {
  const { knownOtherTypeRow, coreInaktifRow } = require("./excelSource");
  const mac = [
    { Model: "NOTEBOOK", Marka: "Apple", Asset: "Apple Macbook Pro 14 inch M4" },
    { Model: "NOTEBOOK", Marka: "", Asset: "MacBook Air 13" },
    { Model: "DESKTOP", Marka: "", Asset: "iMac 24", "Cihaz Tipi": "MAC Desktop Cihazlar" },
    { Model: "NOTEBOOK", "Cihaz Tipi": "MAC Notebook Cihazlar", Marka: "-", Asset: "-" },
    { Model: "DESKTOP", Marka: "Apple", Asset: "Mac mini M2" },
  ];
  mac.forEach((r) => { assert.equal(coreDeviceRow(r), false, JSON.stringify(r)); assert.equal(knownOtherTypeRow(r), true); assert.equal(coreInaktifRow(r), false); });
  const keep = [
    { Model: "NOTEBOOK", Marka: "Lenovo", Asset: "Lenovo ThinkPad T14" },
    { Model: "DESKTOP", Marka: "HP", Asset: "HP EliteDesk 800" },
    { Model: "MONITOR", Marka: "Apple", Asset: "Apple Studio Display" }, // Apple monitör: Notebook/Desktop değil
  ];
  keep.forEach((r) => assert.equal(coreDeviceRow(r), true, JSON.stringify(r)));
});

test("Disk: 'C Size Less Than' biçiminde Site Code / Volume Name uyarısı çıkmaz; eski biçimde eksikse hâlâ uyarır", () => {
  const { checkHeaders } = require("./fileSchemas");
  const c = checkHeaders("disk", ["Hostname", "Serial Number", "C Free Space MB", "C Size MB", "LastLogonLokasyon", "Type"]);
  assert.equal(c.ok, true);
  assert.deepEqual(c.missingRecommended, []);
  const old = checkHeaders("disk", ["Name", "Free Space", "Size"]);
  assert.equal(old.ok, true);
  assert.equal(old.missingRecommended.length, 2);
});
