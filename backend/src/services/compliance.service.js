import { ref } from "../config/firebase.js";
import { notifyEvent } from "./eventBus.js";
import { now } from "./yard.service.js";

/**
 * Depot transit & speed compliance guard.
 *
 * The yard is treated as a geofenced route: Gate → Weighbridge → Holding yard
 * → Gantry → Exit. Each segment has a known distance and speed limit, so
 * checkpoint crossing timestamps give an observed average speed; dwell time
 * is measured against a cap per stage. Violations are surfaced as SLA alerts
 * and drive the fleet compliance score on the executive dashboard.
 */
export const SEGMENTS = [
  { from: "GATE", to: "WEIGHBRIDGE", distanceM: 280, speedLimitKph: 20 },
  { from: "WEIGHBRIDGE", to: "GANTRY", distanceM: 420, speedLimitKph: 15 },
  { from: "GANTRY", to: "EXIT", distanceM: 360, speedLimitKph: 25 },
];

const DWELL_LIMITS_MIN = {
  GATE: 20,
  WEIGHBRIDGE: 15,
  GANTRY: 30,
};

const PATH_VIOLATIONS = "yard/compliance/violations";
const PATH_TRAIL = "yard/checkpoints";

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Scan all trucks for speed + dwell compliance violations and persist new
 * findings (deduped by signature while OPEN). Emits a `compliance:violation`
 * stream event per new violation.
 */
export async function scanCompliance(bays, trucks) {
  const violations = [];

  const [trailSnap, openSnap] = await Promise.all([
    ref(PATH_TRAIL).once("value"),
    ref(PATH_VIOLATIONS).once("value"),
  ]);
  const trail = trailSnap.val() ?? {};
  const open = openSnap.val() ?? {};

  for (const [id, truck] of Object.entries(trucks)) {
    if (!truck?.id) continue;

    for (const seg of SEGMENTS) {
      const fromTs = trail?.[seg.from]?.[id]?.capturedAt;
      const toTs = trail?.[seg.to]?.[id]?.capturedAt;
      if (!fromTs || !toTs) continue;

      const elapsedSec = Math.max(0, (toTs - fromTs) / 1000);
      if (elapsedSec < 20) continue;

      const speedKph = (seg.distanceM / 1000) / (elapsedSec / 3600);
      if (speedKph <= seg.speedLimitKph) continue;

      await registerViolation(open, violations, {
        type: "SPEED_EXCEEDED",
        segment: `${seg.from}:${seg.to}`,
        truckId: id,
        regNo: truck.regNo,
        value: round2(speedKph),
        limit: seg.speedLimitKph,
        unit: "km/h",
        severity: "warning",
        message: `Truck ${truck.regNo} hit ${round2(speedKph)} km/h on ${seg.from}→${seg.to} (limit ${seg.speedLimitKph} km/h)`,
      });
    }

    if (["COMPLETED", "LOADING"].includes(truck.status)) continue;

    const stage = truck.checkpoint;
    const dwellLimit = DWELL_LIMITS_MIN[stage];
    if (!dwellLimit) continue;

    const baseTs = truck.updatedAt ?? truck.enteredAt;
    const dwellMin = (now() - baseTs) / 60000;
    if (dwellMin <= dwellLimit) continue;

    await registerViolation(open, violations, {
      type: "OVER_DWELL",
      segment: stage,
      truckId: id,
      regNo: truck.regNo,
      value: round2(dwellMin),
      limit: dwellLimit,
      unit: "min",
      severity: "warning",
      message: `Truck ${truck.regNo} stationary ${Math.round(dwellMin)} min at ${stage} (max ${dwellLimit} min)`,
    });
  }

  return violations;
}

async function registerViolation(open, violations, fact) {
  const signature = `${fact.type}_${fact.segment.replace(":", "_")}_${fact.truckId}`;
  const existing = Object.values(open).find((o) => o.status === "OPEN" && o.signature === signature);
  if (existing) return;

  const violation = {
    ...fact,
    signature,
    detectedAt: now(),
    status: "OPEN",
  };
  await ref(`${PATH_VIOLATIONS}/${signature}`).set(violation);
  open[signature] = violation;
  violations.push(violation);

  await notifyEvent("compliance:violation", {
    signature,
    type: violation.type,
    segment: violation.segment,
    truckId: violation.truckId,
    regNo: violation.regNo,
    value: violation.value,
    limit: violation.limit,
    unit: violation.unit,
    message: violation.message,
    timestamp: now(),
  });
}

export async function resolveComplianceViolation(signature, resolution = "MANUAL_ACK", notes = null) {
  const snap = await ref(`${PATH_VIOLATIONS}/${signature}`).once("value");
  if (!snap.exists()) return null;
  await ref(`${PATH_VIOLATIONS}/${signature}`).update({
    status: "RESOLVED",
    resolvedAt: now(),
    resolution,
    notes,
  });
  return { signature, status: "RESOLVED", resolvedAt: now() };
}

export async function listOpenComplianceViolations() {
  const snap = await ref(PATH_VIOLATIONS).once("value");
  return Object.values(snap.val() ?? {}).filter((v) => v.status === "OPEN" || v.status == null);
}

/**
 * Aggregate fleet transit telemetry for the executive compliance widget:
 * per-segment average speed/transit time and an overall compliance score.
 */
export async function getComplianceSummary() {
  const [trailSnap, violationsSnap] = await Promise.all([
    ref(PATH_TRAIL).once("value"),
    ref(PATH_VIOLATIONS).once("value"),
  ]);
  const trail = trailSnap.val() ?? {};
  const violations = violationsSnap.val() ?? {};
  const open = Object.values(violations).filter((v) => v.status === "OPEN" || v.status == null);

  const segmentStats = [];
  let totalSegments = 0;
  let compliantSegments = 0;

  for (const seg of SEGMENTS) {
    const samples = [];
    for (const [truckId, readings] of Object.entries(trail?.[seg.to] ?? {})) {
      const fromTs = trail?.[seg.from]?.[truckId]?.capturedAt;
      const toTs = readings?.capturedAt;
      if (!fromTs || !toTs || toTs <= fromTs) continue;
      const elapsedSec = (toTs - fromTs) / 1000;
      if (elapsedSec < 20) continue;
      const speedKph = (seg.distanceM / 1000) / (elapsedSec / 3600);
      samples.push({ truckId, speedKph, transitMin: elapsedSec / 60, compliant: speedKph <= seg.speedLimitKph });
    }
    totalSegments += samples.length;
    compliantSegments += samples.filter((s) => s.compliant).length;
    segmentStats.push({
      from: seg.from,
      to: seg.to,
      distanceM: seg.distanceM,
      speedLimitKph: seg.speedLimitKph,
      samples: samples.length,
      avgSpeedKph: samples.length ? round2(samples.reduce((s, x) => s + x.speedKph, 0) / samples.length) : null,
      avgTransitMin: samples.length ? round2(samples.reduce((s, x) => s + x.transitMin, 0) / samples.length) : null,
      violations: samples.filter((s) => !s.compliant).length,
    });
  }

  return {
    generatedAt: now(),
    fleetCompliancePct: totalSegments ? Math.round((compliantSegments / totalSegments) * 100) : 100,
    totalSegments,
    compliantSegments,
    openViolations: open.length,
    segmentStats,
    open: open.map((v) => ({ signature: v.signature, type: v.type, segment: v.segment, regNo: v.regNo, value: v.value, limit: v.limit, unit: v.unit, message: v.message })),
  };
}