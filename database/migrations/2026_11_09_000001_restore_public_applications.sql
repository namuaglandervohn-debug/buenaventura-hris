-- Undo applicant registration/profile reuse only. Preserve applications, Auth users,
-- employee accounts, employee filters, leave types, and internal access controls.
begin;

drop trigger if exists register_applicant_profile on auth.users;
drop trigger if exists bind_applicant_identity on public.applicants;
drop function if exists public.register_applicant_profile();
drop function if exists public.bind_applicant_identity();
drop function if exists public.submit_profile_application(jsonb);
drop function if exists public.convert_applicant_account(text,text);

drop policy if exists "Applicants read own applications" on public.applicants;
drop policy if exists "Applicants submit own applications" on public.applicants;
drop policy if exists "Applicants read own reusable profile" on public.applicant_profiles;
drop policy if exists "Applicants update own reusable profile" on public.applicant_profiles;
revoke all on public.applicant_profiles from anon, authenticated;

-- Public forms use narrowly scoped functions, without opening private tables.
create or replace function public.submit_public_application(p_application jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare next_number bigint; tracking_id text; allowed jsonb;
begin
  if jsonb_typeof(p_application) is distinct from 'object'
    or nullif(trim(p_application->>'first_name'),'') is null
    or nullif(trim(p_application->>'last_name'),'') is null
    or coalesce(p_application->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'First name, last name and a valid email address are required.';
  end if;
  perform pg_advisory_xact_lock(778812);
  select coalesce(max(substring(applicant_id from '[0-9]+$')::bigint),0)+1 into next_number
  from public.applicants where applicant_id ~ ('^APP-'||to_char(now(),'YYYY')||'-[0-9]{4,9}$');
  tracking_id := 'APP-'||to_char(now(),'YYYY')||'-'||lpad(next_number::text,greatest(4,length(next_number::text)), '0');
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into allowed from jsonb_each(p_application)
  where key=any(array['name','first_name','middle_name','last_name','suffix','gender','civil_status','birthdate','birthplace','height','weight','phone_number','address','position_applied','education','experience','cover_letter','tin','sss','philhealth','pagibig','emergency_contact','resume_file_name','resume_file_data','supporting_documents','supporting_document_files']);
  insert into public.applicants select * from jsonb_populate_record(null::public.applicants,
    allowed || jsonb_build_object('id',gen_random_uuid(),'applicant_id',tracking_id,'auth_user_id',null,'email',lower(trim(p_application->>'email')),'status','Submitted','created_at',now(),'updated_at',now(),'is_archived',false,'has_resume',false,'has_birth_cert',false,'has_tor',false,'has_med_cert',false));
  return tracking_id;
end; $$;
revoke all on function public.submit_public_application(jsonb) from public;
grant execute on function public.submit_public_application(jsonb) to anon, authenticated;

create or replace function public.track_public_application(p_applicant_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select (select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(a))
    where key=any(array['applicant_id','first_name','middle_name','last_name','position_applied',
      'email','phone_number','status','created_at','interview_date','interview_time',
      'interview_location','interview_notes','scheduled_by','notes']))
    || jsonb_build_object('account_email', case when a.status='Hired' then
      (select u.email from public.employees e join public.user_accounts u on u.employee_id=e.employee_id
       where e.applicant_id=a.applicant_id and u.role='employee' and u.is_active=true limit 1)
      else null end)
  from public.applicants a
  where a.applicant_id=upper(trim(p_applicant_id))
    and upper(trim(p_applicant_id)) ~ '^APP-[0-9]{4}-[A-Z0-9]{4,16}$';
$$;
revoke all on function public.track_public_application(text) from public;
grant execute on function public.track_public_application(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
