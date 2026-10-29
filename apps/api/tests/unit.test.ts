import { Prisma } from '@prisma/client';
import { DEFAULT_COMPANY_SETTINGS } from '@tsm/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, toAppError } from '../src/lib/errors';
import { orderBy } from '../src/lib/pagination';
import { isoDateOnly, dateFromIso } from '../src/lib/serialize';
import { stableStringify } from '../src/middleware/idempotency';
import { slugify } from '../src/modules/roles';
import { diff } from '../src/services/audit';
import { describeSendFailure, emailConfig, emailConfigured } from '../src/services/email';
import { NO_EMAIL_REASON, recipientCreateData } from '../src/services/messaging';
import { canAccessBranch, optionalBranchWhere } from '../src/services/branch-scope';
import { parseSettings } from '../src/services/company-settings';
import { formatDocumentNumber } from '../src/services/document-numbers';
import { isLowStock } from '../src/services/inventory';
import type { AuthContext } from '../src/middleware/auth';

const ctx = (over: Partial<AuthContext> = {}): AuthContext => ({
  profileId: 'p1',
  authUserId: 'a1',
  email: 'x@example.com',
  fullName: 'X',
  permissions: new Set(),
  allBranches: false,
  branchIds: ['b1'],
  ...over,
});

describe('error mapping', () => {
  it('maps unique violations to DUPLICATE with the friendly field message', () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['sku'] },
    });
    const mapped = toAppError(err, { sku: 'This item code is already in use.' });
    expect(mapped?.code).toBe('DUPLICATE');
    expect(mapped?.status).toBe(409);
    expect(mapped?.fields).toEqual({ sku: 'This item code is already in use.' });
  });

  it('maps zod errors to VALIDATION_FAILED with per-field messages', () => {
    const result = z.object({ name: z.string().min(1, 'Name is required.') }).safeParse({ name: '' });
    const mapped = toAppError(result.error);
    expect(mapped?.status).toBe(422);
    expect(mapped?.fields).toEqual({ name: 'Name is required.' });
  });

  it('leaves unknown errors unmapped so they become a safe 500', () => {
    expect(toAppError(new Error('boom'))).toBeNull();
  });
});

describe('document numbers', () => {
  const numbering = DEFAULT_COMPANY_SETTINGS.numbering;
  it('formats with year and padding', () => {
    expect(formatDocumentNumber(numbering, 'sale', 2026, 42)).toBe('SL-2026-00042');
  });
  it('omits the year when configured', () => {
    expect(formatDocumentNumber({ ...numbering, includeYear: false, padding: 3 }, 'client', 0, 7)).toBe('CL-007');
  });
});

describe('company settings', () => {
  it('fills in settings introduced after the record was saved', () => {
    const settings = parseSettings({ defaultTaxRate: '12.5', numbering: { prefixes: { sale: 'INV' } } });
    expect(settings.defaultTaxRate).toBe('12.5');
    expect(settings.numbering.prefixes.sale).toBe('INV');
    expect(settings.numbering.prefixes.registration).toBe('REG');
    expect(settings.allowNegativeStock).toBe(false);
  });
  it('falls back to defaults for corrupted settings', () => {
    expect(parseSettings({ defaultTaxRate: 'lots' })).toEqual(DEFAULT_COMPANY_SETTINGS);
  });
});

describe('branch scope', () => {
  it('lets all-branch users see everything', () => {
    expect(optionalBranchWhere(ctx({ allBranches: true }))).toEqual({});
    expect(canAccessBranch(ctx({ allBranches: true }), 'other')).toBe(true);
  });
  it('limits other users to their branches plus company-wide records', () => {
    expect(canAccessBranch(ctx(), 'b1')).toBe(true);
    expect(canAccessBranch(ctx(), 'b2')).toBe(false);
    expect(canAccessBranch(ctx(), null)).toBe(true);
  });
});

describe('low stock rule', () => {
  it('flags active items at or below a positive reorder level', () => {
    expect(isLowStock(new Prisma.Decimal(5), 5)).toBe(true);
    expect(isLowStock(new Prisma.Decimal(6), 5)).toBe(false);
    expect(isLowStock(new Prisma.Decimal(0), 0)).toBe(false);
    expect(isLowStock(new Prisma.Decimal(0), 5, false)).toBe(false);
  });
});

describe('helpers', () => {
  it('serialises bodies independent of key order', () => {
    expect(stableStringify({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(stableStringify({ a: [{ c: 2, d: 1 }], b: 1 }));
  });
  it('round-trips business dates without timezone drift', () => {
    expect(isoDateOnly(dateFromIso('2026-02-28'))).toBe('2026-02-28');
  });
  it('slugifies role names', () => {
    expect(slugify('Sales Rep (North)')).toBe('sales_rep_north');
  });
  it('records only changed fields', () => {
    expect(diff({ a: 1, b: 'x', c: null }, { a: 1, b: 'y', c: null }, ['a', 'b', 'c'])).toEqual({
      b: { from: 'x', to: 'y' },
    });
  });
  it('rejects unsupported sort fields', () => {
    expect(() => orderBy('password:asc', { name: (d) => ({ name: d }) }, { name: 'asc' as const })).toThrow(AppError);
  });
});

describe('outbound email configuration', () => {
  it('is reported as not configured when the mail settings are absent', () => {
    expect(emailConfigured()).toBe(false);
    expect(emailConfig()).toEqual({
      configured: false,
      fromAddress: null,
      host: null,
      missing: ['SMTP_HOST', 'MAIL_FROM_EMAIL'],
    });
  });

  it('explains SMTP failures in terms the sender can act on', () => {
    expect(describeSendFailure({ code: 'EAUTH' })).toMatch(/user name and password/);
    expect(describeSendFailure({ code: 'ECONNECTION' })).toMatch(/could not reach the mail server/);
    expect(describeSendFailure({ responseCode: 550 })).toMatch(/rejected the address/);
    expect(describeSendFailure(new Error('boom'))).toMatch(/could not deliver/);
  });
});

describe('message recipients', () => {
  const base = { kind: 'client' as const, detail: null, values: { first_name: 'Ama' } };

  it('queues recipients with an address and skips those without one', () => {
    const rows = recipientCreateData([
      { ...base, id: 'c1', name: 'Ridge Hospital', email: 'ridge@example.com' },
      { ...base, id: 'c2', name: 'Northgate Clinic', email: null },
    ]);
    expect(rows[0]).toMatchObject({ status: 'pending', error: null, recipientId: 'c1' });
    expect(rows[1]).toMatchObject({ status: 'skipped', error: NO_EMAIL_REASON });
  });

  it('keeps the merge values with the recipient, so a later edit cannot rewrite history', () => {
    const [row] = recipientCreateData([
      { ...base, id: 'c1', name: 'Ridge Hospital', email: 'ridge@example.com' },
    ]);
    expect(row!.values).toEqual({ first_name: 'Ama' });
  });
});
