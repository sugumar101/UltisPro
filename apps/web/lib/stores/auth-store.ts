import { create } from 'zustand';

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
}

export interface AuthAssignment {
  branchId: string;
  storeId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  assignments: AuthAssignment[];
  setSession: (accessToken: string, user: AuthUser, assignments?: AuthAssignment[]) => void;
  setAssignments: (assignments: AuthAssignment[]) => void;
  clear: () => void;
}

/**
 * Access token lives only in memory (never localStorage/sessionStorage) —
 * page reloads re-derive it via a silent /auth/refresh call using the
 * httpOnly refresh cookie (see lib/hooks/use-require-auth.ts). This keeps
 * the access token out of reach of any XSS-injected script that could read
 * browser storage.
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  assignments: [],
  setSession: (accessToken, user, assignments = []) => set({ accessToken, user, assignments }),
  setAssignments: (assignments) => set({ assignments }),
  clear: () => set({ accessToken: null, user: null, assignments: [] }),
}));

export function hasPermission(assignments: AuthAssignment[], permission: string): boolean {
  return assignments.some((a) => a.permissions.includes(permission));
}
