import { test } from "node:test";
import assert from "node:assert/strict";
import { computeThDepotSccmRows, hasExcludedIp, isIpInCidr, isIslemdekiMalzemeEmri, isZimmetDepoda, normalizeText } from "./thDepotSccmService.js";

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const th = (serial, status, extra = {}) => ({ serial, deviceType: "NOTEBOOK", _raw: { "Konum Kategorisi": status, ...extra } });
const sccm = (serial, ip, lastLogon = daysAgo(5)) => ({ serial, hostname: `H-${serial}`, ipAddresses: ip, lastLogonTime: lastLogon, userLabel: "ahmet.yilmaz" });
const run = (thRows, sccmRows) => computeThDepotSccmRows({ thRows, sccmRows });
const serials = (res) => res.rows.map((r) => r.serial).sort();

test("172.29.4.0/24 bloğu gerçek IP olarak kontrol edilir", () => {
  for (const ip of ["172.29.4.1", "172.29.4.25", "172.29.4.100", "172.29.4.254", "172.29.4.0", "172.29.4.255"]) assert.equal(isIpInCidr(ip), true, ip);
  // Düz string araması ("172.29.4" içeriyor mu) bunları yanlışlıkla hariç tutardı:
  for (const ip of ["172.29.40.5", "172.29.41.1", "172.29.5.1", "172.29.3.255", "10.172.29.4", "172.129.4.1", "1172.29.4.1"]) assert.equal(isIpInCidr(ip), false, ip);
  for (const ip of ["", "172.29.4", "172.29.4.256", "abc", "172.29.4.1.5", null, undefined]) assert.equal(isIpInCidr(ip), false, String(ip));
});

test("birden fazla IP varsa biri bloktaysa cihaz hariç tutulur", () => {
  assert.equal(hasExcludedIp("10.1.1.5, 172.29.4.77"), true);
  assert.equal(hasExcludedIp("10.1.1.5;172.29.40.7 192.168.0.2"), false);
  assert.equal(hasExcludedIp(""), false);
});

test("metin normalizasyonu: büyük/küçük harf, Türkçe karakter, boşluk", () => {
  for (const v of ["İşlemdeki Malzeme Emri", "İŞLEMDEKİ MALZEME EMRİ", "islemdeki malzeme emri", "  İşlemdeki   Malzeme  Emri  ", "işlemdeki malzeme emri (SAS-1)"]) {
    assert.equal(isIslemdekiMalzemeEmri({ _raw: { Durum: v } }), true, v);
  }
  assert.equal(normalizeText("İŞLEMDEKİ"), "islemdeki");
  assert.equal(isZimmetDepoda({ _raw: { Durum: "ZİMMET  DEPODA" } }), true);
  assert.equal(isZimmetDepoda({ _raw: { "Konum Kategorisi": "Warehouse" } }), true);
  assert.equal(isZimmetDepoda({ _raw: { "Konum Kategorisi": "User" } }), false);
});

test("Zimmet Depoda + SCCM aktif + normal IP -> rapora girer", () => {
  const res = run([th("A1", "Warehouse")], [sccm("A1", "10.20.30.40")]);
  assert.deepEqual(serials(res), ["A1"]);
  assert.equal(res.rows[0].thStatus, "Zimmet Depoda");
  assert.equal(res.rows[0].ip, "10.20.30.40");
});

test("172.29.4.x IP'li cihaz hariç, 172.29.40.x ve 172.29.5.x dahil", () => {
  const res = run(
    [th("B1", "Warehouse"), th("B2", "Warehouse"), th("B3", "Warehouse"), th("B4", "Warehouse")],
    [sccm("B1", "172.29.4.25"), sccm("B2", "172.29.40.5"), sccm("B3", "172.29.5.1"), sccm("B4", "10.0.0.9, 172.29.4.254")]
  );
  assert.deepEqual(serials(res), ["B2", "B3"]);
  assert.equal(res.stats.excludedIp, 2);
});

test("TH'de İşlemdeki Malzeme Emri olan cihaz SCCM'de çalışsa da hariç", () => {
  const res = run(
    [th("C1", "Warehouse", { Durum: "İŞLEMDEKİ MALZEME EMRİ" }), th("C2", "Warehouse", { Durum: "  işlemdeki   malzeme emri " }), th("C3", "Warehouse")],
    [sccm("C1", "10.0.0.1"), sccm("C2", "10.0.0.2"), sccm("C3", "10.0.0.3")]
  );
  assert.deepEqual(serials(res), ["C3"]);
  assert.equal(res.stats.excludedMaterialOrder, 2);
});

test("depoda olmayan, SCCM'de olmayan veya SCCM'de eski cihazlar rapora girmez", () => {
  const res = run(
    [th("D1", "User"), th("D2", "Warehouse"), th("D3", "Warehouse"), th("D4", "Warehouse")],
    [sccm("D1", "10.0.0.1"), sccm("D3", "10.0.0.3", daysAgo(400)), sccm("D4", "10.0.0.4", "")]
  );
  assert.deepEqual(serials(res), []);
  assert.equal(res.stats.depot, 3);
  assert.equal(res.stats.sccmMatched, 2);
  assert.equal(res.stats.sccmActive, 0);
});

test("filtre sırası: IP ve Malzeme Emri sayaçları yalnızca aktif cihazlar üzerinden sayılır", () => {
  const res = run(
    [th("E1", "Warehouse"), th("E2", "Warehouse", { Durum: "İşlemdeki Malzeme Emri" }), th("E3", "Warehouse", { Durum: "İşlemdeki Malzeme Emri" })],
    [sccm("E1", "172.29.4.9"), sccm("E2", "172.29.4.10"), sccm("E3", "10.0.0.7", daysAgo(500))]
  );
  assert.deepEqual(res.stats, { thTotal: 3, depot: 3, sccmMatched: 3, sccmActive: 2, excludedIp: 2, excludedMaterialOrder: 0, final: 0 });
});

test("çıkarılan cihazlar aşama listelerinde neden bilgisiyle görünür", () => {
  const res = run(
    [th("F1", "Warehouse"), th("F2", "Warehouse"), th("F3", "Warehouse", { Durum: "İşlemdeki Malzeme Emri" }), th("F4", "Warehouse")],
    [sccm("F1", "10.0.0.1"), sccm("F2", "172.29.4.50"), sccm("F3", "10.0.0.3")]
  );
  assert.deepEqual(res.stages.excludedIp.map((r) => r.serial), ["F2"]);
  assert.equal(res.stages.excludedIp[0].reason, "172.29.4.0/24 IP bloğunda");
  assert.deepEqual(res.stages.excludedMaterialOrder.map((r) => r.serial), ["F3"]);
  assert.deepEqual(res.stages.final.map((r) => r.serial), ["F1"]);
  assert.deepEqual(res.stages.depot.map((r) => r.serial).sort(), ["F1", "F2", "F3", "F4"]);
  assert.equal(res.stages.depot.find((r) => r.serial === "F4").reason, "SCCM'de yok (kapsam dışı)");
  assert.equal(res.stages.excludedIp.length, res.stats.excludedIp);
});
