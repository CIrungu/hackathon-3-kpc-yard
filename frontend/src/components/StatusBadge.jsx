const STATUS_STYLES = {
  WAITING: "bg-slate-500/20 text-slate-300 border-slate-400/30",
  APPROACHING: "bg-sky-500/20 text-sky-300 border-sky-400/30",
  AT_WEIGHBRIDGE: "bg-violet-500/20 text-violet-300 border-violet-400/30",
  WEIGHBRIDGE_PASSED: "bg-violet-400/20 text-violet-200 border-violet-300/30",
  QUEUED: "bg-amber-500/20 text-amber-300 border-amber-400/30",
  LOADING: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
  LOADED: "bg-teal-500/20 text-teal-300 border-teal-400/30",
  COMPLETED: "bg-green-500/20 text-green-300 border-green-400/30",
  REROUTED: "bg-cyan-500/20 text-cyan-300 border-cyan-400/30",
  HELD: "bg-red-500/20 text-red-300 border-red-400/30",
  ACTIVE: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
  DEGRADED: "bg-amber-500/20 text-amber-300 border-amber-400/30",
  MAINTENANCE: "bg-yellow-500/20 text-yellow-300 border-yellow-400/30",
  DOWN: "bg-red-500/20 text-red-300 border-red-400/30",
  OPEN: "bg-red-500/20 text-red-300 border-red-400/30",
  RESOLVED: "bg-green-500/20 text-green-300 border-green-400/30",
  UNRESOLVED: "bg-amber-500/20 text-amber-300 border-amber-400/30",
};

export default function StatusBadge({ status, pulse = false }) {
  const style = STATUS_STYLES[status?.toUpperCase()] ?? STATUS_STYLES.WAITING;
  return (
    <span className={`chip border ${style}`}>
      {pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {status}
    </span>
  );
}