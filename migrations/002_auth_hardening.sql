-- ShipCheck authentication/authorization hardening.
-- Safe to run after 001_init.sql. Existing rows remain readable only to the
-- server-side service role until they are associated with a user.

alter table batches add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists batches_user_id_idx on batches(user_id);

-- Defense-in-depth: authenticated users can only access their own private rows.
alter table scans enable row level security;
alter table batches enable row level security;
alter table shared_reports enable row level security;

drop policy if exists scans_select_own on scans;
drop policy if exists scans_insert_own on scans;
drop policy if exists scans_update_own on scans;
drop policy if exists batches_select_own on batches;
drop policy if exists batches_insert_own on batches;
drop policy if exists batches_update_own on batches;
drop policy if exists shared_reports_public_select on shared_reports;

create policy scans_select_own on scans
  for select to authenticated
  using (user_id = auth.uid());

create policy scans_insert_own on scans
  for insert to authenticated
  with check (user_id = auth.uid());

create policy scans_update_own on scans
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy batches_select_own on batches
  for select to authenticated
  using (user_id = auth.uid());

create policy batches_insert_own on batches
  for insert to authenticated
  with check (user_id = auth.uid());

create policy batches_update_own on batches
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Shared reports are intentionally public-read by unguessable token while
-- their server-side creation remains protected by the application API.
create policy shared_reports_public_select on shared_reports
  for select to anon, authenticated
  using (expires_at > now());

-- Keep updated_at accurate for future partial updates.
create or replace function set_shipcheck_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scans_set_updated_at on scans;
create trigger scans_set_updated_at
before update on scans
for each row execute function set_shipcheck_updated_at();
