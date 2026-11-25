begin;

alter table public.employees
  add column if not exists profile_details jsonb not null default '{}'::jsonb;

alter table public.employees
  drop constraint if exists employees_profile_details_object_check;

alter table public.employees
  add constraint employees_profile_details_object_check
  check (jsonb_typeof(profile_details) = 'object');

comment on column public.employees.profile_details is
  'Employee-maintained personal, education, experience, reference, and emergency contact profile details.';

commit;
