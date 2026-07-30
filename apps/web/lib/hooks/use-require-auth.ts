'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../stores/auth-store';
import { refresh as refreshApi, fetchMe } from '../auth-api';

/**
 * Bootstraps an authenticated page. If the in-memory access token is
 * missing (e.g. after a full page reload), attempts a silent refresh via
 * the httpOnly cookie before giving up and redirecting to /login.
 */
export function useRequireAuth() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const assignments = useAuthStore((s) => s.assignments);
  const setSession = useAuthStore((s) => s.setSession);
  const setAssignments = useAuthStore((s) => s.setAssignments);
  const clear = useAuthStore((s) => s.clear);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (accessToken && user) {
        setReady(true);
        return;
      }

      try {
        const result = await refreshApi();
        if (cancelled) return;
        setSession(result.accessToken, result.user);

        const me = await fetchMe(result.accessToken);
        if (cancelled) return;
        setAssignments(me.assignments);
        setReady(true);
      } catch {
        if (cancelled) return;
        clear();
        router.replace('/login');
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
    // Intentionally runs once per mount; re-running on every store change
    // would fight the very state this effect sets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ready, user, assignments, accessToken };
}
