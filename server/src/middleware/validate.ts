import type { ZodType } from "zod";
import { validationError } from "../lib/errors.js";

/** Parse untrusted input with a Zod schema, mapping failures to a 400 with per-field details. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw validationError(
      result.error.issues.map((i) => ({ field: i.path.join(".") || null, message: i.message })),
    );
  }
  return result.data;
}
