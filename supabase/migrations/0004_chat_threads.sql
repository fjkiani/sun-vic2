-- 0004_chat_threads.sql
-- Adds durable chat threads + messages so the agent can hold state across turns
-- and across page reloads. Also adds `summary` + `thread_id` on documents so
-- prior work can be injected into new threads as cheap summaries.

-- ────────────────────────────────────────────────────────────
-- chat_threads
-- ────────────────────────────────────────────────────────────
create table if not exists chat_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references projects(id) on delete set null,
  title       text not null default 'New chat',
  -- gathering | drafting | editing | sending | done
  stage       text not null default 'gathering'
              check (stage in ('gathering','drafting','editing','sending','done')),
  clarify_count int not null default 0,
  last_message_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists chat_threads_user_updated_idx
  on chat_threads (user_id, updated_at desc);
create index if not exists chat_threads_project_idx
  on chat_threads (project_id) where project_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'set_updated_at_timestamp'
  ) then
    create function set_updated_at_timestamp() returns trigger
      language plpgsql as $trig$
      begin
        new.updated_at = now();
        return new;
      end
    $trig$;
  end if;
end $$;

drop trigger if exists chat_threads_set_updated on chat_threads;
create trigger chat_threads_set_updated
  before update on chat_threads
  for each row execute function set_updated_at_timestamp();

-- ────────────────────────────────────────────────────────────
-- chat_messages
-- ────────────────────────────────────────────────────────────
create table if not exists chat_messages (
  id             uuid primary key default gen_random_uuid(),
  thread_id      uuid not null references chat_threads(id) on delete cascade,
  role           text not null check (role in ('user','assistant','tool','system')),
  content        text not null default '',
  tool_calls     jsonb,
  tool_call_id   text,
  meta           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists chat_messages_thread_idx
  on chat_messages (thread_id, created_at);

-- ────────────────────────────────────────────────────────────
-- documents: link back to thread + memory summary
-- ────────────────────────────────────────────────────────────
alter table documents
  add column if not exists thread_id uuid references chat_threads(id) on delete set null;

alter table documents
  add column if not exists summary text;

create index if not exists documents_thread_idx
  on documents (thread_id) where thread_id is not null;

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
alter table chat_threads enable row level security;
alter table chat_messages enable row level security;

drop policy if exists chat_threads_owner on chat_threads;
create policy chat_threads_owner on chat_threads
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists chat_threads_service_role on chat_threads;
create policy chat_threads_service_role on chat_threads
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists chat_messages_owner on chat_messages;
create policy chat_messages_owner on chat_messages
  for all
  using (
    exists (
      select 1 from chat_threads t
      where t.id = chat_messages.thread_id
        and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from chat_threads t
      where t.id = chat_messages.thread_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists chat_messages_service_role on chat_messages;
create policy chat_messages_service_role on chat_messages
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
