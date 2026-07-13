-- User-scoped API keys. Ciphertext is AES-256-GCM encrypted Node-side.
-- Master key derived from SESSION_JWT_SECRET.
create table if not exists public.user_api_keys (
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider        text not null check (provider in ('openrouter','cohere','gemma','resend')),
  ciphertext      text not null,
  key_fingerprint text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.user_api_keys enable row level security;

drop policy if exists "user_api_keys_owner_select" on public.user_api_keys;
create policy "user_api_keys_owner_select"
  on public.user_api_keys for select
  using (auth.uid() = user_id);

drop policy if exists "user_api_keys_owner_insert" on public.user_api_keys;
create policy "user_api_keys_owner_insert"
  on public.user_api_keys for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_api_keys_owner_update" on public.user_api_keys;
create policy "user_api_keys_owner_update"
  on public.user_api_keys for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_api_keys_owner_delete" on public.user_api_keys;
create policy "user_api_keys_owner_delete"
  on public.user_api_keys for delete
  using (auth.uid() = user_id);

create or replace function public.touch_updated_at_v2()
returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_user_api_keys_touch on public.user_api_keys;
create trigger trg_user_api_keys_touch
  before update on public.user_api_keys
  for each row execute function public.touch_updated_at_v2();
