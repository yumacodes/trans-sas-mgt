import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodForm } from '@/lib/zodForm';
import { useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import {
  clientInputSchema,
  ORGANIZATION_TYPE_LABELS,
  ORGANIZATION_TYPES,
  type ClientDto,
  type ClientInput,
} from '@tsm/shared';
import { FormDialog } from '@/components/app/dialogs';
import { applyServerErrors, Field, FormGrid, useIdempotencyKey } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useBranchOptions, useUserOptions } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';

type ClientOutput = z.output<typeof clientInputSchema>;

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

function toFormValues(client?: ClientDto | null): ClientInput {
  return {
    name: client?.name ?? '',
    organizationType: client?.organizationType ?? ('' as ClientInput['organizationType']),
    contactPerson: client?.contactPerson ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    billingAddress: client?.billingAddress ?? '',
    deliveryAddress: client?.deliveryAddress ?? '',
    taxId: client?.taxId ?? '',
    notes: client?.notes ?? '',
    branchId: client?.branch?.id ?? null,
    accountOwnerId: client?.accountOwner?.id ?? null,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  client?: ClientDto | null;
  onSaved?: (client: ClientDto) => void;
}

export function ClientFormDialog({ open, onOpenChange, client, onSaved }: Props) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const branches = useBranchOptions();
  const owners = useUserOptions();
  const isEdit = Boolean(client);

  const form = useForm<ClientInput, unknown, ClientOutput>({
    resolver: zodForm(clientInputSchema),
    defaultValues: toFormValues(client),
  });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (open) form.reset(toFormValues(client));
  }, [open, client, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await run(
        () =>
          isEdit
            ? api.put<ClientDto>(`/clients/${client!.id}`, values)
            : api.post<ClientDto>('/clients', values, idem.keyFor(values)),
        {
          pending: isEdit ? 'Saving changes…' : 'Creating client…',
          success: isEdit ? 'Client updated' : 'Client created',
        },
      );
      idem.reset();
      await queryClient.invalidateQueries({ queryKey: qk.clients });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      form.reset(toFormValues(saved));
      onOpenChange(false);
      onSaved?.(saved);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      title={isEdit ? `Edit ${client!.name}` : 'New client'}
      description={
        isEdit
          ? `Client code ${client!.code}`
          : 'A client code is assigned automatically when the client is saved.'
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-4">
          <FormGrid>
            <Field label="Client or organization name" error={errors.name?.message} required className="sm:col-span-2">
              <Input autoFocus {...form.register('name')} />
            </Field>
            <Field label="Organization type" error={errors.organizationType?.message} required>
              <NativeSelect {...form.register('organizationType')}>
                <option value="">Select a type…</option>
                {ORGANIZATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ORGANIZATION_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Contact person" error={errors.contactPerson?.message}>
              <Input {...form.register('contactPerson')} />
            </Field>
            <Field label="Email address" error={errors.email?.message}>
              <Input type="email" {...form.register('email')} />
            </Field>
            <Field label="Telephone" error={errors.phone?.message}>
              <Input type="tel" {...form.register('phone')} />
            </Field>
            <Field label="Billing address" error={errors.billingAddress?.message}>
              <Textarea {...form.register('billingAddress')} />
            </Field>
            <Field label="Delivery address" error={errors.deliveryAddress?.message}>
              <Textarea {...form.register('deliveryAddress')} />
            </Field>
            <Field label="Tax / registration ID" error={errors.taxId?.message}>
              <Input {...form.register('taxId')} />
            </Field>
            <Field
              label="Branch"
              error={errors.branchId?.message}
              hint="Leave empty if the client is shared by all branches."
            >
              <NativeSelect {...form.register('branchId', { setValueAs: emptyToNull })}>
                <option value="">All branches</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Account owner" error={errors.accountOwnerId?.message}>
              <NativeSelect {...form.register('accountOwnerId', { setValueAs: emptyToNull })}>
                <option value="">Not assigned</option>
                {owners.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Notes" error={errors.notes?.message} className="sm:col-span-2">
              <Textarea rows={3} {...form.register('notes')} />
            </Field>
          </FormGrid>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">
            {isEdit ? 'Save changes' : 'Create client'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
