import {
  companySettingsSchema,
  DEFAULT_COMPANY_SETTINGS,
  type CompanySettings,
} from '@tsm/shared';
import type { Db } from '../lib/prisma';
import { logger } from '../lib/logger';

/**
 * Company-wide business settings. Stored settings are validated on every read and
 * merged over the defaults, so newly introduced settings get a safe default value.
 */
export function parseSettings(raw: unknown): CompanySettings {
  const merged = {
    ...DEFAULT_COMPANY_SETTINGS,
    ...(raw && typeof raw === 'object' ? raw : {}),
  } as Record<string, unknown>;
  const numbering = merged.numbering as Partial<CompanySettings['numbering']> | undefined;
  merged.numbering = {
    ...DEFAULT_COMPANY_SETTINGS.numbering,
    ...numbering,
    prefixes: { ...DEFAULT_COMPANY_SETTINGS.numbering.prefixes, ...numbering?.prefixes },
  };
  const parsed = companySettingsSchema.safeParse(merged);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, 'stored company settings are invalid; using defaults');
    return DEFAULT_COMPANY_SETTINGS;
  }
  return parsed.data;
}

export async function getCompanySettings(db: Db): Promise<CompanySettings> {
  const company = await db.companyProfile.findFirst({ select: { settings: true } });
  return parseSettings(company?.settings);
}
