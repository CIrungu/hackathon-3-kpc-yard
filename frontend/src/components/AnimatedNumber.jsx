import { useEffect, useRef, useState } from "react";

/**
 * Eased count-up number that animates toward `value` whenever it changes —
 * powers the executive KES/throughput counters.
 */
export default function AnimatedNumber({
  value = 0,
  duration = 900,
  format = (n) => String(Math.round(n)),
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = Number(value) || 0;
    if (from === to) {
      setDisplay(to);
      return undefined;
    }
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = from + (to - from) * eased;
      setDisplay(cur);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format(display)}</>;
}