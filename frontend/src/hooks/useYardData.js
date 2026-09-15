import { useEffect, useState, useCallback } from "react";
import { yardApi } from "../services/api";

/**
 * Poll a backend snapshot on an interval — used as a resilient fallback /
 * refresh channel alongside the SSE stream.
 *
 * `enabled` gates polling until auth is ready so the first poll never fires
 * before a role token exists (avoids a mount-time burst of 401s).
 */
export function usePoll(resolver, intervalMs = 5000, deps = [], enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const value = await resolver();
      setData(value);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [resolver, enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(true);
      return undefined;
    }
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, enabled, ...deps]);

  return { data, error, loading, refresh };
}

export function useYardSnapshot(intervalMs = 5000, enabled = true) {
  return usePoll(() => yardApi.snapshot(), intervalMs, [], enabled);
}

export function useMetrics(intervalMs = 10000, enabled = true) {
  return usePoll(() => yardApi.metrics(), intervalMs, [], enabled);
}

export function useAnomalies(intervalMs = 15000, enabled = true) {
  return usePoll(() => yardApi.anomalies(), intervalMs, [], enabled);
}

export function useEsg(intervalMs = 15000, enabled = true) {
  return usePoll(() => yardApi.esg(), intervalMs, [], enabled);
}

export function useCompliance(intervalMs = 10000, enabled = true) {
  return usePoll(() => yardApi.compliance(), intervalMs, [], enabled);
}

export function useIntegrations(intervalMs = 30000, enabled = true) {
  return usePoll(() => yardApi.integrations(), intervalMs, [], enabled);
}