'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { login } from '../../lib/auth-api';
import { ApiError } from '../../lib/api-client';
import { useAuthStore } from '../../lib/stores/auth-store';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);
    try {
      const result = await login(values);
      setSession(result.accessToken, result.user);
      router.push('/dashboard');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Soft brand wash behind the card — enough depth that the page doesn't
          read as a bare form on grey. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/20 via-secondary/15 to-transparent blur-3xl"
      />
      <Card className="w-full max-w-sm animate-fade-in-up shadow-card-hover">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md bg-gradient-to-br from-primary to-secondary shadow-sm">
            <span className="text-headline-md font-bold text-on-primary">U</span>
          </div>
          <h1 className="text-headline-md text-on-surface">UltisPro</h1>
          <p className="text-body-md text-on-surface-variant">Sign in to your workspace</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <FormField label="Email" error={errors.email?.message}>
              <Input type="email" {...register('email')} />
            </FormField>
            <FormField label="Password" error={errors.password?.message}>
              <Input type="password" {...register('password')} />
            </FormField>
            <div className="text-right">
              <Link className="text-sm text-primary hover:underline" href="/forgot-password">
                Forgot password?
              </Link>
            </div>
            {serverError ? <p className="text-sm text-error">{serverError}</p> : null}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-center text-sm text-on-surface-variant">
              New to UltisPro?{' '}
              <Link className="text-primary hover:underline" href="/signup">
                Create a workspace
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
