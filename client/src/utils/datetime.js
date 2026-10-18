/**
 * Converts an ISO 8601 timestamp into the local-time string format required by
 * an HTML <input type="datetime-local"> element: "YYYY-MM-DDTHH:mm".
 *
 * The returned value has no timezone suffix and represents the user's LOCAL
 * clock time, because the Date getters used below (getFullYear, getHours, ...)
 * read in the browser's timezone rather than UTC.
 *
 * @param {string|null|undefined} iso - ISO timestamp, e.g. "2026-10-14T09:30:00.000Z".
 * @returns {string} Local datetime string, or '' when iso is falsy (so the
 *                   input renders empty for a task that has no date set).
 */
export function toLocalInput(iso) {
  // A datetime-local input cannot hold null, so map missing values to ''.
  if (!iso) return '';
  const d = new Date(iso);
  // Zero-fill a number to two digits (required for every date/time component).
  const pad = (n) => String(n).padStart(2, '0');
  // getMonth() is zero-indexed (0 = January), hence the + 1.
  // Seconds/milliseconds are dropped: the input only supports minute precision.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Reverse of toLocalInput: converts a "datetime-local" value (local clock time)
 * back into a UTC ISO 8601 string for storage/sending to the API.
 *
 * @param {string} value - Value from a datetime-local input.
 * @returns {string|null} ISO 8601 string, or null when value is empty.
 */
export function fromLocalInput(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

/**
 * Formats an ISO timestamp for display, in the user's locale and timezone.
 *
 * @param {string|null|undefined} iso - ISO timestamp.
 * @returns {string} Human-readable date/time, or an em dash when iso is falsy.
 */
export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Formats an ISO timestamp as a date only, in the user's locale and timezone.
 *
 * @param {string|null|undefined} iso - ISO timestamp.
 * @returns {string} Human-readable date, or an em dash when iso is falsy.
 */
export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * Converts an ISO timestamp into a "YYYY-MM-DD" value for <input type="date">.
 * Uses UTC components because occurrence/rule days are UTC days server-side.
 *
 * @param {string|null|undefined} iso - ISO timestamp.
 * @returns {string} Date string, or '' when iso is falsy.
 */
export function toDateInput(iso) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Returns the short weekday name (e.g. "Wed") for a "YYYY-MM-DD" date string.
 * Built with local-time components so the day does not shift across timezones.
 *
 * @param {string} dateStr - Date in "YYYY-MM-DD" form.
 * @returns {string} Localized short weekday name.
 */
export function formatTrendDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // m - 1 because Date months are zero-indexed.
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' });
}

/**
 * Formats a whole number of minutes as "45m", "2h" or "2h 30m".
 *
 * @param {number|null|undefined} minutes - Duration in minutes.
 * @returns {string} Compact duration label.
 */
export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes ?? 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Live countdown label relative to a due date: "in 2d 4h", "in 42m 10s" or
 * "overdue by 1h 5m". Seconds only appear once under an hour remains.
 *
 * @param {string|null|undefined} dueAt - ISO due timestamp.
 * @param {Date} [now] - Current time (injectable for ticking re-renders).
 * @returns {string} Countdown label, or '' when dueAt is falsy.
 */
export function formatCountdown(dueAt, now = new Date()) {
  if (!dueAt) return '';
  const diffMs = new Date(dueAt).getTime() - now.getTime();
  const overdue = diffMs < 0;
  const secs = Math.floor(Math.abs(diffMs) / 1000);
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const sec = secs % 60;

  let text;
  if (days > 0) text = `${days}d ${hours}h`;
  else if (hours > 0) text = `${hours}h ${mins}m`;
  else if (mins > 0) text = `${mins}m ${sec}s`;
  else text = `${sec}s`;

  return overdue ? `overdue by ${text}` : `in ${text}`;
}

/**
 * Formats a millisecond duration as "mm:ss" (or "h:mm:ss" past an hour) for
 * timer displays.
 *
 * @param {number} ms - Elapsed milliseconds.
 * @returns {string} Clock-style duration.
 */
export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
