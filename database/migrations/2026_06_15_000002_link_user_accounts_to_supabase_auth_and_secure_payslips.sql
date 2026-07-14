-- Switch HRIS authorization to Supabase Auth-backed users.
-- user_accounts remains the app profile/role table, but passwords are no
-- longer read from it by the frontend login flow.

alter table if exists public.user_accounts
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

alter table if exists public.user_accounts
  alter column password drop not null;

create unique index if not exists user_accounts_auth_user_id_key
  on public.user_accounts (auth_user_id)
  where auth_user_id is not null;

update public.user_accounts account
set auth_user_id = auth_user.id
from auth.users auth_user
where account.auth_user_id is null
  and lower(account.email) = lower(auth_user.email);

drop policy if exists "Payslip admins can upload files" on storage.objects;
drop policy if exists "Payslip admins can update files" on storage.objects;
drop policy if exists "Payslip users can read scoped files" on storage.objects;

create policy "Payslip admins can upload files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payslips'
  and exists (
    select 1
    from public.user_accounts account
    where account.is_active is true
      and (
        account.auth_user_id = (select auth.uid())
        or lower(account.email) = lower((select auth.jwt() ->> 'email'))
      )
      and lower(account.role) in (
        'hr',
        'hr_admin',
        'admin',
        'accounting',
        'accounting_finance',
        'finance',
        'gm',
        'general_manager'
      )
  )
);

create policy "Payslip admins can update files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'payslips'
  and exists (
    select 1
    from public.user_accounts account
    where account.is_active is true
      and (
        account.auth_user_id = (select auth.uid())
        or lower(account.email) = lower((select auth.jwt() ->> 'email'))
      )
      and lower(account.role) in (
        'hr',
        'hr_admin',
        'admin',
        'accounting',
        'accounting_finance',
        'finance',
        'gm',
        'general_manager'
      )
  )
)
with check (
  bucket_id = 'payslips'
  and exists (
    select 1
    from public.user_accounts account
    where account.is_active is true
      and (
        account.auth_user_id = (select auth.uid())
        or lower(account.email) = lower((select auth.jwt() ->> 'email'))
      )
      and lower(account.role) in (
        'hr',
        'hr_admin',
        'admin',
        'accounting',
        'accounting_finance',
        'finance',
        'gm',
        'general_manager'
      )
  )
);

create policy "Payslip users can read scoped files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payslips'
  and exists (
    select 1
    from public.user_accounts account
    where account.is_active is true
      and (
        account.auth_user_id = (select auth.uid())
        or lower(account.email) = lower((select auth.jwt() ->> 'email'))
      )
      and (
        lower(account.role) in (
          'hr',
          'hr_admin',
          'admin',
          'accounting',
          'accounting_finance',
          'finance',
          'gm',
          'general_manager'
        )
        or (
          account.employee_id is not null
          and (storage.foldername(name))[1] = account.employee_id
        )
      )
  )
);

