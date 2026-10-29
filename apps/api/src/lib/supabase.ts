import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

let admin: SupabaseClient | undefined;

/**
 * Service-role client. Server-only: it bypasses Row Level Security and can manage
 * auth users, so it must never be exposed to the browser.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return admin;
}

/** Test hook. */
export function setSupabaseAdminForTests(client: SupabaseClient | undefined) {
  admin = client;
}
