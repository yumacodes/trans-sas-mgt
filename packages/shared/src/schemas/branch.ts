import { z } from 'zod';
import {
  booleanQuery,
  listQuerySchema,
  optionalEmail,
  optionalPhone,
  optionalText,
  requiredText,
  uuid,
} from './common';

export const branchInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Branch code is required.')
    .max(12)
    .regex(/^[A-Z0-9-]+$/, 'Use capital letters, numbers and hyphens only.'),
  name: requiredText('Branch name', 120),
  addressLine1: optionalText(200),
  city: optionalText(100),
  region: optionalText(100),
  phone: optionalPhone,
  email: optionalEmail,
  /** User who manages this branch; the "branch managers" message audience. */
  managerUserId: uuid.nullable().optional(),
});
export type BranchInput = z.infer<typeof branchInputSchema>;

export const branchStatusSchema = z.object({ isActive: z.boolean() });

export const branchListQuerySchema = listQuerySchema.extend({ isActive: booleanQuery });

export interface BranchDto {
  id: string;
  code: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  phone: string | null;
  email: string | null;
  manager: { id: string; fullName: string; email: string } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BranchRef = Pick<BranchDto, 'id' | 'code' | 'name'>;
