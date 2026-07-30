import type { Response } from 'express';

interface Meta {
  page?: number;
  pageSize?: number;
  total?: number;
  [key: string]: unknown;
}

/** Matches docs/02-system-architecture.md §6 and @ultispro/shared-types ApiResponse. */
export function sendSuccess<T>(res: Response, data: T, statusCode = 200, meta?: Meta): Response {
  return res.status(statusCode).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return res
    .status(statusCode)
    .json({ success: false, error: { code, message, ...(details !== undefined ? { details } : {}) } });
}
