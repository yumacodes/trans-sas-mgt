import { useEffect } from 'react';
import { Controller, useForm, type Control, type FieldValues, type Path } from 'react-hook-form';
import { zodForm } from '@/lib/zodForm';
import { useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import {
  userAccessSchema,
  userCreateSchema,
  DEFAULT_USER_PASSWORD,
  userUpdateSchema,
  type UserAccessInput,
  type UserCreateInput,
  type UserDto,
  type UserUpdateInput,
} from '@tsm/shared';
import { ConfirmDialog, FormDialog } from '@/components/app/dialogs';
import {
  Field,
  FormGrid,
  FormSection,
  useIdempotencyKey,
} from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useBranchOptions, useRoles } from '@/lib/queries';
import { patchRecord } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';

function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.users });
    void queryClient.invalidateQueries({ queryKey: qk.roles });
  };
}

/** Checkbox list bound to an array-of-ids form field. */
function IdChecklist<T extends FieldValues>({
  control,
  name,
  options,
  emptyText,
}: {
  control: Control<T>;
  name: Path<T>;
  options: { id: string; label: string; description?: string }[];
  emptyText: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const value = (field.value as string[] | undefined) ?? [];
        if (options.length === 0) return <p className="text-sm text-ink-muted">{emptyText}</p>;
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((o) => {
              const checked = value.includes(o.id);
              return (
                <label
                  key={o.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2',
                    checked && 'border-accent bg-accent-soft',
                  )}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                    onCheckedChange={(v) =>
                      field.onChange(v === true ? [...value, o.id] : value.filter((id) => id !== o.id))
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">{o.label}</span>
                    {o.description && <span className="block text-xs text-ink-muted">{o.description}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        );
      }}
    />
  );
}

function useAccessOptions() {
  const roles = useRoles();
  const branches = useBranchOptions();
  return {
    roleOptions: (roles.data ?? []).map((r) => ({
      id: r.id,
      label: r.name,
      description: r.description ?? undefined,
    })),
    branchOptions: (branches.data ?? []).map((b) => ({ id: b.id, label: `${b.code} — ${b.name}` })),
  };
}

const BRANCH_HINT =
  'Users see records of their assigned branches. Roles with "access every branch" see all branches regardless.';

/* ---------- Create ---------- */

type CreateOutput = z.output<typeof userCreateSchema>;
const createDefaults: UserCreateInput = {
  email: '',
  username: '',
  fullName: '',
  phone: '',
  roleIds: [],
  branchIds: [],
};

export function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const invalidate = useInvalidateUsers();
  const { roleOptions, branchOptions } = useAccessOptions();
  const form = useForm<UserCreateInput, unknown, CreateOutput>({
    resolver: zodForm(userCreateSchema),
    defaultValues: createDefaults,
  });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (open) form.reset(createDefaults);
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    onOpenChange(false);
    form.reset(createDefaults);
    try {
      await run(() => api.post<UserDto>('/users', values, idem.keyFor(values)), {
        pending: 'Creating user account…',
        success: 'User account created',
        blocking: true,
      });
      idem.reset();
      invalidate();
    } catch {
      // The error dialog already explained the failure.
    }
  });

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} size="xl" title="New user">
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-6">
          <FormSection title="Profile">
            <FormGrid>
              <Field label="Full name" error={errors.fullName?.message} required>
                <Input autoFocus {...form.register('fullName')} />
              </Field>
<Field
                label="Username"
                error={errors.username?.message}
                required
                hint="Used to sign in, as an alternative to the email address."
              >
                <Input autoComplete="off" autoCapitalize="none" spellCheck={false} {...form.register('username')} />
              </Field>
              <Field label="Email address" error={errors.email?.message} required hint="Used for account contact details.">
                <Input type="email" autoComplete="off" {...form.register('email')} />
              </Field>
              <Field label="Telephone" error={errors.phone?.message}>
                <Input type="tel" {...form.register('phone')} />
              </Field>
            </FormGrid>
          </FormSection>

          <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">
            The account starts with the password <strong className="font-mono text-ink">{DEFAULT_USER_PASSWORD}</strong>.
            The user is asked to choose their own the first time they sign in.
          </p>

          <FormSection title="Roles" description="Roles determine what the user can see and do.">
            <IdChecklist control={form.control} name="roleIds" options={roleOptions} emptyText="No roles available." />
            {errors.roleIds?.message && (
              <p role="alert" className="text-xs text-danger">
                {errors.roleIds.message}
              </p>
            )}
          </FormSection>

          <FormSection title="Branches" description={BRANCH_HINT}>
            <IdChecklist
              control={form.control}
              name="branchIds"
              options={branchOptions}
              emptyText="No branches have been created yet."
            />
          </FormSection>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">
            Create user
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}

/* ---------- Edit profile ---------- */

type UpdateOutput = z.output<typeof userUpdateSchema>;

export function EditUserDialog({ user, onOpenChange }: { user: UserDto | null; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const invalidate = useInvalidateUsers();
  const form = useForm<UserUpdateInput, unknown, UpdateOutput>({ resolver: zodForm(userUpdateSchema) });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (user) form.reset({ username: user.username, fullName: user.fullName, phone: user.phone ?? '' });
  }, [user, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user) return;
    onOpenChange(false);
    try {
      await run(() => api.put(`/users/${user.id}`, values), {
        pending: 'Saving user…',
        success: 'User updated',
        optimistic: () =>
          patchRecord<UserDto>(queryClient, qk.users, user.id, {
            fullName: values.fullName,
            phone: values.phone ?? null,
          }),
      });
      invalidate();
    } catch {
      // The error dialog already explained the failure.
    }
  });

  return (
    <FormDialog
      open={Boolean(user)}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="md"
      title={`Edit ${user?.fullName ?? 'user'}`}
      description={user?.email}
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-4">
          <Field label="Full name" error={errors.fullName?.message} required>
            <Input {...form.register('fullName')} />
          </Field>
          <Field label="Username" error={errors.username?.message} required hint="Used to sign in.">
            <Input autoComplete="off" autoCapitalize="none" spellCheck={false} {...form.register('username')} />
          </Field>
          <Field label="Telephone" error={errors.phone?.message}>
            <Input type="tel" {...form.register('phone')} />
          </Field>
          <p className="text-xs text-ink-muted">
            The email address can&apos;t be changed here. Create a new account if a user&apos;s email
            address changes.
          </p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">
            Save changes
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}

/* ---------- Access (roles & branches) ---------- */

export function UserAccessDialog({ user, onOpenChange }: { user: UserDto | null; onOpenChange: (o: boolean) => void }) {
  const { run } = useOperation();
  const invalidate = useInvalidateUsers();
  const { roleOptions, branchOptions } = useAccessOptions();
  const form = useForm<UserAccessInput>({ resolver: zodForm(userAccessSchema) });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (user)
      form.reset({ roleIds: user.roles.map((r) => r.id), branchIds: user.branches.map((b) => b.id) });
  }, [user, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user) return;
    onOpenChange(false);
    try {
      await run(() => api.put(`/users/${user.id}/access`, values), {
        pending: 'Updating access…',
        success: 'Access updated',
        blocking: true,
      });
      invalidate();
    } catch {
      // The error dialog already explained the failure.
    }
  });

  return (
    <FormDialog
      open={Boolean(user)}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="lg"
      title={`Access for ${user?.fullName ?? 'user'}`}
      description="Changes take effect on the user's next request."
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-6">
          <FormSection title="Roles">
            <IdChecklist control={form.control} name="roleIds" options={roleOptions} emptyText="No roles available." />
            {errors.roleIds?.message && (
              <p role="alert" className="text-xs text-danger">
                {errors.roleIds.message}
              </p>
            )}
          </FormSection>
          <FormSection title="Branches" description={BRANCH_HINT}>
            <IdChecklist
              control={form.control}
              name="branchIds"
              options={branchOptions}
              emptyText="No branches have been created yet."
            />
          </FormSection>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">
            Save access
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}

/* ---------- Reset to the default password ---------- */

export function TemporaryPasswordDialog({
  user,
  onClose,
}: {
  user: Pick<UserDto, 'id' | 'fullName'> | null;
  onClose: () => void;
}) {
  const { run } = useOperation();
  const invalidate = useInvalidateUsers();

  const reset = async () => {
    if (!user) return;
    try {
      await run(() => api.post(`/users/${user.id}/temporary-password`), {
        pending: 'Resetting password…',
        success: `Password reset for ${user.fullName}`,
        blocking: true,
      });
      invalidate();
    } catch {
      // The error dialog already explained the failure.
    }
  };

  return (
    <ConfirmDialog
      open={Boolean(user)}
      onOpenChange={(o) => !o && onClose()}
      title="Reset to the default password?"
      description={
        <p>
          {user?.fullName}'s password will be replaced with {DEFAULT_USER_PASSWORD}. They will be asked to choose a
          new one the next time they sign in.
        </p>
      }
      confirmLabel="Reset password"
      destructive
      onConfirm={reset}
    />
  );
}
