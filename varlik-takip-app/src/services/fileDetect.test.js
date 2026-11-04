import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { detectFromName, detectFromWorkbook, pickNewestPerKind } from "./fileDetect.js";

const loose0 = (s) => s.replace(/[İIı]/g, "i").toLowerCase();
const DEMO =join(import.meta.dirname, "..", "..", "..", "backend", "demo-data");

test("dosya adından tür: önekler büyük/küçük harf, boşluk ve alt çizgiden etkilenmez", () => {
  const cases = {
    "İnaktifCihazlar_20260901000000.xlsx": "inaktif",
    "inaktif cihazlar (2).xlsx": "inaktif",
    "DiskAlani_20260901000000.xlsx": "disk",
    "SCCM Inventory Report-W Collection_20260901000000.xlsx": "sccm",
    "Attached Monitors Report_20260901000000.xlsx": "monitor",
    "LokasyonMailListesi_20260921000000.xlsx": "lokasyon",
    "Weekly_BSOD_20260901000000.xlsx": "bsod",
    "Battery Health 2026.xlsx": "battery",
    "bant-genisligi.csv": "bant",
    "TH_20260901000000.xlsx": "th",
    "TH Envanteri.xlsx": "th",
    "TuruncuHat_son.xlsx": "th",
    "rapor.xlsx": null,
    "Thermal_notlar.xlsx": null,
    "C:\\Users\\x\\Downloads\\DiskAlani_1.xlsx": "disk",
  };
  for (const [name, kind] of Object.entries(cases)) assert.equal(detectFromName(name), kind, name);
});

test("başlık sütunlarından tür: demo dosyaları adı olmadan da doğru tanınır", () => {
  const expected = {
    "Attached Monitors Report": "monitor", DiskAlani: "disk", "İnaktifCihazlar": "inaktif", LokasyonMailListesi: "lokasyon",
    "SCCM Inventory Report": "sccm", "TH_": "th", Weekly_BSOD: "bsod",
  };
  const dir = join(DEMO, "current");
  const files = readdirSync(dir).filter((f) => f.endsWith(".xlsx"));
  assert.equal(files.length, Object.keys(expected).length);
  for (const f of files) {
    const key = Object.keys(expected).find((k) => f.startsWith(k) || loose0(f).startsWith(loose0(k)));
    const wb = XLSX.read(readFileSync(join(dir, f)), { type: "buffer", sheetRows: 12 });
    assert.equal(detectFromWorkbook(wb), expected[key], f);
  }
  assert.equal(detectFromWorkbook(XLSX.read(readFileSync(join(DEMO, "battery-health.xlsx")), { type: "buffer", sheetRows: 12 })), "battery");
  assert.equal(detectFromWorkbook(XLSX.read(readFileSync(join(DEMO, "bant-genisligi.csv")), { type: "buffer", sheetRows: 12 })), "bant");
});

test("başlıkları hiçbir türe uymayan dosya tanınmaz", () => {
  const ws = XLSX.utils.aoa_to_sheet([["Ad", "Soyad"], ["a", "b"]]);
  const wb = { SheetNames: ["S"], Sheets: { S: ws } };
  assert.equal(detectFromWorkbook(wb), null);
  assert.equal(detectFromWorkbook(null), null);
});

test("aynı türden birden çok dosyada yalnız en yenisi kullanılır, tanınmayan ayrı işaretlenir", () => {
  const r = pickNewestPerKind([
    { name: "a.xlsx", kind: "sccm", lastModified: 1 },
    { name: "b.xlsx", kind: "sccm", lastModified: 5 },
    { name: "c.xlsx", kind: "disk", lastModified: 2 },
    { name: "d.xlsx", kind: null, lastModified: 9 },
  ]);
  assert.deepEqual(r.map((e) => e.action), ["skip", "use", "use", "unknown"]);
  assert.equal(r[0].newerName, "b.xlsx");
});

test("Adı 'SCCM' ile başlayan Disk (low disk space) raporu SCCM Envanteri sanılmaz; gerçek SCCM envanteri yine SCCM", async () => {
  const { detectFile } = await import("./fileDetect.js");
  const mk = (name, aoa) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "S");
    return new File([XLSX.write(wb, { type: "buffer", bookType: "xlsx" })], name);
  };
  const low = mk("SCCM Low Disk Space.xlsx", [["Rapor"], [""], ["Hostname", "Volume Name", "Free Space", "Size", "Durum"], ["IST1", "C", 1000, 2000, "Kritik"]]);
  assert.deepEqual(await detectFile(low), { kind: "disk", via: "sütunlar" });
  const inv = mk("SCCM Inventory Report.xlsx", [["Rapor"], [""], [""], ["Hostname", "Serial Number", "LastLogon UserName", "Type"], ["h", "s", "u", "Laptop"]]);
  assert.equal((await detectFile(inv)).kind, "sccm");
  const unreadable = new File([new Uint8Array([1, 2, 3])], "SCCM bilinmeyen.xlsx");
  assert.equal((await detectFile(unreadable)).kind, "sccm", "sütunlar okunamazsa ad kuralına düşer");
});

test("'C Size Less Than 10 GB' (SCCM envanter alt kümesi, C boş alan/boyut) Disk Alanı sayılır; gerçek SCCM envanteri SCCM kalır", async () => {
  const { detectFile } = await import("./fileDetect.js");
  const mk = (name, aoa) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "S");
    return new File([XLSX.write(wb, { type: "buffer", bookType: "xlsx" })], name);
  };
  const cDisk = mk("C Size Less Than 10 GB.xlsx", [[""], [""], ["SCCM Inventory Report"], [""], [""], ["Hostname", "Serial Number", "LastLogon UserName", "Type", "C Free Space MB ", "C Size MB "], ["H1", "S1", "u", "Laptop", 9800, 152094]]);
  assert.equal((await detectFile(cDisk)).kind, "disk");
  const inv = mk("rapor.xlsx", [["r"], [""], [""], ["Hostname", "Serial Number", "LastLogon UserName", "Type"], ["h", "s", "u", "Laptop"]]);
  assert.equal((await detectFile(inv)).kind, "sccm");
});

test("Turuncuhat v2 başlıkları (adı tanınmasa da) TuruncuHat olarak tanınır", async () => {
  const { detectFile } = await import("./fileDetect.js");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Total", "Seri No", "Barkod", "Model", "Cihaz Sahibi", "Location identifier"], [1, "S1", "B1", "NOTEBOOK", "X", "User"]]), "S");
  const f = new File([XLSX.write(wb, { type: "buffer", bookType: "xlsx" })], "rapor-ekim.xlsx");
  assert.equal((await detectFile(f)).kind, "th");
});

test("Tam SCCM envanteri (C boş alan sütunları da var ama İştirak/Last LogonSicil/Bitlocker var) SCCM kalır; 'C Size Less Than' alt kümesi Disk olur", async () => {
  const { detectFile } = await import("./fileDetect.js");
  const mk = (name, aoa) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "S");
    return new File([XLSX.write(wb, { type: "buffer", bookType: "xlsx" })], name);
  };
  const full = mk("SCCM Inventory Report-W Collection.xlsx", [[""], [""], [""], ["Hostname", "Serial Number", "LastLogon UserName", "Type", "İştirak", "Last LogonSicil ", "C Free Space MB ", "C Size MB ", "Bitlocker Enabled"], ["h", "s", "u", "Laptop", "TKAO", "123", 9000, 100000, "Yes"]]);
  assert.equal((await detectFile(full)).kind, "sccm");
  const anyName = mk("rapor.xlsx", [[""], [""], [""], ["Hostname", "Serial Number", "LastLogon UserName", "Type", "İştirak", "C Free Space MB ", "C Size MB "], ["h", "s", "u", "Laptop", "TKAO", 9000, 100000]]);
  assert.equal((await detectFile(anyName)).kind, "sccm");
  const subset = mk("C Size Less Than 10 GB.xlsx", [[""], ["SCCM Inventory Report"], ["Hostname", "Serial Number", "LastLogon UserName", "Type", "C Free Space MB ", "C Size MB "], ["h", "s", "u", "Laptop", 9000, 100000]]);
  assert.equal((await detectFile(subset)).kind, "disk");
});

test("Lokasyon listesi iki biçimde de tanınır (Lokasyon Kodu/Mail Adresi ve Caption/Node_CP_ContactMail); yalnız 2 sütunlu eksik liste tanınmaz", async () => {
  const { detectFile } = await import("./fileDetect.js");
  const mk = (name, aoa) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "S");
    return new File([XLSX.write(wb, { type: "buffer", bookType: "xlsx" })], name);
  };
  assert.equal((await detectFile(mk("a.xlsx", [["Lokasyon Kodu", "Açık Lokasyon Adı", "Mail Adresi", "Node_CP_ContactMail2", "IP_Address"], ["X", "Y", "a@b", "c@d", "1.1.1.1"]]))).kind, "lokasyon");
  assert.equal((await detectFile(mk("b.xlsx", [["Caption", "Lokasyon", "Node_CP_ContactMail", "Node_CP_ContactMail2", "IP_Address"], ["X", "Y", "a@b", "c@d", "1.1.1.1"]]))).kind, "lokasyon");
  assert.equal((await detectFile(mk("c.xlsx", [["Lokasyon Kodu", "Açık Lokasyon Adı"], ["X", "Y"]]))).kind, null);
});
