import { z } from "zod";
import { ValidationError } from "../kernel";

/** Parse untrusted input at the boundary; throw a mapped ValidationError on failure. */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError("Invalid request", result.error.issues);
  }
  return result.data;
}
