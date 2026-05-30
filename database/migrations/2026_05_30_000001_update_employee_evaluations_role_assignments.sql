-- Align performance evaluation assignments with the HR/Admin -> Supervisor role workflow.
-- HR/Admin submits an employee to the Supervisor role, so evaluator_user_id must be optional.

alter table if exists public.employee_evaluations
  alter column evaluator_user_id drop not null;

alter table if exists public.employee_evaluations
  drop constraint if exists employee_evaluations_evaluator_user_id_fkey;

comment on column public.employee_evaluations.evaluator_user_id is
  'Optional. Null means the evaluation is assigned by role through evaluator_role, such as supervisor.';

