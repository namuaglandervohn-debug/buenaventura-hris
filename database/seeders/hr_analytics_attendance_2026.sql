-- Additional synthetic shifts for HR Analytics in 2026. Repeatable without
-- changing employee records, attendance logs, or previously seeded demo data.
with months as (
  select month_start::date as month_start
  from generate_series(date '2026-01-01', date '2026-12-01', interval '1 month') as m(month_start)
), outlets(outlet_key, outlet, base_shifts) as (
  values
    ('restaurant', 'Maria Clara Restaurant', 58),
    ('resort', 'Maria Clara Resort', 70),
    ('cafe', 'Buenaventura Café', 42)
), monthly_samples as (
  select month_start, outlet, outlet_key,
         extract(day from (month_start + interval '1 month - 1 day'))::integer as days_in_month,
         base_shifts + mod(abs(hashtext(outlet_key || month_start::text || ':volume')::bigint), 55)::integer as shift_count,
         7 + mod(abs(hashtext(outlet_key || month_start::text || ':late')::bigint), 11)::integer as late_percent,
         2 + mod(abs(hashtext(outlet_key || month_start::text || ':absent')::bigint), 4)::integer as absent_percent
  from months cross join outlets
), ranked_shifts as (
  select m.*, sample.shift_number,
         row_number() over (
           partition by m.month_start, m.outlet_key
           order by md5(m.outlet_key || m.month_start::text || ':' || sample.shift_number), sample.shift_number
         ) as shift_rank
  from monthly_samples m
  cross join lateral generate_series(1, m.shift_count) as sample(shift_number)
), attendance as (
  select 'hr-analytics-demo-2026-supplement:attendance:' || to_char(month_start, 'YYYYMM') || ':' || outlet_key || ':' || shift_number as seed_key,
         outlet, month_start + mod(shift_number - 1, days_in_month) as record_date,
         case when shift_rank <= greatest(1, shift_count * absent_percent / 100) then 'Absent'
              when shift_rank <= greatest(1, shift_count * absent_percent / 100) + shift_count * late_percent / 100 then 'Late'
              else 'Present' end as status
  from ranked_shifts
)
insert into public.hr_analytics_demo_records
  (seed_key, record_type, outlet, record_date, status, is_late, is_absent, late_minutes)
select seed_key, 'attendance', outlet, record_date, status, status = 'Late', status = 'Absent',
       case when status = 'Late' then 3 + mod(abs(hashtext(seed_key || ':minutes')::bigint), 28)::integer else 0 end
from attendance
on conflict (seed_key) do nothing;
