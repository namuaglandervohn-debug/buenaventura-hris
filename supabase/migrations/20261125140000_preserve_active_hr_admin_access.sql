begin;

create schema if not exists hris_private;

create or replace function hris_private.prevent_hr_admin_lockout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  removes_admin_access boolean := false;
  other_active_admins bigint;
begin
  if tg_op = 'UPDATE' then
    removes_admin_access := old.is_active is true and (
      new.is_active is distinct from true
      or pg_catalog.lower(coalesce(new.role, '')) not in ('hr', 'hr_admin', 'admin')
      or (old.auth_user_id is not null and new.auth_user_id is distinct from old.auth_user_id)
    );
  elsif tg_op = 'DELETE' then
    removes_admin_access := old.is_active is true;
  end if;

  if not removes_admin_access
     or old.role is null
     or pg_catalog.lower(old.role) not in ('hr', 'hr_admin', 'admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if auth.uid() is not null and old.auth_user_id = auth.uid() then
    raise exception 'You cannot deactivate, unlink, or remove your own active HR Admin account.';
  end if;

  -- Serialize simultaneous changes so two admins cannot deactivate each
  -- other's accounts and leave the system without an active HR Admin.
  perform pg_catalog.pg_advisory_xact_lock(564844, 1);
  select count(*) into other_active_admins
  from public.user_accounts account
  where account.user_id is distinct from old.user_id
    and account.is_active is true
    and pg_catalog.lower(coalesce(account.role, '')) in ('hr', 'hr_admin', 'admin');

  if other_active_admins = 0 then
    raise exception 'At least one active HR Admin account must remain. Activate another HR Admin account first.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function hris_private.prevent_hr_admin_lockout() from public, anon, authenticated, service_role;
drop trigger if exists prevent_hr_admin_lockout on public.user_accounts;
create trigger prevent_hr_admin_lockout
before update of is_active, role, auth_user_id or delete on public.user_accounts
for each row execute function hris_private.prevent_hr_admin_lockout();

notify pgrst, 'reload schema';
commit;
