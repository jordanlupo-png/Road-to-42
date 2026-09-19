import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRun} from '../supabase/functions/google-health/normalize.mjs';
const point=(type='RUNNING')=>({name:'users/me/dataTypes/exercise/dataPoints/123',exercise:{exerciseType:type,interval:{startTime:'2026-09-13T23:30:00Z',endTime:'2026-09-14T00:00:00Z',startUtcOffset:'7200s'},activeDuration:'1800s',metricsSummary:{distanceMillimeters:5000000,averagePaceSecondsPerMeter:.36}}});
test('millimeters become km and seconds-per-meter become seconds-per-km',()=>{
 const r=normalizeRun(point());assert.equal(r.distance_km,5);assert.equal(r.duration_minutes,30);assert.equal(r.pace_seconds_per_km,360);
});
test('local Monday cutoff includes Sunday UTC when local date is Monday',()=>assert.equal(normalizeRun(point()).activity_date,'2026-09-14'));
test('local Sunday excluded even if UTC date is Monday',()=>{
 const p=point();p.exercise.interval.startTime='2026-09-14T00:30:00Z';p.exercise.interval.startUtcOffset='-7200s';assert.equal(normalizeRun(p),null);
});
test('only outdoor, trail, and treadmill runs accepted',()=>{
 for(const type of ['RUNNING','TRAIL_RUN','TREADMILL'])assert.ok(normalizeRun(point(type)));
 for(const type of ['WALKING','TREADMILL_WALK','BIKING','HIKING','OTHER','NEW_UNKNOWN_TYPE'])assert.equal(normalizeRun(point(type)),null);
});
test('missing distance or missing date information does not invent a run',()=>{
 const p=point();delete p.exercise.metricsSummary.distanceMillimeters;assert.equal(normalizeRun(p),null);
 const q=point();delete q.exercise.interval.startUtcOffset;assert.equal(normalizeRun(q),null);
});
test('civil date is preferred to UTC offsets when supplied',()=>{
 const p=point();p.exercise.interval.civilStartTime={date:{year:2026,month:9,day:15}};assert.equal(normalizeRun(p).activity_date,'2026-09-15');
});
