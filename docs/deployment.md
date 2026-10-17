# ShipCheck deployment

## Recommended architecture

- App/scanner: Railway persistent service running the Dockerfile.
- Database: Supabase Postgres using the server-only service-role REST API.
- Repository workspaces: ephemeral container storage, retained only for the active scan/rescan TTL.
- Persistent reports/batches/share links: Postgres.

This avoids putting long-running Git/static-analysis work into a serverless-only runtime while keeping report data durable.

## Database setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `../migrations/001_init.sql`.
4. Run `../migrations/002_auth_hardening.sql`.
5. Set the Supabase Site URL and redirect URLs for `/auth/callback`.
6. Keep email confirmation enabled for production.
7. Configure password strength, rate limits and CAPTCHA in Authentication settings.
8. Copy the project URL into both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`.
9. Copy the publishable key into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
10. Copy the server-side service/secret key into `SUPABASE_SERVICE_ROLE_KEY`.
11. Never expose the service/secret key as `NEXT_PUBLIC_*` and never commit it.

## Railway

1. Push this repository to GitHub.
2. Create a Railway project and deploy the GitHub repository.
3. Railway will use the repository-root `Dockerfile`.
4. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and AI variables in Railway Variables.
5. Generate a Railway public domain.
6. Verify `/api/health` returns `database: configured`.

The scanner needs a persistent service because it launches Git processes and uses temporary workspaces during scans. Keep the workspace TTL short; the database is the durable source for reports.

## Local

```powershell
npm.cmd install
npm.cmd run dev
```

Run these commands from the repository root. Create `.env.local` from
`.env.example`, set the Supabase variables, and run the migration in Supabase.

## Important

The database stores scan metadata and JSON reports/findings. It does NOT store cloned repository contents or raw repository files.

## Authentication hardening

ShipCheck now uses Supabase Auth with cookie-based SSR sessions via `@supabase/ssr`. The previous localStorage-only demo login is no longer an authentication boundary. Protected APIs verify the authenticated user server-side, scan sessions are bound to the authenticated user, state-changing APIs enforce same-origin requests, password reset uses Supabase Auth, and optional TOTP MFA can be enabled from Profile. Keep `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` public and keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
