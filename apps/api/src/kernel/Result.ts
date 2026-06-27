import { DomainError } from "./errors";

/** Explicit success/failure return for handlers - avoids throwing for expected paths. */
export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E = DomainError>(error: E): Result<never, E> => ({ ok: false, error });
