import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { mapDiskRow } from "./diskRowFileService.js";
import { isCoreSccmRaw } from "./thCoreFilter.js";
import { findHeaderRow, REQUIRED_COLUMNS } from "./headerRowFileService.js";

test("Eski biçim (Name/Volume Name/Free Space/Size, MB) aynen çalışır", () => {
  const r = mapDiskRow({ Name: "IST1", "Volume Name": "Windows", "Free Space": 8192, Size: 262144, "Site Code": "IST" });
  assert.equal(r.owner, "IST1");
  assert.equal(r.freeSpaceGb, 8);
  assert.equal(r.diskLevel, "critical");
  assert.equal(r.siteCode, "IST");
  assert.equal(r.serial, "C");
});

test("'C Size Less Than' biçimi: uç boşluklu 'C Free Space MB ' / 'C Size MB ' sütunları okunur, sürücü C, lokasyon yedeği kullanılır", () => {
  const r = mapDiskRow({ Hostname: "ADA0B03", "C Free Space MB ": 9800, "C Size MB ": 152094, LastLogonLokasyon: "ADANA BINASI", Type: "Laptop" });
  assert.equal(r.owner, "ADA0B03");
  assert.equal(Math.round(r.freeSpaceGb * 10) / 10, 9.6);
  assert.equal(r.diskLevel, "critical");
  assert.equal(r.model, "9.6 GB");
  assert.equal(r.serial, "C");
  assert.equal(r.siteCode, "ADANA BINASI");
});

test("Boş alan sütunu yoksa 0 GB / kritik üretilmez (bilinmiyor)", () => {
  const r = mapDiskRow({ Hostname: "X" });
  assert.equal(r.freeSpaceGb, null);
  assert.equal(r.diskLevel, "unknown");
  assert.equal(r.model, "");
});

test("Type filtresi: yalnız Desktop/Laptop/Notebook; Type olmayan eski biçim etkilenmez", () => {
  const rows = [{ Type: "Laptop" }, { Type: "Desktop" }, { Type: "Server" }, { Type: "Virtual Machine" }, {}];
  assert.equal(rows.filter(isCoreSccmRaw).length, 3);
});

test("Başlık 6. satırda ve sütun adlarında uç boşluk olsa da disk başlığı bulunur", () => {
  const aoa = [[""], [""], ["SCCM Inventory Report"], [""], [""], ["Hostname", "", "Serial Number", "C Free Space MB ", "C Size MB "], ["H1", "", "S1", 9800, 152094]];
  assert.equal(findHeaderRow(XLSX.utils.aoa_to_sheet(aoa), REQUIRED_COLUMNS.disk, 5), 5);
});
