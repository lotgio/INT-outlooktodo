alter table public.agenda_tasks
  add column if not exists assignee_names text[] not null default '{}'::text[];

update public.agenda_tasks
set assignee_names = ARRAY(
  select trim(names.value)
  from unnest(string_to_array(agenda_tasks.assignee_name, ',')) as names(value)
  where trim(names.value) <> ''
)
where cardinality(assignee_names) = 0
  and coalesce(assignee_name, '') <> '';
