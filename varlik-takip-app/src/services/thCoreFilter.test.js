import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isCoreDeviceRaw } from "./thCoreFilter.js";
import { computeUnusedDevices } from "./unusedDeviceService.js";

const cur = join(import.meta.dirname, "..", "..", "..", "backend", "demo-data", "current");

test("TH içe aktarımı yalnızca Desktop / Notebook / Monitor bırakır (demo TuruncuHat dosyası)", () => {
  const wb = XLSX.read(readFileSync(join(cur, readdirSync(cur).find((f) => f.startsWith("TH_")))), { type: "buffer" });
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const kept = raw.filter(isCoreDeviceRaw);
  assert.deepEqual([...new Set(kept.map((r) => r.Model))].sort(), ["DESKTOP", "MONITOR", "NOTEBOOK"]);
  assert.ok(kept.length < raw.length, "Tablet/Printer/Line satırları elenmeli");
  assert.ok(raw.some((r) => r.Model === "TABLET") && !kept.some((r) => r.Model === "TABLET"));
});

test("Büyük/küçük harf ve boşluk fark etmez", () => {
  assert.equal(isCoreDeviceRaw({ Model: " Notebook " }), true);
  assert.equal(isCoreDeviceRaw({ Model: "PRINTER" }), false);
  assert.equal(isCoreDeviceRaw({ Model: "Executive Voice Line" }), false);
  assert.equal(isCoreDeviceRaw({}), false);
});

test("Kullanılmayan cihazlar: OBS monitör (SCCM'de olmaz) 'kullanılmıyor' sayılmaz; OBS notebook/desktop sayılır", () => {
  const th = ["NOTEBOOK", "DESKTOP", "MONITOR"].map((t) => ({ serial: `S-${t}`, deviceType: t, assignmentType: "OBS", _raw: {} }));
  const unused = computeUnusedDevices({ thRows: th, sccmRows: [] });
  assert.deepEqual(unused.map((r) => r.serial).sort(), ["S-DESKTOP", "S-NOTEBOOK"]);
});

test("SCCM/İnaktif: TH'de başka türde görünen cihaz elenir; TH'de hiç olmayan ve çekirdek olan kalır", async () => {
  const { excludedSerialsOf, dropOtherTypes } = await import("./thCoreFilter.js");
  const raw = [{ Model: "NOTEBOOK", "Seri No": "A1" }, { Model: "TABLET", "Seri No": "T1" }, { Model: "PRINTER", "Seri No": "P1" }, { Model: "TABLET", "Seri No": "A1" }];
  const excluded = excludedSerialsOf(raw);
  assert.deepEqual(excluded.sort(), ["A1", "P1", "T1"]);
  const kept = [{ serial: "A1" }];
  const sccm = [{ serial: "a1" }, { serial: "T1" }, { serial: "P1" }, { serial: "X9" }];
  assert.deepEqual(dropOtherTypes(sccm, excluded, kept).map((r) => r.serial), ["a1", "X9"]);
  assert.equal(dropOtherTypes(sccm, [], kept), sccm, "TH yoksa/elenen yoksa liste değişmez");
});

test("SCCM içe aktarımı: yalnızca Desktop ve Laptop/Notebook; Type boşsa kalır", async () => {
  const { isCoreSccmRaw } = await import("./thCoreFilter.js");
  assert.equal(isCoreSccmRaw({ Type: "Desktop" }), true);
  assert.equal(isCoreSccmRaw({ Type: " laptop " }), true);
  assert.equal(isCoreSccmRaw({ Type: "Server" }), false);
  assert.equal(isCoreSccmRaw({ Type: "Virtual Machine" }), false);
  assert.equal(isCoreSccmRaw({ Type: "" }), true);
});

test("İnaktif listesi: TH'de MONITOR olan cihaz çıkar; aynı seri no'lu bilgisayar kaydı varsa kalır; TH'de olmayan kalır", async () => {
  const { dropOtherTypes } = await import("./thCoreFilter.js");
  const inaktif = [{ serial: "MON1" }, { serial: "PC1" }, { serial: "BOTH" }, { serial: "YOK" }];
  const pcRows = [{ serial: "PC1" }, { serial: "BOTH" }]; // monitör olmayan çekirdek TH satırları
  const out = dropOtherTypes(inaktif, ["MON1", "BOTH", "TAB1"], pcRows);
  assert.deepEqual(out.map((r) => r.serial), ["PC1", "BOTH", "YOK"]);
});

test("İnaktif listesi: TH'de MONITOR olan cihaz çıkar; aynı seri no'lu bilgisayar kaydı varsa kalır; TH'de olmayan kalır", async () => {
  const { dropOtherTypes } = await import("./thCoreFilter.js");
  const inaktif = [{ serial: "MON1" }, { serial: "PC1" }, { serial: "BOTH" }, { serial: "YOK" }];
  const pcRows = [{ serial: "PC1" }, { serial: "BOTH" }]; // monitör olmayan çekirdek TH satırları
  const out = dropOtherTypes(inaktif, ["MON1", "BOTH", "TAB1"], pcRows);
  assert.deepEqual(out.map((r) => r.serial), ["PC1", "BOTH", "YOK"]);
});

test("Turuncuhat v2: sütunlar eski adlara çevrilir, '-' boş olur, eski biçime dokunulmaz", async () => {
  const { normalizeThRow } = await import("./thAliasFileService.js");
  const r = normalizeThRow({ "Seri No": "S1", Model: "NOTEBOOK", "Cihaz Sahibi": "AYSE (BT)", "Location identifier": "OBS", "Cihaz Sahibinin Sicil No": "012345", "Cihaz Sahibinin Mail Adresi": "a@thy.com", "Varlık Adı": "MacBook", Barkod: "B1", "Cihaz Sahibi Firma": "TKAO-THY A.O.", LBS: "BINA" });
  assert.deepEqual([r.Sahibi, r["Konum Kategorisi"], r["Cihaz Sahibinin Sicili"], r["Cihaz Sahibinin Maili"], r.Asset, r["Varlık Barkodu"], r["Sahibi Firma"], r["Cihaz Sahibinin LBS'i"]], ["AYSE (BT)", "OBS", "012345", "a@thy.com", "MacBook", "B1", "TKAO-THY A.O.", "BINA"]);
  assert.equal(normalizeThRow({ "Location identifier": "-" })["Konum Kategorisi"], "");
  assert.equal(normalizeThRow({ Sahibi: "ESKI", "Cihaz Sahibi": "YENI" }).Sahibi, "ESKI");
});

test("Envanterden çıkmış cihazlar (Kal Edildi / Hibe Edildi / Satıldı / Personele Satıldı) içe aktarılmaz; 'Hibe Edilecek' ve 'Kullanımda' alınır", async () => {
  const { isCoreDeviceRaw } = await import("./thCoreFilter.js");
  for (const d of ["Kal Edildi", "Hibe Edildi", "Satıldı", "Personele Satıldı", " hibe edildi "]) assert.equal(isCoreDeviceRaw({ Model: "NOTEBOOK", Durum: d }), false, d);
  for (const d of ["Kullanımda", "Stokta", "Hibe Edilecek", "Kal Edilecek", "Arizali", ""]) assert.equal(isCoreDeviceRaw({ Model: "NOTEBOOK", Durum: d }), true, d);
  assert.equal(isCoreDeviceRaw({ Model: "NOTEBOOK" }), true);
});

test("İnaktif: Model sütunu kategori ise yalnız DESKTOP/NOTEBOOK; model adı ya da boşsa satır elenmez", async () => {
  const { isCoreInaktifRaw } = await import("./thCoreFilter.js");
  for (const m of ["NOTEBOOK", "DESKTOP"]) assert.equal(isCoreInaktifRaw({ Model: m }), true, m);
  for (const m of ["MONITOR", "TABLET", "IP PHONE", "MOBILE PHONE", "HEADPHONE", "Data Line", "Voice Line", "Executive Voice Line", "SERVER", "PRINTER"]) assert.equal(isCoreInaktifRaw({ Model: m }), false, m);
  for (const m of ["Dell OptiPlex 5090", "Lenovo ThinkPad X1 Carbon", "HP EliteBook 840 G8", "LG 24MK430H", "", undefined]) assert.equal(isCoreInaktifRaw({ Model: m }), true, String(m));
});

test("excludedSerialsOf: envanterden çıkmış cihazlar SCCM/İnaktif'ten elenecek listeye girmez", async () => {
  const { excludedSerialsOf } = await import("./thCoreFilter.js");
  const raw = [{ "Seri No": "A1", Model: "NOTEBOOK", Durum: "Kullanımda" }, { "Seri No": "A2", Model: "NOTEBOOK", Durum: "Satıldı" }, { "Seri No": "T1", Model: "TABLET", Durum: "Kullanımda" }, { "Seri No": "T2", Model: "TABLET", Durum: "Hibe Edildi" }, { "Seri No": "U1", Model: "-", Durum: "-" }, { "Seri No": "U2", Model: "" }];
  assert.deepEqual(excludedSerialsOf(raw), ["T1"]);
});

test("Mac'ler (Apple / MacBook / iMac / MAC cihaz tipi) içe aktarılmaz ve İnaktif'ten çıkar; Apple monitör ve Lenovo kalır", async () => {
  const { isCoreDeviceRaw, isCoreInaktifRaw, excludedSerialsOf } = await import("./thCoreFilter.js");
  const mac = [
    { "Seri No": "M1", Model: "NOTEBOOK", Marka: "Apple", Asset: "Apple Macbook Pro 14 inch M4 16Gb/512Gb" },
    { "Seri No": "M2", Model: "NOTEBOOK", Marka: "", Asset: "MacBook Air 13" },
    { "Seri No": "M3", Model: "DESKTOP", "Cihaz Tipi": "MAC Desktop Cihazlar", Marka: "-", Asset: "-" },
  ];
  mac.forEach((r) => { assert.equal(isCoreDeviceRaw(r), false, r["Seri No"]); assert.equal(isCoreInaktifRaw(r), false, r["Seri No"]); });
  assert.deepEqual(excludedSerialsOf(mac), ["M1", "M2", "M3"]);
  assert.equal(isCoreDeviceRaw({ Model: "NOTEBOOK", Marka: "Lenovo", Asset: "Lenovo ThinkPad T14" }), true);
  assert.equal(isCoreDeviceRaw({ Model: "MONITOR", Marka: "Apple", Asset: "Apple Studio Display" }), true);
  assert.equal(isCoreInaktifRaw({ Model: "NOTEBOOK", Marka: "Lenovo" }), true);
});
