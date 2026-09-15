import AnimatedNumber from "./AnimatedNumber.jsx";

export default function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "emerald",
  spark = null,
  pulse = false,
  animate = false,
  format = (n) => String(Math.round(n)),
}) {
  const accents = {
    emerald: "from-emerald-500/20 to-transparent text-emerald-300",
    amber: "from-amber-500/20 to-transparent text-amber-300",
    red: "from-red-500/20 to-transparent text-red-300",
    sky: "from-sky-500/20 to-transparent text-sky-300",
    violet: "from-violet-500/20 to-transparent text-violet-300",
  };
  return (
    <div className={`glass glass-outline bg-gradient-to-br ${accents[accent]} p-5`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <div className="flex items-center gap-2">
          {pulse && <span className="live-dot h-2 w-2 rounded-full bg-current text-emerald-400" />}
          {Icon && <Icon className="h-4 w-4 opacity-80" />}
        </div>
      </div>
      <p className="tick-up mt-2 font-mono text-2xl font-bold text-white">
        {animate ? (
          <AnimatedNumber value={Number(value ?? 0)} format={format} />
        ) : (
          String(value ?? 0)
        )}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      {spark && <div className="mt-2 h-8">{spark}</div>}
    </div>
  );
}