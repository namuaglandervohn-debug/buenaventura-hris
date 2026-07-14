alter table public.applicants
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text,
  add column if not exists archive_reason text;

create index if not exists applicants_archive_status_created_at_idx
  on public.applicants (is_archived, status, created_at desc);
