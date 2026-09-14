import StatusBadge from "./StatusBadge.jsx";

const PRODUCT_COLORS = {
  DIESEL: "bg-amber-400 text-black",
  PETROL: "bg-sky-400 text-black",
  KEROSENE: "bg-orange-400 text-black",
  JET_A1: "bg-violet-400 text-black",
  ADBLUE: "bg-cyan-400 text-black",
  FLEXIBLE: "bg-slate-400 text-black",
};

/**
 * Visual gantry bay card with live queue occupancy and pump-rate telemetry.
 */
export default function BayCard({ bay, bayId, onOverride = null, active = false }) {
  const queue = Object.values(bay.queuedVehicles ?? {});
  const currentLoading = bay.currentVehicleRegNo ?? null;
  const productColor = PRODUCT_COLORS[bay.product] ?? "bg-slate-400 text-black";
  const bottleneck = queue.length >= 5 || ["DOWN", "DEGRADED"].includes(bay.status);

  return (
    <div
      className={`card flex flex-col gap-2 transition ${active ? "ring-2 ring-emerald-400" : ""} ${
        bottleneck ? "border-red-400/40" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`chip ${productColor}`}>{bay.product}</span>
          <StatusBadge status={bay.status} pulse={bay.status === "ACTIVE"} />
        </div>
        <span className="font-mono text-sm text-slate-300">{bayId}</span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-semibold">{bay.name}</p>
          <p className="font-mono text-xs text-slate-400">{bay.pumpRateLpm} L/min</p>
        </div>
        <div className="text-right">
          {currentLoading ? (
            <p className="font-mono text-xs text-emerald-300">
              Loading: <b>{currentLoading}</b>
            </p>
          ) : (
            <p className="text-xs text-slate-500">Standby</p>
          )}
          <p className="font-mono text-xs text-slate-400">
            Queue: <b className="text-amber-300">{queue.length}</b>
          </p>
        </div>
      </div>

      <div className="flex gap-0.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < queue.length
                ? bottleneck
                  ? "bg-red-400"
                  : "bg-amber-400"
                : i === queue.length && currentLoading
                  ? "bg-emerald-400"
                  : "bg-white/10"
            }`}
          />
        ))}
      </div>

      {queue.slice(0, 3).map((v) => (
        <div key={v.regNo} className="flex justify-between rounded bg-black/20 px-2 py-1 font-mono text-[10px] text-slate-400">
          <span>{v.regNo}</span>
          <span>~{v.etaMinutes ?? "—"} min</span>
        </div>
      ))}

      {queue.length > 3 && (
        <p className="text-center text-[10px] text-slate-500">+{queue.length - 3} more in queue</p>
      )}

      {onOverride && (
        <button
          onClick={() => onOverride(bayId, bay.status)}
          className="mt-1 rounded border border-white/10 px-2 py-1 text-xs text-slate-300 transition hover:bg-white/10"
        >
          Set health
        </button>
      )}
    </div>
  );
}