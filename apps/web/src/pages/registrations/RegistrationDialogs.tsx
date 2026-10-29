import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodForm } from '@/lib/zodForm';
import { useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import {
  REGISTRATION_TRANSITIONS,
  registrationCreateSchema,
  registrationUpdateSchema,
  type ClientOptionDto,
  type RegistrationCreateInput,
  type RegistrationDto,
  type RegistrationStatus,
  type RegistrationUpdateInput,
} from '@tsm/shared';
import { ClientPicker } from '@/components/app/ClientPicker';
import { FormDialog } from '@/components/app/dialogs';
import { applyServerErrors, Field, FormError, FormGrid, useIdempotencyKey } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { REGISTRATION_STATUS_LABELS } from '@/components/app/StatusBadges';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { qk } from '@/lib/queryKeys';

function useInvalidateRegistrations() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.registrations });
    void queryClient.invalidateQueries({ queryKey: qk.clients });
    void queryClient.invalidateQueries({ queryKey: qk.dashboard });
  };
}

/* ---------- Create ---------- */

type CreateOutput = z.output<typeof registrationCreateSchema>;

const createDefaults = (): RegistrationCreateInput => ({
  clientId: '',
  registrationNumber: '',
  registeredOn: todayIso(),
  validUntil: null,
  status: 'active',
  notes: '',
});

export function RegisterClientDialog({
  open,
  onOpenChange,
  initialClient,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialClient?: ClientOptionDto | null;
}) {
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const invalidate = useInvalidateRegistrations();
  const [client, setClient] = useState<ClientOptionDto | null>(null);
  const form = useForm<RegistrationCreateInput, unknown, CreateOutput>({
    resolver: zodForm(registrationCreateSchema),
    defaultValues: createDefaults(),
  });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (!open) return;
    form.reset({ ...createDefaults(), clientId: initialClient?.id ?? '' });
    setClient(initialClient ?? null);
    // Reset only when the dialog opens, never while the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await run(() => api.post<RegistrationDto>('/registrations', values, idem.keyFor(values)), {
        pending: 'Registering client…',
        success: 'Client registered',
      });
      idem.reset();
      invalidate();
      form.reset(createDefaults());
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
      title="Register a client"
      description="Registration is recorded against an existing client; the client record itself is not duplicated."
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-4">
          <Field label="Client" error={errors.clientId?.message} required>
            <ClientPicker
              value={client}
              onChange={(c) => {
                setClient(c);
                form.setValue('clientId', c?.id ?? '', { shouldDirty: true, shouldValidate: Boolean(c) });
              }}
            />
          </Field>
          <FormGrid>
            <Field
              label="Registration number"
              error={errors.registrationNumber?.message}
              hint="Leave empty to assign the next number automatically."
            >
              <Input {...form.register('registrationNumber')} />
            </Field>
            <Field label="Initial status" error={errors.status?.message} required>
              <NativeSelect {...form.register('status')}>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
              </NativeSelect>
            </Field>
            <Field label="Registration date" error={errors.registeredOn?.message} required>
              <Input type="date" {...form.register('registeredOn')} />
            </Field>
            <Field label="Valid until" error={errors.validUntil?.message} hint="Optional.">
              <Input type="date" {...form.register('validUntil', { setValueAs: (v) => v || null })} />
            </Field>
          </FormGrid>
          <Field label="Notes" error={errors.notes?.message}>
            <Textarea {...form.register('notes')} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">
            Register client
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}

/* ---------- Edit ---------- */

type UpdateOutput = z.output<typeof registrationUpdateSchema>;

export function EditRegistrationDialog({
  registration,
  onOpenChange,
}: {
  registration: RegistrationDto | null;
  onOpenChange: (o: boolean) => void;
}) {
  const { run } = useOperation();
  const invalidate = useInvalidateRegistrations();
  const form = useForm<RegistrationUpdateInput, unknown, UpdateOutput>({
    resolver: zodForm(registrationUpdateSchema),
  });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (registration)
      form.reset({
        registeredOn: registration.registeredOn,
        validUntil: registration.validUntil,
        notes: registration.notes ?? '',
      });
  }, [registration, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!registration) return;
    try {
      await run(() => api.put(`/registrations/${registration.id}`, values), {
        pending: 'Saving registration…',
        success: 'Registration updated',
      });
      invalidate();
      form.reset(form.getValues());
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <FormDialog
      open={Boolean(registration)}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="md"
      title={`Edit registration ${registration?.registrationNumber ?? ''}`}
      description={registration?.client.name}
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-4">
          <FormGrid>
            <Field label="Registration date" error={errors.registeredOn?.message} required>
              <Input type="date" {...form.register('registeredOn')} />
            </Field>
            <Field label="Valid until" error={errors.validUntil?.message}>
              <Input type="date" {...form.register('validUntil', { setValueAs: (v) => v || null })} />
            </Field>
          </FormGrid>
          <Field label="Notes" error={errors.notes?.message}>
            <Textarea {...form.register('notes')} />
          </Field>
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

/* ---------- Status change ---------- */

interface StatusForm {
  status: RegistrationStatus | '';
  reason: string;
}

export function RegistrationStatusDialog({
  registration,
  onOpenChange,
}: {
  registration: RegistrationDto | null;
  onOpenChange: (o: boolean) => void;
}) {
  const { run } = useOperation();
  const invalidate = useInvalidateRegistrations();
  const [error, setError] = useState<string | null>(null);
  const next = registration ? REGISTRATION_TRANSITIONS[registration.status] : [];
  const form = useForm<StatusForm>({ defaultValues: { status: '', reason: '' } });
  const { isDirty } = form.formState;

  useEffect(() => {
    if (registration) {
      form.reset({ status: '', reason: '' });
      setError(null);
    }
  }, [registration, form]);

  const onSubmit = form.handleSubmit(async ({ status, reason }) => {
    if (!registration) return;
    if (!status) {
      setError('Select the new status.');
      return;
    }
    try {
      await run(
        () =>
          api.post(`/registrations/${registration.id}/status`, {
            status,
            reason: reason.trim() || null,
          }),
        { pending: 'Updating status…', success: `Registration ${REGISTRATION_STATUS_LABELS[status].toLowerCase()}` },
      );
      invalidate();
      form.reset({ status: '', reason: '' });
      onOpenChange(false);
    } catch {
      /* explained in the feedback dialog */
    }
  });

  return (
    <FormDialog
      open={Boolean(registration)}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="sm"
      title="Change registration status"
      description={
        registration
          ? `${registration.registrationNumber} · ${registration.client.name} · currently ${REGISTRATION_STATUS_LABELS[registration.status]}`
          : undefined
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-4">
          <FormError message={error} />
          {next.length === 0 ? (
            <p className="text-sm text-ink-muted">
              A {registration ? REGISTRATION_STATUS_LABELS[registration.status].toLowerCase() : ''}{' '}
              registration can&apos;t be changed. Register the client again if needed.
            </p>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-xs font-medium text-ink-muted">New status</legend>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <div className="space-y-1.5">
                      {next.map((s) => (
                        <label
                          key={s}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                        >
                          <input
                            type="radio"
                            name={field.name}
                            value={s}
                            checked={field.value === s}
                            onChange={() => field.onChange(s)}
                            className="accent-[var(--color-accent)]"
                          />
                          {REGISTRATION_STATUS_LABELS[s]}
                          {s === 'revoked' && (
                            <span className="ml-auto text-xs text-danger">Cannot be undone</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                />
              </fieldset>
              <Field label="Reason" hint="Recorded in the audit history.">
                <Textarea {...form.register('reason')} maxLength={500} />
              </Field>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          {next.length > 0 && (
            <Button type="submit">
              Update status
            </Button>
          )}
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
