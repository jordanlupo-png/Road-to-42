begin;
do $$
declare u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); a bigint; r text; payload jsonb; lease_id uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,u||'@example.invalid','{}'),(v,v||'@example.invalid','{}');
 update public.profiles set character_key='lynx',setup_completed=true,weekly_km_target=25 where id=u;
 begin
  update public.profiles set character_key='fox' where id=u;
  raise exception 'FAILED: completed character changed';
 exception when check_violation then null; end;
 insert into public.health_connections(user_id,health_user_id,token_cipher,lease) values(u,u::text,'test-cipher',lease_id);
 payload:=jsonb_build_object('external_id',u||':one','activity_date','2026-09-14','distance_km',5,'duration_minutes',30,'pace_seconds_per_km',360);
 r:=public.health_ingest(u,payload,lease_id);
 if r<>'imported' then raise exception 'FAILED import';end if;
 perform public.health_ingest(u,payload,lease_id);
 if (select count(*) from public.activities where user_id=u)<>1 then raise exception 'FAILED idempotency';end if;
 perform public.health_ingest(u,jsonb_set(payload,'{distance_km}','6'),lease_id);
 if (select sum(distance_km) from public.activities where user_id=u)<>6 then raise exception 'FAILED update';end if;
 insert into public.activities(user_id,activity_date,activity_type,distance_km) values(u,'2026-09-15','Easy',7) returning id into a;
 payload:=jsonb_build_object('external_id',u||':two','activity_date','2026-09-15','distance_km',7,'duration_minutes',42,'pace_seconds_per_km',360);
 r:=public.health_ingest(u,payload,lease_id);
 if r<>'pending' or (select count(*) from public.activities where user_id=u)<>2 then raise exception 'FAILED duplicate quarantine';end if;
 begin
  perform public.health_ingest(v,payload,null,'link',a);
  raise exception 'FAILED cross user resolution';
 exception when raise_exception then if sqlerrm='FAILED cross user resolution' then raise; end if; end;
 perform public.health_ingest(u,payload,null,'link',a);
 if (select count(*) from public.activities where user_id=u)<>2 then raise exception 'FAILED manual link';end if;
 delete from public.activities where id=a;
 r:=public.health_ingest(u,payload,lease_id);
 if r<>'ignored' then raise exception 'FAILED deleted run reimport';end if;
 perform public.health_finish(u,array[]::text[],lease_id,1);
 if exists(select 1 from public.activities where user_id=u) then raise exception 'FAILED remote deletion';end if;
 insert into public.health_oauth_states values('test-'||u,u,'test',now()+interval '10 minutes');
 delete from auth.users where id=u;
 if exists(select 1 from public.health_connections where user_id=u) or exists(select 1 from public.health_runs where user_id=u) or exists(select 1 from public.health_oauth_states where user_id=u) or exists(select 1 from public.profiles where id=u) then raise exception 'FAILED account cascade';end if;
 if has_table_privilege('authenticated','public.health_connections','select') or has_function_privilege('authenticated','public.health_ingest(uuid,jsonb,uuid,text,bigint)','execute') then raise exception 'FAILED private access';end if;
end $$;
rollback;
