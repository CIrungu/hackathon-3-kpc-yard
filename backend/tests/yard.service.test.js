import { loadingDurationMinutes, processGateEntry, matchBay, allocateBayForTruck, startLoading, completeLoading, generateToken, TRUCK_STATUS } from "../src/services/yard.service.js";
import { ref } from "../src/config/firebase.js";

beforeAll(async () => {
  await ref("yard/bays/G1").set({
    name: "Gantry 1",
    product: "DIESEL",
    pumpRateLpm: 1200,
    status: "ACTIVE",
    queuedVehicles: {},
  });
  await ref("yard/bays/G3").set({
    name: "Gantry 3",
    product: "PETROL",
    pumpRateLpm: 1100,
    status: "ACTIVE",
    queuedVehicles: {},
  });
  await ref("yard/manifest/vehicles/b1").set({
    regNo: "KCA 123X",
    driver: "James Otieno",
    driverPhone: "+254711000001",
    product: "DIESEL",
    capacityLiters: 45000,
    status: "SCHEDULED",
  });
  await ref("yard/manifest/vehicles/b2").set({
    regNo: "KNK 753G",
    driver: "George Barasa",
    driverPhone: "+254711000010",
    product: "DIESEL",
    capacityLiters: 41000,
    status: "SCHEDULED",
  });
  await ref("yard/manifest/vehicles/b3").set({
    regNo: "KMJ 864F",
    driver: "Faith Akinyi",
    driverPhone: "+254711000009",
    product: "PETROL",
    capacityLiters: 34500,
    status: "SCHEDULED",
  });
});

describe("ANPR & Digital Token Issuance", () => {
  test("token matches KPC-MBA-YYYYMMDD-SEQZ pattern", () => {
    expect(generateToken("MBA")).toMatch(/^KPC-MBA-\d{8}-\d+Z$/);
  });

  test("enforces uniqueness for active plates", async () => {
    const first = await processGateEntry({ regNo: "KCA 123X", depot: "MBA" });
    expect(first.token).toMatch(/^KPC-MBA-\d{8}-\d+Z$/);
    expect(first.manifestVerified).toBe(true);

    await expect(processGateEntry({ regNo: "KCA 123X", depot: "MBA" })).rejects.toThrow(/already has an active token/);
  });

  test("unknown plate still gets a token but unverified", async () => {
    const entry = await processGateEntry({ regNo: "ZZZ 000Z", depot: "MBA" });
    expect(entry.manifestVerified).toBe(false);
  });
});

describe("AI Flow-Rate & Bay Matching", () => {
  test("loading duration is liters / pump rate", () => {
    expect(loadingDurationMinutes(45000, 1200)).toBe(37.5);
    expect(loadingDurationMinutes(30000, 1000)).toBe(30);
    expect(loadingDurationMinutes(0, 1000)).toBe(0);
  });

  test("matches a DIESEL truck to the DIESEL bay", async () => {
    const truck = {
      id: "t1",
      token: "KPC-MBA-20260912-100Z",
      regNo: "KKH 135E",
      product: "DIESEL",
      capacityLiters: 45000,
    };
    const { bayId } = await matchBay(truck);
    expect(bayId).toBe("G1");
  });

  test("allocateBayForTruck queues the truck to the best bay", async () => {
    const entry = await processGateEntry({ regNo: "KNK 753G", depot: "MBA" });
    const { truck, assignment } = await allocateBayForTruck(entry.id);
    expect(truck.status).toBe(TRUCK_STATUS.QUEUED);
    expect(assignment.bayId).toBe("G1");
    expect(assignment.forecastLoadMinutes).toBe(34);
  });
});

describe("Loading lifecycle (start → complete)", () => {
  test("startLoading moves a truck to LOADING and completeLoading releases the bay", async () => {
    const { id } = await processGateEntry({ regNo: "KMJ 864F", depot: "MBA" });
    const { assignment } = await allocateBayForTruck(id);
    const bayId = assignment.bayId;

    const started = await startLoading(id, bayId);
    expect(started.status).toBe(TRUCK_STATUS.LOADING);
    expect(started.bayId).toBe(bayId);

    const baySnap = await ref(`yard/bays/${bayId}`).once("value");
    expect(baySnap.val().currentVehicleId).toBe(id);

    const { completed, efficiencyPct } = await completeLoading(id, bayId, { pumpRateLpm: 1100 });
    expect(completed.status).toBe(TRUCK_STATUS.COMPLETED);
    expect(completed.loadCompletedAt).toBeTruthy();
    expect(efficiencyPct).toBeGreaterThan(0);

    const bayAfter = await ref(`yard/bays/${bayId}`).once("value");
    expect(bayAfter.val().currentVehicleId).toBeFalsy();
  });
});