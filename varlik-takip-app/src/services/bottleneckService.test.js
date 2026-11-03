import test from "node:test";
import assert from "node:assert/strict";
import { computeBottlenecks } from "./bottleneckService.js";

const sccm = (h, biosDate = "") => ({ hostname: h, serial: "S-" + h, biosDate, userLabel: "ali", location: "IST", company: "X", deviceModel: "T14" });
const disk = (h, level, gb) => ({ owner: h, freeSpaceGb: gb, diskLevel: level, serial: "C" });
const bat = (h, health) => ({ hostname: h, batteryHealth: health, cycleCount: 300 });

test("tek kritik sinyal darboğaz sayılır; tek uyarı sayılmaz; iki uyarı sayılır", () => {
  const { rows } = computeBottlenecks({
    sccmRows: [sccm("A"), sccm("B"), sccm("C"), sccm("D")],
    diskRows: [disk("a", "critical", 2), disk("b", "warning", 15), disk("c", "warning", 15), disk("d", "normal", 200)],
    batteryRows: [bat("c", 70)], // c: disk uyarı + pil uyarı = 2 uyarı
  });
  const m = Object.fromEntries(rows.map((r) => [r.hostname, r]));
  assert.equal(m.A.isBottleneck, true);
  assert.equal(m.A.primary, "disk");
  assert.equal(m.B.isBottleneck, false); // tek uyarı
  assert.equal(m.C.isBottleneck, true); // iki uyarı
  assert.equal(m.D.isBottleneck, false);
  assert.equal(rows[0].hostname, "A"); // kritik önce
});

test("hostname FQDN / büyük-küçük harf fark etmez; sinyaller birleşir; CPU/RAM sinyali yok", () => {
  const { rows, summary } = computeBottlenecks({
    sccmRows: [sccm("PC1", "2018-01-01")],
    diskRows: [disk("pc1", "critical", 3), disk("PC1", "normal", 200)],
    bsodRows: [{ hostname: "PC1.corp.local", count: 2 }, { hostname: "pc1", count: 2 }],
    batteryRows: [bat("pc1.x", 55)],
  });
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.signals.disk.level, "crit"); // en kötü birim
  assert.equal(r.signals.bsod.value, 4);
  assert.equal(r.signals.bsod.level, "crit");
  assert.equal(r.signals.battery.level, "crit");
  assert.equal(r.signals.age.level, "crit");
  assert.equal(r.signals.cpu, undefined);
  assert.equal(r.signals.ram, undefined);
  assert.deepEqual(Object.keys(summary.byCause).sort(), ["age", "battery", "bsod", "disk"]);
});

test("cihaz yaşı tek başına darboğaz değil; tek uyarıyı destekleyince darboğaz", () => {
  const old = "2015-01-01";
  const { rows } = computeBottlenecks({
    sccmRows: [sccm("OLD", old), sccm("OLDWARN", old), sccm("NEWWARN", "2025-01-01")],
    diskRows: [disk("oldwarn", "warning", 15), disk("newwarn", "warning", 15)],
  });
  const m = Object.fromEntries(rows.map((r) => [r.hostname, r]));
  assert.equal(m.OLD.signals.age.level, "crit");
  assert.equal(m.OLD.isBottleneck, false);
  assert.equal(m.OLDWARN.isBottleneck, true);
  assert.equal(m.NEWWARN.isBottleneck, false);
});

test("kaynak verisi olmayan cihaz 'Veri Yok' sinyalleriyle listelenir, darboğaz sayılmaz", () => {
  const { rows } = computeBottlenecks({ sccmRows: [sccm("Z")] });
  assert.equal(rows[0].isBottleneck, false);
  assert.equal(rows[0].signals.disk.text, "Veri Yok");
});

import { healthOf, bandOf, HEALTH_BANDS, HEALTH_PENALTY } from "./bottleneckService.js";

test("sağlık skoru: 100'den ceza düşülür; düşük skor = aksiyon; baskın soruna göre aksiyon sırası", () => {
  const { rows } = computeBottlenecks({
    sccmRows: [sccm("OK", "2025-01-01"), sccm("DISK"), sccm("AGEONLY", "2018-01-01"), sccm("WORST", "2015-01-01")],
    diskRows: [disk("ok", "normal", 300), disk("disk", "critical", 2), disk("worst", "critical", 1)],
    bsodRows: [{ hostname: "worst", count: 5 }],
    batteryRows: [bat("worst", 40), bat("ok", 95)],
  });
  const m = Object.fromEntries(rows.map((r) => [r.hostname, r]));
  assert.equal(m.OK.health, 100);
  assert.equal(m.OK.band, "good");
  assert.equal(m.DISK.health, 60); // disk kritik −40
  assert.equal(m.DISK.band, "action");
  assert.deepEqual(m.DISK.actions, ["Disk alanını boşalt ya da diski genişlet"]);
  assert.equal(m.AGEONLY.health, 85); // yaş kritik −15 → izle, darboğaz değil
  assert.equal(m.AGEONLY.band, "watch");
  assert.equal(m.AGEONLY.isBottleneck, false);
  assert.equal(m.WORST.health, 0); // 40+40+30+15 = 125 → 0'a kırpılır
  assert.equal(m.WORST.band, "urgent");
  assert.equal(m.WORST.actions.length, 4);
  assert.deepEqual(rows.map((r) => r.hostname), ["WORST", "DISK", "AGEONLY", "OK"]); // en düşük skor (en acil) üstte
  assert.equal(m.OK.measured, 3); // BSOD kaydı yok → "Veri Yok" (kayıt yokluğu "çökme yok" sayılmaz); disk, pil, yaş ölçüldü
});

test("bantlar ve sınırlar", () => {
  assert.deepEqual(HEALTH_BANDS.map((b) => b.id), ["good", "watch", "action", "urgent"]);
  const at = (h) => bandOf(h);
  assert.deepEqual([at(100), at(90), at(89), at(80), at(79), at(50), at(49), at(0), at(null)], ["good", "good", "watch", "watch", "action", "action", "urgent", "urgent", "nodata"]);
});

test("veri olmayan cihaz skor almaz (uydurulmaz), sonda listelenir; ölçülen sinyal sayısı bilinir", () => {
  const { rows, summary } = computeBottlenecks({ sccmRows: [sccm("Z"), sccm("D")], diskRows: [disk("d", "warning", 15)] });
  const m = Object.fromEntries(rows.map((r) => [r.hostname, r]));
  assert.equal(m.Z.health, null);
  assert.equal(m.Z.band, "nodata");
  assert.equal(m.D.health, 80); // yalnız disk ölçüldü (1/4), uyarı −20
  assert.equal(m.D.measured, 1);
  assert.equal(rows[rows.length - 1].hostname, "Z");
  assert.equal(summary.byBand.nodata, 1);
  assert.equal(summary.avgHealth, 80);
});

test("bottleneck ⇔ skor < 80: tüm sinyal kombinasyonlarında (4^4 = 256) tanım ve skor tutarlı", () => {
  const levels = ["ok", "warn", "crit", "none"];
  const ids = ["disk", "bsod", "battery", "age"];
  const orig = (lv) => { // eski darboğaz kuralının bağımsız kopyası
    const perf = [lv.disk, lv.bsod, lv.battery];
    const pc = perf.filter((l) => l === "crit").length, pw = perf.filter((l) => l === "warn").length;
    return pc >= 1 || pw >= 2 || (pw >= 1 && lv.age !== "ok" && lv.age !== "none");
  };
  let checked = 0;
  for (let n = 0; n < 256; n++) {
    const lv = Object.fromEntries(ids.map((id, i) => [id, levels[Math.floor(n / 4 ** i) % 4]]));
    const signals = Object.fromEntries(ids.map((id) => [id, { level: lv[id], value: 0, text: "" }]));
    const h = healthOf(signals);
    if (ids.every((id) => lv[id] === "none")) { assert.equal(h.health, null); continue; }
    assert.ok(h.health >= 0 && h.health <= 100, JSON.stringify(lv));
    assert.equal(orig(lv), h.health < 80, `${JSON.stringify(lv)} skor ${h.health}`);
    checked += 1;
  }
  assert.equal(checked, 255);
  assert.deepEqual(Object.keys(HEALTH_PENALTY).sort(), ["age", "battery", "bsod", "disk"]);
});
