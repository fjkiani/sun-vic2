-- Sunvic Documents Engine — projects entity.
-- A project groups a homeowner + property across the contracts and invoices
-- generated for them. Documents can belong to a project via project_id.
-- Runs on Supabase Postgres. Idempotent.

-- ────────────────────────────────────────────────────────────────
-- projects
-- ────────────────────────────────────────────────────────────────
create table if not exists projects (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,                    -- e.g. "36 Bushnell Road"
  homeowner_name     text,
  homeowner_email    text,
  homeowner_phone    text,
  property_address   text,
  status             text not null default 'active'
                     check (status in ('active','on_hold','completed','archived')),
  contract_total_cents bigint not null default 0,      -- denormalized snapshot of latest contract
  notes              text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists projects_created_by_updated_idx
  on projects (created_by, updated_at desc);
create index if not exists projects_status_idx
  on projects (status);

-- Bump updated_at on any UPDATE.
create or replace function projects_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists projects_updated_at_trg on projects;
create trigger projects_updated_at_trg
  before update on projects
  for each row execute function projects_set_updated_at();

-- ────────────────────────────────────────────────────────────────
-- documents.project_id (nullable — existing docs backfilled below)
-- ────────────────────────────────────────────────────────────────
alter table documents
  add column if not exists project_id uuid references projects(id) on delete set null;

create index if not exists documents_project_id_idx
  on documents (project_id);

-- ────────────────────────────────────────────────────────────────
-- Row-Level Security — owner-only, service role bypasses.
-- ────────────────────────────────────────────────────────────────
alter table projects enable row level security;

drop policy if exists "projects_owner_all" on projects;
create policy "projects_owner_all"
  on projects for all
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

drop policy if exists "projects_service_all" on projects;
create policy "projects_service_all"
  on projects for all
  to service_role
  using (true) with check (true);

-- ────────────────────────────────────────────────────────────────
-- Backfill: create one project per distinct (created_by, client_name)
-- and link all existing documents to it.
--
-- Strategy: for each user, group documents by client_name (fallback: title).
-- Documents whose client_name is null get a project named "Untitled #1", "…#2", etc.
-- ────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  proj_id uuid;
  proj_name text;
  addr text;
  email text;
  phone text;
  total bigint;
begin
  for r in
    select distinct created_by, coalesce(nullif(client_name, ''), '(unnamed project)') as key
    from documents
    where project_id is null and created_by is not null
  loop
    -- pick representative fields from the newest doc in this group
    select
      coalesce(client_name, title, 'Untitled project'),
      coalesce(
        (payload->'homeowner'->>'address'),
        (payload->'bill_to'->>'property_address')
      ),
      coalesce(client_email, (payload->'homeowner'->>'email'), (payload->'bill_to'->>'recipient_email')),
      coalesce((payload->'homeowner'->>'phone'), (payload->'bill_to'->>'recipient_phone')),
      total_cents
      into proj_name, addr, email, phone, total
    from documents
    where created_by = r.created_by
      and coalesce(nullif(client_name, ''), '(unnamed project)') = r.key
    order by updated_at desc
    limit 1;

    insert into projects (name, homeowner_name, homeowner_email, homeowner_phone, property_address, contract_total_cents, created_by)
    values (
      case when r.key = '(unnamed project)' then proj_name else r.key end,
      case when r.key = '(unnamed project)' then null else r.key end,
      email,
      phone,
      addr,
      coalesce(total, 0),
      r.created_by
    )
    returning id into proj_id;

    -- link all docs in this group
    update documents
      set project_id = proj_id
      where created_by = r.created_by
        and coalesce(nullif(client_name, ''), '(unnamed project)') = r.key
        and project_id is null;
  end loop;
end $$;
