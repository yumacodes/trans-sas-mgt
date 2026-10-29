import { z } from 'zod';
import { isPermission, type Permission } from '../permissions';
import { optionalText, requiredText } from './common';

export const roleInputSchema = z.object({
  name: requiredText('Role name', 60),
  description: optionalText(300),
  permissions: z
    .array(z.string())
    .refine((list) => list.every(isPermission), 'Unknown permission.')
    .transform((list) => Array.from(new Set(list)) as Permission[]),
});
export type RoleInput = z.input<typeof roleInputSchema>;

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  userCount: number;
}
