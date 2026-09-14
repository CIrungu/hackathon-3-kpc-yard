export default function KpiCard({ label, value, sub, icon: Icon, accent = "emerald", spark = null }) {
  const accents = {
    emerald: "from-emerald-500/20 to-transparent text-emerald-300",
    amber: "from-amber-500/20 to-transparent text-amber-300",
    red: "from-red-500/20 to-transparent text-red-300",
    sky: "from-sky-500/20 to-transparent text-sky-300",
  };
  return (
    <div className={`card relative overflow-hidden bg-gradient-to-br ${accents[accent]}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        {Icon && <Icon className="h-4 w-4 opacity-80" />}
      </div>
      <p className="mt-2 font-mono text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      {spark && <div className="mt-2 h-8">{spark}</div>}
    </div>
  );
}