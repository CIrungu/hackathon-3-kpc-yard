import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export { API_BASE };

const TOKEN_PREFIX = "kpc_demo_token";
const LEGACY_TOKEN_KEY = "kpc_demo_token";

/**
 * Demo JWTs are minted per role. Pages log in with different roles
 * (gate-officer, driver, depot-manager, executive), so each role gets its
 * own localStorage slot instead of clobbering a single shared token.
 */
function tokenKey(role) {
  return `${TOKEN_PREFIX}_${role}`;
}

export function getToken(role) {
  if (role) return localStorage.getItem(tokenKey(role)) ?? localStorage.getItem(LEGACY_TOKEN_KEY);
  return localStorage.getItem(LEGACY_TOKEN_KEY);
}

export function setToken(token, role) {
  if (role && token) localStorage.setItem(tokenKey(role), token);
  if (token && !role) localStorage.setItem(LEGACY_TOKEN_KEY, token);
}

export function clearSession() {
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(TOKEN_PREFIX)) localStorage.removeItem(key);
  }
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

/** Pick the strongest available token for a request path. */
function pickTokenFor(url) {
  if (url.startsWith("/control-plane")) {
    return getToken("depot-manager") ?? getToken("executive") ?? getToken("gate-officer");
  }
  if (url.startsWith("/checkpoints") || url.startsWith("/gate")) {
    return getToken("gate-officer") ?? getToken("depot-manager");
  }
  if (url.startsWith("/driver")) {
    return getToken("driver") ?? getToken("depot-manager");
  }
  return getToken("depot-manager");
}

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = pickTokenFor(config.url ?? "");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error?.message ?? err.message ?? "Request failed";
    return Promise.reject(new Error(message));
  },
);

export async function authenticateDemo(role, name) {
  const { data } = await api.post("/auth/demo", { role, name });
  setToken(data.data.token, role);
  return data.data;
}

export const yardApi = {
  gateEntry: (payload) => api.post("/gate/entry", payload).then((r) => r.data.data),
  scanCheckpoint: (payload) => api.post("/checkpoints/scan", payload).then((r) => r.data.data),
  driverStatus: (token) => api.get(`/driver/${token}`).then((r) => r.data.data),
  metrics: () => api.get("/control-plane/metrics").then((r) => r.data.data),
  throughput: (days = 7) => api.get(`/control-plane/throughput?days=${days}`).then((r) => r.data.data),
  anomalies: () => api.get("/control-plane/anomalies").then((r) => r.data.data),
  runCycle: () => api.post("/control-plane/cycle").then((r) => r.data.data),
  snapshot: () => api.get("/control-plane/snapshot").then((r) => r.data.data),
  resequence: (movements) => api.post("/control-plane/resequence", { movements }).then((r) => r.data.data),
  setBayHealth: (bayId, status) => api.post(`/control-plane/bay/${bayId}/health`, { bayId, status }).then((r) => r.data.data),
  resolveAnomaly: (signature) => api.post(`/control-plane/anomalies/${signature}/resolve`, { resolution: "MANUAL_OVERRIDE" }).then((r) => r.data.data),
  allocate: (truckId) => api.post("/control-plane/allocate", { truckId }).then((r) => r.data.data),
  startLoading: (truckId, bayId) => api.post("/checkpoints/loading/start", { truckId, bayId }).then((r) => r.data.data),
  completeLoading: (truckId, bayId) => api.post("/checkpoints/loading/complete", { truckId, bayId }).then((r) => r.data.data),
};