import { processGateEntry, allocateBayForTruck, startLoading } from "../src/services/yard.service.js";
import { simulatePumpFlow, dispatchPreMovementAlerts } from "../src/services/autoReroute.service.js";
import { verifyCheckpoint } from "../src/services/checkpoint.service.js";
import { ref } from "../src/config/firebase.js";

async function makeBay(id, pumpRateLpm = 1000) {
  await ref(`yard/bays/${id}`).set({
    name: `Gantry ${id}`,
    product: "PETROL",
    pumpRateLpm,
    status: "ACTIVE",
    currentVehicleToken: null,
    currentVehicleId: null,
    currentVehicleCapacityLiters: null,
    currentVehicleRemainingLiters: null,
    loadStartedAt: null,
    queuedVehicles: {},
    completedCount: 0,
  });
}

let truckLoadingId;
let truckUpNextRegNo;

describe("Autonomous Flow Simulation & Pre-Movement Alerts", () => {
  beforeAll(async () => {
    await makeBay("GN1", 1000);
    await ref("yard/manifest/vehicles/m1").set({
      regNo: "KEC 789Z",
      driver: "Peter Mwangi",
      driverPhone: "+254711000003",
      product: "PETROL",
      capacityLiters: 33000,
      status: "SCHEDULED",
    });
    await ref("yard/manifest/vehicles/m2").set({
      regNo: "KMJ 864F",
      driver: "Faith Akinyi",
      driverPhone: "+254711000009",
      product: "PETROL",
      capacityLiters: 34500,
      status: "SCHEDULED",
    });
    await ref("yard/manifest/vehicles/m3").set({
      regNo: "KFD 321A",
      driver: "Grace Njeri",
      driverPhone: "+254711000004",
      product: "PETROL",
      capacityLiters: 42000,
      status: "SCHEDULED",
    });
  });

  test("simulatePumpFlow advances remaining liters and reports progress", async () => {
    const { id } = await processGateEntry({ regNo: "KEC 789Z", depot: "MBA" });
    const { assignment } = await allocateBayForTruck(id);
    await startLoading(id, assignment.bayId);

    const bays = (await ref("yard/bays").once("value")).val();
    const trucks = (await ref("yard/trucks").once("value")).val();
    const { advanced } = await simulatePumpFlow(bays, trucks);

    expect(advanced.length).toBe(1);
    expect(advanced[0].regNo).toBe("KEC 789Z");
    expect(advanced[0].remainingLiters).toBeLessThan(33000);

    const bay = (await ref(`yard/bays/${assignment.bayId}`).once("value")).val();
    expect(bay.currentVehicleRemainingLiters).toBeLessThan(33000);
    expect(typeof bay.loadProgressPct).toBe("number");
  });

  test("drains a nearly-empty tank and auto-completes the load", async () => {
    const trucks = (await ref("yard/trucks").once("value")).val();
    const loading = Object.values(trucks).find((t) => t.status === "LOADING");
    expect(loading).toBeDefined();

    await ref(`yard/bays/${loading.bayId}`).update({ currentVehicleRemainingLiters: 5 });
    const bays = (await ref("yard/bays").once("value")).val();
    const res = await simulatePumpFlow(bays, trucks);

    expect(res.completed.length).toBe(1);
    const bay = (await ref(`yard/bays/${loading.bayId}`).once("value")).val();
    expect(bay.currentVehicleId).toBeFalsy();
    const truck = (await ref(`yard/trucks/${loading.id}`).once("value")).val();
    expect(truck.status).toBe("LOADED");
  });

  test("EXIT scan completes the journey and frees the plate", async () => {
    const trucks = (await ref("yard/trucks").once("value")).val();
    const loaded = Object.values(trucks).find((t) => t.status === "LOADED");
    expect(loaded).toBeDefined();

    const { checkpoint } = await verifyCheckpoint({ token: loaded.token, checkpoint: "EXIT" });
    expect(checkpoint.status).toBe("COMPLETED");
    expect(checkpoint.sequence).toBe(3);

    const after = (await ref(`yard/trucks/${loaded.id}`).once("value")).val();
    expect(after.status).toBe("COMPLETED");
    expect(after.checkpoint).toBe("EXIT");
    expect(after.lastEvent).toBe("EXITED");

    const stats = (await ref("yard/stats/totals").once("value")).val();
    expect(Number(stats.completedCount)).toBeGreaterThan(0);
  });

  test("dispatches a pre-movement SMS to the next queued driver inside the window", async () => {
    const lead = await processGateEntry({ regNo: "KFD 321A", depot: "MBA" });
    const leadAlloc = await allocateBayForTruck(lead.id);
    await startLoading(lead.id, leadAlloc.assignment.bayId);
    truckLoadingId = lead.id;

    const upNext = await processGateEntry({ regNo: "KMJ 864F", depot: "MBA" });
    await allocateBayForTruck(upNext.id);
    const nextTruck = (await ref(`yard/trucks/${upNext.id}`).once("value")).val();
    truckUpNextRegNo = nextTruck.regNo;
    expect(nextTruck.bayId).toBe(leadAlloc.assignment.bayId);

    await ref(`yard/trucks/${lead.id}`).update({ loadStartedAt: Date.now() - 38 * 60000 });
    const bays = (await ref("yard/bays").once("value")).val();
    const trucks = (await ref("yard/trucks").once("value")).val();
    const dispatched = await dispatchPreMovementAlerts(bays, trucks);

    expect(dispatched.length).toBe(1);
    expect(dispatched[0].movingUpRegNo).toBe(truckUpNextRegNo);
    expect(dispatched[0].progressPct).toBeGreaterThanOrEqual(90);
    expect(dispatched[0].sms.emulated).toBe(true);

    const fired = (await ref("yard/preMovement").once("value")).val();
    expect(Object.keys(fired)).toHaveLength(1);
  });

  test("does not re-dispatch the same loading window twice", async () => {
    const bays = (await ref("yard/bays").once("value")).val();
    const trucks = (await ref("yard/trucks").once("value")).val();
    const again = await dispatchPreMovementAlerts(bays, trucks);
    expect(again.length).toBe(0);
  });

  test("auto-starts the next staged truck when the gantry frees", async () => {
    const door = "GN2";
    await makeBay(door, 1000);
    await ref(`yard/bays/${door}`).update({
      currentVehicleId: "truck_lead",
      currentVehicleRegNo: "KEC 789Z",
      currentVehicleCapacityLiters: 33000,
      currentVehicleRemainingLiters: 5,
      loadStartedAt: Date.now(),
    });
    await ref(`yard/bays/${door}/queuedVehicles/truck_next`).set({
      token: "KPC-NXT",
      regNo: "KMJ 864F",
      product: "PETROL",
      capacityLiters: 34500,
      pumpRateLpm: 1000,
      enqueuedAt: Date.now(),
    });
    await ref("yard/trucks/truck_lead").set({
      id: "truck_lead",
      token: "KPC-LD",
      regNo: "KEC 789Z",
      product: "PETROL",
      capacityLiters: 33000,
      status: "LOADING",
      bayId: door,
      checkpoint: "GATE",
      loadStartedAt: Date.now(),
    });
    await ref("yard/trucks/truck_next").set({
      id: "truck_next",
      token: "KPC-NXT",
      regNo: "KMJ 864F",
      driverPhone: "+254711000009",
      product: "PETROL",
      capacityLiters: 34500,
      status: "QUEUED",
      bayId: door,
      checkpoint: "GATE",
    });

    const bays = (await ref("yard/bays").once("value")).val();
    const trucks = (await ref("yard/trucks").once("value")).val();
    const res = await simulatePumpFlow(bays, trucks);

    expect(res.completed.map((c) => c.truckId)).toContain("truck_lead");
    const bay = (await ref(`yard/bays/${door}`).once("value")).val();
    expect(bay.currentVehicleId).toBe("truck_next");
    expect(bay.loadProgressPct).toBe(0);
  });
});