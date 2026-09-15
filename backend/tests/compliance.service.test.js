import { scanCompliance, getComplianceSummary } from "../src/services/compliance.service.js";
import { processGateEntry, allocateBayForTruck } from "../src/services/yard.service.js";
import { ref } from "../src/config/firebase.js";

describe("Depot Speed & Transit Compliance Guard", () => {
  let fastId;
  let dwellId;

  beforeAll(async () => {
    await ref("yard/manifest/vehicles/c1").set({
      regNo: "KGE 654B",
      driver: "Charles Kiptoo",
      driverPhone: "+254711000005",
      product: "KEROSENE",
      capacityLiters: 30000,
      status: "SCHEDULED",
    });
    await ref("yard/manifest/vehicles/c2").set({
      regNo: "KHF 987C",
      driver: "Alice Chebet",
      driverPhone: "+254711000006",
      product: "KEROSENE",
      capacityLiters: 30000,
      status: "SCHEDULED",
    });

    const fast = await processGateEntry({ regNo: "KGE 654B", depot: "MBA" });
    fastId = fast.id;
    const dwell = await processGateEntry({ regNo: "KHF 987C", depot: "MBA" });
    dwellId = dwell.id;

    const t0 = Date.now();
    await ref(`yard/checkpoints/GATE/${fastId}`).set({ capturedAt: t0 - 30_000 });
    await ref(`yard/checkpoints/WEIGHBRIDGE/${fastId}`).set({ capturedAt: t0 });
    await ref(`yard/trucks/${fastId}`).update({ checkpoint: "WEIGHBRIDGE", status: "AT_WEIGHBRIDGE", updatedAt: t0 });

    await ref(`yard/checkpoints/GATE/${dwellId}`).set({ capturedAt: t0 - 45 * 60_000 });
    await ref(`yard/checkpoints/WEIGHBRIDGE/${dwellId}`).set({ capturedAt: t0 - 20 * 60_000 });
    await ref(`yard/trucks/${dwellId}`).update({ checkpoint: "WEIGHBRIDGE", status: "AT_WEIGHBRIDGE", updatedAt: t0 - 20 * 60_000 });
  });

  test("flags speed exceedances and over-dwell in a single scan", async () => {
    const bays = (await ref("yard/bays").once("value")).val();
    const trucks = (await ref("yard/trucks").once("value")).val();
    const violations = await scanCompliance(bays, trucks);

    const speed = violations.find((v) => v.type === "SPEED_EXCEEDED" && v.truckId === fastId);
    expect(speed).toBeDefined();
    expect(speed.segment).toBe("GATE:WEIGHBRIDGE");
    expect(speed.value).toBeGreaterThan(20);

    const dwell = violations.find((v) => v.type === "OVER_DWELL" && v.truckId === dwellId);
    expect(dwell).toBeDefined();
    expect(dwell.value).toBeGreaterThan(15);
  });

  test("aggregates a fleet compliance summary from the transit ledger", async () => {
    const summary = await getComplianceSummary();
    expect(summary.totalSegments).toBe(2);
    expect(summary.fleetCompliancePct).toBe(50);
    expect(summary.openViolations).toBeGreaterThanOrEqual(2);
    const gateSegment = summary.segmentStats.find((s) => s.from === "GATE");
    expect(gateSegment.samples).toBe(2);
  });
});