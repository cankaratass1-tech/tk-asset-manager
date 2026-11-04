import test from "node:test";
import assert from "node:assert/strict";
import { computeDeviceHealth } from "./deviceHealthService.js";

const sccm = ["A", "B", "C", "D", "E"].map((x) => ({ serial: `S-${x}`, hostname: `H-${x}` }));

test("Aynı cihaz birden çok bulguda olsa da bir kez sayılır; SCCM dışı bulgular paydaya/oranı etkilemez", () => {
  const h = computeDeviceHealth({
    sccmRows: sccm,
    inaktifRows: [{ serial: "S-A" }, { serial: "S-X" }], // X SCCM'de yok
    zimmetBadRows: [{ serial: "S-A" }, { serial: "S-B" }, { serial: "MON-1" }], // monitör SCCM cihazı değil
    diskCriticalRows: [{ owner: "H-A" }, { owner: "H-C" }],
    unusedRows: [{ serial: "S-OBS-1" }, { serial: "S-OBS-2" }], // OBS, SCCM'de yok
  });
  assert.equal(h.devices, 5);
  assert.equal(h.problemDevices, 3); // A, B, C
  assert.equal(h.healthyDevices, 2);
  assert.equal(h.healthPct, 40);
  assert.equal(h.totalFindings, 9);
  assert.equal(h.outsideInventory, 4); // S-X, MON-1, 2 OBS
  assert.equal(h.inScope.inaktif + h.inScope.zimmet + h.inScope.disk + h.inScope.unused, 5);
});

test("Bulgu yoksa %100; envanter boşsa %0 (bölme hatası yok)", () => {
  assert.equal(computeDeviceHealth({ sccmRows: sccm }).healthPct, 100);
  assert.equal(computeDeviceHealth({}).healthPct, 0);
});
