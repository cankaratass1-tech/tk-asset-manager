import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAtilMonitorRows, REASON_ACTIVE, REASON_DEPOT_IDLE, REASON_DEPOT_USED, REASON_NOT_ATTACHED, REASON_USED_BY_OTHER } from "./atilMonitorService.js";

const mon = (serial, type, extra = {}) => ({ serial, deviceType: "MONITOR", assignmentType: type, model: "Dell P2419H", owner: "Ali Veli", ownerUsername: "ali.veli", ...extra });
const att = (serial, extra = {}) => ({ monitorSerial: serial, virtualMachine: "false", username: "ali.veli", ...extra });
const run = (thRows, monitorRows) => computeAtilMonitorRows({ thRows, monitorRows });
const serials = (list) => list.map((r) => r.monitorSerial).sort();
const find = (list, serial) => list.find((r) => r.monitorSerial === serial);

test("Warehouse, Site, Supplier, boş ve OBS kategori kapsam dışı; yalnızca User değerlendirilir", () => {
  const res = run([mon("W1", "Warehouse"), mon("W2", "Site"), mon("W3", "Supplier"), mon("W4", ""), mon("U1", "User"), mon("O1", "OBS")], []);
  assert.deepEqual(serials(res.rows), ["U1"]);
  assert.equal(res.stats.excludedScope, 3);
  assert.equal(res.stats.inScope, 1);
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

test("OBS monitörü hiç gösterilmez; aynı durumdaki User monitörü bilgi dışı kullanım sayılır", () => {
  const res = run(
    [mon("OB1", "OBS", { ownerUsername: "mudurluk.sorumlusu" }), mon("US1", "User", { ownerUsername: "mudurluk.sorumlusu" })],
    [att("OB1", { username: "baska.kisi" }), att("US1", { username: "baska.kisi" })]
  );
  assert.deepEqual(serials(res.stages.outside), ["US1"]);
  assert.equal(find(res.stages.all, "OB1"), undefined, "OBS monitörü hiçbir listede yok");
});

test("OBS monitörü raporda yoksa da atıl listesine girmez (OBS hiç gösterilmez)", () => {
  const res = run([mon("OB2", "OBS"), mon("OB3", "OBS")], [att("OB3")]);
  assert.deepEqual(serials(res.rows), []);
  assert.equal(res.stats.thMonitorTotal, 0);
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
  assert.deepEqual(res.stats, { thMonitorTotal: 4, materialOrderExcluded: 0, excludedScope: 1, inScope: 3, active: 1, outside: 1, atil: 1, depotTotal: 1, depotUsed: 0 });
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
  const res = run([mon("D5", "Warehouse", { _raw: { Durum: "ZİMMET  DEPODA" } })], [att("D5")]);
  assert.deepEqual(serials(res.stages.depotUsed), ["D5"]);
});

test("User/OBS monitörü depotUsed'a girmez", () => {
  const res = run([mon("U1", "User"), mon("O1", "OBS")], [att("U1"), att("O1")]);
  assert.deepEqual(res.stages.depotUsed, []);
  assert.equal(res.stats.depotTotal, 0);
});

test("bilgi listeleri: tüm monitörler, kapsam dışı ve depodaki tüm monitörler (kullanılan + duran)", () => {
  const res = run(
    [mon("U1", "User"), depotMon("D1"), depotMon("D2"), mon("S1", "Site"), mon("O1", "OBS"), mon("W9", "Warehouse")],
    [att("U1"), att("D1")]
  );
  assert.deepEqual(serials(res.stages.all), ["D1", "D2", "U1", "W9"]);
  assert.deepEqual(serials(res.stages.excludedScope), ["D1", "D2", "W9"]);
  assert.deepEqual(serials(res.stages.depotAll), ["D1", "D2", "W9"]);
  assert.deepEqual(serials(res.stages.depotUsed), ["D1"]);
  assert.equal(find(res.stages.depotAll, "D2").reason, REASON_DEPOT_IDLE);
  assert.equal(find(res.stages.all, "S1"), undefined, "Site monitörü hiçbir listede yok");
  assert.equal(find(res.stages.all, "O1"), undefined, "OBS monitörü hiçbir listede yok");
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

// --- TuruncuHat v2: kullanıcı adı yok → e-posta (@ öncesi) yedeği ---
const v2mon = (serial, type, ownerMail) => ({ serial, deviceType: "MONITOR", assignmentType: type, model: "Dell P2419H", owner: "Ali Veli", ownerUsername: "", ownerMail });
const attM = (serial, username, mail) => ({ monitorSerial: serial, hostname: "H1", username, mail, virtualMachine: "" });

test("Bilgi dışı kullanım: kullanıcı adı yoksa e-posta ile bulunur (farklı kişi)", () => {
  const r = computeAtilMonitorRows({ thRows: [v2mon("M1", "User", "ali.veli@thy.com")], monitorRows: [attM("M1", "x_kisi", "baska@thy.com")] });
  assert.equal(r.stats.outside, 1);
  assert.equal(r.stages.outside[0].reason, REASON_USED_BY_OTHER);
});

test("Bilgi dışı kullanım: aynı kişi, alan adı farklı (thy.com / thyspor.com) → işaretlenmez", () => {
  const r = computeAtilMonitorRows({ thRows: [v2mon("M1", "User", "B.YENIYAZICI@THY.COM")], monitorRows: [attM("M1", "b_yeniyazici", "b.yeniyazici@thyspor.com")] });
  assert.equal(r.stats.outside, 0);
  assert.equal(r.stats.active, 1);
});

test("Bilgi dışı kullanım: e-posta karşılaştırılamıyorsa (monitör raporunda e-posta boş) işaretlenmez; OBS ve depo hiç aranmaz", () => {
  const noMail = computeAtilMonitorRows({ thRows: [v2mon("M1", "User", "ali.veli@thy.com")], monitorRows: [attM("M1", "x", "")] });
  assert.equal(noMail.stats.outside, 0);
  const obs = computeAtilMonitorRows({ thRows: [v2mon("M2", "OBS", "mud@thy.com")], monitorRows: [attM("M2", "x", "baska@thy.com")] });
  assert.equal(obs.stats.outside, 0);
});

test("Kullanıcı adı varsa o belirleyici (eski biçim değişmez): aynı kullanıcı adı, farklı e-posta olsa da işaretlenmez", () => {
  const th = { ...mon("M3", "User"), ownerMail: "a@thy.com" };
  const r = computeAtilMonitorRows({ thRows: [th], monitorRows: [attM("M3", "ali.veli", "baska@thy.com")] });
  assert.equal(r.stats.outside, 0);
  const diff = computeAtilMonitorRows({ thRows: [th], monitorRows: [attM("M3", "bir.baskasi", "a@thy.com")] });
  assert.equal(diff.stats.outside, 1);
});

// --- sicil yedeği ---
const v2s = (serial, ownerMail, ownerSicil) => ({ serial, deviceType: "MONITOR", assignmentType: "User", model: "Dell P2419H", owner: "Ali Veli", ownerUsername: "", ownerMail, ownerSicil });

test("Sicil yedeği: monitör raporunda Username sicil numarasıysa ve zimmet sahibinin siciliyle aynıysa (baştaki sıfır fark etmez) işaretlenmez", () => {
  const r = computeAtilMonitorRows({ thRows: [v2s("S1", "ali@thy.com", "092031")], monitorRows: [attM("S1", "92031", "")] });
  assert.equal(r.stats.outside, 0);
  assert.equal(r.stats.active, 1);
});

test("Sicil yedeği: farklı sicil → bilgi dışı (e-posta olmasa da); sicil eşleşirse e-posta farklı olsa bile aynı kişi", () => {
  const diff = computeAtilMonitorRows({ thRows: [v2s("S2", "", "111111")], monitorRows: [attM("S2", "222222", "")] });
  assert.equal(diff.stats.outside, 1);
  const same = computeAtilMonitorRows({ thRows: [v2s("S3", "ali@thy.com", "111111")], monitorRows: [attM("S3", "111111", "baska@thy.com")] });
  assert.equal(same.stats.outside, 0);
});

test("Sicil yedeği: Username rakam değilse (kullanıcı adı) sicil olarak yorumlanmaz; karşılaştırılacak veri yoksa işaretlenmez", () => {
  const none = computeAtilMonitorRows({ thRows: [v2s("S4", "", "111111")], monitorRows: [attM("S4", "x_kisi", "")] });
  assert.equal(none.stats.outside, 0);
});

// --- İşlemdeki Malzeme Emri ---
test("İşlemdeki Malzeme Emri (ATO) olan monitörler hiçbir gruba alınmaz; boş ya da '-' olanlar alınır", () => {
  const ths = [
    { ...mon("A1", "User"), materialOrder: "ATO-00301971" },
    { ...mon("A2", "OBS"), materialOrder: "ATO-00301969" },
    { ...mon("A3", "Warehouse"), materialOrder: "ATO-00298550" },
    { ...mon("A4", "User"), materialOrder: "-" },
    { ...mon("A5", "User"), materialOrder: "" },
    mon("A6", "User"),
  ];
  const r = computeAtilMonitorRows({ thRows: ths, monitorRows: [] });
  assert.equal(r.stats.materialOrderExcluded, 2);
  assert.equal(r.stats.thMonitorTotal, 3);
  assert.deepEqual(r.stages.atil.map((x) => x.monitorSerial).sort(), ["A4", "A5", "A6"]);
  assert.equal(r.stages.all.some((x) => ["A1", "A2", "A3"].includes(x.monitorSerial)), false);
  assert.equal(r.stats.atil + r.stats.outside + r.stats.active, r.stats.inScope);
});
