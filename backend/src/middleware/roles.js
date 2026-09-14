import { ApiError } from "./errorHandler.js";

export const ROLES = {
  GATE_OFFICER: "gate-officer",
  DRIVER: "driver",
  DEPOT_MANAGER: "depot-manager",
  EXECUTIVE: "executive",
  SYSTEM: "system",
};

export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized("Not authenticated"));
    if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Role '${req.user.role}' cannot perform this action`));
    }
    return next();
  };
}