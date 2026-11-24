-- The roles a production deployment connects with (SOC 2 CC6.1, CC6.3).
--   app_runtime  what the app's login role joins. It has no rights of its own: every query first
--                switches into app_owner, app_team, app_agent, app_auth or app_system, so row-level
--                security and grants always apply. The admin role (BYPASSRLS) runs migrations only.
--   app_system   scheduled jobs: clears old transcripts, removes expired sign-in links and sessions.
--                Reads the newest audit row's id and hash. It cannot read customers, messages or drafts.
-- To deploy: create role ai_employee_app login password '...'; grant app_runtime to ai_employee_app;

do $$ begin
  if not exists (select from pg_roles where rolname = 'app_system') then create role app_system nologin; end if;
  if not exists (select from pg_roles where rolname = 'app_runtime') then create role app_runtime nologin noinherit; end if;
end $$;

grant app_owner, app_team, app_agent, app_auth, app_system to app_runtime;

-- The daily job reads the newest audit row's id and hash to log it outside the database.
grant select (id, hash) on audit_log to app_system;
create policy system_head on audit_log for select to app_system using (true);

-- Retention: clear transcripts on old calls (every business), remove old links and sessions.
grant select (id, started_at, transcript), update (transcript) on calls to app_system;
grant select (token_hash, expires_at), delete on login_tokens to app_system;
grant select (id, expires_at, revoked_at), delete on sessions to app_system;
create policy system_retention on calls for all to app_system using (true) with check (true);
create policy system_retention on login_tokens for all to app_system using (true);
create policy system_retention on sessions for all to app_system using (true);
