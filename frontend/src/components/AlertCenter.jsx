import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

let pushCounter = 0;
const listeners = new Set();

/** Tiny event bus for cross-page alert toasts. */
export function pushAlert(alert) {
  pushCounter += 1;
  listeners.forEach((fn) => fn({ id: `alert-${pushCounter}`, ...alert }));
}

export default function AlertCenter() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const add = (alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 5));
      const t = setTimeout(() => setAlerts((prev) => prev.filter((a) => a.id !== alert.id)), 9000);
      t.unref?.();
    };
    listeners.add(add);
    return () => listeners.delete(add);
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm backdrop-blur ${
            a.tone === "error"
              ? "border-red-400/50 bg-red-950/80 text-red-100"
              : a.tone === "warning"
                ? "border-amber-400/50 bg-amber-950/80 text-amber-100"
                : "border-emerald-400/50 bg-emerald-950/80 text-emerald-100"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{a.title}</p>
            <p className="text-xs opacity-80">{a.message}</p>
          </div>
          <button
            onClick={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))}
            className="opacity-60 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}