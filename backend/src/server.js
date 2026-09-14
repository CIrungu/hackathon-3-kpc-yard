import env from "./config/env.js";
import { app as firebaseApp } from "./config/firebase.js";
import app from "./app.js";
import { runClosedLoopCycle } from "./services/autoReroute.service.js";
import { seedYard } from "./services/seed.js";

let loopTimer = null;
let server = null;

function startWatchers() {
  const loopMs = Number(process.env.LOOP_INTERVAL_MS ?? 45_000);
  loopTimer = setInterval(async () => {
    try {
      const cycle = await runClosedLoopCycle();
      if (cycle.anomalies.length > 0) {
        console.log("[loop] Closed-loop cycle →", cycle.anomalies.map((a) => a.type).join(", "));
      }
    } catch (err) {
      console.error("[loop] Closed-loop cycle failed:", err.message);
    }
  }, loopMs);
  loopTimer.unref?.();
  console.log(`[loop] Closed-loop anomaly watcher active (every ${loopMs / 1000}s)`);
}

async function bootstrap() {
  await seedYard();
  server = app.listen(env.port, () => {
    console.log(`[kpc-yard-control-plane] listening on :${env.port} (${env.nodeEnv})`);
  });
  startWatchers();

  const shutdown = (signal) => {
    console.log(`\n[server] ${signal} received — shutting down gracefully`);
    if (loopTimer) clearInterval(loopTimer);
    server.close(() => {
      try {
        firebaseApp?.delete?.();
      } catch {
        /* non-fatal */
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 8_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("[bootstrap] Failed to start:", err);
  process.exit(1);
});

export { app };