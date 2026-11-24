-- The AI employee's database. Three app roles, each limited to what it needs (SOC 2 CC6.1, CC6.3):
--   app_owner  the business owner: everything in their business, approves customer-facing drafts
--   app_team   a team member: reads the work, updates jobs and the calendar, approves nothing
--   app_agent  Mike: reads what his tools need, writes leads, calls and pending drafts, deletes nothing
-- Every table is scoped to one business by row-level security, forced so the table owner obeys it too.
-- Every write lands in an append-only, hash-chained audit log (CC7.2, CC7.3).
-- Migrations and the seed run as an admin role with BYPASSRLS; the app never connects as it.

do $$ begin
  if not exists (select from pg_roles where rolname = 'app_owner') then create role app_owner nologin; end if;
  if not exists (select from pg_roles where rolname = 'app_team') then create role app_team nologin; end if;
  if not exists (select from pg_roles where rolname = 'app_agent') then create role app_agent nologin; end if;
end $$;

create function app_business() returns uuid language sql stable as $$
  select nullif(current_setting('app.business_id', true), '')::uuid
$$;

create function app_actor() returns text language sql stable as $$
  select coalesce(nullif(current_setting('app.actor', true), ''), 'system:' || current_user)
$$;

create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null,
  created_at timestamptz not null default now()
);

create table people (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  name text not null,
  role text not null check (role in ('owner', 'team')),
  email_enc text,
  created_at timestamptz not null default now()
);

-- Contact details are ciphertext (src/db/crypto.ts); phone_hash is a keyed hash for lookups.
create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  name text not null,
  phone_enc text,
  phone_hash text,
  email_enc text,
  address_enc text,
  created_at timestamptz not null default now(),
  unique (business_id, phone_hash)
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  customer_id uuid not null references customers(id),
  title text not null,
  status text not null default 'lead' check (status in ('lead', 'scheduled', 'done', 'paid', 'lost')),
  urgent boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table slots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'open' check (status in ('open', 'held', 'booked')),
  job_id uuid references jobs(id),
  held_until timestamptz
);

create table calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  customer_id uuid references customers(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  outcome text check (outcome in ('customer', 'message', 'spam', 'unclear')),
  urgent boolean not null default false,
  summary text,
  transcript jsonb,
  grade jsonb
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  customer_id uuid not null references customers(id),
  direction text not null check (direction in ('in', 'out')),
  body text not null,
  at timestamptz not null default now()
);

-- Anything a customer will see is a draft first. Only the owner can move it past pending.
create table drafts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  customer_id uuid references customers(id),
  kind text not null check (kind in ('text', 'email', 'briefing')),
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'sent')),
  review jsonb,
  created_by text not null,
  decided_by uuid references people(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  job_id uuid references jobs(id),
  name text not null,
  storage_key text not null,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  business_id uuid,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  target_table text not null,
  target_id text,
  detail jsonb,
  prev_hash text,
  hash text not null
);

-- One hash function for writing and verifying, so the chain can be checked at any time. It covers
-- every column, the row's own id and business included, so no field can be changed without breaking it.
create function audit_hash(id bigint, bid uuid, prev text, at timestamptz, actor text, action text, tbl text, tid text, detail jsonb)
returns text language sql stable as $$
  select encode(sha256(convert_to(concat_ws('|',
    id::text, coalesce(bid::text, ''),
    coalesce(prev, ''), to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    actor, action, tbl, coalesce(tid, ''), coalesce(detail::text, '')), 'UTF8')), 'hex')
$$;

-- Writes one audit row per changed row. Runs as the definer, so app roles never need (or get)
-- write access to the log. Update rows record which columns changed, not their values.
create function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec record;
  prev text;
  ts timestamptz := clock_timestamp();
  det jsonb;
  act text := app_actor();
  bid uuid;
  nid bigint;
begin
  rec := case when tg_op = 'DELETE' then old else new end;
  bid := case when tg_table_name = 'businesses' then (to_jsonb(rec)->>'id')::uuid else (to_jsonb(rec)->>'business_id')::uuid end;
  if tg_op = 'UPDATE' then
    select jsonb_build_object('changed', coalesce(jsonb_agg(n.key order by n.key), '[]'::jsonb)) into det
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value;
  end if;
  perform pg_advisory_xact_lock(7243);
  select hash into prev from audit_log order by id desc limit 1;
  nid := nextval(pg_get_serial_sequence('audit_log', 'id'));
  insert into audit_log (id, business_id, at, actor, action, target_table, target_id, detail, prev_hash, hash)
  values (nid, bid, ts, act, lower(tg_op), tg_table_name, rec.id::text, det, prev,
          audit_hash(nid, bid, prev, ts, act, lower(tg_op), tg_table_name, rec.id::text, det));
  return null;
end $$;

create function audit_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;

create trigger audit_log_append_only before update or delete on audit_log for each row execute function audit_append_only();
create trigger audit_log_no_truncate before truncate on audit_log execute function audit_append_only();

do $$
declare t text;
begin
  foreach t in array array['businesses', 'people', 'customers', 'jobs', 'slots', 'calls', 'messages', 'drafts', 'files'] loop
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function audit_row()', t, t);
  end loop;
  foreach t in array array['businesses', 'people', 'customers', 'jobs', 'slots', 'calls', 'messages', 'drafts', 'files', 'audit_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- Businesses: scoped by their own id.
create policy own on businesses for all to app_owner, app_team, app_agent using (id = app_business()) with check (id = app_business());

-- Every other table: scoped by business_id. Grants decide what each role may do within that scope.
do $$
declare t text;
begin
  foreach t in array array['people', 'customers', 'jobs', 'slots', 'calls', 'messages', 'drafts', 'files'] loop
    execute format('create policy own on %I for all to app_owner, app_team, app_agent using (business_id = app_business()) with check (business_id = app_business())', t);
  end loop;
end $$;

-- Mike may only create drafts that wait for a person.
create policy agent_pending_only on drafts as restrictive for insert to app_agent with check (status = 'pending');

-- The log: the owner reads their business's rows; inserts come only from audit_row().
create policy owner_reads on audit_log for select to app_owner using (business_id = app_business());
create policy trigger_writes on audit_log for insert with check (true);

grant select on businesses to app_owner, app_team, app_agent;
grant update on businesses to app_owner;
grant select, insert, update, delete on people, customers, jobs, slots, calls, messages, drafts, files to app_owner;
grant select on audit_log to app_owner;
grant select on people, customers, jobs, slots, calls, messages, drafts, files to app_team;
grant insert, update on customers, jobs, slots, messages to app_team;
grant select on people, customers, jobs, slots, calls, drafts to app_agent;
grant insert, update on customers, calls to app_agent;
grant insert on jobs, drafts to app_agent;
grant update (status, job_id, held_until) on slots to app_agent;
