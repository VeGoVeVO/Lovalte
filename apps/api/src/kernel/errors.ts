/** Domain/application error hierarchy. The HTTP layer maps `code` -> status. */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string = "DOMAIN_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION", details);
  }
}
export class NotFoundError extends DomainError {
  constructor(message = "Not found") {
    super(message, "NOT_FOUND");
  }
}
export class ConflictError extends DomainError {
  constructor(message = "Conflict") {
    super(message, "CONFLICT");
  }
}
export class UnauthorizedError extends DomainError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED");
  }
}
export class ForbiddenError extends DomainError {
  constructor(message = "Forbidden") {
    super(message, "FORBIDDEN");
  }
}
