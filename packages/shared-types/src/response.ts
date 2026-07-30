/**
 * The one API response envelope shape used by every UltisPro endpoint.
 * Mirrors docs/02-system-architecture.md §6. Consumed by both the Express
 * API (to build responses) and the Next.js web app (to parse them).
 */

export interface ResponseMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  [key: string]: unknown;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorPayload;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
