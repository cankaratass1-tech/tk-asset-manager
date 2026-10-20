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
