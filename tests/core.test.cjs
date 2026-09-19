const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../core.js');
const now=new Date('2026-09-19T12:00:00');
test('only runs earn XP; imported runs count; future entries excluded',()=>{
 const logs=[{type:'run',km:7.1,date:'2026-09-14'},{type:'Easy',km:3,date:'2026-09-19'},{type:'Cross',km:60,date:'2026-09-19'},{type:'Rest',km:5,date:'2026-09-19'},{type:'Long',km:10,date:'2026-09-21'}];
 const s=C.stats(logs,now);assert.equal(s.xp,10.1);assert.equal(s.weekKm,10.1);assert.equal(s.runs.length,2);assert.equal(s.remaining,14.9);
});
test('level transitions and maximum level have no phantom next level',()=>{
 assert.equal(C.stats([{type:'Easy',km:25,date:'2026-09-14'}],now).level,2);
 const top=C.stats([{type:'run',km:950,date:'2026-09-14'}],now);
 assert.equal(top.level,10);assert.equal(top.next,null);assert.equal(top.percent,100);
});
test('rest days preserve consecutive training weeks',()=>{
 const logs=['2026-08-24','2026-08-31','2026-09-07','2026-09-14'].map(date=>({date,type:'Easy',km:5}));
 assert.equal(C.stats(logs,now).bestWeeks,4);
 assert.equal(C.stats(logs,now).consecutive,4);
 assert.equal(C.rewards(logs,25,now).find(x=>x[1]==='Four-week rhythm')[2],true);
});
test('week boundaries follow local Monday, across year and daylight saving',()=>{
 assert.equal(C.weekKey('2027-01-03'),'2026-12-28');
 assert.equal(C.weekKey('2026-10-26'),'2026-10-26');
});
test('a long run does not unlock quality-session reward',()=>{
 assert.equal(C.rewards([{type:'Long',km:8,date:'2026-09-14'}],25,now).find(x=>x[1]==='Quality session')[2],false);
});
