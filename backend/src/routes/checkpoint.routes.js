import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { ROLES, authorize } from "../middleware/roles.js";
import {
  scanCheckpoint,
  checkpointHistory,
  beginLoading,
  finishLoading,
} from "../controllers/checkpoint.controller.js";

const router = Router();

router.use(authenticate);

/**
 * POST /checkpoints/scan — RFID reader event (Gate → Weighbridge → Gantry)
 */
router.post("/scan", authorize(ROLES.GATE_OFFICER, ROLES.SYSTEM, ROLES.DEPOT_MANAGER, ROLES.DRIVER), scanCheckpoint);

/**
 * GET /checkpoints/:token — full checkpoint trail for a token
 */
router.get("/:token", authorize(...Object.values(ROLES)), checkpointHistory);

/**
 * POST /checkpoints/loading/start
 * POST /checkpoints/loading/complete
 */
router.post("/loading/start", authorize(ROLES.SYSTEM, ROLES.DEPOT_MANAGER, ROLES.GATE_OFFICER), beginLoading);
router.post("/loading/complete", authorize(ROLES.SYSTEM, ROLES.DEPOT_MANAGER, ROLES.GATE_OFFICER), finishLoading);

export default router;