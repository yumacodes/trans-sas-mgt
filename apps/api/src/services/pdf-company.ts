import { prisma } from '../lib/prisma';
import type { PdfCompany } from './proforma-pdf';
import { parseSettings } from './company-settings';

/** Company letterhead for generated documents, built from the company profile. */
export async function pdfCompany(fallbackName: string): Promise<PdfCompany> {
  const company = await prisma.companyProfile.findFirst();
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
    tagline: company ? parseSettings(company.settings).tagline || null : null,
    lines: [...address, ...contact, company?.taxId ? `Tax ID: ${company.taxId}` : ''].filter(Boolean),
    footer: [name, ...address.slice(0, 1)].join(' | '),
  };
}
