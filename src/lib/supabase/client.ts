import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from './config';

export function createClient() {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error(
      'ShipCheck is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart the dev server.',
    );
  }

  return createBrowserClient(config.url, config.publishableKey);
}
