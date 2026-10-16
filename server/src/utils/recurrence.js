import TaskOccurrence from '../models/TaskOccurrence.js';
import HttpError from './httpError.js';

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly'];
export const HORIZON_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OCCURRENCES_PER_TASK = 500;

export function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Validates a recurrenceRule payload and returns a normalized rule object,
// or null when the value explicitly clears recurrence.
export function parseRecurrenceRule(value) {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'recurrenceRule must be an object or null');
  }

  const { frequency, interval, byWeekday, until, timeZone } = value;

  if (!RECURRENCE_FREQUENCIES.includes(frequency)) {
    throw new HttpError(400, `frequency must be one of: ${RECURRENCE_FREQUENCIES.join(', ')}`);
  }

  let normalizedInterval = 1;
  if (interval !== undefined) {
    normalizedInterval = Number(interval);
    if (
      !Number.isInteger(normalizedInterval) ||
      normalizedInterval < 1 ||
      normalizedInterval > 365
    ) {
      throw new HttpError(400, 'interval must be an integer between 1 and 365');
    }
  }

  let normalizedWeekdays = null;
  if (frequency === 'weekly') {
    if (!Array.isArray(byWeekday) || byWeekday.length === 0) {
      throw new HttpError(400, 'byWeekday is required for weekly recurrence');
    }
    const days = [...new Set(byWeekday.map(Number))];
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw new HttpError(400, 'byWeekday values must be integers 0 (Sunday) through 6 (Saturday)');
    }
    normalizedWeekdays = days.sort((a, b) => a - b);
  }

  let untilDate = null;
  if (until !== undefined && until !== null && until !== '') {
    untilDate = new Date(until);
    if (Number.isNaN(untilDate.getTime())) {
      throw new HttpError(400, 'until must be a valid date');
    }
    untilDate = startOfUtcDay(untilDate);
  }

  const normalizedTz =
    typeof timeZone === 'string' && timeZone.trim() !== '' ? timeZone.trim() : 'UTC';

  return {
    frequency,
    interval: normalizedInterval,
    ...(normalizedWeekdays ? { byWeekday: normalizedWeekdays } : {}),
    until: untilDate,
    timeZone: normalizedTz,
  };
}

// The scheduled days a rule fires on, from fromDay through toDay (both
// inclusive, UTC days). Expansion is anchored at `fromDay`: for weekly rules
// the interval counts weeks from the anchor's week; for monthly rules the
// day-of-month is the anchor's, clamped to shorter months.
export function ruleDays(rule, fromDay, toDay) {
  const days = [];
  const anchor = startOfUtcDay(fromDay);
  const last = startOfUtcDay(toDay);
  if (anchor > last) return days;

  const untilDay = rule.until ? startOfUtcDay(rule.until) : null;
  const pastEnd = (d) => untilDay !== null && d > untilDay;

  if (rule.frequency === 'daily') {
    for (let d = new Date(anchor); d <= last && days.length < MAX_OCCURRENCES_PER_TASK; d = addUtcDays(d, rule.interval)) {
      if (pastEnd(d)) break;
      days.push(new Date(d));
    }
    return days;
  }

  if (rule.frequency === 'weekly') {
    const anchorSunday = addUtcDays(anchor, -anchor.getUTCDay());
    for (let d = new Date(anchor); d <= last && days.length < MAX_OCCURRENCES_PER_TASK; d = addUtcDays(d, 1)) {
      if (pastEnd(d)) break;
      const sunday = addUtcDays(d, -d.getUTCDay());
      const weeksSince = Math.round((sunday - anchorSunday) / (7 * DAY_MS));
      if (weeksSince % rule.interval === 0 && rule.byWeekday.includes(d.getUTCDay())) {
        days.push(new Date(d));
      }
    }
    return days;
  }

  // monthly: same day-of-month as the anchor, clamped (Jan 31 → Feb 28)
  const anchorDom = anchor.getUTCDate();
  for (let d = new Date(anchor); d <= last && days.length < MAX_OCCURRENCES_PER_TASK; d = addUtcDays(d, 1)) {
    if (pastEnd(d)) break;
    const monthsSince =
      (d.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      (d.getUTCMonth() - anchor.getUTCMonth());
    if (monthsSince % rule.interval !== 0) continue;
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    if (d.getUTCDate() === Math.min(anchorDom, daysInMonth)) {
      days.push(new Date(d));
    }
  }
  return days;
}

// Lazily materialize occurrences through upToDay. Idempotent: the unique
// taskId+scheduledFor index plus $setOnInsert makes concurrent/retried runs safe.
export async function ensureOccurrences(task, upToDay) {
  // Mongoose nested paths return a truthy wrapper even when the stored value is
  // null, so presence of `frequency` — not truthiness — decides.
  const rule = task.recurrenceRule;
  if (!rule?.frequency) return;

  const anchorDay = startOfUtcDay(task.startAt ?? task.createdAt);
  const lastDay = startOfUtcDay(upToDay);
  if (lastDay < anchorDay) return;

  const days = ruleDays(rule, anchorDay, lastDay);
  if (days.length === 0) return;

  const ops = days.map((d) => ({
    updateOne: {
      filter: { taskId: task._id, scheduledFor: d },
      update: { $setOnInsert: { taskId: task._id, scheduledFor: d, status: 'pending' } },
      upsert: true,
    },
  }));
  await TaskOccurrence.bulkWrite(ops, { ordered: false });
}

// A pending occurrence whose scheduled day has fully elapsed is missed.
// Runs on read; idempotent via the status guard.
export async function sweepMissed(taskId) {
  await TaskOccurrence.updateMany(
    { taskId, status: 'pending', scheduledFor: { $lt: startOfUtcDay() } },
    { $set: { status: 'missed' } }
  );
}
