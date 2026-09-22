import {createClient} from "@supabase/supabase-js";
import webpush from "web-push";

const cors={"Access-Control-Allow-Origin":"https://jordanlupo-png.github.io","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const b64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");
const decode=(value:string)=>Uint8Array.from(atob(value.replaceAll("-","+").replaceAll("_","/").padEnd(Math.ceil(value.length/4)*4,"=")),c=>c.charCodeAt(0));

async function generateVapid(){
 const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
 const pub=await crypto.subtle.exportKey("jwk",pair.publicKey),priv=await crypto.subtle.exportKey("jwk",pair.privateKey);
 const raw=new Uint8Array(65);raw[0]=4;raw.set(decode(pub.x!),1);raw.set(decode(pub.y!),33);
 return {publicKey:b64url(raw),privateKey:priv.d!};
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  let body:any;try{body=await req.json()}catch{return json({error:"Invalid request"},400)}
  let {data:config,error:configError}=await admin.rpc("get_push_config");
  if(configError)throw configError;
  let settings=config?.[0];
  const webhook=req.headers.get("x-road42-webhook");
  if(webhook){
   if(!settings?.webhook_secret||webhook!==settings.webhook_secret)return json({error:"Unauthorized"},401);
   const id=Number(body.notification_id);if(!Number.isSafeInteger(id))return json({error:"Invalid notification"},400);
   if(!settings.public_key||!settings.private_key){
    const keys=await generateVapid(),stored=await admin.rpc("store_push_vapid",{p_public:keys.publicKey,p_private:keys.privateKey});if(stored.error)throw stored.error;
    ({data:config,error:configError}=await admin.rpc("get_push_config"));if(configError)throw configError;settings=config?.[0];
   }
   const {data:notice,error:nerr}=await admin.from("runner_notifications").select("id,recipient_id,kind,title,body").eq("id",id).maybeSingle();
   if(nerr)throw nerr;if(!notice)return json({sent:0});
   const {data:subs,error:serr}=await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id",notice.recipient_id);
   if(serr)throw serr;if(!subs?.length)return json({sent:0});
   const {data:done}=await admin.from("push_deliveries").select("subscription_id,status").eq("notification_id",id);
   const successful=new Set((done||[]).filter((d:any)=>d.status>=200&&d.status<300).map((d:any)=>d.subscription_id));
   const payload=JSON.stringify({title:notice.title,body:notice.body,tag:`road42-${id}`,url:`https://jordanlupo-png.github.io/Road-to-42/?notification=${id}`,kind:notice.kind});
   let sent=0;
   await Promise.all(subs.filter((s:any)=>!successful.has(s.id)).map(async(s:any)=>{
    let status=500;
    try{
     const result=await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},payload,{vapidDetails:{subject:"mailto:roadto42.notifications@gmail.com",publicKey:settings.public_key,privateKey:settings.private_key},TTL:86400,urgency:notice.kind==="level_up"?"high":"normal"});
     status=result.statusCode;sent++;
    }catch(error:any){status=Number(error?.statusCode)||500;if(status===404||status===410)await admin.from("push_subscriptions").delete().eq("id",s.id)}
    await admin.from("push_deliveries").upsert({notification_id:id,subscription_id:s.id,status,attempted_at:new Date().toISOString()});
   }));
   return json({sent});
  }

  const jwt=req.headers.get("Authorization")?.replace(/^Bearer /,"")||"";
  const {data:{user},error:userError}=await admin.auth.getUser(jwt);
  if(userError||!user)return json({error:"Invalid session"},401);
  const action=String(body.action||"");
  if(!settings?.public_key||!settings?.private_key){
   const keys=await generateVapid();
   const stored=await admin.rpc("store_push_vapid",{p_public:keys.publicKey,p_private:keys.privateKey});if(stored.error)throw stored.error;
   ({data:config,error:configError}=await admin.rpc("get_push_config"));if(configError)throw configError;settings=config?.[0];
  }
  if(action==="public_key")return json({public_key:settings.public_key});
  if(action==="subscribe"){
   const sub=body.subscription,endpoint=String(sub?.endpoint||""),p256dh=String(sub?.keys?.p256dh||""),auth=String(sub?.keys?.auth||"");
   if(!endpoint.startsWith("https://")||!p256dh||!auth)return json({error:"Invalid subscription"},400);
   const {error}=await admin.from("push_subscriptions").upsert({user_id:user.id,endpoint,p256dh,auth,user_agent:String(req.headers.get("user-agent")||"").slice(0,500),updated_at:new Date().toISOString()},{onConflict:"endpoint"});
   if(error)throw error;return json({subscribed:true});
  }
  if(action==="unsubscribe"){
   const endpoint=String(body.endpoint||"");if(endpoint)await admin.from("push_subscriptions").delete().eq("user_id",user.id).eq("endpoint",endpoint);
   return json({subscribed:false});
  }
  if(action==="status"){
   const {count,error}=await admin.from("push_subscriptions").select("id",{count:"exact",head:true}).eq("user_id",user.id);if(error)throw error;
   return json({subscribed:(count||0)>0,devices:count||0,public_key:settings.public_key});
  }
  return json({error:"Unknown action"},400);
 }catch(error){console.error(error);return json({error:"Push notification request failed"},500)}
});
