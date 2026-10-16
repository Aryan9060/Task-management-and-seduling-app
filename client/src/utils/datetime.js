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
