import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './app-error';
import { sendError } from './response-envelope';
import { logger } from './logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`);
}

/**
 * Centralized error handler (Express 5 forwards rejected promises from
 * async route handlers here automatically — no catchAsync wrapper needed).
 * Must keep the 4-arg signature for Express to recognize it as an error
 * middleware even though `next` is unused.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId: req.requestId }, err.message);
    } else {
      logger.warn({ code: err.code, requestId: req.requestId }, err.message);
    }
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', err.flatten());
    return;
  }

  // Anything reaching here is a bug or an unmodeled failure (a raw driver
  // error from `pg`, a bad Neon connection string, a missing env var that
  // should have failed fast at boot but didn't, etc.) — not a condition any
  // service deliberately threw an AppError for. Always log the full error
  // with request context so it's grep-able in server logs regardless of
  // environment.
  const err_ = err instanceof Error ? err : new Error(String(err));
  logger.error(
    { err: err_, requestId: req.requestId, method: req.method, path: req.originalUrl },
    'Unhandled error',
  );

  // Outside production, put the real message (and, for non-Error throws or
  // when it helps, the stack) in the response body instead of the generic
  // placeholder — this is exactly what makes "Something went wrong" useless
  // for debugging a broken signup/checkout/etc. locally. Withheld in
  // production because these messages can contain raw driver/SQL detail
  // (connection strings, table names, constraint names) that shouldn't be
  // handed to an end user; production still gets the full detail in the
  // server log line above.
  const message = env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err_.message;
  const details = env.NODE_ENV === 'production' ? undefined : { stack: err_.stack };
  sendError(res, 500, 'INTERNAL_ERROR', message, details);
}
