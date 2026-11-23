import { z } from 'zod';
import { optionalText, requiredText } from './common';

/**
 * The public website (trans-sas-main) talks to the API through /public routes only:
 * it reads the catalogue of stock items marked "Show on website" and sends customers'
 * product requests, which become draft proformas. Nothing here needs a session, so every
 * field is validated strictly and nothing internal (cost, stock, price) is exposed.
 */

export const WEBSITE_REQUEST_MAX_LINES = 50;
export const WEBSITE_REQUEST_MAX_QUANTITY = 9999;

export const WEBSITE_DELIVERY_METHODS = ['delivery', 'pickup'] as const;
export type WebsiteDeliveryMethod = (typeof WEBSITE_DELIVERY_METHODS)[number];

/** One product a customer asked for. Prices are never taken from the browser. */
export const websiteRequestLineSchema = z.object({
  sku: z.string().trim().toUpperCase().min(1).max(40),
  quantity: z.coerce
    .number({ invalid_type_error: 'Enter a quantity.' })
    .int('Quantities are whole numbers.')
    .min(1, 'Quantities start at 1.')
    .max(WEBSITE_REQUEST_MAX_QUANTITY, `Ask for at most ${WEBSITE_REQUEST_MAX_QUANTITY} of one item.`),
});

export const websiteRequestSchema = z.object({
  /** Random key the browser makes once per submission; a resend returns the same reference. */
  submissionKey: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/, 'Invalid submission key.'),
  name: requiredText('Your name', 120),
  organisation: optionalText(160),
  email: z
    .string({ required_error: 'Enter your email address.' })
    .trim()
    .toLowerCase()
    .max(254)
    .email('Enter an email address like name@example.com.'),
  phone: z
    .string({ required_error: 'Enter a phone number.' })
    .trim()
    .regex(/^[+()\d\s.-]{7,40}$/, 'Enter a phone number we can reach you on.'),
  delivery: z.enum(WEBSITE_DELIVERY_METHODS),
  address: optionalText(500),
  notes: optionalText(2000),
  items: z
    .array(websiteRequestLineSchema)
    .min(1, 'Add at least one product.')
    .max(WEBSITE_REQUEST_MAX_LINES, `Send at most ${WEBSITE_REQUEST_MAX_LINES} products in one request.`),
  /** Honeypot: a hidden field people never fill in. Anything here is treated as a bot. */
  website: z.string().max(200).optional(),
}).superRefine((v, ctx) => {
  if (v.delivery === 'delivery' && !v.address) {
    ctx.addIssue({ code: 'custom', path: ['address'], message: 'Enter the delivery address, with a landmark or GPS code.' });
  }
});
export type WebsiteRequestInput = z.input<typeof websiteRequestSchema>;

export interface WebsiteRequestReceiptDto {
  /** The draft proforma's number, given to the customer as their reference. */
  reference: string;
}

export interface WebsiteProductDto {
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  unit: string;
  /** Short-lived signed URLs, first image first. */
  images: string[];
}
