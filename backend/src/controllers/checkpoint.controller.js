import { verifyCheckpoint, checkpointTrail } from "../services/checkpoint.service.js";
import { allocateBayForTruck, startLoading, completeLoading, getLiveBays } from "../services/yard.service.js";
import { recordCompletion } from "../services/analytics.service.js";

function rawBodyToCheckpoint(req) {
  return {
    token: req.body.token ?? req.body.serial,
    checkpoint: req.body.checkpoint,
    rfidReaderId: req.body.readerId ?? req.body.reader,
    payload: req.body.payload ?? null,
  };
}

export async function scanCheckpoint(req, res, next) {
  try {
    const result = await verifyCheckpoint(rawBodyToCheckpoint(req));
    const { checkpoint } = result;

    if (checkpoint.checkpoint === "WEIGHBRIDGE" && result.sequential) {
      // Auto-allocate optimal bay once weighed — closed-loop, no human dispatch
      const allocation = await allocateBayForTruck(checkpoint.truckId);
      return res.json({ success: true, data: { ...result, allocation } });
    }

    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

export async function checkpointHistory(req, res, next) {
  try {
    const trail = await checkpointTrail(req.params.token);
    return res.json({ success: true, data: trail });
  } catch (err) {
    return next(err);
  }
}

export async function beginLoading(req, res, next) {
  try {
    const { truckId, bayId } = req.body;
    const truck = await startLoading(truckId, bayId);
    return res.json({ success: true, data: { truck } });
  } catch (err) {
    return next(err);
  }
}

export async function finishLoading(req, res, next) {
  try {
    const { truckId, bayId } = req.body;
    const bays = await getLiveBays();
    const gantry = bays[bayId] ?? {};
    const { completed, theoreticalMinutes, efficiencyPct } = await completeLoading(truckId, bayId, gantry);

    await recordCompletion({ truck: completed, completion: { actualLoadingMinutes: completed.actualLoadingMinutes } });

    return res.json({
      success: true,
      data: {
        completed,
        theoreticalMinutes,
        efficiencyPct,
      },
    });
  } catch (err) {
    return next(err);
  }
}