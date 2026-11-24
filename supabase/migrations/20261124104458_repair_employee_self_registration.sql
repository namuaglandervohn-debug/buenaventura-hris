alter table public.employee_account_requests
  add column if not exists submitted_full_name text,
  add column if not exists requested_outlet text;

create or replace function public.register_employee_account_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_employee_id text;
  requested_full_name text;
  requested_outlet text;
  normalized_email text;
  matched_employee public.employees;
  employee_name text;
begin
  if coalesce(new.raw_user_meta_data->>'registration_kind', '') <> 'employee' then
    return new;
  end if;

  requested_employee_id := nullif(btrim(new.raw_user_meta_data->>'employee_id'), '');
  requested_full_name := nullif(regexp_replace(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), '\s+', ' ', 'g'), '');
  requested_outlet := nullif(btrim(new.raw_user_meta_data->>'outlet'), '');
  normalized_email := lower(btrim(coalesce(new.email, '')));

  if requested_employee_id is null or requested_full_name is null
     or cardinality(regexp_split_to_array(requested_full_name, '\s+')) < 2
     or normalized_email = '' or requested_outlet is null then
    raise exception 'Enter your full name, employee ID, email address, and assigned outlet.';
  end if;
  if requested_outlet not in ('Maria Clara Restaurant', 'Maria Clara Resort', 'Buenaventura Café') then
    raise exception 'Select a valid assigned outlet.';
  end if;

  -- Lock the normalized ID so case-only or simultaneous duplicate claims cannot pass.
  perform pg_advisory_xact_lock(
    hashtext('employee-account-registration'),
    hashtext(upper(requested_employee_id))
  );

  select * into matched_employee
  from public.employees
  where upper(btrim(employee_id)) = upper(requested_employee_id)
  limit 1
  for share;

  if found then
    employee_name := concat_ws(' ', nullif(btrim(matched_employee.first_name), ''),
      nullif(btrim(matched_employee.middle_name), ''), nullif(btrim(matched_employee.last_name), ''),
      nullif(btrim(matched_employee.suffix), ''));
    requested_employee_id := matched_employee.employee_id;
  else
    employee_name := requested_full_name;
    if exists (
      select 1 from public.employees where lower(email) = normalized_email
    ) then
      raise exception 'This email is already assigned to an employee record. Contact HR.';
    end if;
  end if;
  if exists (select 1 from public.user_accounts where upper(btrim(employee_id)) = upper(requested_employee_id)) then
    raise exception 'This employee already has an HRIS account. Contact HR if you cannot sign in.';
  end if;

  if exists (select 1 from public.employee_account_requests
      where upper(btrim(employee_id)) = upper(requested_employee_id) and status = 'Pending') then
    raise exception 'An account request for this employee ID is already awaiting HR review.';
  end if;
  if exists (select 1 from public.user_accounts where lower(email) = normalized_email) then
    raise exception 'This email is already assigned to an HRIS account. Contact HR.';
  end if;
  if exists (select 1 from public.employee_account_requests
      where lower(email) = normalized_email and status = 'Pending') then
    raise exception 'A registration request using this email is already awaiting HR review.';
  end if;

  insert into public.employee_account_requests(
    auth_user_id, employee_id, email, full_name, submitted_full_name, requested_outlet
  ) values (
    new.id, requested_employee_id, normalized_email, employee_name, requested_full_name, requested_outlet
  );
  return new;
end;
$$;

create or replace function public.approve_employee_account_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.employee_account_requests;
  employee_row public.employees;
  auth_row auth.users;
  account_row public.user_accounts;
  generated_user_id text;
  name_parts text[];
  canonical_name text;
  created_new_employee boolean := false;
begin
  if not public.hris_has_role(array['hr_admin']) then
    raise exception 'Only HR/Admin can approve employee account requests.';
  end if;

  select * into request_row
  from public.employee_account_requests
  where id = p_request_id
  for update;
  if not found or request_row.status <> 'Pending' then
    raise exception 'This request is no longer pending.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('employee-account-registration'),
    hashtext(upper(btrim(request_row.employee_id)))
  );

  select * into auth_row from auth.users where id = request_row.auth_user_id;
  if not found then raise exception 'The registration login no longer exists.'; end if;
  if auth_row.email_confirmed_at is null then
    raise exception 'The employee must confirm the registration email before HR approval.';
  end if;
  if lower(coalesce(auth_row.email, '')) <> lower(request_row.email) then
    raise exception 'The registration email no longer matches the login.';
  end if;
  if exists (select 1 from public.user_accounts where lower(email) = lower(request_row.email)) then
    raise exception 'This email is already assigned to another HRIS account.';
  end if;

  select * into employee_row
  from public.employees
  where upper(btrim(employee_id)) = upper(btrim(request_row.employee_id))
  limit 1
  for update;

  if not found then
    if request_row.requested_outlet is null or request_row.requested_outlet not in
      ('Maria Clara Restaurant', 'Maria Clara Resort', 'Buenaventura Café') then
      raise exception 'This request has no assigned outlet. Create the employee record before approving it.';
    end if;
    -- HR-approved registrations become the official employee record, retaining the ID
    -- entered by the employee. Keep full name while populating the required name columns.
    name_parts := regexp_split_to_array(
      regexp_replace(btrim(coalesce(request_row.submitted_full_name, request_row.full_name)), '\s+', ' ', 'g'),
      '\s+'
    );
    if cardinality(name_parts) < 2 then
      raise exception 'The submitted full name must contain at least a first and last name.';
    end if;

    insert into public.employees(
      employee_id, first_name, middle_name, last_name, suffix, email, outlet, status
    ) values (
      btrim(request_row.employee_id), name_parts[1],
      case when cardinality(name_parts) > 2 then array_to_string(name_parts[2:cardinality(name_parts)-1], ' ') else null end,
      name_parts[cardinality(name_parts)], '', lower(request_row.email), request_row.requested_outlet, 'Active'
    ) returning * into employee_row;
    created_new_employee := true;
  end if;

  if exists (select 1 from public.user_accounts where employee_id = employee_row.employee_id) then
    raise exception 'This employee already has an HRIS account. No account was created.';
  end if;


  canonical_name := concat_ws(' ', nullif(btrim(employee_row.first_name), ''),
    nullif(btrim(employee_row.middle_name), ''), nullif(btrim(employee_row.last_name), ''),
    nullif(btrim(employee_row.suffix), ''));
  generated_user_id := 'USR-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  insert into public.user_accounts(
    user_id, auth_user_id, employee_id, full_name,
    email, password, role, outlet, is_active
  ) values (
    generated_user_id, auth_row.id, employee_row.employee_id, canonical_name,
    lower(request_row.email), null, 'employee', employee_row.outlet, true
  ) returning * into account_row;

  update public.employee_account_requests
  set status = 'Approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = request_row.id;

  return jsonb_build_object(
    'approved', true,
    'employee_created', created_new_employee,
    'employee_id', account_row.employee_id,
    'user_id', account_row.user_id
  );
end;
$$;

revoke all on function public.register_employee_account_request() from public, anon, authenticated;
revoke all on function public.approve_employee_account_request(uuid) from public, anon;
grant execute on function public.approve_employee_account_request(uuid) to authenticated;

notify pgrst, 'reload schema';
