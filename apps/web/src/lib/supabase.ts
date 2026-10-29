import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Accept URLs copied with an API path (e.g. ".../rest/v1/"); only the origin is used. */
function projectOrigin(value: string | undefined) {
  try {
    return value ? new URL(value).origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when the configured browser key is a privileged key. A service_role or secret
 * key must never ship to the browser, so the app refuses to start with one.
 */
export function isPrivilegedKey(key: string | undefined) {
  if (!key) return false;
  if (key.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(atob(key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

const url = projectOrigin(rawUrl);

export const privilegedKeyConfigured = isPrivilegedKey(anonKey);

/** False when the browser build lacks safe public Supabase settings; the app shows a setup screen. */
export const supabaseConfigured = Boolean(url && anonKey) && !privilegedKeyConfigured;

/**
 * Browser Supabase client, used only for authentication (sign-in, session refresh,
 * password recovery). All business data goes through the API, never directly to the
 * database. Only the public anon key is used here.
 */
export const supabase = createClient(
  url || 'http://localhost:54321',
  supabaseConfigured ? anonKey : 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Password-reset emails are requested by the API (server side), so
      // their links carry the session in the URL fragment (implicit format). A PKCE
      // client would reject those links. The fragment never reaches any server.
      flowType: 'implicit',
    },
  },
);
