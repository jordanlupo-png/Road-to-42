create or replace function public.health_finish(p_user uuid,p_seen text[],p_lease uuid,p_revision bigint) returns void
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
