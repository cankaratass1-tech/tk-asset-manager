import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAtilMonitorRows, REASON_ACTIVE, REASON_DEPOT_IDLE, REASON_DEPOT_USED, REASON_NOT_ATTACHED, REASON_USED_BY_OTHER } from "./atilMonitorService.js";

const mon = (serial, type, extra = {}) => ({ serial, deviceType: "MONITOR", assignmentType: type, model: "Dell P2419H", owner: "Ali Veli", ownerUsername: "ali.veli", ...extra });
const att = (serial, extra = {}) => ({ monitorSerial: serial, virtualMachine: "false", username: "ali.veli", ...extra });
const run = (thRows, monitorRows) => computeAtilMonitorRows({ thRows, monitorRows });
const serials = (list) => list.map((r) => r.monitorSerial).sort();
const find = (list, serial) => list.find((r) => r.monitorSerial === serial);

test("Warehouse, Site, Supplier ve boş kategori kapsam dışı; yalnızca User ve OBS değerlendirilir", () => {
  const res = run([mon("W1", "Warehouse"), mon("W2", "Site"), mon("W3", "Supplier"), mon("W4", ""), mon("U1", "User"), mon("O1", "OBS")], []);
  assert.deepEqual(serials(res.rows), ["O1", "U1"]);
  assert.equal(res.stats.excludedScope, 4);
  assert.equal(res.stats.inScope, 2);
});

test("monitör olmayan TH satırları (notebook vb.) dikkate alınmaz", () => {
  const res = run([{ serial: "N1", deviceType: "NOTEBOOK", assignmentType: "User" }], []);
  assert.equal(res.stats.thMonitorTotal, 0);
  assert.deepEqual(res.rows, []);
});

test("atıl: monitör raporunda satırı yok", () => {
  const res = run([mon("A1", "User")], [att("BASKA")]);
  assert.deepEqual(serials(res.stages.atil), ["A1"]);
  assert.equal(res.rows[0].reason, REASON_NOT_ATTACHED);
});

test("yalnızca sanal makinede görünen monitör atıl sayılır", () => {
  const res = run([mon("V1", "User")], [att("V1", { virtualMachine: "true" })]);
  assert.deepEqual(serials(res.stages.atil), ["V1"]);
});

test("aktif: raporda var ve zimmetli kişi kullanıyor", () => {
  const res = run([mon("C1", "User")], [att("C1")]);
  assert.deepEqual(serials(res.stages.active), ["C1"]);
  assert.equal(res.stages.active[0].reason, REASON_ACTIVE);
  assert.deepEqual(res.rows, []);
});

test("bilgi dışı kullanım: zimmetli kişi dışında biri kullanıyor (iki kullanıcı adı da var ve farklı)", () => {
  const res = run([mon("H1", "User")], [att("H1", { username: "Ayse.Demir" })]);
  assert.deepEqual(serials(res.stages.outside), ["H1"]);
  assert.equal(res.stages.outside[0].reason, REASON_USED_BY_OTHER);
  assert.equal(res.stages.outside[0].usedBy, "Ayse.Demir");
  assert.deepEqual(res.rows, []); // atıl değil
});

test("kullanıcı bilgisi yoksa ya da sahibin kullanıcı adı yoksa 'başkası kullanıyor' denmez", () => {
  const res = run(
    [mon("G3", "User"), mon("G4", "User", { ownerUsername: "" })],
    [att("G3", { username: "" }), att("G4", { username: "ayse.demir" })]
  );
  assert.deepEqual(serials(res.stages.active), ["G3", "G4"]);
  assert.equal(find(res.stages.inScope, "G3").usedByOther, false);
  assert.equal(find(res.stages.inScope, "G4").usedByOther, false);
});

test("kullanıcı adı karşılaştırması büyük/küçük harf farkını yok sayar", () => {
  const res = run([mon("G2", "User")], [att("G2", { username: "ALI.VELI" })]);
  assert.deepEqual(serials(res.stages.active), ["G2"]);
});

test("OBS monitörünü başkası kullanıyorsa bilgi dışı kullanım sayılmaz (herkes kullanabilir), User'da sayılır", () => {
  const res = run(
    [mon("OB1", "OBS", { ownerUsername: "mudurluk.sorumlusu" }), mon("US1", "User", { ownerUsername: "mudurluk.sorumlusu" })],
    [att("OB1", { username: "baska.kisi" }), att("US1", { username: "baska.kisi" })]
  );
  assert.deepEqual(serials(res.stages.active), ["OB1"]);
  assert.deepEqual(serials(res.stages.outside), ["US1"]);
  assert.equal(find(res.stages.inScope, "OB1").usedByOther, false);
});

test("OBS monitörü raporda yoksa atıl listesine girer, raporda varsa girmez", () => {
  const res = run([mon("OB2", "OBS"), mon("OB3", "OBS")], [att("OB3")]);
  assert.deepEqual(serials(res.rows), ["OB2"]);
  assert.equal(find(res.rows, "OB2").assignmentType, "OBS");
});

test("seri no büyük/küçük harf ve boşluk farkını yok sayar", () => {
  const res = run([mon(" ab12 ", "User")], [att("AB12")]);
  assert.equal(res.stats.active, 1);
  assert.equal(res.stats.atil, 0);
});

test("aynı monitör birden fazla satırda geçerse tek kayıt; kullanıcılardan biri sahibiyse bilgi dışı sayılmaz", () => {
  const res = run([mon("D1", "User")], [att("D1", { username: "baska.kisi" }), att("D1", { username: "ali.veli" })]);
  assert.equal(res.stats.inScope, 1);
  assert.deepEqual(serials(res.stages.active), ["D1"]);
});

test("sayaçlar tutarlı: aktif + bilgi dışı + atıl = kapsamdaki", () => {
  const res = run(
    [mon("F1", "User"), mon("F2", "User"), mon("F3", "User"), mon("F5", "Warehouse")],
    [att("F2"), att("F3", { username: "baska" })]
  );
  assert.deepEqual(res.stats, { thMonitorTotal: 4, excludedScope: 1, inScope: 3, active: 1, outside: 1, atil: 1, depotTotal: 1, depotUsed: 0 });
  assert.equal(res.stats.active + res.stats.outside + res.stats.atil, res.stats.inScope);
});

const depotMon = (serial, extra = {}) => mon(serial, "Warehouse", { owner: "", ownerUsername: "", _raw: { "Konum Kategorisi": "Warehouse" }, ...extra });

test("Zimmet Depoda görünen ama Monitor Raporu'nda kullanılan monitör ayrıca listelenir", () => {
  const res = run([depotMon("D1"), depotMon("D2"), depotMon("D3")], [att("D1", { username: "kisi.bir" }), att("D3", { virtualMachine: "true" })]);
  assert.deepEqual(serials(res.stages.depotUsed), ["D1"]); // D2 depoda duruyor (normal), D3 yalnızca sanal makinede
  assert.equal(res.stages.depotUsed[0].reason, REASON_DEPOT_USED);
  assert.equal(res.stages.depotUsed[0].usedBy, "kisi.bir");
  assert.equal(res.stages.depotUsed[0].usedByOther, false); // depoda sahip anlamlı değil
  assert.equal(res.stats.depotTotal, 3);
  assert.equal(res.stats.depotUsed, 1);
});

test("depo monitörleri atıl/aktif/kapsamdaki sayaçlarını etkilemez, atıl listesine girmez", () => {
  const res = run([depotMon("D4"), mon("U9", "User")], [att("D4"), att("U9")]);
  assert.deepEqual(res.rows, []);
  assert.equal(res.stats.inScope, 1);
  assert.equal(res.stats.active, 1);
  assert.equal(res.stats.depotUsed, 1);
});

test("durum alanında 'Zimmet Depoda' yazan (User/OBS olmayan) monitör de depo sayılır", () => {
  const res = run([mon("D5", "Site", { _raw: { Durum: "ZİMMET  DEPODA" } })], [att("D5")]);
  assert.deepEqual(serials(res.stages.depotUsed), ["D5"]);
});

test("User/OBS monitörü depotUsed'a girmez", () => {
  const res = run([mon("U1", "User"), mon("O1", "OBS")], [att("U1"), att("O1")]);
  assert.deepEqual(res.stages.depotUsed, []);
  assert.equal(res.stats.depotTotal, 0);
});

test("bilgi listeleri: tüm monitörler, kapsam dışı ve depodaki tüm monitörler (kullanılan + duran)", () => {
  const res = run(
    [mon("U1", "User"), depotMon("D1"), depotMon("D2"), mon("S1", "Site"), mon("O1", "OBS")],
    [att("U1"), att("D1")]
  );
  assert.deepEqual(serials(res.stages.all), ["D1", "D2", "O1", "S1", "U1"]);
  assert.deepEqual(serials(res.stages.excludedScope), ["D1", "D2", "S1"]);
  assert.deepEqual(serials(res.stages.depotAll), ["D1", "D2"]);
  assert.deepEqual(serials(res.stages.depotUsed), ["D1"]);
  assert.equal(find(res.stages.depotAll, "D2").reason, REASON_DEPOT_IDLE);
  assert.equal(find(res.stages.excludedScope, "S1").reason, "Kapsam dışı — Site");
  assert.equal(res.stats.excludedScope, 3);
  assert.equal(res.stats.thMonitorTotal, res.stages.all.length);
});

import { buildOtherUserMailPlan } from "./atilMonitorService.js";

test("bilgi dışı mail planı: kullanan kişiye toplu, maili olmayan ayrı, zimmetli kişi hariç", () => {
  const rows = [
    { usedByOther: true, ownerUsername: "ali.veli", usedBy: "ayse.kaya", monitorSerial: "M1" },
    { usedByOther: true, ownerUsername: "can.ak", usedBy: "ayse.kaya, can.ak", monitorSerial: "M2" },
    { usedByOther: true, ownerUsername: "ali.veli", usedBy: "yok.mail", monitorSerial: "M3" },
    { usedByOther: false, ownerUsername: "x", usedBy: "ayse.kaya", monitorSerial: "M4" },
  ];
  const thRows = [{ ownerUsername: "Ayse.Kaya", ownerMail: "ayse.kaya@mhy.com.tr" }];
  const plan = buildOtherUserMailPlan(rows, thRows);
  assert.equal(plan.recipients.length, 1);
  assert.equal(plan.recipients[0].mail, "ayse.kaya@mhy.com.tr");
  assert.deepEqual(plan.recipients[0].items.map((r) => r.monitorSerial), ["M1", "M2"]);
  assert.deepEqual(plan.noMail.map((n) => n.username), ["yok.mail"]);
});
