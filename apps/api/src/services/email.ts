import { createTransport, type Transporter } from 'nodemailer';
import type { EmailConfigDto } from '@tsm/shared';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

/**
 * Outbound email over SMTP.
 *
 * Email is an optional integration: when it is not configured the app does not pretend
 * that messages were sent — `emailConfig().configured` is false and the Communication
 * module shows what an administrator still needs to set up.
 *
 * Credentials come from the server environment only and are never returned to the
 * browser: `emailConfig()` reports the sending address and host, nothing else.
 */

export const EMAIL_NOT_CONFIGURED =
  'Email has not been set up on this server yet, so no message was sent. Ask your administrator to configure the mail settings (SMTP_HOST and MAIL_FROM_EMAIL).';

export interface EmailMessage {
  to: string;
  toName?: string | null;
  subject: string;
  /** Plain text body. A matching HTML part is generated from it. */
  text: string;
}

/** Which required variables are still missing, for the setup notice. */
function missingSettings(): string[] {
  const config = env();
  const missing: string[] = [];
  if (!config.SMTP_HOST) missing.push('SMTP_HOST');
  if (!config.MAIL_FROM_EMAIL) missing.push('MAIL_FROM_EMAIL');
  return missing;
}

export function emailConfigured(): boolean {
  return missingSettings().length === 0;
}

export function emailConfig(): EmailConfigDto {
  const config = env();
  const missing = missingSettings();
  const configured = missing.length === 0;
  return {
    configured,
    fromAddress: configured ? fromHeader() : null,
    host: configured ? `${config.SMTP_HOST}:${config.SMTP_PORT}` : null,
    missing,
  };
}

function fromHeader(): string {
  const { MAIL_FROM_EMAIL, MAIL_FROM_NAME } = env();
  return MAIL_FROM_NAME
    ? `"${MAIL_FROM_NAME.replace(/"/g, '')}" <${MAIL_FROM_EMAIL}>`
    : `${MAIL_FROM_EMAIL}`;
}

let transporter: Transporter | undefined;

function getTransport(): Transporter {
  if (transporter) return transporter;
  const config = env();
  transporter = createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.smtpSecure,
    ...(config.SMTP_USER ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASS ?? '' } } : {}),
    // One connection reused for a whole send run, rather than one per recipient.
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
  });
  return transporter;
}

/** Test hook: replace the transport (and reset it with `undefined`). */
export function setEmailTransportForTests(fake: Transporter | undefined) {
  transporter = fake;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain text to a simple, readable HTML part: paragraphs with line breaks preserved. */
function htmlFromText(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 1em">${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('');
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1f2933">${paragraphs}</div>`;
}

/**
 * Send one email. Throws an AppError whose message is safe to show a business user;
 * the technical cause is logged with the recipient domain only.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!emailConfigured()) throw new AppError('SERVICE_UNAVAILABLE', EMAIL_NOT_CONFIGURED);
  const { MAIL_REPLY_TO } = env();
  try {
    await getTransport().sendMail({
      from: fromHeader(),
      to: message.toName ? { name: message.toName, address: message.to } : message.to,
      ...(MAIL_REPLY_TO ? { replyTo: MAIL_REPLY_TO } : {}),
      subject: message.subject,
      text: message.text,
      html: htmlFromText(message.text),
    });
  } catch (err) {
    logger.warn({ err, domain: message.to.split('@')[1] }, 'email delivery failed');
    throw new AppError('SERVICE_UNAVAILABLE', describeSendFailure(err));
  }
}

/** Check the SMTP settings without sending anything. */
export async function verifyEmailTransport(): Promise<void> {
  if (!emailConfigured()) throw new AppError('SERVICE_UNAVAILABLE', EMAIL_NOT_CONFIGURED);
  try {
    await getTransport().verify();
  } catch (err) {
    logger.warn({ err }, 'smtp verification failed');
    throw new AppError('SERVICE_UNAVAILABLE', describeSendFailure(err));
  }
}

/** Turn an SMTP failure into something the sender can act on. */
export function describeSendFailure(err: unknown): string {
  const code = (err as { code?: string; responseCode?: number } | null)?.code;
  const responseCode = (err as { responseCode?: number } | null)?.responseCode;
  if (code === 'EAUTH') {
    return 'The mail server rejected the sign-in details. Check the SMTP user name and password.';
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'EDNS') {
    return 'We could not reach the mail server. Check the host, port and network, then try again.';
  }
  if (responseCode === 550 || responseCode === 553) {
    return 'The mail server rejected the address. Check that it is spelled correctly and can receive mail.';
  }
  if (responseCode === 554) {
    return 'The mail server refused the message. It may have been treated as spam or the sending address may not be allowed.';
  }
  return 'The mail server could not deliver this message. Try again shortly.';
}
