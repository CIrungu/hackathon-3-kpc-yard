import { useState } from "react";
import { AlertTriangle, Play, RefreshCw, CheckCircle2, SlidersHorizontal } from "lucide-react";
import { useDemoAuth } from "../hooks/useDemoAuth.js";
import { useYardSnapshot, useAnomalies } from "../hooks/useYardData.js";
import { useYardStream } from "../hooks/useYardStream.js";
import StatusBadge from "../components/StatusBadge.jsx";
import BayCard from "../components/BayCard.jsx";
import { pushAlert } from "../components/AlertCenter.jsx";
import { yardApi } from "../services/api.js";

const HEALTH_OPTIONS = ["ACTIVE", "DEGRADED", "MAINTENANCE", "DOWN"];

export default function AdminOps() {
  useDemoAuth("depot-manager", "Depot Manager");
  const { data, refresh } = useYardSnapshot(6000);
  const { data: anomalies, refresh: refreshAnomalies } = useAnomalies(12000);
  const [busy, setBusy] = useState(null);

  useYardStream({
    "anomaly:detected": (m) => pushAlert({ tone: "warning", title: `Anomaly: ${m.payload.type}`, message: m.payload.message }),
    "reroute:applied": (m) =>
      pushAlert({ tone: "warning", title: "Auto-reroute executed", message: `${m.payload.movements.length} trucks moved` }),
    "queue:sequenced": () => refresh(),
    "control:override": (m) => {
      pushAlert({ tone: "success", title: "Override recorded", message: `operator ${m.payload.operator ?? "system"}` });
      refresh();
    },
  });

  const bays = data?.bays ?? {};
  const trucks = Object.values(data?.trucks ?? {}).filter((t) => t.id);
  const staged = trucks.filter((t) => ["WAITING", "AT_WEIGHBRIDGE"].includes(t.status)).slice(0, 8);

  async function run(act, payload) {
    setBusy(act);
    try {
      const res = await payload();
      pushAlert({ tone: "success", title: "Action executed", message: act });
      if (act === "run-cycle" || act === "allocate") {
        const m = res?.movements ?? res?.assignment ?? null;
        if (m) pushAlert({ tone: "success", title: "Closed-loop result", message: JSON.stringify(m).slice(0, 120) });
      }
      refresh();
      refreshAnomalies();
    } catch (err) {
      pushAlert({ tone: "error", title: "Action failed", message: err.message });
    } finally {
      setBusy(null);
    }
  }

  async function setHealth(bayId, status) {
    await run(`bay:${bayId}`, () => yardApi.setBayHealth(bayId, status));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin Ops — Depot Manager Override</h1>
          <p className="text-sm text-slate-400">Manual re-sequencing, bay health, anomaly triage</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => run("run-cycle", () => yardApi.runCycle())} disabled={busy === "run-cycle"} className="btn-primary text-xs">
            {busy === "run-cycle" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Run closed-loop cycle
          </button>
          <button onClick={refresh} className="btn-ghost text-xs">Refresh</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Anomaly triage */}
        <div className="card lg:col-span-2">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <AlertTriangle className="h-4 w-4 text-amber-300" /> Open anomalies / SLA breaches
          </p>
          {(anomalies ?? []).length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No open anomalies — control loop is green.</p>
          ) : (
            <div className="space-y-2">
              {(anomalies ?? []).map((a) => (
                <div key={a.signature} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-slate-200">
                      <span className="chip bg-red-500/20 text-red-300">{a.type}</span>
                      <StatusBadge status={a.status} pulse={a.status === "OPEN"} />
                      {a.severity === "critical" && <span className="chip bg-amber-500/20 text-amber-300">auto-actioned</span>}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-400">{a.message}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-600">{a.signature}</p>
                  </div>
                  <button
                    onClick={() => run(`resolve:${a.signature}`, () => yardApi.resolveAnomaly(a.signature))}
                    disabled={busy}
                    className="btn-ghost shrink-0 text-xs"
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Re-open/Fix
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Staging override */}
        <div className="card">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <SlidersHorizontal className="h-4 w-4" /> Manual allocation
          </p>
          {staged.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No trucks staging at the gate.</p>
          ) : (
            <div className="space-y-2">
              {staged.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
                  <div>
                    <p className="font-mono font-semibold">{t.regNo}</p>
                    <p className="text-slate-500">{t.product ?? "?"} · {t.capacityLiters?.toLocaleString()} L</p>
                  </div>
                  <button
                    onClick={() => run("allocate", () => yardApi.allocate(t.id))}
                    disabled={busy}
                    className="btn-primary px-2 py-1 text-[10px]"
                  >
                    Allocate bay
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bay health override grid */}
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-300">Gantry bay health — overrides feed the anomaly detector</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(bays).map(([bayId, bay]) => (
            <div key={bayId} className="card">
              <BayCard bay={bay} bayId={bayId} />
              <div className="mt-2 flex flex-wrap gap-1">
                {HEALTH_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setHealth(bayId, opt)}
                    className={`rounded px-2 py-1 text-[10px] transition ${
                      bay.status === opt ? "bg-kpc-green/40 text-emerald-200" : "bg-white/5 text-slate-400 hover:bg-white/10"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}