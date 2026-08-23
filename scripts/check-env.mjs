const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing local environment variables: ${missing.join(', ')}`);
  console.error('Create .env.local from .env.example, fill the Supabase values, and restart the dev server.');
  process.exit(1);
}

try {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!/^https?:$/.test(url.protocol)) throw new Error('URL must use http or https');
} catch {
  console.error('NEXT_PUBLIC_SUPABASE_URL is not a valid http(s) URL.');
  process.exit(1);
}

console.log('ShipCheck environment looks ready for Supabase Auth.');
