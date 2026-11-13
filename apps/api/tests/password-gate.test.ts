import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { DEFAULT_USER_PASSWORD, newPasswordSchema } from '@tsm/shared';
import { requirePasswordChanged } from '../src/middleware/auth';

const run = (mustChangePassword: boolean | undefined) => {
  let passed = false;
  const req = { auth: { mustChangePassword } } as unknown as Request;
  try {
    requirePasswordChanged(req, {} as Response, () => {
      passed = true;
    });
  } catch (error) {
    return { passed, code: (error as { code?: string }).code };
  }
  return { passed, code: undefined };
};

describe('default password gate', () => {
  it('lets an account that chose its own password through', () => {
    expect(run(false)).toEqual({ passed: true, code: undefined });
    expect(run(undefined).passed).toBe(true);
  });

  it('closes the API for an account still on the default password', () => {
    expect(run(true)).toEqual({ passed: false, code: 'PASSWORD_CHANGE_REQUIRED' });
  });

  it('the default password can never satisfy the password policy', () => {
    const result = newPasswordSchema.safeParse({ password: DEFAULT_USER_PASSWORD, confirmPassword: DEFAULT_USER_PASSWORD });
    expect(result.success).toBe(false);
  });
});
