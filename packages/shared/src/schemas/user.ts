import { z } from 'zod';
import type { Permission } from '../permissions';
import { booleanQuery, listQuerySchema, optionalPhone, requiredText, uuid } from './common';
import type { BranchRef } from './branch';
import { usernameSchema } from './auth';

export const userCreateSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, 'Email is required.')
      .email('Enter a valid email address.'),
    username: usernameSchema,
    fullName: requiredText('Full name', 120),
    phone: optionalPhone,
    roleIds: z.array(uuid).min(1, 'Assign at least one role.'),
    branchIds: z.array(uuid).default([]),
    /** Set by the administrator; the user replaces it from Account settings after signing in. */
    temporaryPassword: z
      .string()
      .min(10, 'Enter a temporary password of at least 10 characters.')
      .max(128),
  });
export const userTemporaryPasswordSchema = z.object({
  temporaryPassword: z
    .string()
    .min(10, 'Enter a temporary password of at least 10 characters.')
    .max(128),
});
export type UserTemporaryPasswordInput = z.input<typeof userTemporaryPasswordSchema>;
export type UserCreateInput = z.input<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  username: usernameSchema,
  fullName: requiredText('Full name', 120),
  phone: optionalPhone,
});
export type UserUpdateInput = z.input<typeof userUpdateSchema>;

export const userAccessSchema = z.object({
  roleIds: z.array(uuid).min(1, 'Assign at least one role.'),
  branchIds: z.array(uuid),
});
export type UserAccessInput = z.infer<typeof userAccessSchema>;

export const userStatusSchema = z.object({ isActive: z.boolean() });

export const userListQuerySchema = listQuerySchema.extend({
  isActive: booleanQuery,
  roleId: uuid.optional(),
});

/** What users may change about themselves; username, roles and branches are admin-managed. */
export const profileUpdateSchema = z.object({
  fullName: requiredText('Full name', 120),
  phone: optionalPhone,
});
export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;

export interface RoleSummaryDto {
  id: string;
  key: string;
  name: string;
}

export interface UserDto {
  id: string;
  authUserId: string;
  email: string;
  username: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  roles: RoleSummaryDto[];
  branches: BranchRef[];
  createdAt: string;
  updatedAt: string;
}

export interface MeDto {
  user: Pick<UserDto, 'id' | 'email' | 'username' | 'fullName' | 'phone' | 'roles' | 'branches'>;
  permissions: Permission[];
  allBranches: boolean;
  company: { name: string; defaultCurrency: string; logoUrl: string | null } | null;
}

export interface AuditEntryDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  actor: { id: string; fullName: string } | null;
  createdAt: string;
}

export const auditListQuerySchema = listQuerySchema.extend({
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(60).optional(),
  actorId: uuid.optional(),
});

export interface UserOptionDto {
  id: string;
  fullName: string;
}

/** An open request from a user asking an administrator to reset their password. */
export interface PasswordResetRequestDto {
  id: string;
  requestedAt: string;
  user: { id: string; fullName: string; email: string; username: string };
}
