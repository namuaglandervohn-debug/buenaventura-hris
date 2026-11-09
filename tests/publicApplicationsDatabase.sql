-- Run after all migrations inside BEGIN; finish with ROLLBACK.
-- Use a test database: synthetic applications only, no emails or Auth mutations.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare first_id text; second_id text; tracked jsonb; begin
  first_id := public.submit_public_application('{"first_name":"Rollback","last_name":"Fixture","name":"Rollback Fixture","email":"rollback-fixture@example.invalid","position_applied":"Service Crew","status":"Hired","auth_user_id":"c0010000-0000-4000-8000-000000000001"}');
  second_id := public.submit_public_application('{"first_name":"Another","last_name":"Fixture","name":"Another Fixture","email":"another-fixture@example.invalid","position_applied":"Cashier"}');
  if substring(second_id from '[0-9]+$')::bigint <> substring(first_id from '[0-9]+$')::bigint+1 then
    raise exception 'Tracking IDs are not sequential';
  end if;
  tracked := public.track_public_application(first_id);
  if tracked->>'status' <> 'Submitted' or tracked->>'first_name' <> 'Rollback' then
    raise exception 'Public submission or tracking failed';
  end if;
  if tracked ? 'auth_user_id' or tracked ? 'resume_file_data' or tracked ? 'cover_letter' then
    raise exception 'Tracking exposed private application fields';
  end if;
  if public.track_public_application('') is not null or public.track_public_application('%') is not null then
    raise exception 'Tracking accepts an empty or wildcard lookup';
  end if;
  perform set_config('test.public_applicant_id',first_id,true);
end; $$;
reset role;
do $$ begin
  if exists(select 1 from public.applicants where applicant_id=current_setting('test.public_applicant_id') and auth_user_id is not null) then
    raise exception 'Guest application was bound to an account';
  end if;
  if exists(select 1 from pg_trigger where tgname in ('register_applicant_profile','bind_applicant_identity') and not tgisinternal) then
    raise exception 'Applicant account triggers remain enabled';
  end if;
  if to_regprocedure('public.convert_applicant_account(text,text)') is not null then
    raise exception 'Account conversion remains enabled';
  end if;
end; $$;
select 'PASS: anonymous submission, sequential IDs, scoped tracking and disabled applicant accounts' as verification;
