/**
 * Application error type. Anything thrown as an AppError is rendered to the
 * client with its status/code/message; anything else becomes a 500 with a
 * generic message (details only go to the logs, keyed by request id).
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);
export const validationError = (details: unknown) =>
  new AppError(400, "VALIDATION_ERROR", "Request validation failed", details);
export const unauthorized = (message = "Authentication required") =>
  new AppError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "You do not have access to this resource") =>
  new AppError(403, "FORBIDDEN", message);
export const notFound = (resource: string) => new AppError(404, "NOT_FOUND", `${resource} not found`);
export const conflict = (message: string) => new AppError(409, "CONFLICT", message);
export const unprocessable = (code: string, message: string) => new AppError(422, code, message);
