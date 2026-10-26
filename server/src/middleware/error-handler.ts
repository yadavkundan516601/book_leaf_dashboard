import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import type { ApiErrorBody } from "@bookleaf/shared";
import { AppError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";

const requestId = (req: Request) => (req.id === undefined ? undefined : String(req.id));

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    error: { code: "ROUTE_NOT_FOUND", message: `No route for ${req.method} ${req.path}`, requestId: requestId(req) },
  };
  res.status(404).json(body);
};

export function errorHandler(log: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    let status = 500;
    let body: ApiErrorBody = {
      error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side. Please try again.", requestId: requestId(req) },
    };

    if (err instanceof AppError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message, details: err.details, requestId: requestId(req) } };
    } else if (err?.type === "entity.parse.failed") {
      status = 400;
      body = { error: { code: "MALFORMED_JSON", message: "Request body is not valid JSON", requestId: requestId(req) } };
    } else if (err?.type === "entity.too.large") {
      status = 413;
      body = { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large", requestId: requestId(req) } };
    }

    if (status >= 500) log.error({ err, requestId: requestId(req) }, "unhandled error");
    if (res.headersSent) return;
    res.status(status).json(body);
  };
}
