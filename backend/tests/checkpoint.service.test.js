import { verifyCheckpoint, checkpointTrail } from "../src/services/checkpoint.service.js";
import { processGateEntry, TRUCK_STATUS } from "../src/services/yard.service.js";
import { ref } from "../src/config/firebase.js";

let token;
let entryId;

beforeAll(async () => {
  await ref("yard/manifest/vehicles/cp1").set({
    regNo: "KDB 456Y",
    driver: "Mary Wambui",
    driverPhone: "+254711000002",
    product: "DIESEL",
    capacityLiters: 38000,
    status: "SCHEDULED",
  });
  await ref("yard/manifest/vehicles/cp_mismatch").set({
    regNo: "KFA 222F",
    driver: "Test Mismatch",
    driverPhone: "+254700000001",
    product: "DIESEL",
    capacityLiters: 38000,
    status: "SCHEDULED",
  });
  const entry = await processGateEntry({ regNo: "KDB 456Y", depot: "MBA" });
  token = entry.token;
  entryId = entry.id;
});

// KDB 456Y — DIESEL 38,000 L · expectedGross = 38000×0.85 + defaultTare(38000×0.45) = 49400 kg
const VALID_GROSS_KG = 49400;

describe("RFID Checkpoint Verification", () => {
  test("advances sequentially GATE → WEIGHBRIDGE with valid gross weight", async () => {
    const first = await verifyCheckpoint({ token, checkpoint: "WEIGHBRIDGE", payload: { grossWeightKg: VALID_GROSS_KG } });
    expect(first.sequential).toBe(true);
    expect(first.checkpoint.checkpoint).toBe("WEIGHBRIDGE");
    expect(first.checkpoint.status).toBe(TRUCK_STATUS.WEIGHBRIDGE_PASSED);
    expect(first.weight.pass).toBe(true);
    expect(first.checkpoint.weight.expectedGrossKg).toBe(49400);

    const truck = (await ref(`yard/trucks/${entryId}`).once("value")).val();
    expect(truck.weighedAt).toBeTruthy();
    expect(truck.grossWeightKg).toBe(VALID_GROSS_KG);
    expect(truck.weightPassed).toBe(true);

    const trailRes = await checkpointTrail(token);
    expect(trailRes.readings.map((r) => r.checkpoint)).toContain("WEIGHBRIDGE");
  });

  test("flags a second weighbridge scan as non-sequential", async () => {
    const breach = await verifyCheckpoint({
      token,
      checkpoint: "WEIGHBRIDGE",
      payload: { grossWeightKg: VALID_GROSS_KG },
    });
    expect(breach.sequential).toBe(false);
  });

  test("rejects weighbridge scan without grossWeightKg", async () => {
    await expect(verifyCheckpoint({ token, checkpoint: "WEIGHBRIDGE" })).rejects.toThrow(/gross weight/);
  });

  test("rejects unknown tokens", async () => {
    await expect(verifyCheckpoint({ token: "KPC-MBA-00000000-000Z", checkpoint: "GATE" })).rejects.toThrow(/No active token/);
  });
});

describe("Weighbridge gross-weight mismatch", () => {
  let mismatchToken;

  beforeAll(async () => {
    const entry = await processGateEntry({ regNo: "KFA 222F", depot: "MBA" });
    mismatchToken = entry.token;
  });

  test("holds a vehicle whose gross weight deviates beyond tolerance", async () => {
    await expect(
      verifyCheckpoint({ token: mismatchToken, checkpoint: "WEIGHBRIDGE", payload: { grossWeightKg: 70000 } }),
    ).rejects.toThrow(/weighbridge mismatch/);

    const trucks = (await ref("yard/trucks").once("value")).val();
    const mismatchTruck = Object.values(trucks).find((t) => t.token === mismatchToken);
    expect(mismatchTruck.status).toBe(TRUCK_STATUS.AT_WEIGHBRIDGE);
    expect(mismatchTruck.weightPassed).toBe(false);
    expect(mismatchTruck.grossWeightKg).toBe(70000);
  });

  test("corrective re-weigh with a valid gross clears the hold", async () => {
    // KFA 222F — DIESEL 38,000 L · expectedGross = 38000×0.85 + defaultTare(17100) = 49400 kg
    const retry = await verifyCheckpoint({
      token: mismatchToken,
      checkpoint: "WEIGHBRIDGE",
      payload: { grossWeightKg: 49400 },
    });
    expect(retry.sequential).toBe(true);
    expect(retry.weight.pass).toBe(true);
    expect(retry.checkpoint.status).toBe(TRUCK_STATUS.WEIGHBRIDGE_PASSED);
  });
});