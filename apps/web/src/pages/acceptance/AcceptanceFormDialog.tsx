import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import {
  acceptanceBody,
  acceptanceInputSchema,
  acceptanceSubject,
  type AcceptanceDefaultsDto,
  type AcceptanceDto,
  type AcceptanceInput,
  type TenderDto,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { FormDialog } from '@/components/app/dialogs';
import { CustomerInput } from '@/components/app/DocumentPickers';
import { Field, FormGrid, FormSection, useIdempotencyKey } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { insertRecord, patchRecord, pendingId } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { zodForm } from '@/lib/zodForm';

type Output = z.output<typeof acceptanceInputSchema>;

const BASE = '/acceptance-letters';
const nullIfEmpty = (v: unknown) => (v === '' || v === undefined ? null : v);

function toFormValues(l?: AcceptanceDto | null, defaults?: AcceptanceDefaultsDto): AcceptanceInput {
  if (!l) {
    return {
      letterDate: todayIso(),
      yourReference: '',
      clientId: null,
      recipientName: '',
      recipientAddress: '',
      contractNumber: '',
      awardLetterDate: null,
      supplyDescription: 'MEDICAL ITEMS',
      subject: acceptanceSubject(''),
      body: acceptanceBody({ supplyDescription: 'MEDICAL ITEMS' }),
      signatoryName: defaults?.signatoryName ?? '',
      signatoryTitle: defaults?.signatoryTitle ?? '',
      tenderId: null,
    };
  }
  return {
    letterDate: l.letterDate,
    yourReference: l.yourReference ?? '',
    clientId: l.clientId,
    recipientName: l.recipientName,
    recipientAddress: l.recipientAddress ?? '',
    contractNumber: l.contractNumber,
    awardLetterDate: l.awardLetterDate,
    supplyDescription: l.supplyDescription,
    subject: l.subject,
    body: l.body,
    signatoryName: l.signatoryName,
    signatoryTitle: l.signatoryTitle ?? '',
    tenderId: l.tender?.id ?? null,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing a draft. */
  letter?: AcceptanceDto | null;
  onSaved?: (letter: AcceptanceDto) => void;
}

export function AcceptanceFormDialog({ open, onOpenChange, letter, onSaved }: Props) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const isEdit = Boolean(letter);

  const nextNumber = useQuery({
    queryKey: [...qk.acceptanceLetters, 'next-number'],
    queryFn: ({ signal }) => api.get<{ number: string }>(`${BASE}/next-number`, undefined, signal),
    enabled: open && !isEdit,
    staleTime: 0,
    gcTime: 0,
  });
  const defaults = useQuery({
    queryKey: [...qk.acceptanceLetters, 'defaults'],
    queryFn: ({ signal }) => api.get<AcceptanceDefaultsDto>(`${BASE}/defaults`, undefined, signal),
    enabled: open && !isEdit,
  });
  // Price schedules to link the award to, for users who can see them.
  const tenders = useQuery({
    queryKey: [...qk.tenders, 'link-options'],
    queryFn: ({ signal }) =>
      api.get<TenderDto[]>('/tenders', { page: 1, pageSize: 50, sort: 'scheduleDate:desc' }, signal),
    enabled: open && can('tenders.read'),
  });

  const form = useForm<AcceptanceInput, unknown, Output>({
    resolver: zodForm(acceptanceInputSchema),
    defaultValues: toFormValues(letter),
  });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (open) form.reset(toFormValues(letter, defaults.data));
  }, [open, letter, defaults.data, form]);

  // Keep the template subject and text in step with the details until someone edits them.
  const [contractNumber, awardLetterDate, supplyDescription] = form.watch(['contractNumber', 'awardLetterDate', 'supplyDescription']);
  useEffect(() => {
    if (!open || isEdit) return;
    if (!form.getFieldState('subject').isDirty) form.setValue('subject', acceptanceSubject(contractNumber ?? ''));
    if (!form.getFieldState('body').isDirty) {
      form.setValue('body', acceptanceBody({ awardLetterDate, supplyDescription }));
    }
  }, [open, isEdit, contractNumber, awardLetterDate, supplyDescription, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    onOpenChange(false);
    try {
      const saved = await run(
        () =>
          isEdit
            ? api.put<AcceptanceDto>(`${BASE}/${letter!.id}`, values)
            : api.post<AcceptanceDto>(BASE, values, idem.keyFor(values)),
        {
          pending: isEdit ? 'Saving letter…' : 'Creating letter…',
          success: isEdit ? 'Letter updated' : 'Acceptance letter created',
          optimistic: () => {
            const linked = tenders.data?.find((t) => t.id === values.tenderId);
            const shown = {
              letterDate: values.letterDate,
              yourReference: values.yourReference ?? null,
              clientId: values.clientId ?? null,
              recipientName: values.recipientName,
              recipientAddress: values.recipientAddress ?? null,
              contractNumber: values.contractNumber,
              awardLetterDate: values.awardLetterDate ?? null,
              supplyDescription: values.supplyDescription,
              subject: values.subject,
              body: values.body,
              signatoryName: values.signatoryName,
              signatoryTitle: values.signatoryTitle ?? null,
              tender: linked ? { id: linked.id, number: linked.number } : null,
            };
            return isEdit
              ? patchRecord<AcceptanceDto>(queryClient, qk.acceptanceLetters, letter!.id, shown)
              : insertRecord<AcceptanceDto>(queryClient, qk.acceptanceLetters, {
                  ...shown,
                  id: pendingId(),
                  number: nextNumber.data?.number ?? '…',
                  status: 'draft',
                  preparedBy: '',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
          },
        },
      );
      idem.reset();
      void queryClient.invalidateQueries({ queryKey: qk.acceptanceLetters });
      void queryClient.invalidateQueries({ queryKey: qk.clients });
      onSaved?.(saved);
    } catch {
      // The error dialog already explained the failure.
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="lg"
      title={isEdit ? `Edit ${letter!.number}` : 'New acceptance letter'}
      description="Your acceptance of a contract award. It is saved as a draft until you mark it issued."
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-6">
          <FormSection title="Letter details">
            <FormGrid>
              <Field label="Our ref" hint={isEdit ? undefined : 'Assigned when you save.'}>
                <Input
                  readOnly
                  value={isEdit ? letter!.number : (nextNumber.data?.number ?? '…')}
                  className="bg-surface-muted font-mono"
                />
              </Field>
              <Field label="Date" error={errors.letterDate?.message} required>
                <Input type="date" {...form.register('letterDate')} />
              </Field>
              <Field label="Your ref" error={errors.yourReference?.message}>
                <Input placeholder="e.g. MOH/2026/PQ/SDC/01" {...form.register('yourReference')} />
              </Field>
              {can('tenders.read') && (
                <Field label="Price schedule" error={errors.tenderId?.message} hint="Optional: the schedule this award is for.">
                  <NativeSelect {...form.register('tenderId', { setValueAs: nullIfEmpty })}>
                    <option value="">Not linked</option>
                    {tenders.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.number} — {t.customerName}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              <Field label="To" error={errors.recipientName?.message} required className="sm:col-span-2">
                <Controller
                  control={form.control}
                  name="recipientName"
                  render={({ field }) => (
                    <CustomerInput
                      base={BASE}
                      value={field.value}
                      invalid={Boolean(errors.recipientName)}
                      placeholder="Search clients or type the organisation's name"
                      onChange={(text) => {
                        field.onChange(text);
                        if (form.getValues('clientId')) form.setValue('clientId', null);
                      }}
                      onPick={(c) => {
                        form.setValue('recipientName', c.name, { shouldDirty: true });
                        form.setValue('clientId', c.id, { shouldDirty: true });
                        form.setValue('recipientAddress', c.address ?? '', { shouldDirty: true });
                      }}
                    />
                  )}
                />
              </Field>
              <Field label="Address" error={errors.recipientAddress?.message} className="sm:col-span-2">
                <Textarea rows={2} {...form.register('recipientAddress')} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Award">
            <FormGrid>
              <Field label="Contract number" error={errors.contractNumber?.message} required>
                <Input placeholder="e.g. AHF/THEO/2026" {...form.register('contractNumber')} />
              </Field>
              <Field label="Award letter dated" error={errors.awardLetterDate?.message}>
                <Input type="date" {...form.register('awardLetterDate', { setValueAs: nullIfEmpty })} />
              </Field>
              <Field label="Supply of" error={errors.supplyDescription?.message} required className="sm:col-span-2">
                <Input {...form.register('supplyDescription')} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Letter">
            <Field label="Subject" error={errors.subject?.message} required>
              <Input {...form.register('subject')} />
            </Field>
            <Field
              label="Letter text"
              error={errors.body?.message}
              required
              hint="Filled from the standard wording; edit it freely. Blank lines start new paragraphs."
            >
              <Textarea rows={7} {...form.register('body')} />
            </Field>
            <FormGrid>
              <Field label="Signatory" error={errors.signatoryName?.message} required>
                <Input placeholder="e.g. Kweku K. Sasu" {...form.register('signatoryName')} />
              </Field>
              <Field label="Signatory title" error={errors.signatoryTitle?.message}>
                <Input placeholder="e.g. Managing Director" {...form.register('signatoryTitle')} />
              </Field>
            </FormGrid>
          </FormSection>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{isEdit ? 'Save changes' : 'Create letter'}</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
