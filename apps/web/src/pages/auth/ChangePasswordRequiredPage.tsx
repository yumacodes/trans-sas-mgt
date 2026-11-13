import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { DEFAULT_USER_PASSWORD, newPasswordSchema, type NewPasswordInput } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { applyServerErrors, Field } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { zodForm } from '@/lib/zodForm';
import { AuthLayout } from './AuthLayout';
import { PasswordInput } from './LoginPage';

/**
 * Shown instead of the application the first time a user signs in with the default password.
 * The rest of the API stays closed until a new password has been saved.
 */
export function ChangePasswordRequiredPage() {
  const { me, signOut } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const [show, setShow] = useState(false);
  const form = useForm<NewPasswordInput>({
    resolver: zodForm(newPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    if (values.password === DEFAULT_USER_PASSWORD) {
      form.setError('password', { message: 'Choose a password that is different from the default one.' });
      return;
    }
    try {
      await run(() => api.post('/me/password', values), {
        pending: 'Saving your new password…',
        success: 'Password saved',
        blocking: true,
      });
      await queryClient.invalidateQueries({ queryKey: qk.me });
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <AuthLayout
      title="Choose your password"
      description={`Welcome${me ? `, ${me.user.fullName}` : ''}. You signed in with the default password, so choose one of your own before continuing. Use at least 10 characters, including a letter and a number.`}
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
          Save and continue
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
          Sign out
        </Button>
      </form>
    </AuthLayout>
  );
}
