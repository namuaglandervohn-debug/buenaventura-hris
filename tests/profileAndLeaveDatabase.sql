-- Run after all migrations inside a transaction, then ROLLBACK.
-- Synthetic records only; does not send messages or change existing passwords.
select set_config('test.hr_auth', (select auth_user_id::text from public.user_accounts where role='hr_admin' and is_active=true and auth_user_id is not null limit 1),true);
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('c0010000-0000-4000-8000-000000000001','authenticated','authenticated','leave-fixture@example.invalid',now(),now());
insert into public.employees(employee_id,first_name,last_name,email,status)
values('EMP-TEST-LEAVE','Test','Employee','leave-fixture@example.invalid','Active');
insert into public.user_accounts(user_id,auth_user_id,employee_id,full_name,email,password,role,is_active)
values('USR-TEST-LEAVE','c0010000-0000-4000-8000-000000000001','EMP-TEST-LEAVE','Test Employee','leave-fixture@example.invalid',null,'employee',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.hr_auth'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  insert into public.leave_types(name) values('__Wellness fixture__');
end; $$;
select set_config('request.jwt.claims','{"sub":"c0010000-0000-4000-8000-000000000001","role":"authenticated","email":"leave-fixture@example.invalid"}',true);
do $$ begin
  insert into public.employee_requests(employee_id,request_type,leave_type,start_date,end_date,reason)
  values('EMP-TEST-LEAVE','Leave','__Wellness fixture__',current_date,current_date,'Database fixture');
  begin
    insert into public.leave_types(name) values('__EMPLOYEE_UNAUTHORIZED_TEST__');
    raise exception 'Employee was allowed to manage leave types';
  exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.hr_auth'),'role','authenticated')::text,true);
update public.leave_types set is_active=false where name='__Wellness fixture__';
-- Existing requests still support normal review after a type is deactivated.
update public.employee_requests set status='Approved' where employee_id='EMP-TEST-LEAVE';
select set_config('request.jwt.claims','{"sub":"c0010000-0000-4000-8000-000000000001","role":"authenticated","email":"leave-fixture@example.invalid"}',true);
do $$ begin
  begin
    insert into public.employee_requests(employee_id,request_type,leave_type,start_date,end_date,reason)
    values('EMP-TEST-LEAVE','Leave','__Wellness fixture__',current_date,current_date,'Must fail');
    raise exception 'A deactivated leave type was accepted';
  exception when raise_exception then
    if sqlerrm not like 'This leave type is no longer available%' then raise; end if;
  end;
end; $$;
reset role;
select 'PASS: leave permissions and deactivation' as verification;
