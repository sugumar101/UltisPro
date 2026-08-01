import { Router } from 'express';
import { registerOrganizationSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.dto';
import { authService } from './auth.service';
import { sendSuccess } from '../../shared/response-envelope';
import { requireAuth } from './rbac.middleware';
import { rateLimit } from '../../shared/rate-limit.middleware';
import { env } from '../../config/env';
import type { Selectable } from 'kysely';
import type { UsersTable } from '../../shared/db';

export const authRouter = Router();

const REFRESH_COOKIE = 'ultispro_refresh_token';

// Rate limits on the endpoints most exposed to abuse: credential stuffing
// (login), spam org creation (register-organization), and email
// enumeration/mail-bombing (password/forgot, which also gates
// password/reset since a reset token is useless without a forgot-request
// first). /refresh, /logout, and /me are excluded — they require a valid
// existing session (cookie or JWT) rather than user-supplied credentials,
// so the abuse surface there is different and already mitigated by token
// expiry. See rate-limit.middleware.ts for the in-memory-vs-Redis tradeoff.
const registerOrgLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'auth:register-org' });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'auth:login' });
const forgotPasswordLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyPrefix: 'auth:forgot-password' });
const resetPasswordLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyPrefix: 'auth:reset-password' });

const cookieOptions = {
  // Unreadable to JavaScript, so an XSS payload can't exfiltrate the
  // long-lived refresh token even if it runs.
  httpOnly: true,
  // SameSite=None is only accepted alongside Secure, so force it on in that
  // case regardless of NODE_ENV — otherwise browsers drop the cookie
  // silently and logins appear to "randomly" not persist.
  secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
  sameSite: env.COOKIE_SAMESITE,
  // Scoped to the auth routes: no other endpoint needs this cookie, so it
  // isn't attached to every API call where it could leak via logs or a
  // misbehaving proxy.
  //
  // The prefix matters behind a subpath deployment: the browser matches the
  // cookie path against the public URL (/retailpro/api/v1/auth), not the
  // path Express sees once the proxy has stripped the prefix.
  path: `${env.PUBLIC_PATH_PREFIX}/api/v1/auth`,
};

/**
 * `Selectable<UsersTable>`, not `Pick<UsersTable, …>`: the raw table
 * interface describes columns in all three directions (select/insert/update),
 * so `id` there is `Generated<string>` rather than the `string` a query
 * actually returns. `Selectable<>` resolves each column to its select type,
 * which is what callers pass in — and removes the `as string` casts that
 * were papering over the mismatch.
 */
function toPublicUser(user: Pick<Selectable<UsersTable>, 'id' | 'organization_id' | 'email' | 'full_name'>) {
  return {
    id: user.id,
    organizationId: user.organization_id,
    email: user.email,
    fullName: user.full_name,
  };
}

authRouter.post('/auth/register-organization', registerOrgLimiter, async (req, res) => {
  const input = registerOrganizationSchema.parse(req.body);
  const result = await authService.registerOrganization(input, req.ip ?? null);
  res.cookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOptions, expires: result.refreshTokenExpiresAt });
  sendSuccess(res, { accessToken: result.accessToken, user: toPublicUser(result.user) }, 201);
});

authRouter.post('/auth/login', loginLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input, req.ip ?? null);
  res.cookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOptions, expires: result.refreshTokenExpiresAt });
  sendSuccess(res, { accessToken: result.accessToken, user: toPublicUser(result.user) });
});

authRouter.post('/auth/refresh', async (req, res) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  const result = await authService.refresh(token);
  res.cookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOptions, expires: result.refreshTokenExpiresAt });
  sendSuccess(res, { accessToken: result.accessToken, user: toPublicUser(result.user) });
});

authRouter.post('/auth/logout', async (req, res) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  await authService.logout(token);
  res.clearCookie(REFRESH_COOKIE, { path: cookieOptions.path });
  sendSuccess(res, { loggedOut: true });
});

authRouter.post('/auth/password/forgot', forgotPasswordLimiter, async (req, res) => {
  const input = forgotPasswordSchema.parse(req.body);
  await authService.forgotPassword(input.email);
  sendSuccess(res, { message: 'If that email is registered, a reset link has been sent.' });
});

authRouter.post('/auth/password/reset', resetPasswordLimiter, async (req, res) => {
  const input = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(input.token, input.newPassword);
  sendSuccess(res, { message: 'Password updated. Please log in again.' });
});

authRouter.get('/auth/me', requireAuth, async (req, res) => {
  const result = await authService.me(req.auth!.sub);
  sendSuccess(res, { user: toPublicUser(result.user), assignments: result.assignments });
});
