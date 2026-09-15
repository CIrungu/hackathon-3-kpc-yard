import { computeEsgScorecard, baySpillRisk, riskLevel } from "../src/services/esg_scorecard.service.js";
import { ref } from "../src/config/firebase.js";

describe("ESG & Carbon-Spill Risk Scorecard", () => {
  beforeAll(async () => {
    await ref("yard/bays/EG1").set({
      name: "Gantry EG1",
      product: "DIESEL",
      pumpRateLpm: 1200,
      status: "ACTIVE",
      queuedVehicles: {},
    });
    await ref("yard/bays/EG2").set({
      name: "Gantry EG2",
      product: "PETROL",
      pumpRateLpm: 1100,
      status: "DOWN",
      queuedVehicles: {},
    });
    await ref("yard/stats/totals").set({
      completedCount: 2,
      totalHoursPrevented: 10,
    });
  });

  test("healthy bay scores GREEN, down bay scores RED", () => {
    expect(riskLevel(baySpillRisk({ status: "ACTIVE", queuedVehicles: {} }).score)).toBe("GREEN");
    const down = baySpillRisk({ status: "DOWN", queuedVehicles: {} });
    expect(down.level).toBe("RED");
    expect(down.drivers).toContain("bay down");
  });

  test("computes CO2 saved from prevented idle-hours", async () => {
    const scorecard = await computeEsgScorecard();
    expect(scorecard.totals.co2SavedKg).toBeCloseTo(26.8, 1);
    expect(scorecard.totals.treesEquivalent).toBeGreaterThan(1);
  });

  test("exposes a per-bay spill-risk meter and fleet score", async () => {
    const scorecard = await computeEsgScorecard();
    const downBay = scorecard.perBay.find((b) => b.bayId === "EG2");
    expect(downBay.risk.level).toBe("RED");
    expect(scorecard.fleet.worstBay.bayId).toBe("EG2");
    expect(scorecard.fleet.esgScorePct).toBeGreaterThan(0);
    expect(scorecard.fleet.esgScorePct).toBeLessThan(100);
  });
});