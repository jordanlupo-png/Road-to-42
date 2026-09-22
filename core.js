(function(root){
'use strict';
const thresholds=[25,60,120,200,300,425,575,750,950];
const dateKey=(d=new Date())=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const weekKey=(value)=>{const d=new Date((value||dateKey())+'T12:00:00');d.setDate(d.getDate()-(d.getDay()+6)%7);return dateKey(d)};
const isRun=l=>['Easy','Quality','Long','run'].includes(l.type||l.activity_type)&&Number(l.km??l.distance_km)>0;
const km=l=>Number(l.km??l.distance_km)||0;
const day=l=>(l.date||l.activity_date).slice(0,10);
const parseDistance=value=>{const raw=String(value??'').trim().replace(',','.');if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(raw))return null;const n=Number(raw);return Number.isFinite(n)&&n>=0&&n<=500?n:null};
const durationMinutes=(hours,minutes)=>{const h=Number(hours),m=Number(minutes);return Number.isInteger(h)&&Number.isInteger(m)&&h>=0&&h<=168&&m>=0&&m<=59?h*60+m:null};
const paceSeconds=(minutes,seconds)=>{if(String(minutes??'').trim()===''&&String(seconds??'').trim()==='')return 0;const m=Number(minutes||0),s=Number(seconds||0);return Number.isInteger(m)&&Number.isInteger(s)&&m>=0&&m<=99&&s>=0&&s<=59?m*60+s:null};
function stats(logs,now=new Date()) {
 const today=dateKey(now),start=weekKey(today),runs=logs.filter(l=>isRun(l)&&day(l)<=today);
 const xp=runs.reduce((n,l)=>n+km(l),0),weeks={};
 for(const l of runs){const key=weekKey(day(l));weeks[key]??={km:0,runs:0};weeks[key].km+=km(l);weeks[key].runs++}
 const level=1+thresholds.filter(t=>xp>=t).length,next=thresholds[level-1]??null,previous=thresholds[level-2]??0;
 let consecutive=0,d=new Date(start+'T12:00:00');
 if(!weeks[start]) d.setDate(d.getDate()-7);
 while(weeks[dateKey(d)]){consecutive++;d.setDate(d.getDate()-7)}
 let bestWeeks=0,current=0,last=null;
 for(const key of Object.keys(weeks).sort()){
  const t=new Date(key+'T12:00:00');const prev=new Date(t);prev.setDate(prev.getDate()-7);
  current=last===dateKey(prev)?current+1:1;bestWeeks=Math.max(bestWeeks,current);last=key;
 }
 return {runs,xp,level,next,remaining:next===null?0:Math.max(0,next-xp),percent:next===null?100:Math.min(100,(xp-previous)/(next-previous)*100),
  weekKm:weeks[start]?.km||0,weekRuns:weeks[start]?.runs||0,weeks,consecutive,bestWeeks,days:new Set(runs.map(day)).size,longest:Math.max(0,...runs.map(km))};
}
function rewards(logs,target,now=new Date()){
 const s=stats(logs,now),all=s.runs,days=[...new Set(all.map(day))].sort();
 const comeback=days.some((v,i)=>i&&((new Date(v+'T12:00:00')-new Date(days[i-1]+'T12:00:00'))/86400000)>=7);
 const bestWeek=Math.max(0,...Object.values(s.weeks).map(w=>w.km));
 return [
 ['👟','First run',all.length>=1,'Log your first run.'],
 ['🌱','5 km total',s.xp>=5,'Run 5 km across your training.'],
 ['🔥','10 km total',s.xp>=10,'Run 10 km in total.'],
 ['🛤️','25 km total',s.xp>=25,'Run 25 km in total.'],
 ['🏔️','50 km total',s.xp>=50,'Run 50 km in total.'],
 ['🌍','100 km total',s.xp>=100,'Run 100 km in total.'],
 ['🏅','Weekly goal',target>0&&bestWeek>=target,'Reach your weekly distance target in a calendar week.'],
 ['⚡','Three runs',all.length>=3,'Log three runs.'],
 ['🚀','Ten runs',all.length>=10,'Log ten runs.'],
 ['🦊','Long session',all.some(l=>(l.type||l.activity_type)==='Long'),'Log a planned long run.'],
 ['🎯','Quality session',all.some(l=>(l.type||l.activity_type)==='Quality'),'Log a quality training session.'],
 ['📅','Two-week rhythm',s.bestWeeks>=2,'Run in two consecutive weeks. Rest days are welcome.'],
 ['🌿','Four-week rhythm',s.bestWeeks>=4,'Run in four consecutive weeks.'],
 ['🔁','Welcome back',comeback,'Return for a run after at least a week away.'],
 ['🏃','42.2 km trained',s.xp>=42.2,'Accumulate 42.2 km across training runs.'],
 ['🏁','Eight-week rhythm',s.bestWeeks>=8,'Run in eight consecutive weeks.'],
 ['💪','10 active days',s.days>=10,'Run on ten different dates.'],
 ['✨','Training story',all.length>=20,'Log twenty runs.']
 ];
}
const api={dateKey,weekKey,isRun,parseDistance,durationMinutes,paceSeconds,stats,rewards};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.Road42Core=api;
})(typeof window==='undefined'?this:window);
