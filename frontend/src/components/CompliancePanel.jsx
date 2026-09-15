import { Gauge, AlertTriangle } from "lucide-react";
import AnimatedNumber from "./AnimatedNumber.jsx";

export default function CompliancePanel({ data }) {
  if (!data) {
    return (
      <div className="glass glass-outline p-5">
        <p className="py-6 text-center text-xs text-slate-500">Transit compliance telemetry builds as trucks cross checkpoints…</p>
      </div>
    );
  }

  const pct = data.fleetCompliancePct ?? 100;
  const tone = pct >= 90 ? "text-emerald-300" : pct >= 70 ? "text-amber-300" : "text-red-300";
  const open = data.open ?? [];

  return (
    <div className="glass glass-outline p-5">
      <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-300">
        <Gauge className="h-4 w-4 text-sky-300" /> Depot Speed & Transit Compliance
      </p>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className={`tick-up font-mono text-3xl font-bold ${tone}`}>
            <AnimatedNumber value={pct} format={(n) => `${Math.round(n)}%`} />
          </p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Fleet compliance</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg text-slate-300">{data.totalSegments ?? 0}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">segments measured</p>
          <p className="mt-1 flex items-center justify-end gap-1 font-mono text-xs text-red-300">
            <AlertTriangle className="h-3 w-3" /> {data.openViolations ?? 0} open
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {(data.segmentStats ?? []).map((seg) => {
          const over = seg.samples > 0 && seg.avgSpeedKph > seg.speedLimitKph;
          return (
            <div key={`${seg.from}-${seg.to}`} className="seg-stripes rounded-lg bg-black/20 p-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-mono text-slate-400">
                  {seg.from} → {seg.to} · {seg.distanceM}m
                </span>
                <span className={`font-mono ${over ? "text-red-300" : "text-emerald-300"}`}>
                  {seg.avgSpeedKph == null ? "—" : `${seg.avgSpeedKph} km/h`}
                  <span className="text-slate-600"> / {seg.speedLimitKph}</span>
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${over ? "bg-red-400" : "bg-sky-400"}`}
                    style={{ width: `${Math.min(100, ((seg.avgSpeedKph ?? 0) / (seg.speedLimitKph * 1.4)) * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-[9px] text-slate-500">{seg.samples} tx</span>
              </div>
            </div>
          );
        })}
      </div>

      {open.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {open.slice(0, 3).map((v) => (
            <div key={v.signature} className="flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] text-red-200">
              <span className="chip bg-red-500/20 text-red-300">{v.type === "SPEED_EXCEEDED" ? "SPEED" : "DWELL"}</span>
              <span className="font-mono">{v.regNo}</span>
              <span className="ml-auto text-red-300/70">
                {v.value} {v.unit} / limit {v.limit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}