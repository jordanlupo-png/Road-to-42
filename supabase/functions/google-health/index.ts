import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { IMPORT_START, normalizeRun } from "./normalize.mjs";

const APP = "https://jordanlupo-png.github.io/Road-to-42/";
const ORIGIN = new URL(APP).origin;
const ROOT = Deno.env.get("SUPABASE_URL")!;
const CALLBACK = ROOT + "/functions/v1/google-health-callback";
const SCOPE = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly";
const clientId = () => Deno.env.get("GOOGLE_HEALTH_CLIENT_ID") || "";
const clientSecret = () => Deno.env.get("GOOGLE_HEALTH_CLIENT_SECRET") || "";
const configured = () => !!(clientId() && clientSecret());
const db = createClient(ROOT, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status, headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const enc = new TextEncoder();
const b64 = (v: Uint8Array) => btoa(String.fromCharCode(...v));
const un64 = (s: string) => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
const url64 = (v: Uint8Array) => b64(v).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const random = () => url64(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (s:string) => url64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
function checked<T>(result: {data:T; error:unknown}):T { if(result.error) throw new Error("storage_failed"); return result.data; }
async function cipherKey() {
  if (!clientSecret()) throw new Error("not_configured");
  const material = await crypto.subtle.digest("SHA-256", enc.encode("road42:health:tokens:v1:"+clientSecret()));
  return crypto.subtle.importKey("raw",material,"AES-GCM",false,["encrypt","decrypt"]);
}
async function seal(token:unknown,userId:string) {
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode(userId)},await cipherKey(),enc.encode(JSON.stringify(token)));
 return b64(iv)+"."+b64(new Uint8Array(data));
}
async function unseal(cipher:string,userId:string) {
 const [iv,data]=cipher.split(".");
 return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:un64(iv),additionalData:enc.encode(userId)},await cipherKey(),un64(data))));
}
async function google(path:string,access:string) {
 const r=await fetch("https://health.googleapis.com/v4/"+path,{headers:{Authorization:"Bearer "+access},signal:AbortSignal.timeout(15000)});
 if(!r.ok) throw new Error(r.status===401||r.status===403?"reconnect_required":r.status===429?"rate_limited":"provider_unavailable");
 return r.json();
}
async function tokenRequest(fields:Record<string,string>) {
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({...fields,client_id:clientId(),client_secret:clientSecret()}),signal:AbortSignal.timeout(15000)});
 const data=await r.json();
 if(!r.ok) throw new Error(data.error==="invalid_grant"?"reconnect_required":"provider_unavailable");
 if(!data.access_token) throw new Error("provider_unavailable");
 return {...data,expires_at:Date.now()+Number(data.expires_in||3600)*1000};
}
async function accessToken(connection:any) {
 let token=await unseal(connection.token_cipher,connection.user_id);
 if(token.expires_at<Date.now()+60000) {
  const refresh=await tokenRequest({grant_type:"refresh_token",refresh_token:token.refresh_token});
  token={...token,...refresh,refresh_token:refresh.refresh_token||token.refresh_token};
  checked(await db.from("health_connections").update({token_cipher:await seal(token,connection.user_id)}).eq("user_id",connection.user_id).eq("lease",connection.lease));
 }
 return token.access_token;
}
async function sync(connection:any) {
 try {
  const access=await accessToken(connection), points:any[]=[];
  const seenPages=new Set<string>(); let page="";
  const deadline=Date.now()+90000;
  do {
   if(Date.now()>deadline||seenPages.size>=100||seenPages.has(page)) throw new Error("sync_incomplete");
   seenPages.add(page);
   const query=new URLSearchParams({pageSize:"25",filter:'exercise.interval.civil_start_time >= "'+IMPORT_START+'"'});
   if(page) query.set("pageToken",page);
   const batch=await google("users/me/dataTypes/exercise/dataPoints?"+query,access);
   if(batch.dataPoints!==undefined&&!Array.isArray(batch.dataPoints)) throw new Error("provider_unavailable");
   points.push(...(batch.dataPoints||[])); page=batch.nextPageToken||"";
  } while(page);
  const runs=points.map(normalizeRun).filter(Boolean).map((r:any)=>({...r,external_id:connection.health_user_id+":"+r.external_id}));
  for(const run of runs) checked(await db.rpc("health_ingest",{p_user:connection.user_id,p_run:run,p_lease:connection.lease}));
  checked(await db.rpc("health_finish",{p_user:connection.user_id,p_seen:runs.map((r:any)=>r.external_id),p_lease:connection.lease,p_revision:connection.revision}));
 } catch(error) {
  const code=error instanceof Error?error.message:"sync_failed";
  const allowed=["reconnect_required","rate_limited","provider_unavailable","sync_incomplete"];
  await db.from("health_connections").update({lease:null,lease_until:null,last_error:allowed.includes(code)?code:"sync_failed",reconnect_required:code==="reconnect_required",retry_at:new Date(Date.now()+300000).toISOString()}).eq("user_id",connection.user_id).eq("lease",connection.lease);
 }
}
async function work(userId?:string) {
 if(!configured()) return;
 const connections=checked(await db.rpc("health_claim",{p_user:userId||null}));
 for(const connection of connections||[]) await sync(connection);
}
function background(promise:Promise<unknown>) {
 // Supabase keeps this task alive after the webhook response.
 (globalThis as any).EdgeRuntime.waitUntil(promise.catch(()=>{}));
}
async function userFor(req:Request) {
 const jwt=req.headers.get("Authorization")?.replace(/^Bearer /,"")||"";
 const {data,error}=await db.auth.getUser(jwt);
 if(error||!data.user) throw new Error("unauthorized");
 let session:string;
 try { const part=jwt.split(".")[1].replaceAll("-","+").replaceAll("_","/"); session=JSON.parse(atob(part)).session_id; } catch {throw new Error("unauthorized");}
 if(!session||!checked(await db.rpc("health_active_session",{p_user:data.user.id,p_session:session}))) throw new Error("unauthorized");
 return data.user;
}
async function revoke(connection:any) {
 if(!connection) return;
 try {
  const tokens=await unseal(connection.token_cipher,connection.user_id);
  await fetch("https://oauth2.googleapis.com/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token:tokens.refresh_token||tokens.access_token}),signal:AbortSignal.timeout(10000)});
 } catch { /* Local access is removed even when Google cannot be reached. */ }
}
function redirect(code:string) {
 return new Response(null,{status:303,headers:{Location:APP+"?health="+encodeURIComponent(code),"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
async function callback(req:Request) {
 if(req.method!=="GET") return json({error:"method_not_allowed"},405);
 const url=new URL(req.url),state=url.searchParams.get("state");
 if(!state||state.length>200) return redirect("invalid_state");
 const stateRow=checked(await db.from("health_oauth_states").delete().eq("state_hash",await hash(state)).gt("expires_at",new Date().toISOString()).select("*").maybeSingle());
 if(!stateRow) return redirect("expired");
 if(url.searchParams.has("error")) return redirect("cancelled");
 const code=url.searchParams.get("code");
 if(!code||!configured()) return redirect("not_configured");
 try {
  const tokens=await tokenRequest({grant_type:"authorization_code",code,redirect_uri:CALLBACK,code_verifier:stateRow.verifier});
  if(!tokens.scope?.split(" ").includes(SCOPE)||!tokens.refresh_token) return redirect("permission_required");
  const identity=await google("users/me/identity",tokens.access_token);
  if(!identity.healthUserId) throw new Error("provider_unavailable");
  const current=checked(await db.from("health_connections").select("health_user_id").eq("user_id",stateRow.user_id).maybeSingle());
  if(current&&current.health_user_id!==identity.healthUserId) return redirect("different_health_account");
  const {error}=await db.from("health_connections").upsert({user_id:stateRow.user_id,health_user_id:identity.healthUserId,token_cipher:await seal(tokens,stateRow.user_id),reconnect_required:false,last_error:null,pending:true,lease:null,lease_until:null,retry_at:new Date().toISOString()},{onConflict:"user_id"});
  if(error) return redirect(error.code==="23505"?"already_linked":"connection_failed");
  checked(await db.rpc("health_enqueue",{p_user:stateRow.user_id}));
  background(work(stateRow.user_id)); return redirect("connected");
 } catch { return redirect("connection_failed"); }
}
async function webhook(req:Request) {
 if(req.method!=="POST") return json({error:"method_not_allowed"},405);
 const secret=Deno.env.get("GOOGLE_HEALTH_WEBHOOK_SECRET");
 const authorization=req.headers.get("Authorization")||"";
 if(!secret||await hash(authorization)!==await hash("Bearer "+secret)) return json({error:"unauthorized"},401);
 const raw=await req.text();
 if(raw.length>262144) return json({error:"too_large"},413);
 let payload:any; try {payload=JSON.parse(raw);} catch {return json({error:"invalid_request"},400);}
 if(payload.type==="verification") return json({verified:true});
 const batch=Array.isArray(payload)?payload:[payload];
 if(batch.length>100) return json({error:"too_large"},413);
 const ids=new Set<string>();
 for(const notification of batch) {
  const d=notification?.data;
  if(!d?.healthUserId) continue;
  const c=checked(await db.from("health_connections").select("user_id").eq("health_user_id",d.healthUserId).maybeSingle());
  if(!c) continue;
  if(["user-deleted","user-revoked-access"].includes(d.dataType)) {
   checked(await db.rpc("health_disconnect",{p_user:c.user_id})); continue;
  }
  if(d.dataType==="exercise") ids.add(c.user_id);
 }
 // Durably enqueue before acknowledging. Retries are safe.
 for(const id of ids) checked(await db.rpc("health_enqueue",{p_user:id}));
 background(work());
 return new Response(null,{status:204});
}

Deno.serve(async(req:Request)=>{
 const route=new URL(req.url).pathname.split("/").pop();
 try {
  if(route==="google-health-callback") return await callback(req);
  if(route==="webhook") return await webhook(req);
  if(route==="worker") {
   if(req.method!=="POST") return json({error:"method_not_allowed"},405);
   const token=req.headers.get("Authorization")?.replace(/^Bearer /,"")||"";
   if(!token||!checked(await db.rpc("health_worker_authorized",{p_token:token}))) return json({error:"unauthorized"},401);
   background(work()); return json({queued:true});
  }
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST") return json({error:"method_not_allowed"},405);
  const user=await userFor(req),body=await req.json();
  const connection=checked(await db.from("health_connections").select("*").eq("user_id",user.id).maybeSingle());
  if(body.action==="status") {
   const pending=checked(await db.from("health_runs").select("external_id,run").eq("user_id",user.id).eq("status","pending").limit(100));
   return json({configured:configured(),connected:!!connection,reconnect_required:connection?.reconnect_required||false,last_sync_at:connection?.last_sync_at||null,last_error:connection?.last_error||null,syncing:connection?.pending||false,automatic:!!Deno.env.get("GOOGLE_HEALTH_WEBHOOK_SECRET"),pending});
  }
  if(body.action==="connect") {
   if(!configured()) return json({error:"not_configured"},503);
   if(body.consent!==true) return json({error:"consent_required"},400);
   const p=checked(await db.from("profiles").select("setup_completed").eq("id",user.id).maybeSingle());
   if(!p?.setup_completed) return json({error:"complete_setup_first"},409);
   const state=random(),verifier=random();
   checked(await db.from("health_oauth_states").delete().eq("user_id",user.id));
   checked(await db.from("health_oauth_states").insert({state_hash:await hash(state),user_id:user.id,verifier,expires_at:new Date(Date.now()+600000).toISOString()}));
   const query=new URLSearchParams({client_id:clientId(),redirect_uri:CALLBACK,response_type:"code",scope:SCOPE,access_type:"offline",prompt:"consent select_account",state,code_challenge:await hash(verifier),code_challenge_method:"S256"});
   return json({url:"https://accounts.google.com/o/oauth2/v2/auth?"+query});
  }
  if(body.action==="disconnect") {
   if(body.confirm!==true) return json({error:"confirmation_required"},400);
   checked(await db.rpc("health_disconnect",{p_user:user.id})); await revoke(connection);
   return json({disconnected:true});
  }
  if(!connection) return json({error:"not_connected"},409);
  if(body.action==="sync") {
   checked(await db.rpc("health_enqueue",{p_user:user.id})); background(work(user.id)); return json({queued:true});
  }
  if(body.action==="resolve") {
   const r=checked(await db.from("health_runs").select("run").eq("user_id",user.id).eq("external_id",body.external_id).eq("status","pending").maybeSingle());
   if(!r) return json({error:"already_reviewed"},409);
   const result=checked(await db.rpc("health_ingest",{p_user:user.id,p_run:r.run,p_resolution:body.resolution,p_manual:body.manual_id||null}));
   return json({result});
  }
  return json({error:"invalid_action"},400);
 } catch(error) {
  const unauthorized=error instanceof Error&&error.message==="unauthorized";
  return json({error:unauthorized?"unauthorized":"request_failed"},unauthorized?401:500);
 }
});
