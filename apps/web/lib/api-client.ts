import type { ApiResponse, ApiSuccessResponse } from '@ultispro/shared-types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  public code: string;
  public details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

/**
 * `credentials: 'include'` is required on every call so the browser sends
 * (and stores) the httpOnly refresh-token cookie set by the API — see
 * apps/api/src/modules/auth/auth.routes.ts.
 */
export async function apiFetchEnvelope<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<ApiSuccessResponse<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });
  } catch (err) {
    // fetch() itself threw — the API is unreachable (not running, wrong
    // NEXT_PUBLIC_API_URL, CORS rejected the request, DNS failure, etc.).
    // This is the case that used to surface as a generic "Something went
    // wrong" everywhere: there's no JSON error envelope to read a message
    // from because no response ever came back.
    throw new ApiError(
      'NETWORK_ERROR',
      `Could not reach the API at ${API_BASE_URL}. Confirm the API is running and NEXT_PUBLIC_API_URL is correct. (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    // The API responded, but not with JSON — a proxy/500 HTML error page,
    // an uncaught exception outside Express's error handling, etc.
    throw new ApiError(
      'NETWORK_ERROR',
      `API returned a non-JSON response (HTTP ${res.status} ${res.statusText}).`,
    );
  }

  if (!json.success) {
    throw new ApiError(json.error.code, json.error.message, json.error.details);
  }

  return json;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const envelope = await apiFetchEnvelope<T>(path, options, accessToken);
  return envelope.data;
}
