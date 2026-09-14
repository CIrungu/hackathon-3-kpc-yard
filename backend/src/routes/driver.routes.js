import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { authorize, ROLES } from "../middleware/roles.js";
import { ref } from "../config/firebase.js";

const router = Router();

router.use(authenticate);

/**
 * GET /driver/:token — real-time status, assigned bay & push alerts for a driver
 */
router.get("/:token", authorize(...Object.values(ROLES)), async (req, res, next) => {
  try {
    const snap = await ref("yard/trucks").once("value");
    const trucks = snap.val() ?? {};
    const truck = Object.values(trucks).find(
      (t) => t.token && t.token.toUpperCase() === req.params.token.toUpperCase() && t.id,
    );
    if (!truck) {
      return res.status(404).json({ success: false, error: { message: "Token not found" } });
    }
    const bays = req.query.includeBay === "true" ? (await ref("yard/bays").once("value")).val() ?? {} : null;
    const bay = truck.bayId ? bays?.[truck.bayId] ?? null : null;
    return res.json({
      success: true,
      data: {
        token: truck.token,
        regNo: truck.regNo,
        driverName: truck.driverName,
        product: truck.product,
        status: truck.status,
        checkpoint: truck.checkpoint,
        bayId: truck.bayId,
        queuePosition: truck.queuePosition,
        etaMinutes: bay?.queuedVehicles?.[truck.id]?.etaMinutes ?? null,
        bay,
        alerts: [],
        lastEvent: truck.lastEvent,
        updatedAt: truck.updatedAt ?? truck.enteredAt,
      },
    });
  } catch (err) {
    return next(err);
  }
});

export default router;