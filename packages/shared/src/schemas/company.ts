import { z } from 'zod';
import { optionalEmail, optionalPhone, optionalText, requiredText } from './common';

export const DOCUMENT_TYPES = [
  'client',
  'registration',
  'proforma',
  'tender',
  'sale',
  'waybill',
  'acceptance',
  'payment',
  'purchase',
  'expense',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  client: 'Client code',
  registration: 'Client registration',
  proforma: 'Proforma',
  tender: 'Tender',
  sale: 'Sale',
  waybill: 'Waybill',
  acceptance: 'Acceptance letter',
  payment: 'Payment receipt',
  purchase: 'Purchase',
  expense: 'Expense',
};

export const DEFAULT_DOCUMENT_PREFIXES: Record<DocumentType, string> = {
  client: 'CL',
  registration: 'REG',
  proforma: 'PF',
  tender: 'TD',
  sale: 'SL',
  waybill: 'WB',
  acceptance: 'AL',
  payment: 'RC',
  purchase: 'PO',
  expense: 'EX',
};

const prefix = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Prefix is required.')
  .max(10)
  .regex(/^[A-Z0-9-]+$/, 'Use capital letters, numbers and hyphens only.');

export const documentNumberingSchema = z.object({
  prefixes: z.object(
    Object.fromEntries(DOCUMENT_TYPES.map((t) => [t, prefix])) as Record<DocumentType, typeof prefix>,
  ),
  padding: z.coerce.number().int().min(3).max(8),
  includeYear: z.boolean(),
});
export type DocumentNumbering = z.infer<typeof documentNumberingSchema>;

export const companySettingsSchema = z.object({
  defaultTaxRate: z
    .string()
    .trim()
    .regex(/^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/, 'Enter a percentage between 0 and 100.'),
  pricesIncludeTax: z.boolean(),
  allowNegativeStock: z.boolean(),
  proformaValidityDays: z.coerce.number().int().min(1).max(365),
  numbering: documentNumberingSchema,
});
export type CompanySettings = z.infer<typeof companySettingsSchema>;

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  defaultTaxRate: '0',
  pricesIncludeTax: false,
  allowNegativeStock: false,
  proformaValidityDays: 30,
  numbering: { prefixes: DEFAULT_DOCUMENT_PREFIXES, padding: 5, includeYear: true },
};

export const companyProfileSchema = z.object({
  name: requiredText('Company name'),
  legalName: optionalText(200),
  email: optionalEmail,
  phone: optionalPhone,
  website: optionalText(200),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  region: optionalText(100),
  country: optionalText(100),
  taxId: optionalText(60),
  registrationNumber: optionalText(60),
  defaultCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a three-letter ISO currency code, such as GHS or USD.'),
  settings: companySettingsSchema,
});
export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

export interface CompanyProfileDto {
  id: string;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  taxId: string | null;
  registrationNumber: string | null;
  defaultCurrency: string;
  settings: CompanySettings;
  logoUrl: string | null;
  updatedAt: string;
}

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
