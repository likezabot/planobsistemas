import { createClient, SupabaseClient } from '@supabase/supabase-js';

/** Retry auth admin createUser + signInWithPassword to survive transient Supabase auth errors in CI. */
async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export async function adminCreateUserRetry(admin: any, email: string, password: string) {
  let lastErr: any;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (!error) return data;
    lastErr = error;
    await sleep(800 + i * 600);
  }
  throw lastErr;
}

export async function signInRetry(client: SupabaseClient, email: string, password: string) {
  let lastErr: any;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (!error) return data;
    lastErr = error;
    await sleep(800 + i * 600);
  }
  throw lastErr;
}
