import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodForm } from '@/lib/zodForm';
import { Link, useNavigate } from 'react-router';
import { newPasswordSchema, type NewPasswordInput } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { applyServerErrors, Field, FormError } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { FullScreenLoader } from '@/components/app/FullScreenLoader';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { PasswordInput } from './LoginPage';

function linkErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const description = params.get('error_description') ?? hash.get('error_description');
  return description ? description.replace(/\+/g, ' ') : null;
}

/**
 * Turns a Supabase password failure into an error the form can show. The two cases the
 * user can fix are attached to the password field; anything else goes to the dialog.
 */
function passwordError(code: string | undefined) {
  const field =
    code === 'same_password'
      ? 'Choose a password that is different from your current one.'
      : code === 'weak_password'
        ? 'This password is too weak. Use a longer password with letters and numbers.'
        : null;
  return field
    ? new ApiError({ status: 400, code: 'VALIDATION_FAILED', message: field, fields: { password: field } })
    : new ApiError({
        status: 400,
        code: 'INTERNAL',
        message: "We couldn't update your password. Request a new link and try again.",
      });
}

/**
 * Landing page for password-recovery links. Supabase exchanges the link
 * for a short-lived session; the user then chooses a new password.
 */
export default function ResetPasswordPage() {
  const { status, session } = useAuth();
  const navigate = useNavigate();
  const [linkError] = useState(linkErrorFromUrl);
  const { run } = useOperation();
  const [show, setShow] = useState(false);

  const form = useForm<NewPasswordInput>({
    resolver: zodForm(newPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const { errors } = form.formState;

  if (status === 'loading' && !session && !linkError) {
    return <FullScreenLoader label="Verifying your link…" />;
  }

  if (!session) {
    return (
      <AuthLayout title="This link can't be used">
        <FormError
          message={
            linkError
              ? `The link is invalid or has expired (${linkError}).`
              : 'The link is invalid or has expired.'
          }
        />
        <p className="mt-4 text-sm text-ink-muted">
          Request a new password reset link. Links can only be used once and expire after a short
          time.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthLayout>
    );
  }

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await run(
        async () => {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw passwordError(error.code);
        },
        { pending: 'Updating your password…', success: 'Password updated' },
      );
      navigate('/', { replace: true });
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <AuthLayout
      title="Choose a new password"
      description={`For ${session.user.email ?? 'your account'}. Use at least 10 characters, including a letter and a number.`}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="New password" error={errors.password?.message} required>
          <PasswordInput
            visible={show}
            onToggle={() => setShow((v) => !v)}
            autoComplete="new-password"
            autoFocus
            {...form.register('password')}
          />
        </Field>
        <Field label="Confirm new password" error={errors.confirmPassword?.message} required>
          <PasswordInput
            visible={show}
            onToggle={() => setShow((v) => !v)}
            autoComplete="new-password"
            {...form.register('confirmPassword')}
          />
        </Field>
        <Button type="submit" className="w-full" size="lg">
          Save new password
        </Button>
      </form>
    </AuthLayout>
  );
}
