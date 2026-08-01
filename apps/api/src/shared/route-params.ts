import type { Request } from 'express';
import { AppError } from './app-error';

/**
 * Reads a single route parameter as a string.
 *
 * Express 5 types `req.params` values as `string | string[]`, because a
 * pattern *can* capture a parameter more than once. None of this
 * application's routes do — they're all single captures like
 * `/products/:id` — but TypeScript can't know that from the route string
 * alone, so every `req.params.id` widens to a union and fails to satisfy a
 * `string` argument.
 *
 * Rather than sprinkle `as string` at ~60 call sites (which would silently
 * pass an array through if a route ever did repeat a param), this narrows
 * once, in one place, and fails loudly on the shape it doesn't expect.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];

  if (typeof value === 'string') return value;

  // Defensive: only reachable if a route is later written with a repeated
  // parameter, in which case the handler needs rewriting rather than
  // silently receiving "a,b" from an implicit array-to-string coercion.
  if (Array.isArray(value)) {
    throw new AppError('VALIDATION_ERROR', `Route parameter "${name}" was supplied more than once`);
  }

  throw new AppError('VALIDATION_ERROR', `Missing route parameter "${name}"`);
}
