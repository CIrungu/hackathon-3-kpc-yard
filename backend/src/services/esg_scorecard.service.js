import { ref } from "../config/firebase.js";
import env from "../config/env.js";
import { getLiveBays, getLiveTrucks, now, hoursBetween, loadingDurationMinutes } from "./yard.service.js";

/**
 * ESG & Carbon-Spill Risk Scorecard.
 *
 * CO₂ ledger: every idle-hour prevented (queued truck that loaded sooner
 * than the legacy baseline turnaround) is an hour the engine did not idle,
 * so it maps to a concrete CO₂ saving. Spill-risk is a predictive per-bay
 * meter (Green/Amber/Red) derived from pump health, queue saturation and
 * load-hang stress signals — used to pre-empt an over-pressure/overflow
 * event before it happens.
 */
export const ESG_CONSTANTS = {
  idleCo2KgPerHour: env.co2.idleKgPerHour,
  treesPerKg: env.co2.treesPerKg,
};

const RULES = [
  { weight: 60, test: (bay) => bay.status === "DOWN", label: "bay down" },
  { weight: 35, test: (bay) => bay.status === "DEGRADED" || bay.status === "MAINTENANCE", label: "bay degraded" },
  { weight: 20, test: (bay) => Object.keys(bay.queuedVehicles ?? {}).length >= 5, label: "queue saturation" },
  {
    weight: 25,
    test: (bay) => {
      const truck = bay.currentVehicleCapacityLiters ? { capacityLiters: bay.currentVehicleCapacityLiters, loadStartedAt: bay.loadStartedAt } : null;
      if (!truck?.loadStartedAt) return false;
      const expected = loadingDurationMinutes(truck.capacityLiters, bay.pumpRateLpm);
      return isFinite(expected) && expected > 0 && hoursBetween(truck.loadStartedAt, now()) * 60 > expected * 1.35;
    },
    label: "pump stress / load hang",
  },
];

export function riskLevel(score) {
  if (score >= 70) return "RED";
  if (score >= 40) return "AMBER";
  return "GREEN";
}

export function baySpillRisk(bay) {
  let score = 15;
  const drivers = [];
  for (const rule of RULES) {
    if (rule.test(bay)) {
      score += rule.weight;
      drivers.push(rule.label);
    }
  }
  score = Math.min(100, Math.max(0, score));
  return { score, level: riskLevel(score), drivers };
}

/**
 * Live computation of the ESG scorecard. Stateless apart from the persisted
 * analytics ledger (hoursPrevented / completedCount) aggregated in stats.
 */
export async function computeEsgScorecard() {
  const [statsSnap, bays, trucks] = await Promise.all([
    ref("yard/stats/totals").once("value"),
    getLiveBays(),
    getLiveTrucks(),
  ]);
  const totals = statsSnap.val() ?? {};

  const completed = Object.values(trucks).filter((t) => t.id && t.status === "COMPLETED");
  const turnoverHours = completed.reduce(
    (s, t) => s + hoursBetween(t.enteredAt ?? now(), t.loadCompletedAt ?? now()),
    0,
  );
  const avgTurnaround = completed.length ? turnoverHours / completed.length : 0;

  const hoursPrevented = Number(totals.totalHoursPrevented ?? 0);
  const co2SavedKg = hoursPrevented * ESG_CONSTANTS.idleCo2KgPerHour;
  const treesEquivalent = co2SavedKg / ESG_CONSTANTS.treesPerKg;

  const hoursSinceMidnight = hourOfDay(now());
  const co2SavedPerHourRunRate = hoursSinceMidnight > 0 ? co2SavedKg / hoursSinceMidnight : 0;

  const perBay = Object.entries(bays).map(([bayId, bay]) => {
    const risk = baySpillRisk(bay);
    return {
      bayId,
      product: bay.product,
      status: bay.status,
      queueDepth: Object.keys(bay.queuedVehicles ?? {}).length,
      risk,
    };
  });

  const riskScores = perBay.map((b) => b.risk.score);
  const avgRiskScore = riskScores.length ? riskScores.reduce((s, x) => s + x, 0) / riskScores.length : 0;

  const worst = perBay.reduce((a, b) => (b.risk.score > (a?.risk.score ?? -1) ? b : a), null);
  const fleetEsgPct = Math.max(0, Math.min(100, Math.round(100 * (1 - avgRiskScore / 100))));

  return {
    generatedAt: now(),
    totals: {
      completedCount: Number(totals.completedCount ?? 0),
      hoursPrevented: Number(hoursPrevented.toFixed(2)),
      co2SavedKg: Number(co2SavedKg.toFixed(2)),
      co2SavedPerHourRunRate: Number(co2SavedPerHourRunRate.toFixed(3)),
      treesEquivalent: Number(treesEquivalent.toFixed(2)),
      avgTurnaroundHours: Number(avgTurnaround.toFixed(2)),
    },
    fleet: {
      esgScorePct: fleetEsgPct,
      spillRiskIndex: Number(avgRiskScore.toFixed(1)),
      worstBay: worst ? { bayId: worst.bayId, level: worst.risk.level, score: worst.risk.score } : null,
    },
    perBay,
    constants: {
      idleCo2KgPerHour: ESG_CONSTANTS.idleCo2KgPerHour,
      treesPerKg: ESG_CONSTANTS.treesPerKg,
      thresholds: { green: "<40", amber: "40–69", red: "≥70" },
    },
  };
}

function hourOfDay(ts) {
  const d = new Date(ts);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}