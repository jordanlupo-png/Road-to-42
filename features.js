(function(){
'use strict';
const app=window.Road42,C=window.Road42Core,$=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let awarding=false,healthBusy=false,healthTimer=null,activeModal=null,returnFocus=null,lastHealth=0;
const notice=(id,text)=>{$(id).textContent=text;$(id).classList.remove('hidden')};
function openModal(id){returnFocus=document.activeElement;activeModal=$(id);activeModal.classList.remove('hidden');document.querySelectorAll('.app>section').forEach(e=>e.inert=true);activeModal.querySelector('input,button')?.focus()}
function closeModal(){if(activeModal)activeModal.classList.add('hidden');activeModal=null;document.querySelectorAll('.app>section').forEach(e=>e.inert=false);returnFocus?.focus()}
document.addEventListener('keydown',e=>{
 if(!activeModal)return;
 if(e.key==='Escape'&&activeModal.id==='deleteAccountModal'&&!$('confirmDeleteAccount').dataset.busy){closeModal();return}
 if(e.key!=='Tab')return;
 const items=[...activeModal.querySelectorAll('button:not(:disabled),input:not(:disabled),select,a[href]')];
 if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus()}
 else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus()}
});
function render(){
 const s=app.state;if(!s)return;const m=C.stats(s.logs),p=s.profile,target=Number(p.weekly_km_target);
 const stages=[['BEGIN',true],['FIRST RUN',m.runs.length>0],['2 WEEKS',m.bestWeeks>=2],['4 WEEKS',m.bestWeeks>=4],['8 WEEKS',m.bestWeeks>=8]];
 const next=stages.findIndex(x=>!x[1]);
 $('journeyMap').innerHTML=stages.map((x,i)=>'<div class="journeyStop '+(x[1]?'done':i===next?'current':'')+'"><div class="journeyDot">'+(x[1]?'✓':i+1)+'</div><span>'+x[0]+'</span></div>').join('');
 $('journeyKm').textContent=m.xp.toFixed(1)+' km trained';
 $('journeyMessage').textContent='Prepare for your '+s.goal.toLowerCase()+' through consistent training and recovery. These milestones celebrate habits; they do not measure race readiness.';
 const rewards=C.rewards(s.logs,target);
 const earned=new Set(p.earned_rewards||[]);for(const r of rewards)if(earned.has(r[1]))r[2]=true;
 const newlyEarned=rewards.filter(r=>r[2]&&!earned.has(r[1])).map(r=>r[1]);
 if(newlyEarned.length&&!awarding){awarding=true;const uid=app.user.id;app.sb.rpc('keep_runner_rewards',{p_rewards:newlyEarned}).then(({error})=>{if(!error&&app.user?.id===uid){p.earned_rewards=[...earned,...newlyEarned]}}).catch(()=>{}).finally(()=>{awarding=false})}

 $('rewardGrid').innerHTML=rewards.map(x=>'<button type="button" class="reward '+(x[2]?'unlocked':'')+'" aria-label="'+escape(x[1]+'. '+(x[2]?'Unlocked. ':'Locked. ')+x[3])+'" title="'+escape(x[3])+'"><b class="rewardIcon" aria-hidden="true">'+x[0]+'</b><span>'+x[1]+'</span></button>').join('');
 $('rewardGrid').querySelectorAll('button').forEach((b,i)=>b.onclick=()=>{$('rewardDetails').textContent=rewards[i][3]+' '+(rewards[i][2]?'Unlocked!':'Keep building at your own pace.')});
 $('rewardCount').textContent=rewards.filter(x=>x[2]).length+'/'+rewards.length;
 $('streakCount').textContent=m.consecutive+' week'+(m.consecutive===1?'':'s');
 $('streakTitle').textContent=m.consecutive?'Your training rhythm':'Build your rhythm';
 $('streakMessage').textContent='A run in each week builds your rhythm. Rest days are part of the journey.';
 $('challengeBarFill').style.width=Math.min(100,target>0?m.weekKm/target*100:0)+'%';
 $('challengeProgress').textContent=m.weekKm.toFixed(1)+' / '+target.toFixed(1)+' km';
 $('challengeStatus').textContent=target>0&&m.weekKm>=target?'Goal reached':'In progress';
 if(!$('runnerSettings').contains(document.activeElement)){
  $('editWeeklyKm').value=target;$('editRuns').value=p.runs_per_week;$('editGoal').value=p.goal;$('editRaceDate').value=p.race_date;$('editPublic').checked=p.is_public;
 }
 if(m.level>(p.last_goal_review_level||1)&&!activeModal){
  const proposed=Math.min(500,Math.round((target+Math.min(3,target*.08))*10)/10);
  $('levelReviewTitle').textContent='Level '+m.level+' reached';
  $('levelReviewText').textContent='Would you like to review your weekly distance? Keeping your current goal is always an option.';
  $('currentWeeklyGoal').textContent=target.toFixed(1)+' km';$('suggestedWeeklyGoal').textContent=proposed.toFixed(1)+' km';
  $('increaseWeeklyGoal').dataset.target=proposed;$('increaseWeeklyGoal').dataset.level=m.level;
  openModal('levelReviewModal');
 }
}
async function updateProfile(changes){
 const uid=app.user?.id;if(!uid)throw new Error('Sign in again.');
 const {data,error}=await app.sb.from('profiles').update(changes).eq('id',uid).select('id').single();
 if(error||!data)throw new Error('Your changes could not be saved. Please try again.');
 await app.reload();
}
async function review(increase){
 const buttons=[$('increaseWeeklyGoal'),$('keepWeeklyGoal')];buttons.forEach(b=>b.disabled=true);
 try{const changes={last_goal_review_level:Number($('increaseWeeklyGoal').dataset.level)};if(increase)changes.weekly_km_target=Number($('increaseWeeklyGoal').dataset.target);await updateProfile(changes);closeModal()}
 catch(err){$('levelReviewText').textContent=err.message}finally{buttons.forEach(b=>b.disabled=false)}
}
$('increaseWeeklyGoal').onclick=()=>review(true);$('keepWeeklyGoal').onclick=()=>review(false);
$('runnerSettings').onsubmit=async e=>{
 e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button');if(btn.disabled||!form.reportValidity())return;
 btn.disabled=true;
 try{await updateProfile({weekly_km_target:Number($('editWeeklyKm').value),runs_per_week:Number($('editRuns').value),goal:$('editGoal').value,race_date:$('editRaceDate').value,is_public:$('editPublic').checked});notice('settingsMessage','Goals saved.')}
 catch(err){notice('settingsMessage',err.message)}finally{btn.disabled=false}
};
function wellbeing(){
 const value=n=>Number(document.querySelector('input[name="'+n+'"]:checked')?.value||3);
 $('readinessCard').classList.toggle('hidden',!$('wellbeingEnabled').checked);
 $('readinessTitle').textContent='A note for your training diary';
 $('readinessText').textContent='Sleep: '+$('hours').value+' hours · Energy: '+value('energy')+'/5 · Soreness: '+value('soreness')+'/5. These are your own observations, not a test of whether you are ready to run.';
}
$('checkinForm').addEventListener('input',wellbeing);wellbeing();
const healthErrors={not_configured:'Google Health is waiting for the app’s Google setup. You can still log runs manually.',unauthorized:'Please sign in again.',reconnect_required:'Google permission has expired. Reconnect to continue syncing.',rate_limited:'Google has paused requests temporarily. Sync will retry automatically.',provider_unavailable:'Google Health is temporarily unavailable. Sync will retry.',request_failed:'Could not complete the request. Please try again.',sync_incomplete:'Your import could not finish. Please retry.',already_reviewed:'This run has already been reviewed. Refreshing the list.'};
async function healthCall(body){
 const result=await app.sb.functions.invoke('google-health',{body});
 if(result.error){
  let code;try{code=(await result.error.context.json()).error}catch{}
  throw new Error(healthErrors[code]||'Google Health could not be reached. Please try again.');
 }
 if(result.data?.error)throw new Error(healthErrors[result.data.error]||'Could not complete the request.');
 return result.data;
}
async function healthStatus(){
 if(!app.user||!app.state||healthBusy)return;healthBusy=true;const uid=app.user.id;
 try{
  const h=await healthCall({action:'status'});if(app.user?.id!==uid)return;
  $('connectHealth').classList.toggle('hidden',h.connected&&!h.reconnect_required);
  $('connectHealth').disabled=!h.configured;
  $('connectHealth').textContent=h.reconnect_required?'Reconnect Google Health':'Connect Google Health';
  $('syncHealth').classList.toggle('hidden',!h.connected||h.reconnect_required);
  $('syncHealth').disabled=h.syncing;
  $('disconnectHealth').classList.toggle('hidden',!h.connected);
  let text=!h.configured?healthErrors.not_configured:!h.connected?'Connect your own Google Health account to import runs.':h.reconnect_required?healthErrors.reconnect_required:h.last_error?(healthErrors[h.last_error]||'Sync will retry automatically.'):h.syncing?'Syncing your running sessions…':h.last_sync_at?'Last synced '+new Date(h.last_sync_at).toLocaleString():'Connected. Waiting for the first sync.';
  $('healthStatus').textContent=text;
  const box=$('healthDuplicates');box.innerHTML='';
  for(const item of h.pending||[]){
   const run=item.run,matches=app.state.logs.filter(l=>l.source==='manual'&&C.isRun(l)&&l.date.slice(0,10)===run.activity_date&&Math.abs(l.km-run.distance_km)<=Math.max(.2,run.distance_km*.05));
   const div=document.createElement('div');div.className='healthReview';
   div.innerHTML='<h4>Review a possible duplicate</h4><p>'+escape(run.activity_date)+' · '+Number(run.distance_km).toFixed(2)+' km from Google Health</p><p class="sub">This run is waiting and is not counted in your XP yet.</p>';
   if(matches.length){const select=document.createElement('select');select.setAttribute('aria-label','Matching manual run');select.innerHTML=matches.map(l=>'<option value="'+escape(l.id)+'">'+escape(l.type)+' · '+l.km.toFixed(1)+' km · '+l.mins+' min</option>').join('');div.append(select)}
   for(const [label,resolution] of [['Replace matching manual run','link'],['These are separate runs','separate'],['Skip this import','ignore']]){
    if(resolution==='link'&&!matches.length)continue;
    const btn=document.createElement('button');btn.type='button';btn.className='secondaryButton';btn.textContent=label;
    btn.onclick=async()=>{div.querySelectorAll('button').forEach(b=>b.disabled=true);try{await healthCall({action:'resolve',external_id:item.external_id,resolution,manual_id:div.querySelector('select')?.value});await app.reload();await healthStatus()}catch(err){notice('healthStatus',err.message)}finally{div.querySelectorAll('button').forEach(b=>b.disabled=false)}};
    div.append(btn);
   }box.append(div);
  }
  const stamp=h.last_sync_at?Date.parse(h.last_sync_at):0;
  if(stamp>lastHealth){lastHealth=stamp;await app.reload()}
  clearTimeout(healthTimer);
  healthTimer=setTimeout(()=>{if(!document.hidden)healthStatus()},h.syncing?5000:60000);
 }catch(err){if(app.user?.id===uid)notice('healthStatus',err.message)}finally{healthBusy=false}
}
$('connectHealth').onclick=async()=>{
 const btn=$('connectHealth');btn.disabled=true;
 try{const r=await healthCall({action:'connect',consent:true});location.assign(r.url)}catch(err){notice('healthStatus',err.message);btn.disabled=false}
};
$('syncHealth').onclick=async()=>{const btn=$('syncHealth');btn.disabled=true;try{await healthCall({action:'sync'});await healthStatus()}catch(err){notice('healthStatus',err.message);btn.disabled=false}};
$('disconnectHealth').onclick=async()=>{
 if(!confirm('Disconnect Google Health? Previously imported runs stay in your game.'))return;
 try{await healthCall({action:'disconnect',confirm:true});await healthStatus()}catch(err){notice('healthStatus',err.message)}
};
function openDelete(){
 $('deleteAccountConfirmation').value='';$('confirmDeleteAccount').disabled=true;$('deleteAccountMessage').classList.add('hidden');
 $('deletingIdentity').textContent='Account: '+(app.user?.email||'Current signed-in account');openModal('deleteAccountModal');
}
$('openDeleteAccount').onclick=openDelete;$('setupDeleteAccount').onclick=openDelete;
$('cancelDeleteAccount').onclick=()=>{if(!$('confirmDeleteAccount').dataset.busy)closeModal()};
$('deleteAccountConfirmation').oninput=()=>{$('confirmDeleteAccount').disabled=$('deleteAccountConfirmation').value.trim()!=='DELETE'};
$('confirmDeleteAccount').onclick=async()=>{
 const btn=$('confirmDeleteAccount');if(btn.disabled||btn.dataset.busy)return;
 btn.disabled=true;btn.dataset.busy='true';$('cancelDeleteAccount').disabled=true;btn.textContent='Deleting account…';
 try{
  const {data,error}=await app.sb.functions.invoke('delete-account',{body:{confirm:true}});
  if(error||!data?.deleted)throw new Error('Account could not be deleted. Your account remains available; please try again.');
  await app.sb.auth.signOut({scope:'local'});location.replace(location.pathname);
 }catch(err){notice('deleteAccountMessage',err.message);btn.disabled=false}
 finally{delete btn.dataset.busy;btn.textContent='Delete everything permanently';$('cancelDeleteAccount').disabled=false}
};
document.addEventListener('road42:updated',()=>{render();if(!lastHealth)healthStatus()});
document.addEventListener('road42:signedout',()=>{clearTimeout(healthTimer);closeModal();lastHealth=0;$('healthDuplicates').innerHTML=''});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)healthStatus()});
const callback=new URLSearchParams(location.search).get('health');
if(callback){
 const messages={connected:'Google Health connected. Your runs are being imported.',cancelled:'Connection cancelled. You can try again whenever you are ready.',expired:'The connection link expired. Please reconnect.',permission_required:'Allow activity access to sync your runs.',already_linked:'This Google Health account is already linked to another runner.',different_health_account:'Disconnect the current Google Health account before choosing another.'};
 notice('healthStatus',messages[callback]||'Google Health could not connect. Please try again.');
 history.replaceState(null,'',location.pathname);
 document.addEventListener('road42:updated',()=>app.go('more'),{once:true});
}
const detail=document.createElement('p');detail.id='rewardDetails';detail.className='sub';detail.setAttribute('role','status');detail.textContent='Tap a reward to see how to earn it.';$('rewardGrid').after(detail);
if(app.state){render();healthStatus()}
})();
