create table if not exists scans (
  scan_id text primary key,
  user_id uuid null,
  repo_url text not null,
  status text not null default 'complete',
  report jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scans_repo_url_idx on scans(repo_url);
create index if not exists scans_created_at_idx on scans(created_at desc);
create index if not exists scans_user_id_idx on scans(user_id);

create table if not exists batches (
  batch_id text primary key,
  username text not null,
  items jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists batches_created_at_idx on batches(created_at desc);

create table if not exists shared_reports (
  token text primary key,
  scan_id text not null references scans(scan_id) on delete cascade,
  report jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists shared_reports_expires_idx on shared_reports(expires_at);

-- Cleanup helper. Run periodically from a scheduled job if desired.
create or replace function cleanup_expired_shared_reports() returns void
language sql as $$
  delete from shared_reports where expires_at <= now();
$$;

alter table scans enable row level security;
alter table batches enable row level security;
alter table shared_reports enable row level security;
