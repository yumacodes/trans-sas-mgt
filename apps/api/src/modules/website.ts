import { createHash } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import {
  calculateProformaTotals,
  PROFORMA_CURRENCIES,
  WEBSITE_ENQUIRY_TOPIC_LABELS,
  websiteEnquirySchema,
  websiteRequestSchema,
  type ProformaCurrency,
  type WebsiteEnquiryReceiptDto,
  type WebsiteProductDto,
  type WebsiteRequestReceiptDto,
} from '@tsm/shared';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { emailConfigured, sendEmail } from '../services/email';
import { prisma, type Tx } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { parse } from '../lib/validate';
import { recordAudit } from '../services/audit';
import { getCompanySettings } from '../services/company-settings';
import { nextDocumentNumber } from '../services/document-numbers';
import { notifyPermission } from '../services/notifications';
import { allImageUrls } from '../services/stock-images';

/**
 * The public website's door into the system. No session: anyone on the internet can call
 * these routes, so they expose only what the shop window shows (no prices, costs or stock)
 * and accept only one kind of write, a product request.
 *
 * A request becomes a DRAFT proforma with source "website" and no staff author, priced
 * from the stock items' selling prices on the server. Staff with proformas.manage are
 * notified, check it, and issue it. Nothing is sold or reserved by a request.
 */
export const websiteRouter = Router();

/** Only items staff chose to list, and only while they could go on a document. */
const LISTED = { isActive: true, approvalStatus: 'approved', showOnWebsite: true } satisfies Prisma.StockItemWhereInput;

const productInclude = {
  category: { select: { name: true } },
  images: {
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { file: { select: { bucket: true, path: true, deletedAt: true } } },
  },
} satisfies Prisma.StockItemInclude;

type ProductRow = Prisma.StockItemGetPayload<{ include: typeof productInclude }>;

async function toProducts(rows: ProductRow[]): Promise<WebsiteProductDto[]> {
  const images = await allImageUrls(rows);
  return rows.map((r) => ({
    sku: r.sku,
    name: r.name,
    description: r.description,
    category: r.category?.name ?? null,
    brand: r.brand,
    model: r.model,
    unit: r.unit,
    images: images.get(r.id) ?? [],
  }));
}

const catalogueLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new AppError('RATE_LIMITED', 'Too many requests. Wait a minute and try again.')),
});

/** Image links are signed for an hour; a short public cache keeps them well inside that. */
const CATALOGUE_CACHE = 'public, max-age=120, stale-while-revalidate=300';

websiteRouter.get('/products', catalogueLimiter, async (_req, res) => {
  const rows = await prisma.stockItem.findMany({ where: LISTED, include: productInclude, orderBy: { name: 'asc' }, take: 500 });
  res.setHeader('Cache-Control', CATALOGUE_CACHE);
  ok(res, await toProducts(rows));
});

websiteRouter.get('/products/:sku', catalogueLimiter, async (req, res) => {
  const sku = String(req.params.sku ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9._/-]{1,40}$/.test(sku)) throw new AppError('NOT_FOUND', 'That product could not be found.');
  const row = await prisma.stockItem.findFirst({ where: { ...LISTED, sku }, include: productInclude });
  if (!row) throw new AppError('NOT_FOUND', 'That product could not be found. It may have been removed from the website.');
  res.setHeader('Cache-Control', CATALOGUE_CACHE);
  ok(res, (await toProducts([row]))[0]);
});

/* ---------- Product requests ---------- */

const requestLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError('RATE_LIMITED', 'Too many requests have been sent from here in the last hour. Call or WhatsApp us instead.')),
});

const UNAVAILABLE = 'One of the products in your cart is no longer available. Remove it and send your request again.';

async function existingReceipt(submissionKey: string): Promise<WebsiteRequestReceiptDto | null> {
  const row = await prisma.proforma.findUnique({ where: { submissionKey }, select: { number: true } });
  return row ? { reference: row.number } : null;
}

/** The oldest active branch receives website requests; staff can move the proforma when editing. */
async function receivingBranch(tx: Tx) {
  const branch = await tx.branch.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  return branch?.id ?? null;
}

websiteRouter.post('/requests', requestLimiter, async (req, res) => {
  const input = parse(websiteRequestSchema, req.body);
  // Honeypot filled in: a bot. Refuse without saying why.
  if (input.website) throw new AppError('BAD_REQUEST', 'We could not accept this request.');

  // A resent form (double click, lost response, refresh) gets the original reference back.
  const replay = await existingReceipt(input.submissionKey);
  if (replay) return ok(res, replay);

  // The same product twice in one request becomes one line.
  const quantities = new Map<string, number>();
  for (const line of input.items) quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);

  try {
    const receipt = await prisma.$transaction(async (tx) => {
      const items = await tx.stockItem.findMany({
        where: { ...LISTED, sku: { in: [...quantities.keys()] } },
        select: { id: true, sku: true, name: true, unit: true, sellingPrice: true },
      });
      if (items.length !== quantities.size) throw new AppError('VALIDATION_FAILED', UNAVAILABLE, { items: UNAVAILABLE });
      const lines = [...quantities].map(([sku, quantity]) => {
        const item = items.find((i) => i.sku === sku)!;
        return { item, quantity: String(quantity), unitPrice: item.sellingPrice.toFixed(2) };
      });

      const [company, settings, branchId] = await Promise.all([
        tx.companyProfile.findFirst({ select: { defaultCurrency: true } }),
        getCompanySettings(tx),
        receivingBranch(tx),
      ]);
      const currency: ProformaCurrency = (PROFORMA_CURRENCIES as readonly string[]).includes(company?.defaultCurrency ?? '')
        ? (company!.defaultCurrency as ProformaCurrency)
        : 'GHS';
      const totals = calculateProformaTotals(lines, 0, settings.defaultTaxRate);

      // Link to the client directory when the email matches exactly one active client.
      const matches = await tx.client.findMany({
        where: { status: 'active', email: { equals: input.email, mode: 'insensitive' } },
        select: { id: true },
        take: 2,
      });
      const clientId = matches.length === 1 ? matches[0]!.id : null;

      const customerName = input.organisation ?? input.name;
      const notes = [
        'Request from the website. Check prices and availability before issuing.',
        `Contact: ${input.name}${input.organisation ? ` (${input.organisation})` : ''}`,
        input.reference ? `Customer reference (tender / PO): ${input.reference}` : '',
        input.taxId ? `Customer TIN: ${input.taxId}` : '',
        `Fulfilment: ${input.delivery === 'delivery' ? 'deliver to the address above' : 'customer will pick up in Accra'}`,
        input.notes ? `\nCustomer's note:\n${input.notes}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const issueDate = new Date(new Date().toISOString().slice(0, 10));
      const number = await nextDocumentNumber(tx, 'proforma', { date: issueDate });
      const proforma = await tx.proforma.create({
        data: {
          number,
          source: 'website',
          submissionKey: input.submissionKey,
          branchId,
          issueDate,
          currency,
          clientId,
          customerName,
          customerAddress: input.delivery === 'delivery' ? (input.address ?? null) : null,
          customerEmail: input.email,
          customerPhone: input.phone,
          vatRate: 0,
          taxRate: settings.defaultTaxRate,
          subtotal: totals.subtotal,
          vatAmount: totals.vatAmount,
          taxAmount: totals.taxAmount,
          total: totals.total,
          notes,
          createdById: null,
          items: {
            create: lines.map((line, position) => ({
              position,
              stockItemId: line.item.id,
              name: line.item.name,
              quantity: line.quantity,
              unit: line.item.unit,
              unitPrice: line.unitPrice,
              amount: totals.amounts[position]!,
            })),
          },
        },
        select: { id: true, number: true },
      });

      await recordAudit(tx, { actorId: null, requestId: req.id ? String(req.id) : undefined }, {
        action: 'proforma.website_request',
        entityType: 'proforma',
        entityId: proforma.id,
        summary: `Website request ${proforma.number} from ${customerName} (${lines.length} product${lines.length === 1 ? '' : 's'})`,
      });
      await notifyPermission(tx, 'proformas.manage', branchId, null, {
        type: 'website_request',
        title: `New website request from ${customerName}`,
        body: `${proforma.number}: ${lines.length} product${lines.length === 1 ? '' : 's'}. Check the prices, then issue it.`,
        link: `/website-requests?open=${proforma.id}`,
        dedupeKey: `website-request:${proforma.id}`,
      });
      return { reference: proforma.number };
    });
    created(res, receipt);
  } catch (err) {
    // Two copies of the same submission raced; the other one won. Return its reference.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await existingReceipt(input.submissionKey);
      if (winner) return ok(res, winner);
    }
    throw err;
  }
});

/* ---------- Contact-form enquiries ---------- */

const enquiryLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError('RATE_LIMITED', 'Too many messages have been sent from here in the last hour. Call or WhatsApp us instead.')),
});

/** A short reference derived from the submission key, so a resend gets the same one back. */
function enquiryReference(submissionKey: string): string {
  const digest = createHash('sha256').update(submissionKey).digest('base64url').replace(/[^A-Za-z0-9]/g, '');
  return `ENQ-${digest.slice(0, 6).toUpperCase()}`;
}

/**
 * The contact form. There is no enquiry table: staff who handle requests are notified in the
 * app (the notification carries the whole message, once per person thanks to the dedupe key),
 * and the company inbox gets a copy when email is configured. The visitor is told it arrived
 * only after the notification is stored.
 */
websiteRouter.post('/enquiries', enquiryLimiter, async (req, res) => {
  const input = parse(websiteEnquirySchema, req.body);
  if (input.website) throw new AppError('BAD_REQUEST', 'We could not accept this message.');

  const reference = enquiryReference(input.submissionKey);
  const topic = WEBSITE_ENQUIRY_TOPIC_LABELS[input.topic];
  const from = `${input.name}${input.organisation ? ` (${input.organisation})` : ''}`;
  const contact = [input.email, input.phone].filter(Boolean).join(' · ');
  const subject = input.subject ? `${topic}: ${input.subject}` : topic;
  const message = input.message.length > 1500 ? `${input.message.slice(0, 1500)}…` : input.message;

  await prisma.$transaction(async (tx) => {
    await notifyPermission(tx, 'proformas.manage', null, null, {
      type: 'website_enquiry',
      title: `Website message from ${from}`,
      body: `${reference} · ${subject}\n${contact}\n\n${message}`,
      dedupeKey: `website-enquiry:${reference}`,
    });
    await recordAudit(tx, { actorId: null, requestId: req.id ? String(req.id) : undefined }, {
      action: 'website.enquiry',
      entityType: 'website_enquiry',
      entityId: reference,
      summary: `Website message ${reference} from ${from} (${topic})`,
    });
  });

  // The inbox copy is a convenience: the message is already stored for staff, so a mail
  // failure is logged rather than shown to the visitor as a failed send.
  if (emailConfigured()) {
    const company = await prisma.companyProfile.findFirst({ select: { email: true } });
    if (company?.email) {
      sendEmail({
        to: company.email,
        subject: `[Website] ${subject} (${reference})`,
        text: `From: ${from}\nEmail: ${input.email}${input.phone ? `\nPhone: ${input.phone}` : ''}\n\n${input.message}`,
      }).catch((err) => logger.warn({ err, reference }, 'website enquiry email copy failed'));
    }
  }

  created(res, { reference } satisfies WebsiteEnquiryReceiptDto);
});
