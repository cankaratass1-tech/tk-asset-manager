import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { findHeaderRow, REQUIRED_COLUMNS } from "./headerRowFileService.js";

const sheetOf = (aoa) => XLSX.utils.aoa_to_sheet(aoa);

test("Monitör: başlık 1., 2. ya da 6. satırda olsa da bulunur", () => {
  const head = ["ID Monitor Serial Number", "Hostname", "Username"];
  for (const pad of [0, 1, 5]) {
    const sh = sheetOf([...Array(pad).fill(["Rapor"]), head, ["M1", "H1", "u"]]);
    assert.equal(findHeaderRow(sh, REQUIRED_COLUMNS.monitor, 1), pad, `üstte ${pad} satır`);
  }
});

test("Beklenen satırda gerekli sütunlar varsa o satır kalır (eşitlikte beklenen kazanır)", () => {
  const head = ["Hostname", "Serial Number", "Type", "Model", "LastLogon UserName", "LastLogonTime", "IPAddresses"];
  const sh = sheetOf([["r"], [""], [""], head, ["h", "s", "Laptop", "m", "u", "t", "ip"]]);
  assert.equal(findHeaderRow(sh, REQUIRED_COLUMNS.sccm, 3), 3);
});

test("Hiç eşleşme yoksa beklenen (fallback) satır döner", () => {
  const sh = sheetOf([["a", "b"], ["c", "d"]]);
  assert.equal(findHeaderRow(sh, REQUIRED_COLUMNS.monitor, 1), 1);
  assert.equal(findHeaderRow(null, REQUIRED_COLUMNS.monitor, 1), 1);
});

test("Büyük/küçük harf ve uç boşluklar fark etmez", () => {
  const sh = sheetOf([["  id monitor serial number ", "HOSTNAME", "username"], ["M", "H", "u"]]);
  assert.equal(findHeaderRow(sh, REQUIRED_COLUMNS.monitor, 1), 0);
});
