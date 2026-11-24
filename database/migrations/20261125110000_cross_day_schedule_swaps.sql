begin;

-- Store both sides of a cross-day exchange. Keep swap_day populated for older
-- clients and historic rows, where it represented the requester's day.
alter table public.schedule_swap_requests
  add column if not exists requester_day text,
  add column if not exists recipient_day text;

update public.schedule_swap_requests
set requester_day = coalesce(requester_day, swap_day),
    recipient_day = coalesce(recipient_day, swap_day);

alter table public.schedule_swap_requests
  alter column requester_day set not null,
  alter column recipient_day set not null;

alter table public.schedule_swap_requests
  drop constraint if exists schedule_swap_requester_day_check,
  drop constraint if exists schedule_swap_recipient_day_check;
alter table public.schedule_swap_requests
  add constraint schedule_swap_requester_day_check
    check (requester_day in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  add constraint schedule_swap_recipient_day_check
    check (recipient_day in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday'));

-- Employees can see coworkers' schedule-only details for a week they are also
-- scheduled, including coworkers assigned to another outlet.
create or replace function public.get_employee_schedule_overview()
returns table (
  schedule_id text,
  employee_id text,
  employee_name text,
  "position" text,
  outlet text,
  week text,
  time_in text,
  time_out text,
  break_time text,
  monday text,
  tuesday text,
  wednesday text,
  thursday text,
  friday text,
  saturday text,
  sunday text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.hris_has_role(array['employee']) then
    raise exception 'Only employees can view the employee schedule overview' using errcode = '42501';
  end if;

  return query
  with me as (
    select e.employee_id
    from public.employees e
    join public.user_accounts ua on ua.employee_id = e.employee_id
    where hris_private.is_own_employee(e.employee_id)
    limit 1
  )
  select s.schedule_id, s.employee_id,
    pg_catalog.btrim(pg_catalog.concat_ws(' ', e.first_name, e.middle_name, e.last_name, e.suffix)),
    coalesce(nullif(s.position, ''), e.position, ''),
    coalesce(nullif(s.outlet, ''), e.outlet, ''),
    s.week, coalesce(s.time_in::text, ''), coalesce(s.time_out::text, ''), coalesce(s.break_time::text, ''),
    coalesce(s.monday, ''), coalesce(s.tuesday, ''), coalesce(s.wednesday, ''), coalesce(s.thursday, ''),
    coalesce(s.friday, ''), coalesce(s.saturday, ''), coalesce(s.sunday, ''), s.status
  from public.schedule s
  join public.employees e on e.employee_id = s.employee_id
  cross join me
  where s.status in ('Published', 'Confirmed')
    and coalesce(e.status, 'Active') not in ('Resigned', 'Terminated')
    and (
      s.employee_id = me.employee_id
      or exists (
        select 1 from public.schedule own_schedule
        where own_schedule.employee_id = me.employee_id
          and own_schedule.week = s.week
          and own_schedule.week not ilike '%Special Duty:%'
          and own_schedule.status in ('Published', 'Confirmed')
      )
    )
  order by s.week desc, coalesce(nullif(s.outlet, ''), e.outlet, ''), e.first_name, e.last_name;
end;
$$;
revoke all on function public.get_employee_schedule_overview() from public, anon;
grant execute on function public.get_employee_schedule_overview() to authenticated;

drop function if exists public.list_schedule_swap_requests();
create function public.list_schedule_swap_requests()
returns table (
  id uuid,
  request_id text,
  requester_employee_id text,
  recipient_employee_id text,
  requester_schedule_id text,
  recipient_schedule_id text,
  swap_day text,
  requester_day text,
  recipient_day text,
  week text,
  requester_outlet text,
  recipient_outlet text,
  requester_shift text,
  recipient_shift text,
  reason text,
  status text,
  recipient_accepted boolean,
  recipient_note text,
  hr_note text,
  created_at timestamptz,
  requester_name text,
  recipient_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.hris_has_role(array['employee','hr_admin']) then
    raise exception 'You are not allowed to view schedule swap requests' using errcode = '42501';
  end if;
  return query
  select r.id, r.request_id, r.requester_employee_id, r.recipient_employee_id,
    r.requester_schedule_id, r.recipient_schedule_id, r.swap_day,
    r.requester_day, r.recipient_day, r.week, r.requester_outlet, r.recipient_outlet,
    r.requester_shift, r.recipient_shift, r.reason, r.status, r.recipient_accepted,
    r.recipient_note, r.hr_note, r.created_at,
    pg_catalog.btrim(pg_catalog.concat_ws(' ', requester.first_name, requester.middle_name, requester.last_name, requester.suffix)),
    pg_catalog.btrim(pg_catalog.concat_ws(' ', recipient.first_name, recipient.middle_name, recipient.last_name, recipient.suffix))
  from public.schedule_swap_requests r
  join public.employees requester on requester.employee_id = r.requester_employee_id
  join public.employees recipient on recipient.employee_id = r.recipient_employee_id
  where public.hris_has_role(array['hr_admin'])
    or hris_private.is_own_employee(r.requester_employee_id)
    or hris_private.is_own_employee(r.recipient_employee_id)
  order by r.created_at desc;
end;
$$;
revoke all on function public.list_schedule_swap_requests() from public, anon;
grant execute on function public.list_schedule_swap_requests() to authenticated;

create or replace function hris_private.is_valid_schedule_swap_update(
  old_row public.schedule,
  new_row public.schedule
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  swap public.schedule_swap_requests%rowtype;
  request_id_setting text;
  old_shift text;
  new_shift text;
  day_column text;
begin
  if not public.hris_has_role(array['hr_admin']) then return false; end if;
  request_id_setting := nullif(current_setting('hris.schedule_swap_request_id', true), '');
  if request_id_setting is null or request_id_setting !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  select * into swap from public.schedule_swap_requests
  where id = request_id_setting::uuid and status = 'Pending HR'
    and recipient_accepted is true and hr_user_id = auth.uid();
  if not found then return false; end if;

  if old_row.schedule_id = swap.requester_schedule_id
     and old_row.employee_id = swap.requester_employee_id then
    day_column := swap.requester_day;
    old_shift := to_jsonb(old_row) ->> day_column;
    new_shift := to_jsonb(new_row) ->> day_column;
    return to_jsonb(new_row) - array[day_column] = to_jsonb(old_row) - array[day_column]
      and coalesce(old_shift, '') = swap.requester_shift
      and coalesce(new_shift, '') = swap.recipient_shift;
  end if;
  if old_row.schedule_id = swap.recipient_schedule_id
     and old_row.employee_id = swap.recipient_employee_id then
    day_column := swap.recipient_day;
    old_shift := to_jsonb(old_row) ->> day_column;
    new_shift := to_jsonb(new_row) ->> day_column;
    return to_jsonb(new_row) - array[day_column] = to_jsonb(old_row) - array[day_column]
      and coalesce(old_shift, '') = swap.recipient_shift
      and coalesce(new_shift, '') = swap.requester_shift;
  end if;
  return false;
end;
$$;
revoke all on function hris_private.is_valid_schedule_swap_update(public.schedule, public.schedule) from public, anon, authenticated;

create or replace function public.submit_schedule_day_swap_request(
  p_recipient_employee_id text,
  p_requester_schedule_id text,
  p_recipient_schedule_id text,
  p_requester_day text,
  p_recipient_day text,
  p_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_schedule public.schedule%rowtype;
  recipient_schedule public.schedule%rowtype;
  requester_shift text;
  recipient_shift text;
  requester_day_name text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_requester_day, '')));
  recipient_day_name text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_recipient_day, '')));
  requester_date date;
  recipient_date date;
  requester_is_rest_day boolean;
  recipient_is_rest_day boolean;
  new_request_id uuid;
begin
  if auth.uid() is null or not public.hris_has_role(array['employee']) then
    raise exception 'Only employees can request a schedule swap' using errcode = '42501';
  end if;
  if p_recipient_employee_id is null or p_requester_schedule_id is null or p_recipient_schedule_id is null then
    raise exception 'Choose your schedule and a coworker schedule';
  end if;
  if requester_day_name not in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
     or recipient_day_name not in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday') then
    raise exception 'Choose a working day for each employee';
  end if;
  if not hris_private.is_own_employee((select s.employee_id from public.schedule s where s.schedule_id = p_requester_schedule_id)) then
    raise exception 'You can only request a swap for your own schedule' using errcode = '42501';
  end if;

  perform 1 from public.schedule s
  where s.schedule_id in (p_requester_schedule_id, p_recipient_schedule_id)
  order by s.schedule_id for update;
  select * into requester_schedule from public.schedule where schedule_id = p_requester_schedule_id;
  select * into recipient_schedule from public.schedule where schedule_id = p_recipient_schedule_id;
  if requester_schedule.schedule_id is null or recipient_schedule.schedule_id is null then
    raise exception 'One of the selected schedules no longer exists';
  end if;
  if requester_schedule.employee_id is null or requester_schedule.employee_id = recipient_schedule.employee_id
     or recipient_schedule.employee_id is distinct from p_recipient_employee_id then
    raise exception 'The selected schedules do not belong to you and the selected coworker';
  end if;
  if requester_schedule.week is null or requester_schedule.week is distinct from recipient_schedule.week
     or requester_schedule.week ilike '%Special Duty:%' or recipient_schedule.week ilike '%Special Duty:%' then
    raise exception 'Both employees need regular schedules for the same week';
  end if;
  if requester_schedule.status not in ('Published','Confirmed') or recipient_schedule.status not in ('Published','Confirmed') then
    raise exception 'Only published or confirmed schedules can be swapped';
  end if;

  requester_shift := pg_catalog.btrim(coalesce(to_jsonb(requester_schedule) ->> requester_day_name, ''));
  recipient_shift := pg_catalog.btrim(coalesce(to_jsonb(recipient_schedule) ->> recipient_day_name, ''));
  requester_is_rest_day := requester_shift ~* '^(off|rd|rest day)$';
  recipient_is_rest_day := recipient_shift ~* '^(off|rd|rest day)$';
  if requester_shift = '' or requester_shift ~* '^(leave|flex|suspended)$' then
    raise exception 'Your selected day must contain a working shift or Rest Day';
  end if;
  if recipient_shift = '' or recipient_shift ~* '^(leave|flex|suspended)$' then
    raise exception 'The coworker selected day must contain a working shift or Rest Day';
  end if;
  if requester_is_rest_day and recipient_is_rest_day then
    raise exception 'At least one selected day must be a working shift. Swapping two Rest Days would not change either schedule.';
  end if;
  requester_date := hris_private.schedule_weekday_date(requester_schedule.week, requester_day_name);
  recipient_date := hris_private.schedule_weekday_date(recipient_schedule.week, recipient_day_name);
  if requester_date is null or recipient_date is null then
    raise exception 'The schedule week dates cannot be read. Ask HR to correct the schedule dates.';
  end if;

  if exists (
    select 1 from public.schedule_swap_requests r
    where r.status in ('Pending Coworker','Pending HR')
      and (r.requester_schedule_id in (p_requester_schedule_id, p_recipient_schedule_id)
        or r.recipient_schedule_id in (p_requester_schedule_id, p_recipient_schedule_id))
  ) then
    raise exception 'One of these schedules already has a pending swap request';
  end if;

  insert into public.schedule_swap_requests (
    requester_employee_id, recipient_employee_id, requester_schedule_id, recipient_schedule_id,
    swap_day, requester_day, recipient_day, week, requester_outlet, recipient_outlet,
    requester_shift, recipient_shift, reason
  ) values (
    requester_schedule.employee_id, recipient_schedule.employee_id, p_requester_schedule_id, p_recipient_schedule_id,
    requester_day_name, requester_day_name, recipient_day_name, requester_schedule.week,
    requester_schedule.outlet, recipient_schedule.outlet, requester_shift, recipient_shift,
    pg_catalog.btrim(coalesce(p_reason, ''))
  ) returning id into new_request_id;

  insert into public.notifications(recipient_employee_id, title, message, type)
  values (p_recipient_employee_id, 'Schedule swap request',
    'A coworker asked to exchange their ' || pg_catalog.initcap(requester_day_name) || ' shift with your ' || pg_catalog.initcap(recipient_day_name) || ' shift. Review it in Requests.', 'schedule_swap');
  insert into public.notifications(recipient_role, title, message, type)
  values ('hr', 'Schedule swap awaiting coworker', 'A schedule swap request is waiting for the receiving employee to respond.', 'schedule_swap');
  return new_request_id;
end;
$$;
revoke all on function public.submit_schedule_day_swap_request(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_schedule_day_swap_request(text,text,text,text,text,text) to authenticated;

-- Preserve the old RPC for any open/stale clients. Its legacy one-day request
-- maps that day to both sides of the new record.
create or replace function public.submit_schedule_swap_request(
  p_recipient_employee_id text,
  p_requester_schedule_id text,
  p_recipient_schedule_id text,
  p_swap_day text,
  p_reason text default ''
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.submit_schedule_day_swap_request(
    p_recipient_employee_id, p_requester_schedule_id, p_recipient_schedule_id,
    p_swap_day, p_swap_day, p_reason
  );
$$;
revoke all on function public.submit_schedule_swap_request(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_schedule_swap_request(text,text,text,text,text) to authenticated;

create or replace function public.review_schedule_swap_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  swap public.schedule_swap_requests%rowtype;
  requester_schedule public.schedule%rowtype;
  recipient_schedule public.schedule%rowtype;
  requester_shift text;
  recipient_shift text;
  requester_date date;
  recipient_date date;
  changed_rows integer;
begin
  if auth.uid() is null or not public.hris_has_role(array['hr_admin']) then
    raise exception 'Only HR can review an accepted schedule swap' using errcode = '42501';
  end if;
  select * into swap from public.schedule_swap_requests where id = p_request_id for update;
  if not found or swap.status <> 'Pending HR' or swap.recipient_accepted is distinct from true then
    raise exception 'This request has not been accepted by the receiving employee';
  end if;
  if not p_approve then
    update public.schedule_swap_requests
    set status = 'Rejected', hr_user_id = auth.uid(),
        hr_note = nullif(pg_catalog.btrim(coalesce(p_note, '')), ''),
        hr_reviewed_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = p_request_id;
    insert into public.notifications(recipient_employee_id, title, message, type)
    values (swap.requester_employee_id, 'Schedule swap rejected by HR', 'HR rejected the schedule swap request.', 'schedule_swap'),
      (swap.recipient_employee_id, 'Schedule swap rejected by HR', 'HR rejected the schedule swap request.', 'schedule_swap');
    return;
  end if;

  perform 1 from public.schedule s
  where s.schedule_id in (swap.requester_schedule_id, swap.recipient_schedule_id)
  order by s.schedule_id for update;
  select * into requester_schedule from public.schedule where schedule_id = swap.requester_schedule_id;
  select * into recipient_schedule from public.schedule where schedule_id = swap.recipient_schedule_id;
  if requester_schedule.employee_id is distinct from swap.requester_employee_id
     or recipient_schedule.employee_id is distinct from swap.recipient_employee_id
     or requester_schedule.week is distinct from swap.week or recipient_schedule.week is distinct from swap.week
     or requester_schedule.week ilike '%Special Duty:%' or recipient_schedule.week ilike '%Special Duty:%'
     or requester_schedule.status not in ('Published','Confirmed') or recipient_schedule.status not in ('Published','Confirmed') then
    raise exception 'The schedules changed since this request was submitted. Refresh and review it again.';
  end if;
  requester_shift := pg_catalog.btrim(coalesce(to_jsonb(requester_schedule) ->> swap.requester_day, ''));
  recipient_shift := pg_catalog.btrim(coalesce(to_jsonb(recipient_schedule) ->> swap.recipient_day, ''));
  if requester_shift is distinct from swap.requester_shift or recipient_shift is distinct from swap.recipient_shift then
    raise exception 'One of the selected shifts changed since this request was submitted. The swap was not applied.';
  end if;
  if requester_shift = '' or recipient_shift = ''
     or requester_shift ~* '^(leave|flex|suspended)$'
     or recipient_shift ~* '^(leave|flex|suspended)$'
     or (requester_shift ~* '^(off|rd|rest day)$' and recipient_shift ~* '^(off|rd|rest day)$') then
    raise exception 'The selected days are no longer eligible for an exchange. The swap was not applied.';
  end if;
  requester_date := hris_private.schedule_weekday_date(swap.week, swap.requester_day);
  recipient_date := hris_private.schedule_weekday_date(swap.week, swap.recipient_day);
  if requester_date is null or recipient_date is null then
    raise exception 'The schedule week dates cannot be read. The swap was not applied.';
  end if;
  if exists (
    select 1 from public.employee_requests r
    where r.employee_id = swap.requester_employee_id and r.request_type = 'Leave' and r.status = 'Approved'
      and r.start_date <= requester_date and r.end_date >= requester_date
  ) or exists (
    select 1 from public.employee_requests r
    where r.employee_id = swap.recipient_employee_id and r.request_type = 'Leave' and r.status = 'Approved'
      and r.start_date <= recipient_date and r.end_date >= recipient_date
  ) then
    raise exception 'One of the employees has approved leave on the selected date. The swap was not applied.';
  end if;
  if exists (
    select 1 from public.schedule other_schedule
    where other_schedule.employee_id = swap.requester_employee_id
      and other_schedule.schedule_id not in (swap.requester_schedule_id, swap.recipient_schedule_id)
      and other_schedule.status in ('Published','Confirmed')
      and hris_private.schedule_weekday_date(other_schedule.week, swap.requester_day) = requester_date
      and coalesce(pg_catalog.btrim(to_jsonb(other_schedule) ->> swap.requester_day), '') !~* '^(|off|rd|rest day|leave|flex|suspended)$'
  ) or exists (
    select 1 from public.schedule other_schedule
    where other_schedule.employee_id = swap.recipient_employee_id
      and other_schedule.schedule_id not in (swap.requester_schedule_id, swap.recipient_schedule_id)
      and other_schedule.status in ('Published','Confirmed')
      and hris_private.schedule_weekday_date(other_schedule.week, swap.recipient_day) = recipient_date
      and coalesce(pg_catalog.btrim(to_jsonb(other_schedule) ->> swap.recipient_day), '') !~* '^(|off|rd|rest day|leave|flex|suspended)$'
  ) then
    raise exception 'One of the employees has another scheduled duty on the selected date. The swap was not applied.';
  end if;

  update public.schedule_swap_requests
  set hr_user_id = auth.uid(), hr_note = nullif(pg_catalog.btrim(coalesce(p_note, '')), '')
  where id = p_request_id;
  perform pg_catalog.set_config('hris.schedule_swap_request_id', p_request_id::text, true);
  execute pg_catalog.format('update public.schedule set %I = $1 where schedule_id = $2', swap.requester_day)
    using swap.recipient_shift, swap.requester_schedule_id;
  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then raise exception 'The requester schedule could not be updated'; end if;
  execute pg_catalog.format('update public.schedule set %I = $1 where schedule_id = $2', swap.recipient_day)
    using swap.requester_shift, swap.recipient_schedule_id;
  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then raise exception 'The coworker schedule could not be updated'; end if;

  update public.schedule_swap_requests
  set status = 'Approved', hr_reviewed_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = p_request_id;
  insert into public.notifications(recipient_employee_id, title, message, type)
  values (swap.requester_employee_id, 'Schedule swap approved', 'HR approved the schedule swap. Your published schedule has been updated.', 'schedule_swap'),
    (swap.recipient_employee_id, 'Schedule swap approved', 'HR approved the schedule swap. Your published schedule has been updated.', 'schedule_swap');
end;
$$;
revoke all on function public.review_schedule_swap_request(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.review_schedule_swap_request(uuid,boolean,text) to authenticated;

notify pgrst, 'reload schema';
commit;
