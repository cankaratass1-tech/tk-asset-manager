import test from "node:test";
import assert from "node:assert/strict";
import { computeBottlenecks } from "./bottleneckService.js";

const sccm = (h, biosDate = "") => ({ hostname: h, serial: "S-" + h, biosDate, userLabel: "ali", location: "IST", company: "X", deviceModel: "T14" });

test("tek kritik sinyal darboğaz sayılır; tek uyarı sayılmaz; iki uyarı sayılır", () => {
  const { rows } = computeBottlenecks({
    sccmRows: [sccm("A"), sccm("B"), sccm("C"), sccm("D")],
    resourceRows: [
      { hostname: "a.corp", avgCpu: 92, avgRam: 40 },
      { hostname: "b.corp", avgCpu: 75, avgRam: 40 },
      { hostname: "c.corp", avgCpu: 75, avgRam: 85 },
      { hostname: "d.corp", avgCpu: 10, avgRam: 20 },
    ],
  });
  const m = Object.fromEntries(rows.map((r) => [r.hostname, r]));
  assert.equal(m.A.isBottleneck, true);
  assert.equal(m.A.primary, "cpu");
  assert.equal(m.B.isBottleneck, false);
  assert.equal(m.C.isBottleneck, true);
  assert.equal(m.D.isBottleneck, false);
  assert.equal(rows[0].hostname, "A");
});

test("hostname FQDN / büyük-küçük harf fark etmez; sinyaller birleşir", () => {
  const { rows, summary } = computeBottlenecks({
    sccmRows: [sccm("PC1", "2018-01-01")],
    diskRows: [
      { owner: "pc1", freeSpaceGb: 3, diskLevel: "critical", serial: "C" },
      { owner: "PC1", freeSpaceGb: 200, diskLevel: "normal", serial: "D" },
    ],
    bsodRows: [{ hostname: "PC1.corp.local", count: 2 }, { hostname: "pc1", count: 2 }],
    batteryRows: [{ hostname: "pc1.x", batteryHealth: 55, cycleCount: 900 }],
  });
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.signals.disk.level, "crit");
  assert.equal(r.signals.bsod.value, 4);
  assert.equal(r.signals.bsod.level, "crit");
  assert.equal(r.signals.battery.level, "crit");
  assert.equal(r.signals.age.level, "crit");
  assert.equal(r.signals.cpu.level, "none");
  assert.equal(summary.available.cpu, false);
  assert.equal(summary.available.disk, true);
});

test("cihaz yaşı tek başına darboğaz değil; tek uyarıyı destekleyince darboğaz", () => {
  const old = "2015-01-01";
  const { rows } = computeBottlenecks({
    sccmRows: [sccm("OLD", old), sccm("OLDWARN", old), sccm("NEWWARN", "2025-01-01")],
    resourceRows: [{ hostname: "oldwarn", avgCpu: 75 }, { hostname: "newwarn", avgCpu: 75 }],
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
  assert.equal(rows[0].signals.ram.text, "Veri Yok");
});
