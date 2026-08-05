-- Sunvic Documents Engine — email activity log.
-- Records every document email send (success or failure) so the Activity tab can show
-- an "emails sent" dashboard. Runs on Supabase Postgres. Idempotent.

create table if not exists email_log (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid references documents(id) on delete set null,
  project_id   uuid references projects(id) on delete set null,
  doc_number   text,                            -- denormalized for display
  template     text,                            -- 'contract' | 'invoice'
  recipient    text not null,
  subject      text,
  status       text not null default 'sent'
               check (status in ('sent','failed')),
  resend_id    text,                            -- Resend message id (null on failure)
  error        text,                            -- failure detail (null on success)
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists email_log_created_by_created_idx
  on email_log (created_by, created_at desc);
create index if not exists email_log_document_idx
  on email_log (document_id);

-- Row-level security: users see only their own email log rows.
alter table if exists email_log enable row level security;

drop policy if exists email_log_select_own on email_log;
create policy email_log_select_own on email_log
  for select using (auth.uid() = created_by);

drop policy if exists email_log_insert_own on email_log;
create policy email_log_insert_own on email_log
  for insert with check (auth.uid() = created_by);
