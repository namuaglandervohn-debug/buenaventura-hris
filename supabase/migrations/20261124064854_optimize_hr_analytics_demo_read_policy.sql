-- This permission is independent of the row, so evaluate it once per query.
alter policy "Authorized staff read HR analytics demo data"
on public.hr_analytics_demo_records
using ((select public.hris_has_role(array['hr_admin', 'general_manager', 'accounting_finance', 'supervisor'])));
