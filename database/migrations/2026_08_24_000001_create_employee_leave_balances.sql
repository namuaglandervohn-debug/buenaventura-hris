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

insert into public.employee_leave_balances (employee_id, leave_type, available)
select employee.employee_id, defaults.leave_type, defaults.available
from public.employees employee
cross join (
  values
    ('Vacation Leave', 5),
    ('Sick Leave', 5),
    ('Emergency Leave', 3),
    ('Maternity Leave', 105),
    ('Paternity Leave', 7),
    ('Bereavement Leave', 3),
    ('Other', 0)
) as defaults(leave_type, available)
on conflict (employee_id, leave_type) do nothing;
