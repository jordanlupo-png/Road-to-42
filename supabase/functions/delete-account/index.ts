import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const cors={"Access-Control-Allow-Origin":"https://jordanlupo-png.github.io","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const jwt=req.headers.get("Authorization")?.replace(/^Bearer /,"")||"";
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await admin.auth.getUser(jwt);
  if(error||!user)return json({error:"Invalid session"},401);
  let sid;try{sid=JSON.parse(atob(jwt.split(".")[1].replaceAll("-","+").replaceAll("_","/"))).session_id}catch{}
  if(!sid)return json({error:"Invalid session"},401);
  const active=await admin.rpc("health_active_session",{p_user:user.id,p_session:sid});
  if(active.error||!active.data)return json({error:"Invalid session"},401);
  let body;try{body=await req.json()}catch{return json({error:"Invalid request"},400)}
  if(body.confirm!==true)return json({error:"Confirmation required"},400);
  const health=await admin.from("health_connections").select("token_cipher").eq("user_id",user.id).maybeSingle();
  if(health.error)return json({error:"Account could not be deleted"},500);
  const result=await admin.auth.admin.deleteUser(user.id);
  if(result.error)return json({error:"Account could not be deleted"},500);
  // Auth sessions, profiles, activities, check-ins and integration rows cascade.
  if(health.data){
   try{
    const enc=new TextEncoder(),secret=Deno.env.get("GOOGLE_HEALTH_CLIENT_SECRET");
    const key=await crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",enc.encode("road42:health:tokens:v1:"+secret)),"AES-GCM",false,["decrypt"]);
    const [iv,data]=health.data.token_cipher.split(".").map((s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)));
    const token=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:enc.encode(user.id)},key,data)));
    await fetch("https://oauth2.googleapis.com/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token:token.refresh_token||token.access_token}),signal:AbortSignal.timeout(5000)});
   }catch{/* Credentials have already been removed from Road to 42. */}
  }
  return json({deleted:true});
 }catch{return json({error:"Account could not be deleted"},500)}
});
