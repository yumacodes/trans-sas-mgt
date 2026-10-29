import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodForm } from '@/lib/zodForm';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import type { z } from 'zod';
import {
  PERMISSION_DEFINITIONS,
  PERMISSION_GROUPS,
  roleInputSchema,
  type Permission,
  type PermissionGroup,
  type RoleDto,
  type RoleInput,
} from '@tsm/shared';
import { ConfirmDialog, FormDialog } from '@/components/app/dialogs';
import { applyServerErrors, Field, FormGrid } from '@/components/app/form';
import { SectionLoader } from '@/components/app/FullScreenLoader';
import { useOperation } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { EmptyState, ErrorState } from '@/components/app/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { useRoles } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';

const GROUPED = (() => {
  const out = new Map<PermissionGroup, { key: Permission; description: string }[]>();
  for (const [key, def] of Object.entries(PERMISSION_DEFINITIONS) as [
    Permission,
    { group: PermissionGroup; description: string },
  ][]) {
    const list = out.get(def.group) ?? [];
    list.push({ key, description: def.description });
    out.set(def.group, list);
  }
  return out;
})();

const TOTAL = Object.keys(PERMISSION_DEFINITIONS).length;

export default function RolesPage() {
  const roles = useRoles();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const [form, setForm] = useState<{ open: boolean; role: RoleDto | null }>({ open: false, role: null });
  const [toDelete, setToDelete] = useState<RoleDto | null>(null);

  const remove = async (role: RoleDto) => {
    try {
      await run(() => api.delete(`/roles/${role.id}`), {
        pending: 'Deleting role…',
        success: `${role.name} deleted`,
      });
      void queryClient.invalidateQueries({ queryKey: qk.roles });
    } catch {
      /* explained in the feedback dialog */
    }
  };

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="What each role can see and do. Changes apply to every user holding the role."
        actions={
          <Button onClick={() => setForm({ open: true, role: null })}>
            <Plus aria-hidden /> New role
          </Button>
        }
      />
      {roles.isLoading ? (
        <SectionLoader />
      ) : roles.isError ? (
        <Card>
          <ErrorState message={errorMessage(roles.error)} onRetry={() => void roles.refetch()} />
        </Card>
      ) : (roles.data ?? []).length === 0 ? (
        <Card>
          <EmptyState title="No roles defined" />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roles.data!.map((r) => (
            <Card key={r.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {r.name}
                    {r.isSystem && (
                      <Badge tone="neutral">
                        <Lock className="size-3" aria-hidden /> System
                      </Badge>
                    )}
                  </h2>
                  <p className="mt-1 text-xs text-ink-muted">{r.description ?? 'No description'}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-ink-subtle">
                {r.permissions.length} of {TOTAL} permissions · {r.userCount} user{r.userCount === 1 ? '' : 's'}
              </p>
              <div className="mt-4 flex gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={() => setForm({ open: true, role: r })}>
                  <Pencil aria-hidden /> Edit permissions
                </Button>
                {!r.isSystem && r.userCount === 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setToDelete(r)}>
                    <Trash2 aria-hidden /> Delete
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <RoleFormDialog
        open={form.open}
        role={form.role}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete the ${toDelete?.name ?? ''} role?`}
        description="No users hold this role. Deleting it can't be undone."
        confirmLabel="Delete role"
        destructive
        onConfirm={() => toDelete && remove(toDelete)}
      />
    </>
  );
}

type Output = z.output<typeof roleInputSchema>;

function RoleFormDialog({
  open,
  role,
  onOpenChange,
}: {
  open: boolean;
  role: RoleDto | null;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const defaults = useMemo<RoleInput>(
    () => ({
      name: role?.name ?? '',
      description: role?.description ?? '',
      permissions: role?.permissions ?? [],
    }),
    [role],
  );
  const form = useForm<RoleInput, unknown, Output>({
    resolver: zodForm(roleInputSchema),
    defaultValues: defaults,
  });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (open) form.reset(defaults);
  }, [open, defaults, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await run(() => (role ? api.put(`/roles/${role.id}`, values) : api.post('/roles', values)), {
        pending: 'Saving role…',
        success: role ? 'Role updated' : 'Role created',
      });
      void queryClient.invalidateQueries({ queryKey: qk.roles });
      void queryClient.invalidateQueries({ queryKey: qk.me });
      form.reset(form.getValues());
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="xl"
      title={role ? `Edit ${role.name}` : 'New role'}
      description={
        role?.userCount
          ? `${role.userCount} user${role.userCount === 1 ? '' : 's'} will be affected by these changes.`
          : undefined
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-5">
          <FormGrid>
            <Field label="Role name" error={errors.name?.message} required>
              <Input {...form.register('name')} />
            </Field>
            <Field label="Description" error={errors.description?.message}>
              <Input {...form.register('description')} />
            </Field>
          </FormGrid>
          <Controller
            control={form.control}
            name="permissions"
            render={({ field }) => {
              const selected = new Set(field.value ?? []);
              const set = (keys: string[], on: boolean) => {
                const next = new Set(selected);
                keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
                field.onChange([...next]);
              };
              return (
                <div className="space-y-3">
                  {(Object.keys(PERMISSION_GROUPS) as PermissionGroup[]).map((group) => {
                    const perms = GROUPED.get(group) ?? [];
                    const keys = perms.map((p) => p.key);
                    const count = keys.filter((k) => selected.has(k)).length;
                    const all = count === keys.length;
                    return (
                      <fieldset key={group} className="rounded-md border border-border">
                        <legend className="sr-only">{PERMISSION_GROUPS[group].label}</legend>
                        <label className="flex cursor-pointer items-center gap-2.5 border-b border-border bg-surface-muted px-3 py-2">
                          <Checkbox
                            checked={all ? true : count > 0 ? 'indeterminate' : false}
                            onCheckedChange={() => set(keys, !all)}
                            aria-label={`Select all ${PERMISSION_GROUPS[group].label} permissions`}
                          />
                          <span className="text-sm font-semibold text-ink">{PERMISSION_GROUPS[group].label}</span>
                          <span className="ml-auto text-xs text-ink-subtle">
                            {count}/{keys.length}
                          </span>
                        </label>
                        <div className="grid gap-x-4 gap-y-1 p-3 sm:grid-cols-2">
                          {perms.map((p) => (
                            <label key={p.key} className="flex cursor-pointer items-start gap-2.5 py-1">
                              <Checkbox
                                className="mt-0.5"
                                checked={selected.has(p.key)}
                                onCheckedChange={(v) => set([p.key], v === true)}
                              />
                              <span>
                                <span className="block text-sm text-ink">{p.description}</span>
                                <span className="block font-mono text-[11px] text-ink-subtle">{p.key}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
              );
            }}
          />
          {errors.permissions?.message && (
            <p role="alert" className="text-xs text-danger">
              {errors.permissions.message}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">
            {role ? 'Save role' : 'Create role'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
