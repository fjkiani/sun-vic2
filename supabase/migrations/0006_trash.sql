-- Sunvic Documents Engine — Trash (soft-delete) support.
-- Adds a recoverable Trash for documents and projects. A row is "in trash" when
-- deleted_at is set; it is hidden from normal lists and can be restored (cleared) or
-- permanently deleted. Runs on Supabase Postgres. Idempotent.

-- ────────────────────────────────────────────────────────────────
-- documents.deleted_at
-- ────────────────────────────────────────────────────────────────
alter table if exists documents
  add column if not exists deleted_at timestamptz;

create index if not exists documents_created_by_deleted_idx
  on documents (created_by, deleted_at)
  where deleted_at is null;

-- ────────────────────────────────────────────────────────────────
-- projects.deleted_at
-- ────────────────────────────────────────────────────────────────
alter table if exists projects
  add column if not exists deleted_at timestamptz;

create index if not exists projects_created_by_deleted_idx
  on projects (created_by, deleted_at)
  where deleted_at is null;
