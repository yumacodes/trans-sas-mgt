import { z } from 'zod';
import {
  isoDate,
  listQuerySchema,
  optionalEmail,
  optionalPhone,
  optionalText,
  requiredText,
  uuid,
} from './common';
import type { BranchRef } from './branch';

export const ORGANIZATION_TYPES = [
  'public_hospital',
  'private_hospital',
  'clinic',
  'laboratory',
  'pharmacy',
  'government_agency',
  'ngo',
  'distributor',
  'individual',
  'other',
] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  public_hospital: 'Public hospital',
  private_hospital: 'Private hospital',
  clinic: 'Clinic',
  laboratory: 'Laboratory',
  pharmacy: 'Pharmacy',
  government_agency: 'Government agency',
  ngo: 'NGO',
  distributor: 'Distributor',
  individual: 'Individual',
  other: 'Other',
};

export const CLIENT_STATUSES = ['active', 'archived'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const clientInputSchema = z.object({
  name: requiredText('Client name', 200),
  organizationType: z.enum(ORGANIZATION_TYPES, {
    required_error: 'Select an organization type.',
  }),
  contactPerson: optionalText(120),
  email: optionalEmail,
  phone: optionalPhone,
  billingAddress: optionalText(500),
  deliveryAddress: optionalText(500),
  taxId: optionalText(60),
  notes: optionalText(2000),
  branchId: uuid.nullable().optional(),
  accountOwnerId: uuid.nullable().optional(),
});
export type ClientInput = z.input<typeof clientInputSchema>;

export const clientListQuerySchema = listQuerySchema.extend({
  status: z.enum(CLIENT_STATUSES).optional(),
  organizationType: z.enum(ORGANIZATION_TYPES).optional(),
  branchId: uuid.optional(),
});

export interface ClientDto {
  id: string;
  code: string;
  name: string;
  organizationType: OrganizationType;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
  deliveryAddress: string | null;
  taxId: string | null;
  notes: string | null;
  status: ClientStatus;
  branch: BranchRef | null;
  accountOwner: { id: string; fullName: string } | null;
  activeRegistration: {
    id: string;
    registrationNumber: string;
    validUntil: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Registrations ---------- */

export const REGISTRATION_STATUSES = ['pending', 'active', 'suspended', 'expired', 'revoked'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/**
 * Permitted status transitions. The API enforces them and the UI offers only the
 * valid next steps. Adjust when the company's registration policy is confirmed.
 */
export const REGISTRATION_TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  pending: ['active', 'revoked'],
  active: ['suspended', 'expired', 'revoked'],
  suspended: ['active', 'revoked'],
  expired: ['active'],
  revoked: [],
};

const validUntilAfterRegistered = {
  path: ['validUntil'],
  message: 'Valid-until date must be on or after the registration date.',
};

export const registrationCreateSchema = z
  .object({
    clientId: uuid,
    /** Leave blank to have the system assign the next registration number. */
    registrationNumber: optionalText(60),
    registeredOn: isoDate,
    validUntil: isoDate.nullable().optional(),
    status: z.enum(['pending', 'active']).default('active'),
    notes: optionalText(2000),
  })
  .refine((v) => !v.validUntil || v.validUntil >= v.registeredOn, validUntilAfterRegistered);
export type RegistrationCreateInput = z.input<typeof registrationCreateSchema>;

export const registrationUpdateSchema = z
  .object({
    registeredOn: isoDate,
    validUntil: isoDate.nullable().optional(),
    notes: optionalText(2000),
  })
  .refine((v) => !v.validUntil || v.validUntil >= v.registeredOn, validUntilAfterRegistered);
export type RegistrationUpdateInput = z.input<typeof registrationUpdateSchema>;

export const registrationStatusSchema = z.object({
  status: z.enum(REGISTRATION_STATUSES),
  reason: optionalText(500),
});

export const registrationListQuerySchema = listQuerySchema.extend({
  status: z.enum(REGISTRATION_STATUSES).optional(),
  clientId: uuid.optional(),
});

export interface RegistrationDto {
  id: string;
  registrationNumber: string;
  registeredOn: string;
  validUntil: string | null;
  status: RegistrationStatus;
  notes: string | null;
  client: {
    id: string;
    code: string;
    name: string;
    organizationType: OrganizationType;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ClientOptionDto {
  id: string;
  code: string;
  name: string;
}
