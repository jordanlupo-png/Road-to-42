alter table public.profiles
  add column if not exists setup_completed boolean;

update public.profiles
set setup_completed = true
where setup_completed is null;

alter table public.profiles
  alter column setup_completed set default false,
  alter column setup_completed set not null;
