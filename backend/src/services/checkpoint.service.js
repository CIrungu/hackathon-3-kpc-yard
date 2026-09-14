import { ref } from "../config/firebase.js";
import { notifyEvent } from "./eventBus.js";
import { ApiError } from "../middleware/errorHandler.js";
import { TRUCK_STATUS } from "./yard.service.js";

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
 * truck cannot skip ahead and displace service order.
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

  const currentIdx = Math.max(0, CHECKPOINTS.indexOf(entry.checkpoint));
  const isSequential =
    cp === "WEIGHBRIDGE"
      ? currentIdx < idx || (idx === currentIdx && currentIdx < 1)
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