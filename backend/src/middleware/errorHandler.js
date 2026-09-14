export class ApiError extends Error {
  constructor(statusCode, message, code = "API_ERROR", details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details = null) {
    return new ApiError(400, message, "BAD_REQUEST", details);
  }
  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, message, "UNAUTHORIZED");
  }
  static forbidden(message = "Forbidden") {
    return new ApiError(403, message, "FORBIDDEN");
  }
  static notFound(message = "Resource not found") {
    return new ApiError(404, message, "NOT_FOUND");
  }
  static conflict(message) {
    return new ApiError(409, message, "CONFLICT");
  }
  static tooManyRequests(message = "Rate limit exceeded") {
    return new ApiError(429, message, "RATE_LIMITED");
  }
}

export function notFoundHandler(_req, _res, next) {
  next(ApiError.notFound("Route not found"));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  console.error("[error] Unhandled error:", err);
  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
}