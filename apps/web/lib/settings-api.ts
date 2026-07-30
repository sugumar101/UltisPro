import { apiFetch } from './api-client';

export interface Organization {
  id: string;
  legal_name: string;
  display_name: string;
  business_type: string;
  default_currency: string;
  timezone: string;
}

export interface Store {
  id: string;
  name: string;
  gstin: string | null;
  city: string | null;
}

export interface Branch {
  id: string;
  store_id: string;
  name: string;
  code: string;
  is_active: boolean;
}

export interface OrgUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
}

export interface Role {
  id: string;
  name: string;
  is_system: boolean;
}

export function getOrganization(token: string) {
  return apiFetch<Organization>('/api/v1/organizations/me', {}, token);
}

export function updateOrganization(
  token: string,
  input: Partial<{ legalName: string; displayName: string; businessType: string }>,
) {
  return apiFetch<Organization>('/api/v1/organizations/me', { method: 'PATCH', body: JSON.stringify(input) }, token);
}

export function listStores(token: string) {
  return apiFetch<Store[]>('/api/v1/stores', {}, token);
}

export function createStore(token: string, input: { name: string; gstin?: string }) {
  return apiFetch<Store>('/api/v1/stores', { method: 'POST', body: JSON.stringify(input) }, token);
}

export function listBranches(token: string) {
  return apiFetch<Branch[]>('/api/v1/branches', {}, token);
}

export function createBranch(token: string, storeId: string, input: { name: string; code: string }) {
  return apiFetch<Branch>(
    `/api/v1/stores/${storeId}/branches`,
    { method: 'POST', body: JSON.stringify(input) },
    token,
  );
}

export function listUsers(token: string) {
  return apiFetch<OrgUser[]>('/api/v1/users', {}, token);
}

export function inviteUser(
  token: string,
  input: {
    fullName: string;
    email: string;
    initialPassword: string;
    assignments: { branchId: string; roleId: string }[];
  },
) {
  return apiFetch<{ id: string; email: string; fullName: string }>(
    '/api/v1/users',
    { method: 'POST', body: JSON.stringify(input) },
    token,
  );
}

export function listRoles(token: string) {
  return apiFetch<Role[]>('/api/v1/roles', {}, token);
}
