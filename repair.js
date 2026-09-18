(function(){'use strict';
const URL='https://negkvlgimrthgonyvdqf.supabase.co',KEY='sb_publishable_RIt2HNAqPRO6vXMqWQEG3A_NJUHCj_t';
const client=window.supabase?.createClient(URL,KEY),$=id=>document.getElementById(id);
const chars=['wolf','fox','bear','lynx','rabbit','raccoon','dog','cat'];
const charName={wolf:'Wolf',fox:'Fox',bear:'Bear',lynx:'Lynx',rabbit:'Rabbit',raccoon:'Raccoon',dog:'Dog',cat:'Cat'};
const avatar=k=>'assets/avatars/'+(chars.includes(k)?k:'wolf')+'/'+(chars.includes(k)?k:'wolf')+'_01.webp';
function syncXP(){const source=$('xpText'),target=$('xpDistance');if(!source||!target)return;const match=source.textContent.match(/([0-9]+(?:\.[0-9]+)?)\s*XP to next level/);if(match){const value=Number(match[1]);target.textContent=value.toFixed(1)+' XP needed · '+value.toFixed(1)+' km to go';target.classList.remove('hidden')}else{target.textContent='You have reached the highest level.';target.classList.remove('hidden')}}
function show(id){['auth','profile','main'].forEach(x=>$(x)?.classList.toggle('hidden',x!==id))}
function message(text){const box=$('profileMsg');if(box){box.textContent=text;box.classList.remove('hidden')}}
function setup(user){
  show('profile');
  let chosen='',meta=user.user_metadata||{};
  $('newName').value=(meta.full_name||meta.name||'').split(' ')[0]||'';
  if($('baseKm'))$('baseKm').value='25';
  if($('setupAvatar')){$('setupAvatar').classList.add('hidden');$('setupAvatar').removeAttribute('src');$('setupAvatar').alt=''};
  const grid=$('profileCharacters');
  if(grid){grid.innerHTML=chars.map(k=>'<button type="button" class="characterChoice" data-repair-character="'+k+'" aria-pressed="false"><img src="'+avatar(k)+'" alt=""><span>'+charName[k]+'</span></button>').join('');grid.querySelectorAll('[data-repair-character]').forEach(b=>b.onclick=()=>{chosen=b.dataset.repairCharacter;grid.querySelectorAll('button').forEach(x=>{let on=x.dataset.repairCharacter===chosen;x.classList.toggle('selected',on);x.setAttribute('aria-pressed',on)});$('profileCharacterName').textContent=charName[chosen];$('setupAvatar').classList.remove('hidden');$('setupAvatar').src=avatar(chosen);$('setupAvatar').alt=charName[chosen]+' runner'})}
  const form=$('profileForm');
  if(form&&!form.dataset.repaired){form.dataset.repaired='true';form.onsubmit=null;form.addEventListener('submit',async ev=>{ev.preventDefault();if(!chosen){message('Choose your runner before starting your journey.');return}if(!form.reportValidity())return;const btn=$('join');btn.disabled=true;btn.textContent='Creating your runner…';try{const row={id:user.id,display_name:$('newName').value.trim(),avatar_url:meta.avatar_url||null,weekly_km_target:+$('baseKm').value,runs_per_week:+$('baseRuns').value||3,goal:$('goal').value,race_date:$('raceDate').value,character_key:chosen,is_public:true,setup_completed:true};if(!row.display_name){message('Enter your name to start your journey.');return}const result=await client.from('profiles').upsert(row,{onConflict:'id'});if(result.error){message('Could not save your runner: '+result.error.message);return}location.reload()}catch(err){message('Could not create your runner: '+err.message)}finally{btn.disabled=false;btn.textContent='Start my journey'}})}
  $('setupLogout')?.addEventListener('click',async()=>{await client.auth.signOut();location.reload()},{once:true});
}
async function boot(){if(!client)return;try{const {data}=await client.auth.getSession();const user=data.session?.user;if(!user)return;const {data:profile}=await client.from('profiles').select('id,display_name,character_key,weekly_km_target,runs_per_week,goal,race_date,setup_completed').eq('id',user.id).maybeSingle();const incomplete=!profile||!profile.setup_completed||!profile.display_name||!profile.character_key||!profile.weekly_km_target||!profile.runs_per_week||!profile.goal||!profile.race_date;if(incomplete){setTimeout(()=>setup(user),0);return}if($('runnerProfileAvatar')&&profile.character_key){$('runnerProfileAvatar').src=avatar(profile.character_key);$('runnerProfileAvatar').alt=charName[profile.character_key]+' runner'}}catch(err){console.warn('Account setup repair unavailable',err)}}
const xpSource=$('xpText');if(xpSource){new MutationObserver(syncXP).observe(xpSource,{childList:true,subtree:true,characterData:true});setTimeout(syncXP,250)}
setTimeout(boot,700);
})();
