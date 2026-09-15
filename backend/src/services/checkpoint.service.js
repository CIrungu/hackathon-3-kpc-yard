import { ref } from "../config/firebase.js";
import { notifyEvent } from "./eventBus.js";
import { ApiError } from "../middleware/errorHandler.js";
import { TRUCK_STATUS, verifyGrossWeight } from "./yard.service.js";
import { recordCompletion } from "./analytics.service.js";

export const CHECKPOINTS = ["GATE", "WEIGHBRIDGE", "GANTRY", "EXIT"];

const STATUS_BY_CHECKPOINT = {
  GATE: TRUCK_STATUS.WAITING,
  WEIGHBRIDGE: TRUCK_STATUS.AT_WEIGHBRIDGE,
  GANTRY: TRUCK_STATUS.QUEUED,
  EXIT: TRUCK_STATUS.COMPLETED,
};

/**
 * Verify an RFID checkpoint reading for a truck.
 * Enforces strict ordering Gate → Weighbridge → Gantry (→ Exit) so that a
 * truck cannot skip ahead and displace service order. EXIT is the real
 * terminal step: only a truck whose gantry load has finished (LOADED) is
 * cleared to drive out, at which point it is completed and its plate freed.
 */
export async function verifyCheckpoint({ token, checkpoint, rfidReaderId = null, payload = null }) {
  if (!token || !checkpoint) throw ApiError.badRequest("token and checkpoint are required");

  const truckSnap = await ref("yard/trucks").once("value");
  const trucks = truckSnap.val() ?? {};
  const entry = Object.values(trucks).find(
    (t) => t.token && t.token.toUpperCase() === token.toUpperCase() && t.id,
  );
  if (!entry) throw ApiError.notFound(`No active token found for ${token}`);

  const cp = String(checkpoint).toUpperCase();
  const idx = CHECKPOINTS.indexOf(cp);
  if (idx === -1) throw ApiError.badRequest(`Unknown checkpoint '${checkpoint}'`);

  if (cp === "EXIT" && entry.status !== TRUCK_STATUS.LOADED) {
    throw ApiError.conflict(`Vehicle ${entry.regNo} must complete gantry loading before exiting`);
  }

  const currentIdx = Math.max(0, CHECKPOINTS.indexOf(entry.checkpoint));
  const correctiveReWeigh =
    entry.checkpoint === "WEIGHBRIDGE" &&
    entry.status === TRUCK_STATUS.AT_WEIGHBRIDGE &&
    entry.weightPassed === false;
  const isSequential =
    cp === "EXIT"
      ? entry.status === TRUCK_STATUS.LOADED
      : cp === "WEIGHBRIDGE"
        ? currentIdx < idx || (idx === currentIdx && currentIdx < 1) || correctiveReWeigh
        : idx === Math.min(currentIdx + 1, CHECKPOINTS.length - 1);

  const reading = {
    token,
    truckId: entry.id,
    regNo: entry.regNo,
    checkpoint: cp,
    rfidReaderId,
    sequence: idx,
    status: STATUS_BY_CHECKPOINT[cp],
    capturedAt: Date.now(),
    payload,
  };

  // Weighbridge step: validate the physical gross-weight against the manifest
  // registered product volume + tare before clearing for gantry assignment.
  if (cp === "WEIGHBRIDGE") {
    const grossWeightKg = Number(payload?.grossWeightKg ?? payload?.grossWeight);
    if (!Number.isFinite(grossWeightKg) || grossWeightKg <= 0) {
      throw ApiError.badRequest("Weighbridge requires a gross weight reading (payload.grossWeightKg)");
    }

    const weight = verifyGrossWeight({
      grossWeightKg,
      tareKg: entry.tareKg,
      capacityLiters: entry.capacityLiters,
      product: entry.product,
    });
    reading.weight = weight;

    if (weight.pass) {
      reading.status = TRUCK_STATUS.WEIGHBRIDGE_PASSED;
      await ref(`yard/checkpoints/${cp}/${entry.id}`).set(reading);
      await ref(`yard/trucks/${entry.id}`).update({
        checkpoint: cp,
        status: TRUCK_STATUS.WEIGHBRIDGE_PASSED,
        weighedAt: Date.now(),
        grossWeightKg: weight.grossWeightKg,
        weightPassed: true,
        lastEvent: "WEIGHBRIDGE_PASSED",
        updatedAt: Date.now(),
      });
      await notifyEvent("checkpoint:crossed", {
        truckId: entry.id,
        token,
        regNo: entry.regNo,
        checkpoint: cp,
        sequential: isSequential,
        weight: { grossWeightKg: weight.grossWeightKg, expectedGrossKg: weight.expectedGrossKg, diffKg: weight.diffKg, pass: true },
        timestamp: Date.now(),
      });
      return { checkpoint: reading, sequential: isSequential, weight };
    }

    // Gross weight mismatch — record the reading, but HOLD the vehicle and do
    // not clear it for gantry bay assignment.
    await ref(`yard/checkpoints/${cp}/${entry.id}`).set(reading);
    await ref(`yard/trucks/${entry.id}`).update({
      checkpoint: cp,
      status: TRUCK_STATUS.AT_WEIGHBRIDGE,
      weighedAt: Date.now(),
      grossWeightKg: weight.grossWeightKg,
      weightPassed: false,
      lastEvent: "WEIGHBRIDGE_MISMATCH",
      updatedAt: Date.now(),
    });
    await notifyEvent("sla:breach", {
      truckId: entry.id,
      token,
      regNo: entry.regNo,
      type: "WEIGHT_MISMATCH",
      message: `Truck ${entry.regNo} gross weight ${weight.grossWeightKg} kg deviates from expected ${weight.expectedGrossKg} kg (${weight.tolerancePct}% tolerance)`,
      checkpoint: cp,
      weight: { grossWeightKg: weight.grossWeightKg, expectedGrossKg: weight.expectedGrossKg, diffKg: weight.diffKg },
      timestamp: Date.now(),
    });
    throw ApiError.conflict(
      `Gross weight ${weight.grossWeightKg} kg deviates from expected ${weight.expectedGrossKg} kg (diff ${weight.diffKg} kg / ${weight.tolerancePct}% tolerance) — weighbridge mismatch, vehicle held`,
    );
  }

  await ref(`yard/checkpoints/${cp}/${entry.id}`).set(reading);
  await ref(`yard/trucks/${entry.id}`).update({
    checkpoint: cp,
    status: reading.status,
    lastEvent: `RFID_${cp}`,
    updatedAt: Date.now(),
  });

  if (!isSequential) {
    entry.anomalyCount = (entry.anomalyCount ?? 0) + 1;
    await ref(`yard/trucks/${entry.id}`).update({ anomalyCount: entry.anomalyCount });
    await notifyEvent("sla:breach", {
      truckId: entry.id,
      token,
      regNo: entry.regNo,
      type: "CHECKPOINT_SKIPPED",
      message: `Truck ${entry.regNo} skipped checkout sequence at ${cp}`,
      checkpoint: cp,
      timestamp: Date.now(),
    });
  }

  await notifyEvent("checkpoint:crossed", {
    truckId: entry.id,
    token,
    regNo: entry.regNo,
    checkpoint: cp,
    sequential: isSequential,
    timestamp: Date.now(),
  });

  if (cp === "EXIT") {
    const completed = { ...entry, status: TRUCK_STATUS.COMPLETED, checkpoint: "EXIT", lastEvent: "EXITED", updatedAt: Date.now() };
    await ref(`yard/trucks/${entry.id}`).update({ status: TRUCK_STATUS.COMPLETED, lastEvent: "EXITED", updatedAt: Date.now() });
    await recordCompletion({
      truck: completed,
      completion: { actualLoadingMinutes: completed.actualLoadingMinutes },
    });
    await notifyEvent("truck:exited", {
      truckId: entry.id,
      token,
      regNo: entry.regNo,
      bayId: entry.bayId,
      loadCompletedAt: entry.loadCompletedAt,
      latchedEfficiencyPct: entry.loadingEfficiencyPct,
      exitedAt: Date.now(),
    });
  }

  return { checkpoint: reading, sequential: isSequential };
}

export async function checkpointTrail(token) {
  const truckSnap = await ref("yard/trucks").once("value");
  const trucks = truckSnap.val() ?? {};
  const entry = Object.values(trucks).find(
    (t) => t.token && t.token.toUpperCase() === token.toUpperCase() && t.id,
  );
  if (!entry) throw ApiError.notFound(`No active token found for ${token}`);

  const trailSnap = await ref("yard/checkpoints").once("value");
  const trail = trailSnap.val() ?? {};
  const readings = [];
  for (const cp of CHECKPOINTS) {
    const rec = trail?.[cp]?.[entry.id];
    if (rec) readings.push(rec);
  }
  return { token, regNo: entry.regNo, status: entry.status, readings: readings.sort((a, b) => a.capturedAt - b.capturedAt) };
}