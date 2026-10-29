import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodForm } from '@/lib/zodForm';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  passwordPolicy,
  profileUpdateSchema,
  type MeDto,
  type ProfileUpdateInput,
} from '@tsm/shared';
import { useAuth, useMe } from '@/auth/AuthProvider';
import { applyServerErrors, Field } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import { PasswordInput } from '@/pages/auth/LoginPage';

export default function AccountPage() {
  const me = useMe();
  return (
    <>
      <PageHeader title="Account settings" description="Your profile and sign-in details." />
      <div className="grid gap-5 lg:grid-cols-2">
        <ProfileCard me={me} />
        <PasswordCard email={me.user.email} />
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Access</CardTitle>
              <CardDescription>Assigned by an administrator.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-ink-subtle">Roles</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {me.user.roles.length ? (
                  me.user.roles.map((r) => (
                    <Badge key={r.id} tone="accent">
                      {r.name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-ink-muted">None</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-subtle">Branches</p>
              <p className="mt-1 text-sm text-ink">
                {me.allBranches
                  ? 'All branches'
                  : me.user.branches.map((b) => `${b.code} — ${b.name}`).join(', ') || 'None assigned'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ProfileCard({ me }: { me: MeDto }) {
  const { run } = useOperation();
  const queryClient = useQueryClient();
  const form = useForm<ProfileUpdateInput, unknown, z.output<typeof profileUpdateSchema>>({
    resolver: zodForm(profileUpdateSchema),
    defaultValues: { fullName: me.user.fullName, phone: me.user.phone ?? '' },
  });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    form.reset({ fullName: me.user.fullName, phone: me.user.phone ?? '' });
  }, [me.user.fullName, me.user.phone, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await run(() => api.patch<MeDto>('/me', values), {
        pending: 'Saving your profile…',
        success: 'Profile saved',
      });
      await queryClient.invalidateQueries({ queryKey: qk.me });
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            @{me.user.username} · {me.user.email}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Full name" error={errors.fullName?.message} required>
            <Input {...form.register('fullName')} />
          </Field>
          <Field label="Telephone" error={errors.phone?.message}>
            <Input type="tel" {...form.register('phone')} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={!isDirty}>
              Save profile
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    password: passwordPolicy,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  })
  .refine((v) => v.password !== v.currentPassword, {
    path: ['password'],
    message: 'Choose a password that is different from your current one.',
  });
type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Error the feedback dialog passes straight through, so the form can highlight one field. */
function fieldError(field: string, message: string) {
  return new ApiError({ status: 400, code: 'VALIDATION_FAILED', message, fields: { [field]: message } });
}

function changeFailure(code: string | undefined) {
  if (code === 'weak_password')
    return fieldError('password', 'This password is too weak. Use a longer password with letters and numbers.');
  if (code === 'same_password')
    return fieldError('password', 'Choose a password that is different from your current one.');
  return new ApiError({ status: 400, code: 'INTERNAL', message: "We couldn't change your password. Try again." });
}

function PasswordCard({ email }: { email: string }) {
  const { signOut } = useAuth();
  const { run } = useOperation();
  const [show, setShow] = useState(false);
  const form = useForm<ChangePasswordInput>({
    resolver: zodForm(changePasswordSchema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async ({ currentPassword, password }) => {
    try {
      await run(
        async () => {
          // Confirm the current password before allowing the change.
          const check = await supabase.auth.signInWithPassword({ email, password: currentPassword });
          if (check.error) throw fieldError('currentPassword', 'Your current password is incorrect.');
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw changeFailure(error.code);
        },
        { pending: 'Changing your password…', success: 'Password changed' },
      );
      form.reset();
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Password</CardTitle>
          <CardDescription>Use at least 10 characters, including a letter and a number.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Current password" error={errors.currentPassword?.message} required>
            <PasswordInput
              visible={show}
              onToggle={() => setShow((v) => !v)}
              autoComplete="current-password"
              {...form.register('currentPassword')}
            />
          </Field>
          <Field label="New password" error={errors.password?.message} required>
            <PasswordInput
              visible={show}
              onToggle={() => setShow((v) => !v)}
              autoComplete="new-password"
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
          <div className="flex items-center justify-between gap-2">
            <Button variant="link" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
            <Button type="submit">
              Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
