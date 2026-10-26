import type { ApiErrorBody } from "@bookleaf/shared";
import { z } from "zod";

const BASE = "/api/v1";

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: FieldError[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const fieldErrorsSchema = z.array(z.object({ field: z.string(), message: z.string() }));

let onUnauthorized: (() => void) | null = null;

/** Registered by AuthProvider: a 401 anywhere means the session is gone. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

type QueryValue = string | number | readonly string[] | undefined | null;

/** Builds a query string; arrays become repeated params (status=open&status=in_progress). */
export function toQueryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => search.append(key, v));
    else search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** For calls where 401 is an expected answer (login, session probe), not a lost session. */
  expectUnauthorized?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, expectUnauthorized = false } = options;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;

  const payload: unknown = await res.json().catch(() => null);
  if (res.ok) return payload as T;

  const err = (payload as Partial<ApiErrorBody> | null)?.error;
  const details = fieldErrorsSchema.safeParse(err?.details);
  const apiError = new ApiError(
    res.status,
    err?.code ?? "HTTP_ERROR",
    err?.message ??
      (res.status >= 500
        ? "The server is unavailable right now. Please try again in a moment."
        : `Request failed (${res.status})`),
    details.success ? details.data : [],
    err?.requestId,
  );
  if (res.status === 401 && !expectUnauthorized) onUnauthorized?.();
  throw apiError;
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";
