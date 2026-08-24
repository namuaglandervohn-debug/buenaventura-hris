-- Keep one biometric/manual attendance row per employee per day.
-- Existing duplicate rows are cleaned first so the unique index can be applied safely.
with ranked_attendance_logs as (
  select
    ctid,
    row_number() over (
      partition by employee_id, attendance_date
      order by created_at desc nulls last, log_id desc
    ) as duplicate_rank
  from public.attendance_logs
  where employee_id is not null
    and attendance_date is not null
)
delete from public.attendance_logs logs
using ranked_attendance_logs ranked
where logs.ctid = ranked.ctid
  and ranked.duplicate_rank > 1;

create unique index if not exists attendance_logs_employee_date_key
  on public.attendance_logs (employee_id, attendance_date)
  where employee_id is not null
    and attendance_date is not null;
