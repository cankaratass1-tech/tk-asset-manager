import test from "node:test";
import assert from "node:assert/strict";
import { bitlockerColumns, bitlockerTokens, cellHasZero, hasBitlockerZero, bitlockerAllOn } from "./bitlockerCheck.js";

test("BitLocker bölümü: başlığında 'bitlocker' geçen sütunlar (büyük/küçük harf ve Türkçe i fark etmez)", () => {
  assert.deepEqual(bitlockerColumns(["Hostname", "Bitlocker Enabled", "BitLocker C:", "BİTLOCKER D", "OUName"]), ["Bitlocker Enabled", "BitLocker C:", "BİTLOCKER D"]);
  assert.deepEqual(bitlockerColumns(["Hostname", "OUName"]), []);
  assert.deepEqual(bitlockerColumns(), []);
});

test("0 değeri: sayı, metin ve birden çok değerli hücreler", () => {
  for (const v of [0, "0", "0.0", " 0 ", "1;0", "1,1,0", "0|1", "1 0 1", "1/0", "0\n1", "No", "no", "Hayır", "FALSE", "Disabled", "Off", "Kapalı"]) assert.equal(cellHasZero(v), true, JSON.stringify(v));
  for (const v of [1, "1", "Yes", "1;1;1", "1, 1", "Enabled", "10", "01", "100", "", null, undefined, "—"]) assert.equal(cellHasZero(v), false, JSON.stringify(v));
  assert.deepEqual(bitlockerTokens(" 1 ; 0,\n1 "), ["1", "0", "1"]);
});

test("cihaz: BitLocker bölümündeki sütunların herhangi birinde 0 varsa sorunlu; hiç 0 yoksa sorunsuz; boş sorun sayılmaz", () => {
  const cols = ["Bitlocker C", "Bitlocker D"];
  assert.equal(hasBitlockerZero({ "Bitlocker C": 1, "Bitlocker D": 0 }, cols), true);
  assert.equal(hasBitlockerZero({ "Bitlocker C": "1;1", "Bitlocker D": "1" }, cols), false);
  assert.equal(hasBitlockerZero({ "Bitlocker C": "", "Bitlocker D": "" }, cols), false);
  assert.equal(hasBitlockerZero({ "Bitlocker C": "0" }, []), false); // BitLocker sütunu yoksa hiçbir cihaz işaretlenmez
  assert.equal(hasBitlockerZero(null, cols), false);
  assert.equal(hasBitlockerZero({ Hostname: "A", Diger: 0 }, cols), false); // BitLocker dışındaki sütunlardaki 0 sayılmaz
});

test("cihaz kartı: tüm değerler olumluysa açık, herhangi biri 0 ya da bilinmeyen ise açık değil", () => {
  assert.equal(bitlockerAllOn("Yes"), true);
  assert.equal(bitlockerAllOn("1;1"), true);
  assert.equal(bitlockerAllOn("1;0"), false);
  assert.equal(bitlockerAllOn("No"), false);
  assert.equal(bitlockerAllOn(""), false);
  assert.equal(bitlockerAllOn("Şifreli"), false);
});

import { unencryptedDiskLabels, bitlockerDiskSummary, diskLabelOf, ALL_ENCRYPTED } from "./bitlockerCheck.js";

test("değer sırası = disk: 1. değer C, 2. değer Q, 3. değer harici USB; 0 olan disk şifreli değil", () => {
  assert.deepEqual(unencryptedDiskLabels("0,1"), ["C diski"]);
  assert.deepEqual(unencryptedDiskLabels("1,0"), ["Q diski"]);
  assert.deepEqual(unencryptedDiskLabels("1;1;0"), ["Harici USB"]);
  assert.deepEqual(unencryptedDiskLabels("0,0,1"), ["C diski", "Q diski"]);
  assert.deepEqual(unencryptedDiskLabels("0 0 0"), ["C diski", "Q diski", "Harici USB"]);
  assert.deepEqual(unencryptedDiskLabels("1,1,1,0"), ["Ek disk 1"]);
  assert.deepEqual(unencryptedDiskLabels("1,1"), []);
  assert.deepEqual(unencryptedDiskLabels("No"), ["C diski"]); // tek değer x1 sayılır
  assert.deepEqual(unencryptedDiskLabels(0), ["C diski"]);
  assert.deepEqual(unencryptedDiskLabels(""), []);
  assert.equal(diskLabelOf(0), "C diski");
  assert.equal(diskLabelOf(5), "Ek disk 3");
});

test("satır özeti: şifrelenmeyen diskler, hiç 0 yoksa 'Tümü şifreli', veri yoksa boş; birden çok BitLocker sütununda sütun adı eklenir", () => {
  assert.equal(bitlockerDiskSummary({ "Bitlocker Enabled": "1,0,0" }, ["Bitlocker Enabled"]), "Q diski, Harici USB");
  assert.equal(bitlockerDiskSummary({ "Bitlocker Enabled": "1,1" }, ["Bitlocker Enabled"]), ALL_ENCRYPTED);
  assert.equal(bitlockerDiskSummary({ "Bitlocker Enabled": "" }, ["Bitlocker Enabled"]), "");
  assert.equal(bitlockerDiskSummary({ A: "1,0" }, []), "");
  assert.equal(bitlockerDiskSummary({ "BitLocker 1": "0,1", "BitLocker 2": "1,1" }, ["BitLocker 1", "BitLocker 2"]), "C diski (BitLocker 1)");
});
