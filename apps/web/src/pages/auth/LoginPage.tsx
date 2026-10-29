import { useState } from 'react';
import type { InputHTMLAttributes, Ref } from 'react';
import { useForm } from 'react-hook-form';
import { zodForm } from '@/lib/zodForm';
import { Link, Navigate, useSearchParams } from 'react-router';
import { Eye, EyeOff, Info } from 'lucide-react';
import { loginSchema, type LoginInput, type LoginResultDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { safeNextPath } from '@/auth/guards';
import { Field, FormError } from '@/components/app/form';
import { FullScreenLoader } from '@/components/app/FullScreenLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError, errorMessage, NETWORK_ERROR_MESSAGE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';

export const INVALID_CREDENTIALS_MESSAGE =
  "We couldn't sign you in with those details. Check your username or email and password and try again.";

export function signInErrorMessage(error: { message?: string; status?: number; code?: string }) {
  const msg = (error.message ?? '').toLowerCase();
  if (error.code === 'invalid_credentials' || msg.includes('invalid login credentials'))
    return INVALID_CREDENTIALS_MESSAGE;
  if (error.code === 'email_not_confirmed' || msg.includes('email not confirmed'))
    return 'Your email address has not been confirmed yet. Ask your administrator to check your account.';
  if (error.status === 429 || msg.includes('rate limit'))
    return 'Too many sign-in attempts. Wait a few minutes and try again.';
  if (msg.includes('fetch') || msg.includes('network')) return NETWORK_ERROR_MESSAGE;
  return "We couldn't sign you in right now. Try again in a moment.";
}

export default function LoginPage() {
  const { status, notice, clearNotice, meError, signOut } = useAuth();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodForm(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  if (status === 'signedIn') return <Navigate to={next} replace />;
  if (status === 'loading' && !isSubmitting) return <FullScreenLoader label="Checking your session…" />;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    clearNotice();
    if (status === 'error') await signOut();
    try {
      // The API resolves a username to its account email and signs in with Supabase Auth;
      // the browser client then takes over the session (refresh, sign-out).
      const session = await api.post<LoginResultDto>('/auth/login', values);
      const { error } = await supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      if (error) setFormError(signInErrorMessage(error));
    } catch (error) {
      setFormError(error instanceof ApiError ? errorMessage(error) : NETWORK_ERROR_MESSAGE);
    }
  });

  return (
    <AuthLayout title="Sign in" description="Use your username or company email address and password.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {notice && (
          <div
            role="status"
            className="flex gap-2 rounded-md border border-info/25 bg-info-soft px-3 py-2 text-sm text-info"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {notice}
          </div>
        )}
        <FormError message={formError} />
        {status === 'error' && (
          <FormError
            message={`You signed in, but we couldn't load your account. ${errorMessage(meError)}`}
          />
        )}
        <Field label="Username or email" error={errors.identifier?.message} required>
          <Input
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            {...form.register('identifier')}
          />
        </Field>
        <Field label="Password" error={errors.password?.message} required>
          <PasswordInput
            visible={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
            autoComplete="current-password"
            {...form.register('password')}
          />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-accent hover:underline">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting || status === 'loading'}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}

type PasswordInputProps = InputHTMLAttributes<HTMLInputElement> & {
  visible: boolean;
  onToggle: () => void;
  ref?: Ref<HTMLInputElement>;
};

export function PasswordInput({ visible, onToggle, ...props }: PasswordInputProps) {
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className="pr-10" {...props} />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-ink-subtle hover:text-ink"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
