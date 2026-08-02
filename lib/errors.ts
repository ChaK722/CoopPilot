/**
 * Small application error taxonomy. Errors returned to the browser contain a
 * safe message and a correlation ID - never a stack trace or a secret.
 */

export type AppErrorKind =
  | "validation"
  | "unauthenticated"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "ai_unavailable"
  | "database_unavailable"
  | "unexpected";

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly correlationId: string;
  readonly safeMessage: string;

  constructor(kind: AppErrorKind, safeMessage: string, cause?: unknown) {
    super(safeMessage);
    this.name = "AppError";
    this.kind = kind;
    this.safeMessage = safeMessage;
    this.correlationId = crypto.randomUUID();
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.safeMessage;
  }
  if (error instanceof Error && error.message) {
    return "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}
