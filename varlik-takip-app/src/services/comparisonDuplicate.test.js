import test from "node:test";
import assert from "node:assert/strict";
import { computeComparisonRows } from "./comparisonService.js";

const th = (serial, owner, extra = {}) => ({ serial, deviceType: "NOTEBOOK", assignmentType: "User", owner, ownerUsername: owner, ownerMail: `${owner}@x.com`, model: "T14", _raw: {}, ...extra });
const sccm = (serial, user) => ({ serial, userLabel: user, userSicil: "", mail: `${user}@x.com`, hostname: `H-${serial}`, lastLogonTime: "2026-10-30T10:00:00", deviceModel: "T14", _raw: {} });
const run = (thRows, sccmRows) => Object.fromEntries(computeComparisonRows({ thRows, sccmRows }).filter((r) => r.serial).map((r) => [r.serial, r]));

test("X'e 3 notebook zimmetli, üçünü de başka kişiler kullanıyor: kullananlar 'Zimmet Hatalı' (transfer) kalır, sahibin bilgisi satırda", () => {
  const rows = run([th("S1", "x"), th("S2", "x"), th("S3", "x")], [sccm("S1", "ali"), sccm("S2", "veli"), sccm("S3", "can")]);
  for (const sn of ["S1", "S2", "S3"]) {
    assert.equal(rows[sn].statusTag, "Zimmet Hatalı", sn);
    assert.equal(rows[sn].duplicateDevices.length, 3, sn);
    assert.equal(rows[sn].ownerMail, "x@x.com");
  }
  assert.deepEqual(rows.S1.duplicateDevices.map((d) => d.user), ["ali", "veli", "can"]);
});

test("X 2 cihazı kendisi, 1 cihazı Y kullanıyor: X'in satırları 'Birden Fazla Zimmet Mevcut', Y'nin satırı 'Zimmet Hatalı'", () => {
  const rows = run([th("S1", "x"), th("S2", "x"), th("S3", "x")], [sccm("S1", "x"), sccm("S2", "x"), sccm("S3", "y")]);
  assert.equal(rows.S1.statusTag, "Birden Fazla Zimmet Mevcut");
  assert.equal(rows.S2.statusTag, "Birden Fazla Zimmet Mevcut");
  assert.equal(rows.S3.statusTag, "Zimmet Hatalı");
  assert.equal(rows.S3.duplicateDevices.length, 3);
});

test("tek notebook zimmetli kişide 'birden fazla zimmet' yok; başkası kullanıyorsa yine yalnız 'Zimmet Hatalı'", () => {
  const rows = run([th("S1", "x"), th("S2", "z")], [sccm("S1", "x"), sccm("S2", "ali")]);
  assert.equal(rows.S1.statusTag, "Zimmet Doğru");
  assert.equal(rows.S2.statusTag, "Zimmet Hatalı");
  assert.equal(rows.S2.duplicateDevices.length, 0);
});
