alter table public.agenda_tasks
  add column if not exists description text not null default '';
