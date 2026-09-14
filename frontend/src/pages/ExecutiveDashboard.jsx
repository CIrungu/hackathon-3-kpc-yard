import { useMemo } from "react";
import {
  TrendingUp,
  Wallet,
  Gauge,
  ShieldAlert,
  RefreshCw,
  Activity,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { useDemoAuth } from "../hooks/useDemoAuth.js";
import { useMetrics } from "../hooks/useYardData.js";
import { useYardStream } from "../hooks/useYardStream.js";
import KpiCard from "../components/KpiCard.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { pushAlert } from "../components/AlertCenter.jsx";

export default function ExecutiveDashboard() {
  const auth = useDemoAuth("executive", "Executive Officer");
  const { data: metrics, error, loading, refresh } = useMetrics(10000);

  useYardStream({
    "sla:breach": (m) =>
      pushAlert({ tone: "error", title: "SLA Breach", message: m.payload.message, key: m.payload.signature }),
    "anomaly:detected": (m) =>
      pushAlert({ tone: "warning", title: `Anomaly ${m.payload.type}`, message: m.payload.message }),
    "reroute:applied": (m) =>
      pushAlert({ tone: "warning", title: "Self-healing reroute", message: `${m.payload.movements.length} vehicles re-sequenced` }),
    "gate:entry": (m) => pushAlert({ tone: "success", title: "Yard entry", message: `${m.payload.regNo} tokenised` }),
    "loading:completed": (m) =>
      pushAlert({ tone: "success", title: "Load complete", message: `${m.payload.regNo} @ ${m.payload.bayId} (${m.payload.efficiencyPct}% eff)` }),
  });

  const series = useMemo(() => {
    const daily = metrics?.daily ?? {};
    return Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, d]) => ({
        day,
        trucks: d.completedCount ?? 0,
        kes: Math.round(d.totalKesSaved ?? 0),
        turnaround: Number(((d.totalTurnaroundHours ?? 0) / Math.max(1, d.completedCount ?? 1)).toFixed(2)),
      }));
  }, [metrics]);

  const kpis = metrics?.kpis;
  const live = metrics?.live;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Executive Control Plane</h1>
          <p className="text-sm text-slate-400">Strategic yard telemetry · ROI + SLA watchtower</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge pulse status={auth.ready ? "ACTIVE" : "WAITING"} />
          <button onClick={refresh} className="btn-ghost text-xs">
            <RefreshCw className="mr-1 h-3 w-3 animate-pulse" /> Live
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-amber-400/40 bg-amber-950/60 p-3 text-sm text-amber-200">{error}</div>}
      {loading && !metrics && (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-32 animate-pulse bg-white/5" />
          ))}
        </div>
      )}

      {kpis && (
        <>
          {/* ROI KPI band */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              accent="emerald"
              icon={Wallet}
              label="Demurrage Saved"
              value={`KES ${Number(kpis.demurrageSavedKes ?? 0).toLocaleString()}`}
              sub={`@ KES ${kpis.demurrageRatePerHourKes?.toLocaleString()}/hr · ${kpis.hoursPrevented} idle-hr prevented`}
            />
            <KpiCard
              accent="sky"
              icon={TrendingUp}
              label="Throughput Δ vs Baseline"
              value={`${(kpis.throughputDeltaPct ?? 0) >= 0 ? "+" : ""}${kpis.throughputDeltaPct ?? 0}%`}
              sub={`${kpis.throughputRatePerHour}/hr operational vs ${kpis.baselineThroughputPerHour}/hr baseline`}
            />
            <KpiCard
              accent="amber"
              icon={Gauge}
              label="Avg Turnaround"
              value={`${kpis.avgTurnaroundHours ?? 0}h`}
              sub={`Baseline ${kpis.baselineTurnaroundHours}h · ${kpis.turnaroundImprovementPct ?? 0}% improvement`}
            />
            <KpiCard
              accent="emerald"
              icon={Activity}
              label="Bay Utilization"
              value={`${kpis.capacityUtilizationPct ?? 0}%`}
              sub={`${live?.activeBays ?? 0}/${live?.totalBays ?? 0} gantries active`}
            />
          </div>

          {/* Live fleet strip */}
          <div className="grid gap-3 md:grid-cols-5">
            {[
              { label: "Processed (today)", value: live?.processedCount ?? 0, tone: "text-emerald-300" },
              { label: "In yard", value: live?.activeInYard ?? 0, tone: "text-slate-200" },
              { label: "Queued", value: live?.queuedCount ?? 0, tone: "text-amber-300" },
              { label: "Loading now", value: live?.loadingCount ?? 0, tone: "text-sky-300" },
              { label: "Liters in queue", value: `${((live?.totalLitersInQueue ?? 0) / 1000).toFixed(0)} kL`, tone: "text-violet-300" },
            ].map((s) => (
              <div key={s.label} className="card p-3 text-center">
                <p className={`font-mono text-xl font-bold ${s.tone}`}>{s.value}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Wallet className="h-4 w-4" /> KES Demurrage Saved — 7d
              </p>
              {series.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">No completed loads yet — telemetry accrues as trucks exit.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="kes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #ffffff22", borderRadius: 8 }}
                      formatter={(v) => [`KES ${Number(v).toLocaleString()}`, "Demurrage saved"]}
                    />
                    <Area type="monotone" dataKey="kes" stroke="#10b981" fill="url(#kes)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
                <TrendingUp className="h-4 w-4" /> Throughput — loads & turnaround
              </p>
              {series.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">Waiting for first completed loads.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis yAxisId="t" orientation="right" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #ffffff22", borderRadius: 8 }}
                    />
                    <Bar yAxisId="l" dataKey="trucks" name="Trucks" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="t" dataKey="turnaround" name="Avg hrs" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}

      <div className="card flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-300" />
        <div className="text-xs text-slate-400">
          <p className="font-semibold text-slate-200">Autonomous control loop</p>
          <p className="mt-1">
            Every gate capture is verified against the batch manifest; the AI bay-matching engine assigns the
            optimal gantry by pump rate and queue forecast. Anomalies (dead pumps, queue overflow, load hangs)
            trigger <b className="text-amber-300">closed-loop reroutes</b>, SMS to drivers, and PagerDuty/Slack
            escalation — no human dispatcher required.
          </p>
        </div>
      </div>
    </div>
  );
}