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
import { registerOrganization } from '../../lib/auth-api';
import { ApiError } from '../../lib/api-client';
import { useAuthStore } from '../../lib/stores/auth-store';

const BUSINESS_TYPES = [
  'general',
  'clothing',
  'supermarket',
  'electronics',
  'mobile',
  'grocery',
  'pharmacy',
  'hardware',
] as const;

const signupSchema = z.object({
  legalName: z.string().min(2, 'Required'),
  displayName: z.string().min(2, 'Required'),
  businessType: z.enum(BUSINESS_TYPES),
  fullName: z.string().min(2, 'Required'),
  email: z.string().email('Enter a valid email'),
  // Mirrors the API's policy (apps/api/src/modules/auth/auth.dto.ts) so the
  // user is told before submitting rather than by a server rejection.
  password: z
    .string()
    .min(10, 'At least 10 characters — a short phrase works well')
    .max(72, 'At most 72 characters'),
});
type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { businessType: 'general' },
  });

  async function onSubmit(values: SignupFormValues) {
    setServerError(null);
    try {
      const result = await registerOrganization({
        organization: {
          legalName: values.legalName,
          displayName: values.displayName,
          businessType: values.businessType,
        },
        owner: { fullName: values.fullName, email: values.email, password: values.password },
      });
      setSession(result.accessToken, result.user);
      router.push('/dashboard');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <h1 className="font-headline-md text-headline-md text-primary">Create your UltisPro workspace</h1>
          <p className="text-body-md text-on-surface-variant">
            This sets up your organization, a default store and branch, and your owner account in one step.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Legal business name" error={errors.legalName?.message}>
                <Input {...register('legalName')} />
              </FormField>
              <FormField label="Display name" error={errors.displayName?.message}>
                <Input {...register('displayName')} />
              </FormField>
            </div>
            <FormField label="Business type" error={errors.businessType?.message}>
              <select
                className="w-full rounded border border-outline-variant px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                {...register('businessType')}
              >
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </FormField>
            <hr className="border-outline-variant" />
            <FormField label="Your full name" error={errors.fullName?.message}>
              <Input {...register('fullName')} />
            </FormField>
            <FormField label="Email" error={errors.email?.message}>
              <Input type="email" {...register('email')} />
            </FormField>
            <FormField label="Password" error={errors.password?.message}>
              <Input type="password" {...register('password')} />
            </FormField>
            {serverError ? <p className="text-sm text-error">{serverError}</p> : null}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Creating workspace…' : 'Create workspace'}
            </Button>
            <p className="text-center text-sm text-on-surface-variant">
              Already have an account?{' '}
              <Link className="text-primary hover:underline" href="/login">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
