-- 0005_thread_slots.sql — slot-driven agent state.
-- Applied manually in Supabase SQL Editor by the user (same pattern as 0002-0004).
-- Additive-only: safe to re-run.

alter table chat_threads
  add column if not exists template text;

alter table chat_threads
  add column if not exists gathered_slots jsonb not null default '{}'::jsonb;

alter table chat_threads
  add column if not exists pending_slot text;

-- Optional constraint (commented for compat with existing rows):
-- alter table chat_threads add constraint chat_threads_template_check
--   check (template is null or template in ('contract','invoice'));
