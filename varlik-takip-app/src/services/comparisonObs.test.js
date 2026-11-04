import test from "node:test";
import assert from "node:assert/strict";
import { computeComparisonRows, latestPerSerial } from "./comparisonService.js";

const th = (o) => ({ serial: "", owner: "", ownerFull: "", ownerUsername: "", ownerSicil: "", deviceType: "DESKTOP", assignmentType: "User", model: "m", location: "L", company: "AJET", lbsParent: "", lastUpdated: "", ...o });
const sccm = (o) => ({ serial: "", hostname: "", userLabel: "", userFull: "", userSicil: "", sub: "Desktop — x", matched: true, statusTag: "Zimmet Doğru", owner: "", location: "L", company: "AJET", ...o });

test("OBS cihazlar Zimmet Uyuşmazlığı listesine HİÇ girmez (başkası kullansa da hatalı da doğru da sayılmaz)", () => {
  const rows = computeComparisonRows({
    thRows: [th({ serial: "OBS1", owner: "Finans Müdürlüğü", ownerUsername: "finans", assignmentType: "OBS" })],
    sccmRows: [sccm({ serial: "OBS1", hostname: "H1", userLabel: "ahmet" })],
  });
  assert.equal(rows.length, 0);
});

test("Aynı seri TH'de iki kez geçerse en güncel kayıt esas alınır (OBS güncel → eski User kaydı yanlış 'Zimmet Hatalı' üretmez, cihaz listede olmaz)", () => {
  const rows = computeComparisonRows({
    thRows: [
      th({ serial: "DUP1", owner: "Veli Kaya", ownerUsername: "veli", assignmentType: "User", lastUpdated: "2026-01-10" }),
      th({ serial: "DUP1", owner: "Finans Müdürlüğü", ownerUsername: "finans", assignmentType: "OBS", lastUpdated: "2026-09-01" }),
    ],
    sccmRows: [sccm({ serial: "DUP1", hostname: "H3", userLabel: "ahmet" })],
  });
  assert.equal(rows.length, 0);
});

test("Tersi: eski kayıt OBS, güncel kayıt User ise User esas alınır", () => {
  const rows = computeComparisonRows({
    thRows: [
      th({ serial: "DUP2", owner: "Finans Müdürlüğü", ownerUsername: "finans", assignmentType: "OBS", lastUpdated: "2026-01-10" }),
      th({ serial: "DUP2", owner: "Veli Kaya", ownerUsername: "veli", assignmentType: "User", lastUpdated: "2026-09-01" }),
    ],
    sccmRows: [sccm({ serial: "DUP2", hostname: "H4", userLabel: "veli" })],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].statusTag, "Zimmet Doğru");
});

test("OBS notebook listede olmaz ve sahibinin adı başka kişinin birden çok notebook zimmetiyle aynı olsa da o kişinin 'Birden Fazla Zimmet' kaydını etkilemez", () => {
  const rows = computeComparisonRows({
    thRows: [
      th({ serial: "NB1", deviceType: "NOTEBOOK", owner: "Ali Can", ownerUsername: "ali", assignmentType: "OBS" }),
      th({ serial: "NB2", deviceType: "NOTEBOOK", owner: "Ali Can", ownerUsername: "ali", assignmentType: "User" }),
      th({ serial: "NB3", deviceType: "NOTEBOOK", owner: "Ali Can", ownerUsername: "ali", assignmentType: "User" }),
    ],
    sccmRows: ["NB1", "NB2", "NB3"].map((s, i) => sccm({ serial: s, hostname: "N" + i, userLabel: i === 0 ? "ahmet" : "ali" })),
  });
  const by = Object.fromEntries(rows.map((r) => [r.serial, r.statusTag]));
  assert.equal(by.NB1, undefined, "OBS notebook listede yok");
  assert.equal(by.NB2, "Birden Fazla Zimmet Mevcut");
});

test("Kişinin PC'sine bağlı monitör OBS'ye zimmetliyse hiç gösterilmez (doğrulanamadı DEĞİL); OBS monitörün kendisi de listede olmaz", () => {
  const rows = computeComparisonRows({
    thRows: [
      th({ serial: "PC1", owner: "Ali Can", ownerUsername: "ali", assignmentType: "User" }),
      th({ serial: "MON1", deviceType: "MONITOR", owner: "Finans Müdürlüğü", ownerUsername: "finans", assignmentType: "OBS" }),
    ],
    sccmRows: [sccm({ serial: "PC1", hostname: "H1", userLabel: "ali" })],
    monitorRows: [{ monitorSerial: "MON1", hostname: "H1", username: "ali", mail: "", virtualMachine: "" }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].serial, "PC1");
  assert.equal(rows[0].statusTag, "Zimmet Doğru");
  assert.equal(rows[0].monitorUnverified, false);
  assert.equal(rows[0].monitorDetails.length, 0, "OBS monitörü PC satırında gösterilmez");
});

test("latestPerSerial: seri no'su boş satırlar korunur, sıra bozulmaz", () => {
  const rows = [th({ serial: "" }), th({ serial: "A", lastUpdated: "2026-01-01" }), th({ serial: "A", lastUpdated: "2026-02-01", owner: "yeni" }), th({ serial: "" })];
  const out = latestPerSerial(rows);
  assert.equal(out.length, 3);
  assert.equal(out[1].owner, "yeni");
});

test("compareAssignment: kullanıcı adı yoksa sicil, sicil biçimi farklıysa e-posta ile aynı kişi sayılır; farklı kişi hâlâ hatalı", async () => {
  const { compareAssignment } = await import("./comparisonService.js");
  assert.deepEqual(compareAssignment({ actualSicil: "92031", thSicil: "092031", actualMail: "a@thy.com", thMail: "A@THY.COM" }), { verifiable: true, isMatch: true, verifiedBy: "e-posta adresiyle" });
  assert.equal(compareAssignment({ actualSicil: "TKNBGORMUS", thSicil: "933349", actualMail: "TKNBGORMUS@THY.COM", thMail: "SYEGIN@THY.COM" }).isMatch, false);
  assert.deepEqual(compareAssignment({ actualMail: "x@thy.com", thMail: "x@thy.com" }), { verifiable: true, isMatch: true, verifiedBy: "e-posta adresiyle" });
  assert.equal(compareAssignment({ actualSicil: "1", thSicil: "1" }).verifiedBy, "sicil numarasıyla");
  assert.equal(compareAssignment({ actualUsername: "u1", thUsername: "u2", actualMail: "a@x", thMail: "a@x" }).isMatch, false, "kullanıcı adı varsa o belirleyici");
  assert.equal(compareAssignment({}).verifiable, false);
});
