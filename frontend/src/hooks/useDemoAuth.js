import { useEffect, useState, useCallback } from "react";
import { authenticateDemo, getToken } from "../services/api";

function tokenRole(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

/**
 * Ensures a demo/session JWT is present for the given role and re-issues one
 * when the stored token is missing, stale, or was minted for a different role.
 */
export function useDemoAuth(role, name) {
  const [auth, setAuth] = useState(() => ({
    token: getToken(role) ?? null,
    ready: Boolean(getToken(role)),
    role: null,
  }));
  const [error, setError] = useState(null);

  const login = useCallback(async () => {
    try {
      const session = await authenticateDemo(role, name);
      setAuth({ token: session.token, ready: true, role: session.role, name: session.name });
      setError(null);
    } catch (err) {
      setError(err.message);
      setAuth((a) => ({ ...a, ready: true }));
    }
  }, [role, name]);

  useEffect(() => {
    const stored = getToken(role);
    if (!stored || tokenRole(stored) !== role) login();
    else setAuth((a) => ({ ...a, ready: true, role }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...auth, error, login };
}