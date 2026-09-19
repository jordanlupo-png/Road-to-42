// In-memory fixtures only. Never loaded by the published game.
(function(){
 const params=window.QA_SCENARIO||'returning';
 let user={id:'qa-user',email:'qa@example.invalid',user_metadata:{full_name:'QA Runner'}};
 let profile={id:user.id,display_name:'QA Runner',weekly_km_target:25,runs_per_week:3,goal:'Marathon',race_date:'2027-03-14',character_key:'lynx',setup_completed:params!=='new',last_goal_review_level:10,is_public:true};
 let activities=params==='level'?[{id:1,user_id:user.id,activity_date:'2026-09-14',activity_type:'run',distance_km:25,duration_minutes:150,source:'google_health'}]:[{id:1,user_id:user.id,activity_date:'2026-09-14',activity_type:'run',distance_km:7.1,duration_minutes:44,source:'google_health'}];
 if(params==='new')activities=[];if(params==='level')profile.last_goal_review_level=1;
 let authListener=()=>{},pending=params==='duplicate'?[{external_id:'test:2',run:{activity_date:'2026-09-14',distance_km:7.1,duration_minutes:44}}]:[];
 if(params==='duplicate')activities[0].source='manual';
 class Query{
  constructor(table){this.table=table;this.filters=[];this.op='select'}
  select(){return this} eq(k,v){this.filters.push(r=>r[k]===v);return this} gte(k,v){this.filters.push(r=>r[k]>=v);return this}
  order(){return this} limit(){return this} range(){return this} single(){this.one=true;return this} maybeSingle(){this.one=true;return this}
  insert(v){this.op='insert';this.value=v;return this} upsert(v){this.op='upsert';this.value=v;return this}
  update(v){this.op='update';this.value=v;return this} delete(){this.op='delete';return this}
  then(ok,fail){
   return Promise.resolve().then(()=>{
    if(params==='error'&&this.op!=='select')return {data:null,error:{message:'Simulated network failure'}};
    let rows=this.table==='profiles'?[profile]:this.table==='activities'?activities:[];
    const matching=rows.filter(r=>this.filters.every(f=>f(r)));
    if(this.op==='update')matching.forEach(r=>Object.assign(r,this.value));
    if(this.op==='insert'||this.op==='upsert'){
     if(this.table==='profiles'){Object.assign(profile,this.value);rows=[profile]}
     if(this.table==='activities'){const row={id:activities.length+1,source:'manual',...this.value};activities.push(row);rows=[row]}
    }
    if(this.op==='delete'&&this.table==='activities')activities=activities.filter(r=>!matching.includes(r));
    return {data:this.one?{...rows[0]}:rows.map(r=>({...r})),error:null};
   }).then(ok,fail);
  }
 }
 window.supabase={createClient:()=>({
  from:table=>new Query(table),
  auth:{getSession:async()=>({data:{session:user?{user}:null},error:null}),onAuthStateChange:cb=>{authListener=cb},signOut:async()=>{user=null;authListener('SIGNED_OUT',null);return {error:null}},signInWithOAuth:async()=>({error:{message:'Fixture sign-in only'}})},
  functions:{invoke:async(name,{body})=>{
   if(name==='delete-account')return {data:null,error:{message:'Deletion disabled in browser fixture'}};
   if(body.action==='status')return {data:{configured:false,connected:params==='duplicate',syncing:false,pending},error:null};
   if(body.action==='resolve'){pending=[];return {data:{result:'imported'},error:null}}
   return {data:{queued:true},error:null};
  }}
 })};
})();
