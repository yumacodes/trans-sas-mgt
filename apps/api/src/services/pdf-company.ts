import { prisma } from '../lib/prisma';
import type { PdfCompany } from './proforma-pdf';
import { parseSettings } from './company-settings';
import { DEFAULT_LOGO_PNG_BASE64 } from './brand-logo';
import { downloadObject, sniffMimeType } from './storage';

const DEFAULT_LOGO = Buffer.from(DEFAULT_LOGO_PNG_BASE64, 'base64');
let cachedLogo: { fileId: string; bytes: Buffer; at: number } | null = null;

/** The uploaded logo if it is a PNG or JPEG (the only formats PDFs can embed), else the Trans-SAS logo. */
async function logoBytes(file: { id: string; bucket: string; path: string; deletedAt: Date | null } | null | undefined) {
  if (!file || file.deletedAt) return DEFAULT_LOGO;
  if (cachedLogo && cachedLogo.fileId === file.id && Date.now() - cachedLogo.at < 5 * 60_000) return cachedLogo.bytes;
  const bytes = await downloadObject(file.bucket, file.path);
  const type = bytes ? sniffMimeType(bytes) : null;
  if (!bytes || (type !== 'image/png' && type !== 'image/jpeg')) return DEFAULT_LOGO;
  cachedLogo = { fileId: file.id, bytes, at: Date.now() };
  return bytes;
}

/** Company letterhead for generated documents, built from the company profile. */
export async function pdfCompany(fallbackName: string): Promise<PdfCompany> {
  const company = await prisma.companyProfile.findFirst({ include: { logo: true } });
  const address = [
    company?.addressLine1,
    company?.addressLine2,
    [company?.city, company?.region].filter(Boolean).join(', '),
    company?.country,
  ].filter((l): l is string => Boolean(l));
  const phones = (company?.phone ?? '')
    .split(/[,;\n]+/)
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n, i) => `${i === 0 ? 'Tel:' : '        '} ${n}`);
  const contact = [...phones, company?.email && `Email: ${company.email}`, company?.website].filter(
    (l): l is string => Boolean(l),
  );
  const name = company?.legalName || company?.name || fallbackName;
  return {
    name,
    logo: await logoBytes(company?.logo),
    tagline: company ? parseSettings(company.settings).tagline || null : null,
    lines: [...address, ...contact, company?.taxId ? `Tax ID: ${company.taxId}` : ''].filter(Boolean),
    footer: [name, ...address.slice(0, 1)].join(' | '),
  };
}
