import { detector, runClosedLoopCycle } from "../src/services/autoReroute.service.js";
import { processGateEntry, allocateBayForTruck } from "../src/services/yard.service.js";
import { ref } from "../src/config/firebase.js";

async function makeDieselBay(id, status = "ACTIVE", queue = {}) {
  await ref(`yard/bays/${id}`).set({
    name: `Gantry ${id}`,
    product: "DIESEL",
    pumpRateLpm: 1200,
    status,
    queuedVehicles: queue,
  });
}

describe("Closed-Loop Anomaly Detection & Auto-Rerouting", () => {
  let truckId;

  beforeAll(async () => {
    await ref("yard/manifest/vehicles/b1").set({
      regNo: "KEC 789Z",
      driver: "Peter Mwangi",
      driverPhone: "+254711000003",
      product: "DIESEL",
      capacityLiters: 33000,
      status: "SCHEDULED",
    });
    await makeDieselBay("GX1", "ACTIVE");
    await makeDieselBay("GX2", "ACTIVE");
    const entry = await processGateEntry({ regNo: "KEC 789Z", depot: "MBA" });
    const { assignment } = await allocateBayForTruck(entry.id);
    truckId = entry.id;
    await makeDieselBay("GX3", "DOWN", {
      [truckId]: {
        token: entry.token,
        regNo: entry.regNo,
        product: entry.product,
        capacityLiters: entry.capacityLiters,
        pumpRateLpm: 1000,
        etaMinutes: 60,
      },
    });
    expect(assignment.bayId).toBeDefined();
  });

  test("detects a down bay and queue-depth breaches", async () => {
    const bays = (await ref("yard/bays").once("value")).val();
    const trucks = (await ref("yard/trucks").once("value")).val();
    const findings = await detector.scan(bays, trucks);
    expect(findings.some((f) => f.type === "BAY_DOWN")).toBe(true);
  });

  test("remediates the down bay by moving queued vehicles to a healthy bay", async () => {
    const anomaly = {
      type: "BAY_DOWN",
      bayId: "GX3",
      truckId: null,
      signature: "BAY_DOWN_GX3_GLOBAL",
      severity: "critical",
    };
    const movements = await detector.remediate(anomaly);
    expect(movements.length).toBe(1);
    expect(movements[0].fromBay).toBe("GX3");
    expect(["GX1", "GX2"]).toContain(movements[0].toBay);

    const g3 = (await ref("yard/bays/GX3").once("value")).val();
    expect(Object.keys(g3.queuedVehicles ?? {})).toHaveLength(0);
  });

  test("full closed-loop cycle runs without throwing", async () => {
    const result = await runClosedLoopCycle();
    expect(result.scanned).toBeDefined();
    expect(Array.isArray(result.anomalies)).toBe(true);
  });
});