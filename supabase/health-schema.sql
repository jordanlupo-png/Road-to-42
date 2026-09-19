-- Applied through Supabase MCP; all integration tables are server-only.
create table public.health_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 health_user_id text not null unique,
 token_cipher text not null,
 connected_at timestamptz not null default now(),
 last_sync_at timestamptz,
 last_error text,
 reconnect_required boolean not null default false,
 pending boolean not null default true,
 revision bigint not null default 1,
 lease uuid,
 lease_until timestamptz,
 retry_at timestamptz not null default now()
);
create table public.health_oauth_states (
 state_hash text primary key,
 user_id uuid not null unique references auth.users(id) on delete cascade,
 verifier text not null,
 expires_at timestamptz not null
);
create table public.health_runs (
 user_id uuid not null references auth.users(id) on delete cascade,
 external_id text not null,
 run jsonb not null,
 status text not null check(status in ('pending','imported','ignored','deleted')),
 activity_id bigint references public.activities(id) on delete set null,
 primary key(user_id, external_id)
);
create index health_runs_activity_idx on public.health_runs(activity_id);
create index health_connections_pending_idx on public.health_connections(retry_at) where pending;
alter table public.health_connections enable row level security;
alter table public.health_oauth_states enable row level security;
alter table public.health_runs enable row level security;
revoke all on public.health_connections, public.health_oauth_states, public.health_runs from public, anon, authenticated;
grant all on public.health_connections, public.health_oauth_states, public.health_runs to service_role;
do $$ declare c text; begin
 select conname into c from pg_constraint where conrelid='public.activities'::regclass and contype='c' and pg_get_constraintdef(oid) like '%source%';
 if c is not null then execute format('alter table public.activities drop constraint %I',c); end if;
end $$;
alter table public.activities add constraint activities_source_check check(source in ('manual','health_connect','strava','google_health'));

-- Service-only RPCs use invoker privileges. No client can call these.
create function public.health_enqueue(p_user uuid) returns void language sql security invoker set search_path='' as $$
 update public.health_connections set pending=true, revision=revision+1, retry_at=now() where user_id=p_user and not reconnect_required;
$$;
create function public.health_claim(p_user uuid default null)
returns setof public.health_connections language sql security invoker set search_path='' as $$
 update public.health_connections set lease=gen_random_uuid(),lease_until=now()+interval '5 minutes'
 where user_id in (select user_id from public.health_connections where pending and not reconnect_required
 and retry_at<=now() and (lease_until is null or lease_until<now()) and (p_user is null or user_id=p_user)
 order by retry_at limit 1 for update skip locked) returning *;
$$;
create function public.health_ingest(p_user uuid,p_run jsonb,p_lease uuid default null,p_resolution text default 'auto',p_manual bigint default null)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.health_runs; a bigint; ext text:=p_run->>'external_id'; dt date:=(p_run->>'activity_date')::date; km numeric:=(p_run->>'distance_km')::numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,42));
 if not exists(select 1 from public.health_connections where user_id=p_user and (p_lease is null or lease=p_lease)) then raise exception 'Connection changed'; end if;
 if ext is null or dt<'2026-09-14' or km<=0 or km>500 then raise exception 'Invalid run'; end if;
 select * into r from public.health_runs where user_id=p_user and external_id=ext for update;
 if p_resolution not in ('auto','separate','link','ignore') then raise exception 'Invalid resolution'; end if;
 if p_resolution<>'auto' and (r.status is distinct from 'pending') then raise exception 'Run already reviewed'; end if;
 if r.status='ignored' or (r.status='imported' and r.activity_id is null) then return 'ignored'; end if;
 if p_resolution='ignore' then
  update public.health_runs set status='ignored' where user_id=p_user and external_id=ext; return 'ignored';
 end if;
 if p_resolution='link' then
  select id into a from public.activities where id=p_manual and user_id=p_user and source='manual'
    and activity_date=dt and activity_type in ('Easy','Long','Quality','run')
    and abs(distance_km-km)<=greatest(0.2,km*0.05) for update;
  if a is null then raise exception 'Manual run no longer matches'; end if;
 elsif r.status='imported' then a:=r.activity_id;
 elsif p_resolution='auto' and exists(select 1 from public.activities where user_id=p_user and source='manual'
   and activity_date=dt and activity_type in ('Easy','Long','Quality','run') and abs(distance_km-km)<=greatest(0.2,km*0.05)) then
  insert into public.health_runs(user_id,external_id,run,status) values(p_user,ext,p_run,'pending')
  on conflict(user_id,external_id) do update set run=excluded.run,status='pending';
  return 'pending';
 end if;
 if a is null then
  insert into public.activities(user_id,activity_date,activity_type,distance_km,duration_minutes,pace_seconds_per_km,source,external_id,source_recorded_at)
  values(p_user,dt,'run',km,(p_run->>'duration_minutes')::numeric,(p_run->>'pace_seconds_per_km')::integer,'google_health',ext,(p_run->>'source_recorded_at')::timestamptz)
  returning id into a;
 else
  update public.activities set activity_date=dt,distance_km=km,duration_minutes=(p_run->>'duration_minutes')::numeric,
  pace_seconds_per_km=(p_run->>'pace_seconds_per_km')::integer,source='google_health',external_id=ext,
  source_recorded_at=(p_run->>'source_recorded_at')::timestamptz where id=a and user_id=p_user;
 end if;
 insert into public.health_runs(user_id,external_id,run,status,activity_id) values(p_user,ext,p_run,'imported',a)
 on conflict(user_id,external_id) do update set run=excluded.run,status='imported',activity_id=excluded.activity_id;
 return 'imported';
end;
$$;
create function public.health_finish(p_user uuid,p_seen text[],p_lease uuid,p_revision bigint) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,42));
 if not exists(select 1 from public.health_connections where user_id=p_user and lease=p_lease) then raise exception 'Connection changed'; end if;
 delete from public.activities where user_id=p_user and source='google_health' and id in
 (select activity_id from public.health_runs where user_id=p_user and status='imported' and split_part(external_id,':',1)=(select health_user_id from public.health_connections where user_id=p_user) and not(external_id=any(p_seen)));
 update public.health_runs set status='deleted',activity_id=null where user_id=p_user and status in ('imported','pending') and split_part(external_id,':',1)=(select health_user_id from public.health_connections where user_id=p_user) and not(external_id=any(p_seen));
 update public.health_connections set pending=revision<>p_revision,lease=null,lease_until=null,last_error=null,last_sync_at=now()
 where user_id=p_user and lease=p_lease;
end;
$$;
create function public.health_disconnect(p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,42));
 delete from public.health_oauth_states where user_id=p_user;
 delete from public.health_connections where user_id=p_user;
end;
$$;
create function public.health_active_session(p_user uuid,p_session uuid) returns boolean language sql security invoker set search_path='' as $$
 select exists(select 1 from auth.sessions where id=p_session and user_id=p_user);
$$;
revoke all on function public.health_enqueue(uuid),public.health_claim(uuid),public.health_ingest(uuid,jsonb,uuid,text,bigint),public.health_finish(uuid,text[],uuid,bigint),public.health_disconnect(uuid),public.health_active_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.health_enqueue(uuid),public.health_claim(uuid),public.health_ingest(uuid,jsonb,uuid,text,bigint),public.health_finish(uuid,text[],uuid,bigint),public.health_disconnect(uuid),public.health_active_session(uuid,uuid) to service_role;

-- Background retry queue. The scheduler secret never leaves Vault.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if not exists(select 1 from vault.secrets where name='road42_health_worker') then
 perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'road42_health_worker');
 end if;
end $$;
create function public.health_worker_authorized(p_token text) returns boolean language sql security invoker set search_path='' as $$
 select exists(select 1 from vault.decrypted_secrets where name='road42_health_worker' and extensions.digest(decrypted_secret,'sha256')=extensions.digest(p_token,'sha256'));
$$;
revoke all on function public.health_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.health_worker_authorized(text) to service_role;
select cron.schedule('road42-health-queue','* * * * *',$cron$
 select net.http_post(
  url:='https://negkvlgimrthgonyvdqf.supabase.co/functions/v1/google-health/worker',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='road42_health_worker')),
  body:='{}'::jsonb,timeout_milliseconds:=10000
 ) where exists(select 1 from public.health_connections where pending and not reconnect_required and retry_at<=now());
$cron$);

grant select(id,user_id) on auth.sessions to service_role;
