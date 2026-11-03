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
