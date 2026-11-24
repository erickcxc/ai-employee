-- Sign-in (SOC 2 CC6.1, CC6.2): one-time email links and server-side sessions that can be revoked.
-- A separate role, app_auth, does sign-in and can touch nothing else: it reads a person's id, role
-- and business by email hash, and manages links and sessions. Only hashes of links are stored.

do $$ begin
  if not exists (select from pg_roles where rolname = 'app_auth') then create role app_auth nologin; end if;
end $$;

alter table people add column email_hash text unique;

create table login_tokens (
  token_hash text primary key,
  person_id uuid not null references people(id),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  person_id uuid not null references people(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create trigger sessions_audit after insert or update or delete on sessions for each row execute function audit_row();

alter table login_tokens enable row level security;
alter table login_tokens force row level security;
alter table sessions enable row level security;
alter table sessions force row level security;

create policy auth_all on login_tokens for all to app_auth using (true) with check (true);
create policy auth_all on sessions for all to app_auth using (true) with check (true);
create policy auth_reads on people for select to app_auth using (true);
create policy owner_reads on sessions for select to app_owner using (business_id = app_business());

grant select (id, business_id, role, email_hash) on people to app_auth;
grant select, insert, update on login_tokens, sessions to app_auth;
grant select on sessions to app_owner;
