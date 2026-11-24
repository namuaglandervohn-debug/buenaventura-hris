begin;

lock table public.schedule_swap_requests in access exclusive mode;

create table if not exists hris_private.schedule_swap_request_sequences (
  requester_employee_id text primary key references public.employees(employee_id) on delete cascade,
  last_number bigint not null default 0 check (last_number >= 0)
);
revoke all on hris_private.schedule_swap_request_sequences from public, anon, authenticated;

insert into hris_private.schedule_swap_request_sequences (requester_employee_id, last_number)
select requester_employee_id, count(*)
from public.schedule_swap_requests
group by requester_employee_id
on conflict (requester_employee_id) do update
set last_number = greatest(
  hris_private.schedule_swap_request_sequences.last_number,
  excluded.last_number
);

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.schedule_swap_requests'::regclass
      and c.contype = 'u'
      and c.conkey = array[(
        select a.attnum
        from pg_catalog.pg_attribute a
        where a.attrelid = c.conrelid and a.attname = 'request_id'
      )]::smallint[]
  loop
    execute pg_catalog.format('alter table public.schedule_swap_requests drop constraint %I', constraint_name);
  end loop;
end;
$$;

with numbered_requests as (
  select id,
    pg_catalog.row_number() over (
      partition by requester_employee_id order by created_at, id
    ) as request_number
  from public.schedule_swap_requests
)
update public.schedule_swap_requests request
set request_id = 'SWAPREQ-' || pg_catalog.lpad(numbered_requests.request_number::text, 4, '0')
from numbered_requests
where numbered_requests.id = request.id;

alter table public.schedule_swap_requests
  add constraint schedule_swap_requests_requester_request_id_key
  unique (requester_employee_id, request_id);

create or replace function hris_private.assign_schedule_swap_request_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_number bigint;
begin
  insert into hris_private.schedule_swap_request_sequences (requester_employee_id, last_number)
  values (new.requester_employee_id, 1)
  on conflict (requester_employee_id) do update
  set last_number = hris_private.schedule_swap_request_sequences.last_number + 1
  returning last_number into next_number;

  new.request_id := 'SWAPREQ-' || pg_catalog.lpad(next_number::text, 4, '0');
  return new;
end;
$$;
revoke all on function hris_private.assign_schedule_swap_request_id() from public, anon, authenticated;

create trigger schedule_swap_requests_assign_request_id
before insert on public.schedule_swap_requests
for each row execute function hris_private.assign_schedule_swap_request_id();

notify pgrst, 'reload schema';
commit;
