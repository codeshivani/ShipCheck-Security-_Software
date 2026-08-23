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
3. Run `migrations/001_init.sql`.
4. Copy the project URL into `SUPABASE_URL`.
5. Copy the server-side service-role key into `SUPABASE_SERVICE_ROLE_KEY`.
6. Never expose the service-role key as `NEXT_PUBLIC_*` and never commit it.

## Railway

1. Push this repository to GitHub.
2. Create a Railway project and deploy the GitHub repository.
3. Railway will use `Dockerfile`.
4. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and AI variables in Railway Variables.
5. Generate a Railway public domain.
6. Verify `/api/health` returns `database: configured`.

The scanner needs a persistent service because it launches Git processes and uses temporary workspaces during scans. Keep the workspace TTL short; the database is the durable source for reports.

## Local

```powershell
npm.cmd install
npm.cmd run dev
```

Then set the Supabase variables in `.env.local` and run the migration in Supabase.

## Important

The database stores scan metadata and JSON reports/findings. It does NOT store cloned repository contents or raw repository files.
