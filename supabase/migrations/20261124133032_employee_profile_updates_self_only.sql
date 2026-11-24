begin;

-- Keep employee profiles readable to authorized staff while limiting direct
-- authenticated updates to the signed-in employee's own record.
drop policy if exists "Employees update own profile only" on public.employees;
create policy "Employees update own profile only" on public.employees
  as restrictive for update to authenticated
  using (hris_private.is_own_employee(employee_id))
  with check (hris_private.is_own_employee(employee_id));

commit;
