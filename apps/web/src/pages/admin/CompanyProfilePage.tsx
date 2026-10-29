import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodForm } from '@/lib/zodForm';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  companyProfileSchema,
  DEFAULT_COMPANY_SETTINGS,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  LOGO_MAX_BYTES,
  LOGO_MIME_TYPES,
  type CompanyProfileDto,
} from '@tsm/shared';
import { ConfirmDialog } from '@/components/app/dialogs';
import { applyServerErrors, Field, FormError, FormGrid } from '@/components/app/form';
import { SectionLoader } from '@/components/app/FullScreenLoader';
import { useOperation } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { ErrorState } from '@/components/app/States';
import { UnsavedChangesGuard } from '@/components/app/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queryKeys';

type FormInput = z.input<typeof companyProfileSchema>;
type FormOutput = z.output<typeof companyProfileSchema>;

function toFormValues(c: CompanyProfileDto | null | undefined): FormInput {
  return {
    name: c?.name ?? '',
    legalName: c?.legalName ?? '',
    email: c?.email ?? '',
    phone: c?.phone ?? '',
    website: c?.website ?? '',
    addressLine1: c?.addressLine1 ?? '',
    addressLine2: c?.addressLine2 ?? '',
    city: c?.city ?? '',
    region: c?.region ?? '',
    country: c?.country ?? '',
    taxId: c?.taxId ?? '',
    registrationNumber: c?.registrationNumber ?? '',
    defaultCurrency: c?.defaultCurrency ?? '',
    settings: c?.settings ?? DEFAULT_COMPANY_SETTINGS,
  };
}

export default function CompanyProfilePage() {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const query = useQuery({
    queryKey: qk.company,
    queryFn: ({ signal }) => api.get<CompanyProfileDto | null>('/company', undefined, signal),
  });

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodForm(companyProfileSchema),
    defaultValues: toFormValues(null),
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (query.data !== undefined) form.reset(toFormValues(query.data));
  }, [query.data, form]);

  const onSubmit = form.handleSubmit(
    async (values) => {
      setFormError(null);
      try {
        const saved = await run(() => api.put<CompanyProfileDto>('/company', values), {
          pending: 'Saving company profile…',
          success: 'Company profile saved',
        });
        queryClient.setQueryData(qk.company, saved);
        void queryClient.invalidateQueries({ queryKey: qk.me });
        form.reset(toFormValues(saved));
      } catch (error) {
        if (!applyServerErrors(error, form.setError)) setFormError(null);
      }
    },
    () => setFormError('Some information is missing or invalid. Review the highlighted fields and try again.'),
  );

  if (query.isLoading) return <SectionLoader />;
  if (query.isError)
    return (
      <Card>
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Card>
    );

  const numbering = form.watch('settings.numbering');
  const example = (prefix: string) => {
    const pad = Math.min(8, Math.max(3, Number(numbering?.padding) || 5));
    const year = numbering?.includeYear ? `${new Date().getFullYear()}-` : '';
    return `${(prefix || '').toUpperCase()}-${year}${'1'.padStart(pad, '0')}`;
  };

  return (
    <>
      <UnsavedChangesGuard when={isDirty && !isSubmitting} />
      <PageHeader
        title="Company Profile"
        description="Company details and business settings used across documents and calculations."
      />
      {!query.data && (
        <div className="mb-4 rounded-md border border-info/25 bg-info-soft px-4 py-3 text-sm text-info">
          The company profile hasn&apos;t been set up yet. Complete the details below and save to
          start using document numbering and the company logo.
        </div>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormError message={formError} />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Company details</CardTitle>
                <CardDescription>Shown on proformas, invoices, waybills and receipts.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <FormGrid>
                <Field label="Company name" error={errors.name?.message} required>
                  <Input {...form.register('name')} />
                </Field>
                <Field label="Legal name" error={errors.legalName?.message}>
                  <Input {...form.register('legalName')} />
                </Field>
                <Field label="Email" error={errors.email?.message}>
                  <Input type="email" {...form.register('email')} />
                </Field>
                <Field label="Telephone" error={errors.phone?.message}>
                  <Input type="tel" {...form.register('phone')} />
                </Field>
                <Field label="Website" error={errors.website?.message}>
                  <Input {...form.register('website')} />
                </Field>
                <Field label="Tax ID" error={errors.taxId?.message}>
                  <Input {...form.register('taxId')} />
                </Field>
                <Field label="Business registration number" error={errors.registrationNumber?.message}>
                  <Input {...form.register('registrationNumber')} />
                </Field>
                <Field
                  label="Default currency"
                  error={errors.defaultCurrency?.message}
                  required
                  hint="Three-letter ISO code, e.g. GHS, USD, EUR."
                >
                  <Input maxLength={3} className="uppercase" {...form.register('defaultCurrency')} />
                </Field>
                <Field label="Address line 1" error={errors.addressLine1?.message}>
                  <Input {...form.register('addressLine1')} />
                </Field>
                <Field label="Address line 2" error={errors.addressLine2?.message}>
                  <Input {...form.register('addressLine2')} />
                </Field>
                <Field label="City" error={errors.city?.message}>
                  <Input {...form.register('city')} />
                </Field>
                <Field label="Region" error={errors.region?.message}>
                  <Input {...form.register('region')} />
                </Field>
                <Field label="Country" error={errors.country?.message}>
                  <Input {...form.register('country')} />
                </Field>
              </FormGrid>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <LogoCard company={query.data ?? null} />
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Pricing and stock policy</CardTitle>
                  <CardDescription>Defaults applied to new documents.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field
                  label="Default tax rate (%)"
                  error={errors.settings?.defaultTaxRate?.message}
                  required
                >
                  <Input inputMode="decimal" {...form.register('settings.defaultTaxRate')} />
                </Field>
                <Field
                  label="Proforma validity (days)"
                  error={errors.settings?.proformaValidityDays?.message}
                  required
                >
                  <Input type="number" min={1} max={365} {...form.register('settings.proformaValidityDays')} />
                </Field>
                <SwitchRow
                  name="settings.pricesIncludeTax"
                  control={form.control}
                  label="Prices include tax"
                  description="Selling prices already contain tax."
                />
                <SwitchRow
                  name="settings.allowNegativeStock"
                  control={form.control}
                  label="Allow negative stock"
                  description="When off, stock can't be issued beyond the available quantity."
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Document numbering</CardTitle>
              <CardDescription>
                Prefixes and format for automatically assigned reference numbers. Changes apply to
                new documents only.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Number of digits"
                error={errors.settings?.numbering?.padding?.message}
                required
              >
                <Input type="number" min={3} max={8} {...form.register('settings.numbering.padding')} />
              </Field>
              <div className="flex items-end">
                <SwitchRow
                  name="settings.numbering.includeYear"
                  control={form.control}
                  label="Include the year"
                  description="Numbering restarts each calendar year."
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {DOCUMENT_TYPES.map((t) => (
                <Field
                  key={t}
                  label={DOCUMENT_TYPE_LABELS[t]}
                  error={errors.settings?.numbering?.prefixes?.[t]?.message}
                  hint={`Example: ${example(numbering?.prefixes?.[t] ?? '')}`}
                  required
                >
                  <Input className="font-mono uppercase" maxLength={10} {...form.register(`settings.numbering.prefixes.${t}`)} />
                </Field>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-canvas/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <Button
            variant="secondary"
            disabled={!isDirty || isSubmitting}
            onClick={() => form.reset(toFormValues(query.data))}
          >
            Discard changes
          </Button>
          <Button type="submit" disabled={!isDirty}>
            Save company profile
          </Button>
        </div>
      </form>
    </>
  );
}

function SwitchRow({
  name,
  control,
  label,
  description,
}: {
  name: 'settings.pricesIncludeTax' | 'settings.allowNegativeStock' | 'settings.numbering.includeYear';
  control: ReturnType<typeof useForm<FormInput, unknown, FormOutput>>['control'];
  label: string;
  description: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-medium text-ink">{label}</span>
            <span className="block text-xs text-ink-muted">{description}</span>
          </span>
          <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
        </label>
      )}
    />
  );
}

function LogoCard({ company }: { company: CompanyProfileDto | null }) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const onSaved = (saved: CompanyProfileDto) => {
    queryClient.setQueryData(qk.company, saved);
    void queryClient.invalidateQueries({ queryKey: qk.me });
  };

  const upload = async (file: File) => {
    setError(null);
    if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError('Use a PNG, JPEG or WebP image.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError(`The logo must be ${LOGO_MAX_BYTES / 1024 / 1024} MB or smaller.`);
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    try {
      const saved = await run(() => api.upload<CompanyProfileDto>('/company/logo', fd), {
        pending: 'Uploading logo…',
        success: 'Logo updated',
      });
      onSaved(saved);
    } catch {
      setError("We couldn't upload this document. Check the file format and size, then try again.");
    }
  };

  const remove = async () => {
    try {
      const saved = await run(() => api.delete<CompanyProfileDto>('/company/logo'), {
        pending: 'Removing logo…',
        success: 'Logo removed',
      });
      onSaved(saved);
    } catch {
      toast.error("The logo wasn't removed.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Logo</CardTitle>
          <CardDescription>PNG, JPEG or WebP, up to 2 MB.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border-strong bg-surface-muted">
          {company?.logoUrl ? (
            <img src={company.logoUrl} alt={`${company.name} logo`} className="max-h-24 max-w-[80%] object-contain" />
          ) : (
            <span className="text-xs text-ink-subtle">No logo uploaded</span>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        {!company && <p className="text-xs text-ink-muted">Save the company profile before adding a logo.</p>}
        <input
          ref={inputRef}
          type="file"
          accept={LOGO_MIME_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void upload(file);
          }}
        />
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={!company} onClick={() => inputRef.current?.click()}>
            <ImageUp aria-hidden /> {company?.logoUrl ? 'Replace logo' : 'Upload logo'}
          </Button>
          {company?.logoUrl && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
              <Trash2 aria-hidden /> Remove
            </Button>
          )}
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove the company logo?"
        description="Documents generated after this will not show a logo until a new one is uploaded."
        confirmLabel="Remove logo"
        destructive
        onConfirm={remove}
      />
    </Card>
  );
}
