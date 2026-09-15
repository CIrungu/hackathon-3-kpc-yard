import { Leaf, Droplets, ShieldCheck } from "lucide-react";
import AnimatedNumber from "./AnimatedNumber.jsx";

const RISK_STYLES = {
  GREEN: "bg-emerald-400 text-black",
  AMBER: "bg-amber-400 text-black",
  RED: "bg-red-500 text-white",
};

export default function EsgScorecard({ data }) {
  if (!data) {
    return (
      <div className="glass glass-outline p-5">
        <p className="py-6 text-center text-xs text-slate-500">ESG ledger accrues as loads complete…</p>
      </div>
    );
  }

  const totals = data.totals ?? {};
  const fleet = data.fleet ?? {};
  const perBay = data.perBay ?? [];

  const scoreTone = fleet.esgScorePct >= 80 ? "text-emerald-300" : fleet.esgScorePct >= 55 ? "text-amber-300" : "text-red-300";
  const worst = fleet.worstBay ?? null;

  return (
    <div className="glass glass-outline p-5">
      <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-300">
        <Leaf className="h-4 w-4 text-emerald-300" /> ESG & Carbon-Spill Risk Scorecard
      </p>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-emerald-500/10 p-3">
          <p className="text-[10px] uppercase tracking-wider text-emerald-300/80">CO₂ avoided</p>
          <p className="tick-up mt-1 font-mono text-xl font-bold text-emerald-200">
            <AnimatedNumber value={totals.co2SavedKg ?? 0} format={(n) => `${n.toLocaleString()} kg`} />
          </p>
          <p className="mt-1 text-[10px] text-emerald-300/60">
            ≈ <AnimatedNumber value={totals.treesEquivalent ?? 0} format={(n) => n.toFixed(1)} /> trees / yr ·{" "}
            {totals.hoursPrevented ?? 0} idle-hr prevented
          </p>
        </div>

        <div className="rounded-xl bg-violet-500/10 p-3">
          <p className="text-[10px] uppercase tracking-wider text-violet-300/80">Fleet ESG score</p>
          <p className={`tick-up mt-1 font-mono text-xl font-bold ${scoreTone}`}>
            <AnimatedNumber value={fleet.esgScorePct ?? 0} format={(n) => `${Math.round(n)}%`} />
          </p>
          <p className="mt-1 flex items-center gap-1 text-[10px] text-violet-300/60">
            <Droplets className="h-3 w-3" /> spill index {fleet.spillRiskIndex ?? 0}/100
          </p>
        </div>

        <div className="rounded-xl bg-red-500/10 p-3">
          <p className="text-[10px] uppercase tracking-wider text-red-300/80">Highest spill risk</p>
          {worst ? (
            <>
              <p className="mt-1 font-mono text-xl font-bold text-white">{worst.bayId}</p>
              <p className="mt-1 flex items-center gap-1 text-[10px] text-red-300/70">
                <ShieldCheck className="h-3 w-3" /> {worst.level} · score {worst.score}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-500">—</p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">
          Predictive per-gantry spill meter
        </p>
        <div className="flex flex-wrap gap-1.5">
          {perBay.map((b) => {
            const style = RISK_STYLES[b.risk?.level] ?? RISK_STYLES.GREEN;
            return (
              <span
                key={b.bayId}
                title={`${b.bayId} · ${b.risk?.level} · score ${b.risk?.score}${b.risk?.drivers?.length ? ` · ${b.risk.drivers.join(", ")}` : ""}`}
                className={`chip ${style} cursor-default`}
              >
                {b.bayId}
                <span className="opacity-70">{b.risk?.score}</span>
              </span>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[9px] text-slate-500">
          <span className="chip bg-emerald-400/10 text-emerald-300">GREEN &lt;40</span>
          <span className="chip bg-amber-400/10 text-amber-300">AMBER 40–69</span>
          <span className="chip bg-red-500/10 text-red-300">RED ≥70</span>
        </div>
      </div>
    </div>
  );
}