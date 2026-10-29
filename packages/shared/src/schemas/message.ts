import { z } from 'zod';
import { listQuerySchema, optionalText, requiredText, uuid } from './common';
import { ORGANIZATION_TYPES } from './client';

/**
 * Outbound messages to clients and staff (the Communication module).
 *
 * A message is composed once and delivered to every resolved recipient by email.
 * The recipient list is always resolved on the server from the audience and filters,
 * so the browser cannot widen it; `recipientIds` can only narrow it.
 */

export const MESSAGE_AUDIENCES = ['clients', 'users', 'branch_managers'] as const;
export type MessageAudience = (typeof MESSAGE_AUDIENCES)[number];

export const MESSAGE_AUDIENCE_LABELS: Record<MessageAudience, string> = {
  clients: 'Clients',
  users: 'Staff users',
  branch_managers: 'Branch managers',
};

export const MESSAGE_AUDIENCE_DESCRIPTIONS: Record<MessageAudience, string> = {
  clients: 'Organizations in the client directory that have an email address.',
  users: 'People with a user account in this application.',
  branch_managers: 'The user assigned as manager of each branch.',
};

export const MESSAGE_STATUSES = ['queued', 'sending', 'sent', 'partially_sent', 'failed'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  queued: 'Queued',
  sending: 'Sending',
  sent: 'Sent',
  partially_sent: 'Partly sent',
  failed: 'Failed',
};

export const MESSAGE_RECIPIENT_STATUSES = ['pending', 'sent', 'failed', 'skipped'] as const;
export type MessageRecipientStatus = (typeof MESSAGE_RECIPIENT_STATUSES)[number];

export const MESSAGE_RECIPIENT_STATUS_LABELS: Record<MessageRecipientStatus, string> = {
  pending: 'Pending',
  sent: 'Delivered to mail server',
  failed: 'Failed',
  skipped: 'Skipped (no email address)',
};

export const MESSAGE_RECIPIENT_KINDS = ['client', 'user', 'branch_manager'] as const;
export type MessageRecipientKind = (typeof MESSAGE_RECIPIENT_KINDS)[number];

/** Guard against a mistaken filter turning into thousands of emails. */
export const MESSAGE_MAX_RECIPIENTS = 500;
/** How many resolved recipients the audience endpoint lists for review. */
export const MESSAGE_RECIPIENT_PREVIEW_LIMIT = 200;
export const MESSAGE_SUBJECT_MAX = 200;
export const MESSAGE_BODY_MAX = 10_000;

/* ---------- Merge fields ---------- */

export interface MergeField {
  token: string;
  label: string;
}

/** Available in every message. */
export const COMMON_MERGE_FIELDS: MergeField[] = [
  { token: 'recipient_name', label: 'Recipient name' },
  { token: 'first_name', label: 'First word of the recipient name' },
  { token: 'email', label: 'Recipient email address' },
  { token: 'company_name', label: 'Your company name' },
  { token: 'today', label: "Today's date" },
];

const AUDIENCE_MERGE_FIELDS: Record<MessageAudience, MergeField[]> = {
  clients: [
    { token: 'client_code', label: 'Client code' },
    { token: 'contact_person', label: 'Contact person' },
    { token: 'organisation_type', label: 'Organization type' },
    { token: 'branch', label: 'Branch looking after the client' },
  ],
  users: [
    { token: 'username', label: 'Sign-in name' },
    { token: 'branch', label: 'Assigned branch(es)' },
  ],
  branch_managers: [
    { token: 'branch', label: 'Branch name' },
    { token: 'branch_code', label: 'Branch code' },
  ],
};

export function mergeFieldsFor(audience: MessageAudience): MergeField[] {
  return [...COMMON_MERGE_FIELDS, ...AUDIENCE_MERGE_FIELDS[audience]];
}

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/** Merge-field names used in a template, in order of first appearance. */
export function templateTokens(template: string): string[] {
  const out: string[] = [];
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    const token = match[1]!;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

/**
 * Replace `{{token}}` with the recipient's value. Tokens with no value become an empty
 * string; unknown tokens are left untouched (the schema rejects them before sending).
 */
export function renderTemplate(template: string, values: Record<string, string | null>): string {
  return template.replace(TOKEN_PATTERN, (whole, token: string) =>
    token in values ? (values[token] ?? '') : whole,
  );
}

/* ---------- Composing ---------- */

/**
 * Audience filters. Each key applies to specific audiences and is ignored elsewhere:
 * `status`, `organizationType`, `registeredOnly` (clients), `roleId`, `activeOnly`
 * (users), `branchId` (all three).
 */
export const messageFiltersSchema = z.object({
  status: z.enum(['active', 'all']).optional(),
  organizationType: z.enum(ORGANIZATION_TYPES).optional(),
  registeredOnly: z.boolean().optional(),
  roleId: uuid.optional(),
  activeOnly: z.boolean().optional(),
  branchId: uuid.optional(),
});
export type MessageFilters = z.infer<typeof messageFiltersSchema>;

const UNKNOWN_TOKEN = (token: string, audience: MessageAudience) =>
  `"{{${token}}}" is not available for ${MESSAGE_AUDIENCE_LABELS[audience].toLowerCase()}. Use one of the merge fields listed beside the message.`;

const base = z.object({
  audience: z.enum(MESSAGE_AUDIENCES, {
    required_error: 'Choose who should receive this message.',
  }),
  filters: messageFiltersSchema.default({}),
  /** Narrows the resolved audience to these recipients; empty/absent means everyone. */
  recipientIds: z.array(uuid).max(MESSAGE_MAX_RECIPIENTS).optional(),
  subject: requiredText('Subject', MESSAGE_SUBJECT_MAX),
  body: requiredText('Message', MESSAGE_BODY_MAX),
});

/** Rejects merge fields that the chosen audience cannot fill in. */
function checkTokens(
  value: { audience: MessageAudience; subject?: string | null; body?: string | null },
  ctx: z.RefinementCtx,
) {
  const allowed = new Set(mergeFieldsFor(value.audience).map((f) => f.token));
  for (const field of ['subject', 'body'] as const) {
    const template = value[field];
    if (!template) continue;
    const unknown = templateTokens(template).find((t) => !allowed.has(t));
    if (unknown) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: UNKNOWN_TOKEN(unknown, value.audience),
      });
    }
  }
}

export const messageInputSchema = base.superRefine(checkTokens);
export type MessageInput = z.input<typeof messageInputSchema>;

/** Same shape, but the text is optional: used to count recipients while composing. */
export const messageAudienceRequestSchema = base
  .partial({ subject: true, body: true })
  .extend({ subject: optionalText(MESSAGE_SUBJECT_MAX), body: optionalText(MESSAGE_BODY_MAX) })
  .superRefine(checkTokens);
export type MessageAudienceRequest = z.input<typeof messageAudienceRequestSchema>;

export const messageListQuerySchema = listQuerySchema.extend({
  audience: z.enum(MESSAGE_AUDIENCES).optional(),
  status: z.enum(MESSAGE_STATUSES).optional(),
});

/* ---------- Responses ---------- */

export interface AudienceRecipientDto {
  /** Client, user or branch id, depending on the audience. */
  id: string;
  name: string;
  email: string | null;
  /** Secondary line for the review list (client code, branch, role). */
  detail: string | null;
}

export interface MessageAudiencePreviewDto {
  /** Everyone matching the audience and filters. */
  total: number;
  /** Those with an email address, i.e. who would actually be sent to. */
  deliverable: number;
  withoutEmail: number;
  /** Capped at MESSAGE_RECIPIENT_PREVIEW_LIMIT; `truncated` says whether more exist. */
  recipients: AudienceRecipientDto[];
  truncated: boolean;
  /** The message as the first deliverable recipient would receive it. */
  sample: { name: string; email: string; subject: string; body: string } | null;
  /** True when more recipients match than one message may be sent to. */
  overLimit: boolean;
  limit: number;
}

export interface MessageRecipientDto {
  id: string;
  kind: MessageRecipientKind;
  name: string;
  email: string | null;
  status: MessageRecipientStatus;
  error: string | null;
  sentAt: string | null;
}

export interface MessageDto {
  id: string;
  audience: MessageAudience;
  filters: MessageFilters;
  subject: string;
  body: string;
  status: MessageStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
  completedAt: string | null;
}

export interface MessageDetailDto extends MessageDto {
  recipients: MessageRecipientDto[];
}

/** Whether outbound email is configured on the server (never exposes credentials). */
export interface EmailConfigDto {
  configured: boolean;
  fromAddress: string | null;
  host: string | null;
  /** Variables an administrator still needs to set, when not configured. */
  missing: string[];
}
