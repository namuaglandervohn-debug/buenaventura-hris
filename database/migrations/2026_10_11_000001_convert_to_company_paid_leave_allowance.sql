-- Replace per-leave-type balances with one shared annual company-paid allowance.
-- Legal leave entitlements should be tracked separately from this company allowance.

create table if not exists public.employee_leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references public.employees(employee_id) on delete cascade,
  leave_type text not null,
  available numeric(10, 3) not null default 0 check (available >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, leave_type)
);

create index if not exists employee_leave_balances_employee_id_idx
  on public.employee_leave_balances (employee_id);

delete from public.employee_leave_balances
where leave_type <> 'Company Paid Leave';

insert into public.employee_leave_balances (employee_id, leave_type, available)
select employee.employee_id, 'Company Paid Leave', 5
from public.employees employee
where employee.employee_id is not null
on conflict (employee_id, leave_type)
do update set
  available = 5,
  updated_at = now();
