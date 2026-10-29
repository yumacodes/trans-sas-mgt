import { z } from 'zod';

/** Treats an unset, empty or whitespace-only variable as absent. */
const optionalEnv = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().optional(),
);

const optionalEmailEnv = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().email('must be an email address').optional(),
);

/**
 * Server configuration, validated once at start-up. Secrets stay server-side; nothing
 * here is ever sent to the browser.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    SUPABASE_URL: z.string().url('SUPABASE_URL must be a URL'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
    /** Public anon key, used for user sign-in calls. Defaults to VITE_SUPABASE_ANON_KEY. */
    SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) is required'),
    /**
     * Legacy HS256 JWT secret. When set, access tokens are verified with it; otherwise
     * they are verified against the project's JWKS (asymmetric signing keys).
     */
    SUPABASE_JWT_SECRET: z.string().optional(),
    SUPABASE_STORAGE_BUCKET: z.string().default('business-documents'),

    /** Comma-separated list of browser origins allowed to call the API. */
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    /** Public URL of the web app, used for password-reset redirects. */
    APP_URL: z.string().url().default('http://localhost:5173'),
    /** Number of reverse proxies in front of the API (for rate limiting by client IP). */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    /**
     * Outbound email (the Communication module). Email is optional: without SMTP_HOST
     * and MAIL_FROM_EMAIL the app runs normally and the Communication page shows a
     * setup notice instead of pretending that messages were sent.
     */
    SMTP_HOST: optionalEnv,
    SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
    /** Implicit TLS. Defaults to true on port 465, STARTTLS otherwise. */
    SMTP_SECURE: z.enum(['true', 'false']).optional(),
    SMTP_USER: optionalEnv,
    SMTP_PASS: optionalEnv,
    MAIL_FROM_EMAIL: optionalEmailEnv,
    MAIL_FROM_NAME: optionalEnv,
    MAIL_REPLY_TO: optionalEmailEnv,
  })
  .transform((env) => ({
    ...env,
    // Accept URLs copied with an API path (e.g. ".../rest/v1/"); only the origin is used.
    SUPABASE_URL: new URL(env.SUPABASE_URL).origin,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    jwtIssuer: `${new URL(env.SUPABASE_URL).origin}/auth/v1`,
    smtpSecure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : env.SMTP_PORT === 465,
  }));

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse({
      ...process.env,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
    });
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
      throw new Error(`Invalid server configuration:\n${problems.join('\n')}`);
    }
    cached = parsed.data;
  }
  return cached;
}
