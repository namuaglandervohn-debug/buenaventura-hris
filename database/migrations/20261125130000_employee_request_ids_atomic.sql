begin;

-- Serialize request-ID allocation in PostgreSQL. Client-side scans cannot see
-- other employees' rows under RLS and can also race concurrent submissions.
lock table public.employee_requests in access exclusive mode;

create sequence if not exists hris_private.employee_request_id_seq;
revoke all on sequence hris_private.employee_request_id_seq from public, anon, authenticated;

do $$
declare
  highest_existing bigint;
  sequence_value bigint;
  sequence_is_called boolean;
begin
  select coalesce(max(substring(request_id from '^REQ-[0-9]{4}-([0-9]+)$')::bigint), 0)
  into highest_existing
  from public.employee_requests
  where request_id ~ '^REQ-[0-9]{4}-[0-9]+$';

  select last_value, is_called into sequence_value, sequence_is_called
  from hris_private.employee_request_id_seq;
  if highest_existing = 0 and sequence_value = 1 and not sequence_is_called then
    perform pg_catalog.setval('hris_private.employee_request_id_seq'::regclass, 1, false);
  else
    perform pg_catalog.setval(
      'hris_private.employee_request_id_seq'::regclass,
      greatest(highest_existing, sequence_value, 1),
      true
    );
  end if;
end;
$$;

create or replace function hris_private.assign_employee_request_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_number bigint;
  request_year text;
  sequence_text text;
begin
  next_number := pg_catalog.nextval('hris_private.employee_request_id_seq'::regclass);
  request_year := pg_catalog.to_char(
    coalesce(new.created_at, pg_catalog.now()) at time zone 'Asia/Manila',
    'YYYY'
  );
  sequence_text := case
    when next_number < 10000 then pg_catalog.lpad(next_number::text, 4, '0')
    else next_number::text
  end;

  -- Always replace a client-provided value so old or stale clients cannot
  -- introduce collisions or bypass the shared database-wide sequence.
  new.request_id := 'REQ-' || request_year || '-' || sequence_text;
  return new;
end;
$$;
revoke all on function hris_private.assign_employee_request_id() from public, anon, authenticated;

drop trigger if exists assign_employee_request_id on public.employee_requests;
create trigger assign_employee_request_id
before insert on public.employee_requests
for each row execute function hris_private.assign_employee_request_id();

notify pgrst, 'reload schema';
commit;
