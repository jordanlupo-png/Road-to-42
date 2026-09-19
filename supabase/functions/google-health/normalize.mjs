export const IMPORT_START = '2026-09-14';
const RUN_TYPES = new Set(['RUNNING', 'TRAIL_RUN', 'TREADMILL']);
export function seconds(value) {
  return typeof value === 'string' && /^-?\d+(\.\d+)?s$/.test(value) ? Number(value.slice(0, -1)) : NaN;
}
export function normalizeRun(point) {
  const e = point?.exercise;
  if (!e || !RUN_TYPES.has(e.exerciseType)) return null;
  const interval = e.interval || {}, civil = interval.civilStartTime?.date;
  const start = Date.parse(interval.startTime), offset = seconds(interval.startUtcOffset);
  const date = civil?.year && civil?.month && civil?.day
    ? `${civil.year}-${String(civil.month).padStart(2, '0')}-${String(civil.day).padStart(2, '0')}`
    : Number.isFinite(start) && Number.isFinite(offset) ? new Date(start + offset * 1000).toISOString().slice(0, 10) : null;
  if (!date || date < IMPORT_START || !/^users\/[^/]+\/dataTypes\/exercise\/dataPoints\/[^/]+$/.test(point.name || '')) return null;
  const km = Number(e.metricsSummary?.distanceMillimeters) / 1e6;
  if (!Number.isFinite(km) || km <= 0 || km > 500) return null;
  let duration = seconds(e.activeDuration);
  if (!Number.isFinite(duration)) duration = (Date.parse(interval.endTime) - start) / 1000;
  const minutes = Number.isFinite(duration) && duration > 0 && duration <= 604800 ? duration / 60 : null;
  const pace = Number(e.metricsSummary?.averagePaceSecondsPerMeter) * 1000;
  return { external_id: point.name.split('/').pop(), activity_date: date, distance_km: Math.round(km * 1000) / 1000,
    duration_minutes: minutes === null ? null : Math.round(minutes * 100) / 100,
    pace_seconds_per_km: Number.isFinite(pace) && pace > 0 ? Math.round(pace) : minutes ? Math.round(minutes * 60 / km) : null,
    source_recorded_at: Number.isFinite(start) ? new Date(start).toISOString() : null };
}
