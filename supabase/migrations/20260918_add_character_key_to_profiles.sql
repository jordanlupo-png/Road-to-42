alter table public.profiles
  add column if not exists character_key text;

update public.profiles
set character_key = 'wolf'
where character_key is null
   or character_key not in ('wolf','fox','bear','lynx','rabbit','raccoon','dog','cat');

alter table public.profiles
  alter column character_key set default 'wolf',
  alter column character_key set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_character_key_check'
  ) then
    alter table public.profiles
      add constraint profiles_character_key_check
      check (character_key in ('wolf','fox','bear','lynx','rabbit','raccoon','dog','cat'));
  end if;
end
$$;

