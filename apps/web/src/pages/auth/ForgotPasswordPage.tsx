import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodForm } from '@/lib/zodForm';
import { Link } from 'react-router';
import { CheckCircle2 } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@tsm/shared';
import { applyServerErrors, Field } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { AuthLayout } from './AuthLayout';

export default function ForgotPasswordPage() {
  const { run } = useOperation();
  const [sent, setSent] = useState(false);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodForm(forgotPasswordSchema),
    defaultValues: { email: '', username: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      // The API answers identically whether or not the account exists, so the form
      // can't be used to discover accounts. Only rate limiting and outages surface.
      await run(() => api.post('/auth/forgot-password', values), {
        pending: 'Sending your request…',
        success: 'Request sent',
      });
      setSent(true);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  if (sent) {
    return (
      <AuthLayout title="Request sent">
        <div className="flex gap-3 rounded-md border border-success/25 bg-success-soft p-4 text-sm text-ink">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p>
            If those details match an account, your administrator has been told you need a password
            reset. They will give you a temporary password; sign in with it, then choose your own under
            Account settings.
          </p>
        </div>
        <Button asChild variant="secondary" className="mt-6 w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your email address and username. Your administrator will be notified and will give you a temporary password."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Email address" error={errors.email?.message} required>
          <Input type="email" autoComplete="email" autoFocus {...form.register('email')} />
        </Field>
        <Field label="Username" error={errors.username?.message} required>
          <Input autoComplete="username" autoCapitalize="none" spellCheck={false} {...form.register('username')} />
        </Field>
        <Button type="submit" className="w-full" size="lg">
          Request password reset
        </Button>
        <p className="text-center text-sm">
          <Link to="/login" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
