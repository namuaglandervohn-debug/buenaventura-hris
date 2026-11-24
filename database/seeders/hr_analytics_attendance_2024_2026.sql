begin;

-- Replace the attendance samples for these years in the analytics demo table.
-- The same seed produces stable results and never uses actual employee IDs.
create temporary table attendance_demo_seed on commit drop as
with outlets(outlet_key, outlet, usual_volume) as (
  values
    ('cafe', 'Buenaventura Café', 17),
    ('restaurant', 'Maria Clara Restaurant', 32),
    ('resort', 'Maria Clara Resort', 42)
), outlet_months as (
  select o.*, y.year_number, m.month_number, make_date(y.year_number, m.month_number, 1) as month_start
  from outlets o
  cross join generate_series(2024, 2026) as y(year_number)
  cross join generate_series(1, 12) as m(month_number)
), monthly_profiles as (
  select m.*, outlet_key || ':' || to_char(month_start, 'YYYYMM') as month_key,
         usual_volume + 8 * (year_number - 2024)
           + case
               when outlet_key = 'resort' and month_number in (4, 5) then 12
               when outlet_key <> 'resort' and month_number in (11, 12) then 10
               when month_number = 2 then -8
               else 0
             end as expected_volume
  from outlet_months m
), volumes as (
  -- Ranking the seasonal volumes gives each outlet/month/year a distinct
  -- number of shifts while keeping the overall demo dataset compact.
  select p.*, 24 + (row_number() over (
           order by expected_volume + mod(abs(hashtext(month_key || ':volume')::bigint), 40), month_key
         ))::integer as shift_count
  from monthly_profiles p
), monthly_counts as (
  select v.*,
         greatest(1, shift_count * (2 + mod(abs(hashtext(month_key || ':absent')::bigint), 5)::integer) / 100) as absent_count,
         greatest(2, shift_count * (8 + mod(abs(hashtext(month_key || ':late')::bigint), 13)::integer) / 100) as late_count,
         extract(day from (month_start + interval '1 month - 1 day'))::integer as days_in_month
  from volumes v
), ranked_shifts as (
  select m.*, s.shift_number,
         row_number() over (
           partition by m.month_key
           order by md5(m.month_key || ':shift:' || s.shift_number), s.shift_number
         ) as shift_rank
  from monthly_counts m
  cross join lateral generate_series(1, m.shift_count) as s(shift_number)
), attendance as (
  select 'hr-analytics-demo-2024-2026:attendance:' || month_key || ':' || shift_number as seed_key,
         outlet, month_start + mod(shift_number - 1, days_in_month) as record_date,
         case when shift_rank <= absent_count then 'Absent'
              when shift_rank <= absent_count + late_count then 'Late'
              else 'Present' end as status
  from ranked_shifts
)
select seed_key, outlet, record_date, status, status = 'Late' as is_late, status = 'Absent' as is_absent,
       case when status = 'Late' then 3 + mod(abs(hashtext(seed_key || ':minutes')::bigint), 28)::integer else 0 end as late_minutes
from attendance;

do $check$
begin
  if not (
    select count(*) = 108
      and count(distinct shifts) = 108
      and bool_and(on_time > late and late > absent and absent > 0)
    from (
      select count(*) as shifts,
             count(*) filter (where status = 'Present') as on_time,
             count(*) filter (where status = 'Late') as late,
             count(*) filter (where status = 'Absent') as absent
      from attendance_demo_seed
      group by outlet, date_trunc('month', record_date)
    ) groups
  ) then
    raise exception 'Demo attendance must cover 108 distinct outlet-month groups with valid status counts';
  end if;
end
$check$;

delete from public.hr_analytics_demo_records
where record_type = 'attendance'
  and record_date >= date '2024-01-01' and record_date < date '2027-01-01';

insert into public.hr_analytics_demo_records
  (seed_key, record_type, outlet, record_date, status, is_late, is_absent, late_minutes)
select seed_key, 'attendance', outlet, record_date, status, is_late, is_absent, late_minutes
from attendance_demo_seed;

commit;
