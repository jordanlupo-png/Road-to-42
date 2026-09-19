alter table public.profiles add column earned_rewards text[] not null default '{}';
create function public.keep_runner_rewards(p_rewards text[]) returns void language sql security invoker set search_path='' as $$
 update public.profiles set earned_rewards=(
 select array_agg(distinct reward) from unnest(earned_rewards||p_rewards) as reward
 where reward in ('First run','5 km total','10 km total','25 km total','50 km total','100 km total','Weekly goal','Three runs','Ten runs','Long session','Quality session','Two-week rhythm','Four-week rhythm','Welcome back','42.2 km trained','Eight-week rhythm','10 active days','Training story')
 ) where id=(select auth.uid());
$$;
revoke all on function public.keep_runner_rewards(text[]) from public,anon;
grant execute on function public.keep_runner_rewards(text[]) to authenticated;
