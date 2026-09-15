import { useEffect, useState, useCallback } from "react";
import { authenticateDemo } from "../services/api";

/**
 * Ensures a demo/session JWT is present for the given role and re-issues one
 * when the stored token is missing, stale, or was minted for a different role.
 */
export function useDemoAuth(role, name) {
  const [auth, setAuth] = useState(() => ({ token: null, ready: false, role: null }));
  const [error, setError] = useState(null);

  const login = useCallback(async () => {
    try {
      const session = await authenticateDemo(role, name);
      setAuth({ token: session.token, ready: true, role: session.role, name: session.name });
      setError(null);
    } catch (err) {
      setError(err.message);
      setAuth((a) => ({ ...a, ready: false }));
    }
  }, [role, name]);

  useEffect(() => {
    login();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...auth, error, login };
}