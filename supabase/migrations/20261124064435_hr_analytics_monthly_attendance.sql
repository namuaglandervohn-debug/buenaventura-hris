create or replace function public.hris_analytics_monthly_attendance(report_year integer, report_outlet text default null)
returns table (month_number integer, present bigint, late bigint, absent bigint, includes_demo boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with report as (
    select pg_catalog.make_date(report_year, 1, 1) as year_start,
           pg_catalog.make_date(report_year + 1, 1, 1) as year_end,
           nullif(pg_catalog.lower(pg_catalog.btrim(report_outlet)), '') as outlet_filter
    where report_year between 1990 and 9998
      and (select public.hris_has_role(array['hr_admin', 'general_manager', 'accounting_finance', 'supervisor']))
  ), account_outlets as (
    select distinct on (a.employee_id) a.employee_id, a.outlet
    from public.user_accounts a
    cross join report r
    where r.outlet_filter is not null and a.employee_id is not null and a.outlet <> ''
    order by a.employee_id, a.user_id desc
  ), attendance as (
    select l.attendance_date as record_date,
           coalesce(l.is_absent, false) as is_absent,
           coalesce(l.is_late, false) or coalesce(l.late_minutes, 0) > 0 as is_late,
           false as is_demo
    from report r
    join public.attendance_logs l on l.attendance_date >= r.year_start and l.attendance_date < r.year_end
    left join public.employees e on r.outlet_filter is not null and e.employee_id = l.employee_id
    left join account_outlets a on a.employee_id = l.employee_id
    where r.outlet_filter is null
      or lower(coalesce(nullif(btrim(coalesce(a.outlet, e.outlet)), ''), 'Unassigned')) = r.outlet_filter
    union all
    select d.record_date, d.is_absent, d.is_late or d.late_minutes > 0, true
    from report r
    join public.hr_analytics_demo_records d on d.record_date >= r.year_start and d.record_date < r.year_end
    where d.record_type = 'attendance'
      and (r.outlet_filter is null or lower(btrim(d.outlet)) = r.outlet_filter)
  ), totals as (
    select extract(month from record_date)::integer as month_number,
           count(*) filter (where not is_absent and not is_late) as present,
           count(*) filter (where not is_absent and is_late) as late,
           count(*) filter (where is_absent) as absent,
           bool_or(is_demo) as includes_demo
    from attendance
    group by 1
  )
  select months.month_number, coalesce(t.present, 0), coalesce(t.late, 0),
         coalesce(t.absent, 0), coalesce(t.includes_demo, false)
  from report
  cross join pg_catalog.generate_series(1, 12) as months(month_number)
  left join totals t using (month_number)
  order by months.month_number
$$;

revoke execute on function public.hris_analytics_monthly_attendance(integer, text) from public, anon;
grant execute on function public.hris_analytics_monthly_attendance(integer, text) to authenticated;
