import type { NextFunction, Request, Response } from "express";

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    context: Record<string, unknown> | null;
    retryable: boolean;
  };
};

export class AppError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown> | null;
  readonly retryable: boolean;
  readonly statusCode: number;

  constructor(
    code: string,
    message: string,
    options?: {
      context?: Record<string, unknown> | null;
      retryable?: boolean;
      statusCode?: number;
    }
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.context = options?.context ?? null;
    this.retryable = options?.retryable ?? false;
    this.statusCode = options?.statusCode ?? 500;
  }
}

export function errorMiddleware(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction
): void {
  if (response.headersSent) {
    return;
  }

  const appError = error instanceof AppError
    ? error
    : new AppError("internal_error", "An unexpected error occurred", {
        context: null,
        retryable: true,
        statusCode: 500
      });

  const payload: ErrorEnvelope = {
    error: {
      code: appError.code,
      message: appError.message,
      context: appError.context,
      retryable: appError.retryable
    }
  };

  response.status(appError.statusCode).json(payload);
}