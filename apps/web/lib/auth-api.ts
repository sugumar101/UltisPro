import { apiFetch } from './api-client';
import type { AuthUser, AuthAssignment } from './stores/auth-store';

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export function registerOrganization(input: {
  organization: { legalName: string; displayName: string; businessType: string };
  owner: { fullName: string; email: string; password: string };
}) {
  return apiFetch<AuthResponse>('/api/v1/auth/register-organization', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function login(input: { email: string; password: string }) {
  return apiFetch<AuthResponse>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input) });
}

export function refresh() {
  return apiFetch<AuthResponse>('/api/v1/auth/refresh', { method: 'POST' });
}

export function logout() {
  return apiFetch<{ loggedOut: boolean }>('/api/v1/auth/logout', { method: 'POST' });
}

export function forgotPassword(email: string) {
  return apiFetch<{ message: string }>('/api/v1/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(input: { token: string; newPassword: string }) {
  return apiFetch<{ message: string }>('/api/v1/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchMe(accessToken: string) {
  return apiFetch<{ user: AuthUser; assignments: AuthAssignment[] }>('/api/v1/auth/me', {}, accessToken);
}
