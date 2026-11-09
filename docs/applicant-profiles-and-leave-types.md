# Public applications, employee filters and leave types

Apply `database/migrations/2026_11_01_000001_applicant_profiles_and_leave_types.sql`, then `2026_11_01_000002_restore_leave_balance_storage.sql` in Supabase before using this release. Both are transactional and can be rerun safely. The second migration fills missing company allowance rows without replacing existing balances. Back up the database using the normal project process before a release.

## Application rollback — November 9, 2026

Apply `database/migrations/2026_11_09_000001_restore_public_applications.sql` after the earlier migrations, together with this frontend/API release. Until it is applied, public submission and tracking will not work with the restored pages.

- Applicants fill out a fresh form at `/apply`, without registration or sign-in. Personal details are no longer saved or reused across applications; email is editable again.
- `/track` accepts the existing Applicant ID without login. `/applicant` and its navigation link have been removed.
- Hiring uses the existing employee-account creation flow instead of converting an applicant login. Previously created employee accounts remain valid.
- The migration removes registration/binding triggers and account-conversion functions. Existing applications, profile records and Auth users remain stored; profile access is disabled. It does not delete or reset accounts.
- Public submission and tracking use narrowly scoped database functions so public visitors do not need access to private application or internal-account tables. Tracking IDs continue sequentially on the server.
- Internal access controls, employee filters, leave types and leave balances are retained.

- Request Management's **Manage leave types** utility lets HR/Admin add, rename, describe, activate or deactivate leave types. Historical request labels remain unchanged. A database trigger prevents new requests using inactive types, including stale browser submissions. Leave type configuration does not change the existing company-paid leave allowance calculation.
- Employee Records separates search text, search-field selection and independent filters for every data column. Filters combine with AND. **Clear all** resets both search and filters.

Verification: `npx tsc --noEmit`, `node --test tests/*.test.mjs`, `npm run build`, `npm run build:laravel`.

Database integration checks are in `tests/profileAndLeaveDatabase.sql` (leave permissions) and `tests/publicApplicationsDatabase.sql` (public application rollback). Run each inside a transaction after the migrations and finish with `rollback;`; these scripts use synthetic fixtures and must not be committed to a live database. JavaScript tests exercise account/session behavior, anonymous submission and confirmation-email failure handling.
