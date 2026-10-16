/**
 * Calendar helpers. All day math uses UTC components (Date.UTC / getUTC*)
 * because task occurrences are defined as UTC calendar days server-side;
 * mixing local-time accessors here would shift days across timezones.
 */

export const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Formats a Date's UTC components as "YYYY-MM-DD". */
export function toKey(date) {
  return date.toISOString().slice(0, 10);
}

/** Parses "YYYY-MM-DD" into a Date at UTC midnight. */
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Today's UTC day as a Date (UTC midnight). */
export function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Sunday-start week (the recurrence engine also anchors weeks on Sunday). */
export function startOfWeek(date) {
  return addDays(date, -date.getUTCDay());
}

/**
 * Computes the visible range for a view anchored on `cursor`.
 * The range end is exclusive (start of the day after the last visible day),
 * which maps directly onto the API's dueBefore bound.
 *
 * @returns {{start: Date, end: Date, days: Date[], label: string}} UTC days.
 */
export function buildRange(view, cursor) {
  if (view === 'day') {
    return {
      start: cursor,
      end: addDays(cursor, 1),
      days: [cursor],
      label: cursor.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    };
  }

  if (view === 'week') {
    const start = startOfWeek(cursor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const end = addDays(start, 7);
    return {
      start,
      end,
      days,
      label: `${short(start)} – ${short(addDays(start, 6))}`,
    };
  }

  const first = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
  const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 7);
  const days = [];
  for (let d = start; d < end; d = addDays(d, 1)) days.push(d);
  return {
    start,
    end,
    days,
    label: first.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  };
}

/** Short label like "Oct 16" (UTC components, so days never shift). */
export function short(date) {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "HH:mm" for a local-time ISO timestamp, used for deadline chips. */
export function timeLabel(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
