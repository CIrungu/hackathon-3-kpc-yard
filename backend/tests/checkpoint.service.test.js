import { verifyCheckpoint, checkpointTrail } from "../src/services/checkpoint.service.js";
import { processGateEntry } from "../src/services/yard.service.js";

let token;

beforeAll(async () => {
  const entry = await processGateEntry({ regNo: "KDB 456Y", depot: "MBA" });
  token = entry.token;
});

describe("RFID Checkpoint Verification", () => {
  test("advances sequentially GATE → WEIGHBRIDGE", async () => {
    const first = await verifyCheckpoint({ token, checkpoint: "WEIGHBRIDGE" });
    expect(first.sequential).toBe(true);
    expect(first.checkpoint.checkpoint).toBe("WEIGHBRIDGE");

    const trailRes = await checkpointTrail(token);
    expect(trailRes.readings.map((r) => r.checkpoint)).toContain("WEIGHBRIDGE");
  });

  test("flags a skipped sequence as a breach", async () => {
    const breach = await verifyCheckpoint({
      token,
      checkpoint: "WEIGHBRIDGE",
    });
    // second weighbridge reading is not strictly ordered → flagged
    expect(breach.sequential).toBe(false);
  });

  test("rejects unknown tokens", async () => {
    await expect(verifyCheckpoint({ token: "KPC-MBA-00000000-000Z", checkpoint: "GATE" })).rejects.toThrow(/No active token/);
  });
});