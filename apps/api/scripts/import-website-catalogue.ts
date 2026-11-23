/**
 * Adds the public website's products (scripts/data/website-catalogue.json, taken from the old
 * trans-sas.com product range) to Stock Items, marked "Show on website", with their photos.
 *
 *   pnpm --filter api website:import -- --as <username>
 *
 * --as        Username of the administrator the items are recorded as created by. Defaults
 *             to the oldest active administrator.
 * --dry-run   Report what would happen and change nothing.
 *
 * Safe to run again: an item code that already exists is left exactly as it is. Selling
 * prices start at 0 because the website never listed prices; staff set them in Stock Items
 * before issuing a website request's proforma.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { Request } from 'express';
import { prisma } from '../src/lib/prisma';
import { recordAudit } from '../src/services/audit';
import { addImages } from '../src/services/stock-images';

interface CatalogueEntry {
  sku: string;
  name: string;
  category: string;
  summary: string;
  description: string;
  features: string[];
  imageUrl: string | null;
}

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: { as: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } },
});
const dryRun = values['dry-run'];

const entries = JSON.parse(
  readFileSync(new URL('./data/website-catalogue.json', import.meta.url), 'utf8'),
) as CatalogueEntry[];

/** Summary, body, then one "- " line per feature: the website splits it back up the same way. */
const description = (e: CatalogueEntry) =>
  [e.summary, e.description, e.features.map((f) => `- ${f}`).join('\n')].filter(Boolean).join('\n\n').slice(0, 2000);

async function actor() {
  const admin = await prisma.userProfile.findFirst({
    where: {
      isActive: true,
      ...(values.as ? { username: values.as.toLowerCase() } : { roles: { some: { role: { key: 'admin' } } } }),
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, fullName: true },
  });
  if (!admin) throw new Error(values.as ? `No active user called "${values.as}".` : 'No active administrator found.');
  return admin;
}

async function categoryId(name: string, actorId: string) {
  const existing = await prisma.stockCategory.findUnique({ where: { name } });
  if (existing) return existing.id;
  if (dryRun) return null;
  const row = await prisma.stockCategory.create({ data: { name, description: 'Website product range' } });
  await recordAudit(prisma, { actorId }, {
    action: 'stock_category.created',
    entityType: 'stock_category',
    entityId: row.id,
    summary: `Stock category ${name} created by the website catalogue import`,
  });
  return row.id;
}

async function download(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, size: buffer.length, originalname: decodeURIComponent(new URL(url).pathname.split('/').pop() ?? 'image.png') };
}

async function main() {
  const by = await actor();
  console.log(`${dryRun ? '[dry run] ' : ''}Importing ${entries.length} products as ${by.fullName}`);
  // addImages records its audit entries against the request's user.
  const req = { auth: { profileId: by.id } } as unknown as Request;
  const counts = { created: 0, skipped: 0, images: 0, imageFailures: [] as string[] };

  for (const entry of entries) {
    const exists = await prisma.stockItem.findUnique({ where: { sku: entry.sku }, select: { id: true } });
    if (exists) {
      counts.skipped++;
      console.log(`  skip    ${entry.sku} (already exists)`);
      continue;
    }
    if (dryRun) {
      counts.created++;
      console.log(`  create  ${entry.sku}  ${entry.name}${entry.imageUrl ? ' + photo' : ''}`);
      continue;
    }

    const item = await prisma.$transaction(async (tx) => {
      const row = await tx.stockItem.create({
        data: {
          sku: entry.sku,
          name: entry.name,
          description: description(entry),
          categoryId: await categoryId(entry.category, by.id),
          unit: 'unit',
          sellingPrice: 0,
          reorderLevel: 0,
          trackingMode: 'none',
          showOnWebsite: true,
          approvalStatus: 'approved',
          approvedById: by.id,
          approvedAt: new Date(),
          createdById: by.id,
        },
      });
      await recordAudit(tx, { actorId: by.id }, {
        action: 'stock_item.created',
        entityType: 'stock_item',
        entityId: row.id,
        summary: `Stock item ${row.sku} – ${row.name} created by the website catalogue import`,
      });
      return row;
    });
    counts.created++;

    if (entry.imageUrl) {
      try {
        await addImages(req, item.id, by.id, [await download(entry.imageUrl)]);
        counts.images++;
      } catch (error) {
        counts.imageFailures.push(`${entry.sku}: ${(error as Error).message}`);
      }
    }
    console.log(`  created ${entry.sku}`);
  }

  console.log(`\nCreated ${counts.created}, skipped ${counts.skipped}, photos ${counts.images}.`);
  if (counts.imageFailures.length) console.log(`Photos that failed (add them in Stock Items):\n  ${counts.imageFailures.join('\n  ')}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
