-- Stores uploaded payslip file metadata directly on payroll_items.
-- The app still keeps the values inside payslip_details for backward
-- compatibility with existing rows, but these columns make the upload
-- feature queryable and easier to validate.

alter table if exists public.payroll_items
  add column if not exists uploaded_file_path text,
  add column if not exists uploaded_file_name text,
  add column if not exists uploaded_file_mime_type text,
  add column if not exists uploaded_at timestamptz;

update public.payroll_items
set
  uploaded_file_path = coalesce(uploaded_file_path, payslip_details ->> 'uploadedPayslipPath'),
  uploaded_file_name = coalesce(uploaded_file_name, payslip_details ->> 'uploadedPayslipName')
where payslip_details is not null
  and (
    uploaded_file_path is null
    or uploaded_file_name is null
  );
