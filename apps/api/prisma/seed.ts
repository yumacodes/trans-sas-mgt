/**
 * Database seed.
 *
 *   pnpm db:seed            permission catalogue + system roles (safe in every environment)
 *   pnpm db:seed --demo     also adds clearly labelled demo records for development
 *
 * Demo records use the DEMO- code prefix and "[DEMO]" names so they can never be
 * mistaken for real business data. The demo option refuses to run in production.
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_COMPANY_SETTINGS } from '@tsm/shared';
import { syncPermissionCatalogue } from '../src/services/permission-catalogue';

const prisma = new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 30_000 } });
const demo = process.argv.includes('--demo');

async function seedDemo() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data with NODE_ENV=production.');
  }
  const creator = await prisma.userProfile.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!creator) {
    throw new Error('Create the first administrator (pnpm --filter api bootstrap:admin) before seeding demo data.');
  }

  if (!(await prisma.companyProfile.findFirst())) {
    await prisma.companyProfile.create({
      data: {
        name: '[DEMO] Medical Supplies Ltd',
        defaultCurrency: 'GHS',
        settings: DEFAULT_COMPANY_SETTINGS,
      },
    });
  }

  const branches = await Promise.all(
    [
      { code: 'DEMO-HQ', name: '[DEMO] Head Office', city: 'Accra' },
      { code: 'DEMO-KSI', name: '[DEMO] Kumasi Branch', city: 'Kumasi' },
    ].map((b) => prisma.branch.upsert({ where: { code: b.code }, create: b, update: {} })),
  );

  const categories = await Promise.all(
    ['[DEMO] Diagnostic equipment', '[DEMO] Consumables', '[DEMO] Patient monitoring'].map((name) =>
      prisma.stockCategory.upsert({ where: { name }, create: { name }, update: {} }),
    ),
  );

  const items = [
    { sku: 'DEMO-BPM-100', name: '[DEMO] Digital blood pressure monitor', category: 2, price: '450.00', cost: '310.0000', reorder: 5 },
    { sku: 'DEMO-ECG-12', name: '[DEMO] 12-lead ECG machine', category: 0, price: '18500.00', cost: '14200.0000', reorder: 1 },
    { sku: 'DEMO-PLS-20', name: '[DEMO] Pulse oximeter, fingertip', category: 2, price: '180.00', cost: '112.0000', reorder: 10 },
    { sku: 'DEMO-USG-4D', name: '[DEMO] Portable ultrasound scanner', category: 0, price: '42500.00', cost: '33800.0000', reorder: 1 },
    { sku: 'DEMO-MON-8', name: '[DEMO] Eight-parameter patient monitor', category: 2, price: '9800.00', cost: '7400.0000', reorder: 2 },
    { sku: 'DEMO-SYR-5', name: '[DEMO] Disposable syringes 5ml, box of 100', category: 1, price: '48.00', cost: '29.0000', reorder: 60, unit: 'box' },
    { sku: 'DEMO-THM-IR', name: '[DEMO] Infrared thermometer', category: 0, price: '95.00', cost: '58.0000', reorder: 12 },
    { sku: 'DEMO-GLV-M', name: '[DEMO] Nitrile examination gloves (M), box of 100', category: 1, price: '65.00', cost: '41.5000', reorder: 50, unit: 'box' },
  ];
  for (const it of items) {
    await prisma.stockItem.upsert({
      where: { sku: it.sku },
      create: {
        sku: it.sku,
        name: it.name,
        categoryId: categories[it.category]!.id,
        unit: it.unit ?? 'unit',
        sellingPrice: it.price,
        purchaseCost: it.cost,
        reorderLevel: it.reorder,
        createdById: creator.id,
      },
      update: {},
    });
  }

  const clients = [
    { code: 'DEMO-CL-001', name: '[DEMO] Ridge Regional Hospital', organizationType: 'public_hospital' as const },
    { code: 'DEMO-CL-002', name: '[DEMO] Lifeline Diagnostics Laboratory', organizationType: 'laboratory' as const },
    { code: 'DEMO-CL-003', name: '[DEMO] Northgate Specialist Clinic', organizationType: 'clinic' as const },
    { code: 'DEMO-CL-004', name: '[DEMO] Harbour Community Health Centre', organizationType: 'public_hospital' as const },
    { code: 'DEMO-CL-005', name: '[DEMO] Meridian Pharmacy Group', organizationType: 'pharmacy' as const },
  ];
  for (const c of clients) {
    await prisma.client.upsert({
      where: { code: c.code },
      create: { ...c, branchId: branches[0]!.id, createdById: creator.id },
      update: {},
    });
  }
  console.log('Demo records ready (DEMO- prefix).');
}

async function main() {
  await syncPermissionCatalogue(prisma);
  console.log('Permission catalogue and system roles are up to date.');
  if (demo) await seedDemo();
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
