-- Sunvic Documents Engine — initial schema.
-- Runs on Supabase Postgres. Idempotent where possible.

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────
-- documents
-- ────────────────────────────────────────────────────────────────
create table if not exists documents (
  id                uuid primary key default gen_random_uuid(),
  doc_number        text unique not null,
  template          text not null check (template in ('contract','invoice')),
  status            text not null default 'draft'
                    check (status in ('draft','sent','signed','paid','overdue','void')),
  title             text,
  client_name       text,
  client_email      text,
  project_ref       text,
  total_cents       bigint not null default 0,
  payload           jsonb not null,
  locks             jsonb not null default '{}'::jsonb,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  pdf_object_key    text,
  pdf_generated_at  timestamptz
);
create index if not exists documents_template_status_updated_idx
  on documents (template, status, updated_at desc);
create index if not exists documents_created_by_idx
  on documents (created_by);

-- Auto-bump updated_at on any UPDATE.
create or replace function documents_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists documents_updated_at_trg on documents;
create trigger documents_updated_at_trg
  before update on documents
  for each row execute function documents_set_updated_at();

-- ────────────────────────────────────────────────────────────────
-- document_revisions (append-only history)
-- ────────────────────────────────────────────────────────────────
create table if not exists document_revisions (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id) on delete cascade,
  payload       jsonb not null,
  locks         jsonb not null,
  changed_by    uuid references auth.users(id) on delete set null,
  change_source text not null check (change_source in ('user_edit','agent_oneshot','agent_tool','system')),
  created_at    timestamptz not null default now()
);
create index if not exists document_revisions_doc_created_idx
  on document_revisions (document_id, created_at desc);

-- ────────────────────────────────────────────────────────────────
-- agent_messages (one thread per document)
-- ────────────────────────────────────────────────────────────────
create table if not exists agent_messages (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id) on delete cascade,
  role          text not null check (role in ('user','assistant','tool')),
  content       text not null default '',
  tool_name     text,
  tool_args     jsonb,
  tool_result   jsonb,
  provider      text,
  model         text,
  created_at    timestamptz not null default now()
);
create index if not exists agent_messages_doc_created_idx
  on agent_messages (document_id, created_at);

-- ────────────────────────────────────────────────────────────────
-- Doc-number sequences (per template per year)
-- ────────────────────────────────────────────────────────────────
create table if not exists doc_number_counters (
  template text not null,
  year     int  not null,
  counter  int  not null default 0,
  primary key (template, year)
);

create or replace function next_doc_number(p_template text)
returns text language plpgsql as $$
declare
  y  int := extract(year from now())::int;
  n  int;
  prefix text := case p_template when 'contract' then 'CTR' when 'invoice' then 'INV' else 'DOC' end;
begin
  insert into doc_number_counters(template, year, counter)
    values (p_template, y, 1)
    on conflict (template, year) do update
      set counter = doc_number_counters.counter + 1
    returning counter into n;
  return prefix || '-' || y::text || '-' || lpad(n::text, 4, '0');
end $$;

-- ────────────────────────────────────────────────────────────────
-- Row-Level Security
-- ────────────────────────────────────────────────────────────────
alter table documents          enable row level security;
alter table document_revisions enable row level security;
alter table agent_messages     enable row level security;

-- documents: owner-only.
drop policy if exists "documents_owner_all" on documents;
create policy "documents_owner_all"
  on documents for all
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- Public read via service role only; anon has no policy.
drop policy if exists "documents_service_all" on documents;
create policy "documents_service_all"
  on documents for all
  to service_role
  using (true) with check (true);

-- revisions: readable by the document owner; writes go through service role.
drop policy if exists "revisions_owner_read" on document_revisions;
create policy "revisions_owner_read"
  on document_revisions for select
  using (
    exists (select 1 from documents d
            where d.id = document_revisions.document_id and d.created_by = auth.uid())
  );

drop policy if exists "revisions_service_all" on document_revisions;
create policy "revisions_service_all"
  on document_revisions for all
  to service_role
  using (true) with check (true);

-- agent_messages: same pattern.
drop policy if exists "messages_owner_read" on agent_messages;
create policy "messages_owner_read"
  on agent_messages for select
  using (
    exists (select 1 from documents d
            where d.id = agent_messages.document_id and d.created_by = auth.uid())
  );

drop policy if exists "messages_service_all" on agent_messages;
create policy "messages_service_all"
  on agent_messages for all
  to service_role
  using (true) with check (true);

-- ────────────────────────────────────────────────────────────────
-- Storage bucket for signed PDFs (created via SQL where possible;
-- if your project blocks storage.buckets DDL, run this via Supabase UI).
-- ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Only the service role can read/write the bucket (client uses signed URLs from the server).
drop policy if exists "documents_bucket_service" on storage.objects;
create policy "documents_bucket_service"
  on storage.objects for all
  to service_role
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');
