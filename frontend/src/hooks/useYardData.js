import { useEffect, useState, useCallback } from "react";
import { yardApi } from "../services/api";

/**
 * Poll a backend snapshot on an interval — used as a resilient fallback /
 * refresh channel alongside the SSE stream.
 */
export function usePoll(resolver, intervalMs = 5000, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const value = await resolver();
      setData(value);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [resolver]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);

  return { data, error, loading, refresh };
}

export function useYardSnapshot(intervalMs = 5000) {
  return usePoll(() => yardApi.snapshot(), intervalMs);
}

export function useMetrics(intervalMs = 10000) {
  return usePoll(() => yardApi.metrics(), intervalMs);
}

export function useAnomalies(intervalMs = 15000) {
  return usePoll(() => yardApi.anomalies(), intervalMs);
}