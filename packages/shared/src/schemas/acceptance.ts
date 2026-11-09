import { z } from 'zod';
import { isoDate, listQuerySchema, optionalText, requiredText, uuid } from './common';

/**
 * Acceptance letters: the company's written acceptance of a contract award. "Issued" means
 * the letter has been sent to the client; the app never marks it signed on anyone's behalf.
 */
export const ACCEPTANCE_STATUSES = ['draft', 'issued', 'cancelled'] as const;
export type AcceptanceStatus = (typeof ACCEPTANCE_STATUSES)[number];

export const ACCEPTANCE_STATUS_LABELS: Record<AcceptanceStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  cancelled: 'Cancelled',
};

export const acceptanceInputSchema = z.object({
  letterDate: isoDate,
  /** The client's reference ("Your Ref"). */
  yourReference: optionalText(100),
  clientId: uuid.nullable().optional(),
  recipientName: requiredText('Recipient', 200),
  recipientAddress: optionalText(500),
  contractNumber: requiredText('Contract number', 100),
  awardLetterDate: isoDate.nullable().optional(),
  /** What the award is for, e.g. "MEDICAL ITEMS". */
  supplyDescription: requiredText('Supply of', 200),
  subject: requiredText('Subject', 200),
  body: requiredText('Letter text', 5000),
  signatoryName: requiredText('Signatory name', 120),
  signatoryTitle: optionalText(120),
  /** The price schedule this award relates to, when there is one. */
  tenderId: uuid.nullable().optional(),
});
export type AcceptanceInput = z.input<typeof acceptanceInputSchema>;

export const acceptanceStatusSchema = z.object({ status: z.enum(ACCEPTANCE_STATUSES) });

export const acceptanceListQuerySchema = listQuerySchema.extend({
  status: z.enum(ACCEPTANCE_STATUSES).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .toUpperCase();

/** Standard subject line, from the company's template. */
export function acceptanceSubject(contractNumber: string) {
  return `ACCEPTANCE OF AWARD CONTRACT NO: (${contractNumber.trim() || '…'})`;
}

/** Standard letter text, from the company's template. Users can edit it freely. */
export function acceptanceBody(fields: { awardLetterDate?: string | null; supplyDescription?: string }) {
  const dated = fields.awardLetterDate ? ` dated ${longDate(fields.awardLetterDate)}` : '';
  const supply = fields.supplyDescription?.trim() || '…';
  return [
    `We refer to your award notification letter${dated} of the supply of ${supply}.`,
    'We are pleased to inform you of our acceptance to the terms and conditions therein.',
    'We thank you very much for your kind consideration.',
  ].join('\n\n');
}

export interface AcceptanceDto {
  id: string;
  number: string;
  letterDate: string;
  yourReference: string | null;
  clientId: string | null;
  recipientName: string;
  recipientAddress: string | null;
  contractNumber: string;
  awardLetterDate: string | null;
  supplyDescription: string;
  subject: string;
  body: string;
  signatoryName: string;
  signatoryTitle: string | null;
  tender: { id: string; number: string } | null;
  status: AcceptanceStatus;
  preparedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Signatory used on the most recent letter, to prefill the next one. */
export interface AcceptanceDefaultsDto {
  signatoryName: string | null;
  signatoryTitle: string | null;
}
