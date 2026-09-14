import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { authorize, ROLES } from "../middleware/roles.js";
import {
  runCycle,
  anomalies,
  resolveAnomaly,
  overrideResequence,
  bayHealthOverride,
  metrics,
  throughput,
  yardSnapshot,
  manualAlloc,
} from "../controllers/controlPlane.controller.js";

const router = Router();

router.use(authenticate);

/**
 * Control plane routes — cleared for depot managers & the executive suite.
 * Drivers and gate officers never reach this surface.
 */
const manager = authorize(ROLES.DEPOT_MANAGER, ROLES.EXECUTIVE);
const executive = authorize(ROLES.EXECUTIVE, ROLES.DEPOT_MANAGER);

router.get("/metrics", executive, metrics);
router.get("/throughput", executive, throughput);
router.get("/anomalies", manager, anomalies);
router.post("/anomalies/:signature/resolve", manager, resolveAnomaly);
router.post("/cycle", manager, runCycle);
router.post("/resequence", manager, overrideResequence);
router.post("/bay/:bayId/health", manager, bayHealthOverride);
router.post("/allocate", manager, manualAlloc);
router.get("/snapshot", manager, yardSnapshot);

export default router;