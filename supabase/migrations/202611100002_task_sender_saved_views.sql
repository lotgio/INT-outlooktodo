alter table public.agenda_tasks
  add column if not exists sender_name text not null default '';

update public.agenda_tasks as task
set sender_name = email.sender
from public.emails as email
where task.source_key = email.source_key
  and task.sender_name = ''
  and coalesce(email.sender, '') <> '';

create table if not exists public.app_saved_views (
  owner_id text not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, name)
);

alter table public.app_saved_views enable row level security;
revoke all on table public.app_saved_views from anon, authenticated;
